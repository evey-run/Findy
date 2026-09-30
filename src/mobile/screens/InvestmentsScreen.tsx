import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import type { Bank, Transaction } from '../../types';
import { extractTickerFromDescription, useCryptoPrices } from '../../hooks/useCryptoPrices';
import { useMarketPrices } from '../../hooks/useMarketPrices';
import { formatMoney, formatShortDate, formatSigned, toISODate } from '../../lib/format';
import { merchantInitials } from '../../lib/merchant';
import { ScreenBody, ScreenHeader, SectionHeader } from '../components/Screen';
import Sheet from '../components/Sheet';
import BalanceCard from '../components/BalanceCard';
import Amount from '../components/Amount';
import { Chip, ChipRow, Fab, IconButton, PrimaryButton, SegmentedControl } from '../components/Controls';
import { ListCard, ListRow } from '../components/ListRow';
import { AmountInput, DateInput, Field, SelectInput, TextInput } from '../components/Field';
import { parseAmount } from '../../lib/amount';
import { EmptyState, ErrorNotice, SkeletonHero, SkeletonList } from '../components/Feedback';
import { cx, fieldControl, radii, surfaces, text } from '../theme';

/**
 * Investissements.
 *
 * L'écran desktop pose un tableau de sept colonnes — date, libellé, compte,
 * quantité, prix unitaire, montant, corbeille — dont la dernière n'apparaît
 * qu'au survol. Sur un téléphone, la moitié des colonnes sort de l'écran et la
 * corbeille est tout simplement inatteignable : le survol n'existe pas.
 *
 * La lecture est donc inversée. Le portefeuille se résume à un montant et à sa
 * plus-value ; chaque actif devient une ligne où seuls figurent les trois
 * chiffres qu'on cherche vraiment (quantité, valeur, variation) ; le détail
 * transaction par transaction descend d'un niveau, dans une feuille dont le
 * geste de retour du système sait sortir — un simple état local, lui, piégerait
 * l'utilisateur qui balaie pour revenir en arrière.
 */

type AssetType = 'CRYPTO' | 'ETF' | 'ACTION';

interface AssetGroup {
  key: string;
  name: string;
  ticker: string | null;
  assetType: AssetType | null;
  transactions: Transaction[];
  /** Quantité encore détenue : achats moins ventes. */
  netQuantity: number;
  /** Prix de revient unitaire moyen à l'achat. */
  avgBuyPrice: number;
  totalCost: number;
}

/**
 * Palette par nature d'actif.
 *
 * Une liste d'investissements mélange des objets qui n'ont ni la même
 * volatilité ni le même horizon : la teinte de la pastille est ce qui permet
 * de séparer crypto et fonds d'un coup d'œil, sans lire une étiquette.
 */
const ASSET_TYPES: Record<AssetType, { label: string; color: string }> = {
  CRYPTO: { label: 'Crypto', color: '#f59e0b' },
  ETF: { label: 'ETF', color: '#60a5fa' },
  ACTION: { label: 'Action', color: '#34d399' },
};

const UNKNOWN_TYPE = { label: 'Autre', color: '#a1a1aa' };

function assetTone(type: AssetType | null) {
  return type ? ASSET_TYPES[type] : UNKNOWN_TYPE;
}

// ─── Formats propres au portefeuille ────────────────────────────────────────

const QUANTITY = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });

/**
 * Prix unitaire.
 *
 * `formatMoney` arrondit au centime, ce qui affiche « 0,00 € » pour un jeton
 * qui vaut 0,000023 € — soit exactement les actifs dont on veut suivre le
 * prix. Sous l'euro, on descend donc jusqu'à six décimales.
 */
const SUB_EURO = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

function formatUnitPrice(value: number): string {
  const magnitude = Math.abs(value);
  return magnitude > 0 && magnitude < 1 ? SUB_EURO.format(value) : formatMoney(value);
}

/** Pourcentage signé, avec le vrai signe moins pour aligner les colonnes. */
function formatSignedPercent(value: number): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(2).replace('.', ',')} %`;
}

/** Ancienneté d'une cotation, en français et en abrégé. */
function freshness(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'il y a quelques secondes';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

/**
 * Force un rendu périodique.
 *
 * « Prix mis à jour il y a 2 min » gelé pendant une demi-heure ment sur la
 * fraîcheur d'une cotation — c'est précisément l'information que la légende
 * est censée porter.
 */
function useElapsedTicker(active: boolean, everyMs = 30_000): void {
  const [, bump] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => bump((value) => value + 1), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs]);
}

// ─── Écran ──────────────────────────────────────────────────────────────────

export default function InvestmentsScreen() {
  const navigate = useNavigate();
  const {
    transactions,
    banks,
    currentSpace,
    loadBanks,
    loadTransactions,
    addTransaction,
    removeTransaction,
    requestConfirm,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [bankFilter, setBankFilter] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      await Promise.all([
        loadBanks(),
        // `forceRefresh` : le magasin met en cache la dernière requête et
        // l'écran Opérations laisse derrière lui une liste filtrée autrement.
        // Une agrégation faite sur ce reliquat afficherait un portefeuille faux.
        //
        // `limit` : la valeur par défaut est de 50 lignes. Une quantité nette
        // calculée sur un historique tronqué n'est pas approximative, elle est
        // fausse — il faut tous les mouvements de l'actif ou aucun.
        loadTransactions({
          accountType: 'INVESTMENT',
          forceIgnoreSelectedBank: true,
          forceRefresh: true,
          limit: 500,
        }),
      ]);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBanks, loadTransactions, currentSpace?.id]);

  /** Comptes d'investissement, archivés compris : leurs lignes existent encore. */
  const investmentBanks = useMemo(
    () => banks.filter((bank) => bank.accountType === 'INVESTMENT'),
    [banks],
  );

  const selectableBanks = useMemo(
    () => investmentBanks.filter((bank) => !bank.archived),
    [investmentBanks],
  );

  /**
   * Le magasin ne détient qu'une seule liste d'opérations, partagée avec les
   * autres écrans : on ne garde que ce qui relève d'un compte-titres, sans
   * quoi un aller-retour depuis Opérations ferait apparaître des courses dans
   * le portefeuille le temps d'un rendu.
   */
  const investmentTransactions = useMemo(() => {
    const ids = new Set(investmentBanks.map((bank) => bank.id));
    return transactions.filter((transaction) => ids.has(transaction.bankId));
  }, [transactions, investmentBanks]);

  const scoped = useMemo(
    () =>
      bankFilter
        ? investmentTransactions.filter((transaction) => transaction.bankId === bankFilter)
        : investmentTransactions,
    [investmentTransactions, bankFilter],
  );

  /**
   * Regroupement par actif.
   *
   * Une ligne bancaire ne dit pas toujours ce qu'elle achète : les imports CSV
   * n'ont ni ticker ni type, seul le libellé (« ACHAT BTCEUR ») les trahit. On
   * prend donc le ticker explicite, sinon celui déduit du libellé, sinon le
   * libellé lui-même comme clé de regroupement.
   */
  const groups = useMemo<AssetGroup[]>(() => {
    const map = new Map<string, AssetGroup>();

    for (const transaction of scoped) {
      const extracted = extractTickerFromDescription(transaction.description);
      const ticker = transaction.ticker || extracted || null;
      const key = ticker || transaction.description;

      let group = map.get(key);
      if (!group) {
        group = {
          key,
          name: transaction.description,
          ticker,
          assetType: transaction.assetType ?? (extracted ? 'CRYPTO' : null),
          transactions: [],
          netQuantity: 0,
          avgBuyPrice: 0,
          totalCost: 0,
        };
        map.set(key, group);
      }

      group.transactions.push(transaction);

      // Une ligne saisie à la main porte ticker et type ; elle fait autorité
      // sur une ligne importée du même actif, qui n'a que son libellé.
      if (transaction.ticker) {
        if (!group.ticker) group.ticker = transaction.ticker;
        group.name = transaction.description;
      }
      if (transaction.assetType && !group.assetType) group.assetType = transaction.assetType;
    }

    for (const group of map.values()) {
      let boughtQuantity = 0;
      let boughtCost = 0;
      let soldQuantity = 0;

      for (const transaction of group.transactions) {
        if (transaction.amount < 0) {
          boughtQuantity += transaction.quantity || 0;
          boughtCost += Math.abs(transaction.amount);
        } else {
          soldQuantity += transaction.quantity || 0;
        }
      }

      group.netQuantity = boughtQuantity - soldQuantity;
      group.totalCost = boughtCost;
      group.avgBuyPrice = boughtQuantity > 0 ? boughtCost / boughtQuantity : 0;
    }

    // Le seuil absorbe les arrondis flottants d'une position soldée : après
    // avoir tout revendu, il reste souvent 1e-16 unité en mémoire.
    return Array.from(map.values())
      .filter((group) => group.netQuantity > 0.0000001)
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [scoped]);

  // ── Cotations ──
  //
  // Deux sources : CoinGecko pour les cryptomonnaies, Yahoo (via le backend)
  // pour les titres. Un actif sans type mais avec un ticker est traité comme
  // une crypto, seul cas où le ticker se déduit du libellé.
  const cryptoTickers = useMemo(
    () =>
      groups
        .filter((group) => group.ticker && (group.assetType === 'CRYPTO' || !group.assetType))
        .map((group) => group.ticker as string),
    [groups],
  );

  const marketSymbols = useMemo(
    () =>
      groups
        .filter((group) => group.ticker && (group.assetType === 'ETF' || group.assetType === 'ACTION'))
        .map((group) => group.ticker as string),
    [groups],
  );

  const {
    prices: cryptoPrices,
    loading: cryptoLoading,
    error: cryptoError,
    refresh: refreshCrypto,
  } = useCryptoPrices(cryptoTickers);

  const {
    prices: marketPrices,
    loading: marketLoading,
    error: marketError,
    refresh: refreshMarket,
  } = useMarketPrices(marketSymbols);

  const pricesLoading = cryptoLoading || marketLoading;

  const cryptoKey = cryptoTickers.join(',');
  const marketKey = marketSymbols.join(',');

  const refreshPrices = useCallback(async () => {
    if (!cryptoKey && !marketKey) return;
    await Promise.all([refreshCrypto(), refreshMarket()]);
    setRefreshedAt(new Date());
  }, [cryptoKey, marketKey, refreshCrypto, refreshMarket]);

  // Les deux `refresh` sont mémorisés sur la liste de symboles : leur identité
  // ne change qu'à l'apparition d'un nouvel actif, jamais à chaque rendu.
  useEffect(() => {
    void refreshPrices();
  }, [refreshPrices]);

  useElapsedTicker(refreshedAt !== null);

  const priceOf = useCallback(
    (group: AssetGroup): number | undefined => {
      if (!group.ticker) return undefined;
      if (group.assetType === 'ETF' || group.assetType === 'ACTION') {
        return marketPrices[group.ticker]?.price;
      }
      return cryptoPrices[group.ticker];
    },
    [cryptoPrices, marketPrices],
  );

  /**
   * Valorisation du portefeuille.
   *
   * Un actif dont la cotation manque est compté à son prix de revient : le
   * porter à zéro ferait chuter le total de plusieurs milliers d'euros parce
   * qu'une API n'a pas répondu, ce qui est le pire des deux mensonges.
   */
  const portfolio = useMemo(() => {
    let value = 0;
    let cost = 0;

    for (const group of groups) {
      const price = priceOf(group);
      cost += group.totalCost;
      value += price != null ? group.netQuantity * price : group.totalCost;
    }

    const gain = value - cost;
    return { value, cost, gain, ratio: cost > 0 ? (gain / cost) * 100 : null };
  }, [groups, priceOf]);

  // ── Détail d'un actif ──
  //
  // La feuille se pilote par la clé de l'actif et non par une copie du groupe :
  // supprimer une ligne dans le détail doit remettre à jour les chiffres du
  // dessus, et solder la position doit refermer la feuille d'elle-même.
  const selected = useMemo(
    () => groups.find((group) => group.key === selectedKey) ?? null,
    [groups, selectedKey],
  );

  // Le contenu doit survivre à la fermeture le temps de l'animation de sortie ;
  // sans cela, la feuille se vide brutalement avant de descendre.
  const lastSelected = useRef<AssetGroup | null>(null);
  if (selected) lastSelected.current = selected;
  const detailed = selected ?? lastSelected.current;

  const deleteTransaction = async (transaction: Transaction) => {
    const confirmed = await requestConfirm(
      'Cette ligne sera retirée du portefeuille et du solde du compte.',
      { title: 'Supprimer le mouvement', confirmLabel: 'Supprimer', danger: true },
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await response.text());

      removeTransaction(transaction.id);
      // Le solde du compte-titres est recalculé côté serveur à partir des
      // mouvements : il faut le relire pour que le portefeuille reste juste.
      void loadBanks();
      toast.success('Mouvement supprimé');
    } catch (caught) {
      console.error('Suppression du mouvement impossible', caught);
      toast.error('Suppression impossible.');
    }
  };

  const handleAdded = (transaction: Transaction) => {
    addTransaction(transaction);
    void loadBanks();
    // Un actif ajouté sur un autre compte que celui filtré resterait invisible.
    if (bankFilter && transaction.bankId !== bankFilter) setBankFilter(null);
  };

  const priceError = cryptoError ?? marketError;
  const hasQuotes = cryptoTickers.length > 0 || marketSymbols.length > 0;

  return (
    <>
      <ScreenHeader
        title="Investissements"
        action={
          <IconButton label="Actualiser les prix" onClick={() => void refreshPrices()}>
            <ArrowPathIcon className={cx('h-5 w-5', pricesLoading && 'animate-spin')} />
          </IconButton>
        }
      />

      <ScreenBody>
        <div className="space-y-5">
          {loading ? (
            <>
              <SkeletonHero />
              <SkeletonList rows={4} />
            </>
          ) : (
            <>
              {(groups.length > 0 || selectableBanks.length > 0) && (
                <BalanceCard
                  label="Valeur du portefeuille"
                  amount={portfolio.value}
                  selector={
                    <span className="rounded-full bg-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-white/85 backdrop-blur">
                      {groups.length} actif{groups.length > 1 ? 's' : ''}
                    </span>
                  }
                  footer={
                    portfolio.ratio !== null ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={cx(
                            'flex items-center gap-1.5 text-[15px] font-semibold tabular-nums',
                            portfolio.gain >= 0 ? 'text-emerald-300' : 'text-red-300',
                          )}
                        >
                          {portfolio.gain >= 0 ? (
                            <ArrowTrendingUpIcon className="h-4 w-4" />
                          ) : (
                            <ArrowTrendingDownIcon className="h-4 w-4" />
                          )}
                          {formatSigned(portfolio.gain)}
                        </span>
                        <span
                          className={cx(
                            'rounded-full bg-white/[0.14] px-2 py-0.5 text-[12px] font-semibold tabular-nums',
                            portfolio.gain >= 0 ? 'text-emerald-200' : 'text-red-200',
                          )}
                        >
                          {formatSignedPercent(portfolio.ratio)}
                        </span>
                      </div>
                    ) : null
                  }
                />
              )}

              {refreshedAt && (
                <p className={cx(text.caption, 'flex items-center gap-2')}>
                  <span
                    className={cx(
                      'h-1.5 w-1.5 rounded-full',
                      pricesLoading ? 'animate-pulse bg-amber-400' : 'bg-emerald-400',
                    )}
                    aria-hidden="true"
                  />
                  Prix mis à jour {freshness(refreshedAt)}
                </p>
              )}

              {priceError && hasQuotes && (
                <ErrorNotice
                  message="Les cotations n’ont pas pu être récupérées. Les actifs concernés sont valorisés à leur prix de revient."
                  onRetry={() => void refreshPrices()}
                />
              )}

              {selectableBanks.length > 1 && (
                <ChipRow>
                  <Chip label="Tous" active={bankFilter === null} onClick={() => setBankFilter(null)} />
                  {selectableBanks.map((bank) => (
                    <Chip
                      key={bank.id}
                      label={bank.shortName || bank.name}
                      active={bankFilter === bank.id}
                      onClick={() => setBankFilter(bank.id)}
                      leading={
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: bank.color }}
                          aria-hidden="true"
                        />
                      }
                    />
                  ))}
                </ChipRow>
              )}

              <section>
                <SectionHeader title="Mes actifs" />

                {groups.length === 0 ? (
                  <div className={cx(radii.tile, surfaces.card)}>
                    {selectableBanks.length === 0 ? (
                      <EmptyState
                        icon="🏦"
                        title="Aucun compte-titres"
                        description="Créez d’abord un compte d’investissement dans votre portefeuille."
                        action={
                          <PrimaryButton onClick={() => navigate('/banks')}>
                            Ouvrir le portefeuille
                          </PrimaryButton>
                        }
                      />
                    ) : bankFilter ? (
                      <EmptyState
                        icon="🔍"
                        title="Aucun actif sur ce compte"
                        description="Les positions des autres comptes restent visibles dans « Tous »."
                        action={
                          <PrimaryButton onClick={() => setBankFilter(null)}>
                            Voir tous les comptes
                          </PrimaryButton>
                        }
                      />
                    ) : (
                      <EmptyState
                        icon="📈"
                        title="Aucun actif"
                        description="Ajoutez une première position, ou importez le relevé de votre compte-titres."
                        action={<PrimaryButton onClick={() => setAdding(true)}>Ajouter un actif</PrimaryButton>}
                      />
                    )}
                  </div>
                ) : (
                  <ListCard>
                    {groups.map((group) => (
                      <AssetLine
                        key={group.key}
                        group={group}
                        price={priceOf(group)}
                        loadingPrice={pricesLoading}
                        onPress={() => setSelectedKey(group.key)}
                      />
                    ))}
                  </ListCard>
                )}
              </section>
            </>
          )}
        </div>
      </ScreenBody>

      {selectableBanks.length > 0 && <Fab label="Actif" onClick={() => setAdding(true)} />}

      <AssetSheet
        open={Boolean(selected)}
        group={detailed}
        price={detailed ? priceOf(detailed) : undefined}
        loadingPrice={pricesLoading}
        onClose={() => setSelectedKey(null)}
        onDelete={deleteTransaction}
      />

      <AddAssetSheet
        open={adding}
        banks={selectableBanks}
        onClose={() => setAdding(false)}
        onAdded={handleAdded}
      />
    </>
  );
}

// ─── Ligne d'actif ──────────────────────────────────────────────────────────

/**
 * Pastille de tête.
 *
 * Trois caractères du ticker suffisent à reconnaître une position ; la teinte
 * dit la nature de l'actif. Un logo par valeur serait plus joli mais suppose un
 * catalogue d'images que l'application n'a pas.
 */
function AssetGlyph({ group }: { group: AssetGroup }) {
  const tone = assetTone(group.assetType);
  const symbol = group.ticker
    ? group.ticker.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase()
    : merchantInitials(group.name);

  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tracking-tight"
      aria-hidden="true"
      style={{ backgroundColor: `${tone.color}2e`, color: tone.color }}
    >
      {symbol}
    </div>
  );
}

function AssetLine({
  group,
  price,
  loadingPrice,
  onPress,
}: {
  group: AssetGroup;
  price: number | undefined;
  loadingPrice: boolean;
  onPress: () => void;
}) {
  const value = price != null ? group.netQuantity * price : null;
  const ratio =
    value !== null && group.totalCost > 0 ? ((value - group.totalCost) / group.totalCost) * 100 : null;

  return (
    <ListRow
      onClick={onPress}
      leading={<AssetGlyph group={group} />}
      title={
        <span>
          {group.ticker ?? group.name}
          {group.ticker && group.name !== group.ticker && (
            <span className="ml-1.5 font-normal text-zinc-500">{group.name}</span>
          )}
        </span>
      }
      subtitle={
        <span className="tabular-nums">
          {QUANTITY.format(group.netQuantity)}
          {group.ticker ? ` ${group.ticker}` : ''}
        </span>
      }
      trailing={
        <span className={cx(text.rowAmount, 'text-zinc-50')}>
          {formatMoney(value ?? group.totalCost)}
        </span>
      }
      trailingSub={
        ratio !== null ? (
          <span className={cx('tabular-nums', ratio >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {formatSignedPercent(ratio)}
          </span>
        ) : loadingPrice ? (
          <span className="text-zinc-600">cotation…</span>
        ) : (
          <span className="text-zinc-600">prix de revient</span>
        )
      }
    />
  );
}

// ─── Détail d'un actif ──────────────────────────────────────────────────────

function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div className={cx(radii.row, surfaces.card, 'px-4 py-3.5')}>
      <p className={text.label}>{label}</p>
      <p
        className={cx(
          'mt-1.5 text-[17px] font-semibold leading-tight tabular-nums',
          tone === 'positive' ? 'text-emerald-400' : tone === 'negative' ? 'text-red-400' : 'text-zinc-50',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[12px] tabular-nums text-zinc-500">{sub}</p>}
    </div>
  );
}

function AssetSheet({
  open,
  group,
  price,
  loadingPrice,
  onClose,
  onDelete,
}: {
  open: boolean;
  group: AssetGroup | null;
  price: number | undefined;
  loadingPrice: boolean;
  onClose: () => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const tone = assetTone(group?.assetType ?? null);
  const value = group && price != null ? group.netQuantity * price : null;
  const gain = group && value !== null ? value - group.totalCost : null;
  const ratio = group && gain !== null && group.totalCost > 0 ? (gain / group.totalCost) * 100 : null;

  // L'ordre du serveur suit la date décroissante, mais une position reconstruite
  // depuis plusieurs comptes peut arriver mêlée : on retrie sans toucher au
  // tableau du magasin.
  const history = group
    ? [...group.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      fullHeight
      title={group?.ticker ?? group?.name ?? 'Actif'}
      // Le libellé n'est repris que s'il apporte autre chose que le ticker : la
      // nature de l'actif est déjà dite par la pastille de couleur en dessous.
      subtitle={group && group.name !== group.ticker ? group.name : undefined}
    >
      {group && (
        <div className="space-y-4 pt-1">
          {/* ── Cotation ── */}
          <div
            className={cx(
              radii.tile,
              surfaces.card,
              'flex items-end justify-between gap-3 px-4 py-4',
            )}
          >
            <div className="min-w-0">
              <p className={text.label}>Prix actuel</p>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums text-zinc-50">
                {price != null ? formatUnitPrice(price) : loadingPrice ? '…' : '—'}
              </p>
              {price == null && !loadingPrice && (
                <p className="mt-1.5 text-[12px] text-zinc-500">Cotation indisponible</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ backgroundColor: `${tone.color}24`, color: tone.color }}
              >
                {tone.label}
              </span>
              {ratio !== null && (
                <span
                  className={cx(
                    'text-[15px] font-semibold tabular-nums',
                    ratio >= 0 ? 'text-emerald-400' : 'text-red-400',
                  )}
                >
                  {formatSignedPercent(ratio)}
                </span>
              )}
            </div>
          </div>

          {/* ── Chiffres clés ── */}
          <div className="grid grid-cols-2 gap-2.5">
            <Figure label="Quantité" value={QUANTITY.format(group.netQuantity)} sub={group.ticker ?? undefined} />
            <Figure
              label="PRU"
              value={formatUnitPrice(group.avgBuyPrice)}
              sub={`Investi ${formatMoney(group.totalCost)}`}
            />
            <Figure
              label="Valeur"
              value={value !== null ? formatMoney(value) : formatMoney(group.totalCost)}
              sub={value === null ? 'au prix de revient' : undefined}
            />
            <Figure
              label={gain !== null && gain < 0 ? 'Moins-value' : 'Plus-value'}
              value={gain !== null ? formatSigned(gain) : '—'}
              sub={ratio !== null ? formatSignedPercent(ratio) : undefined}
              tone={gain === null ? undefined : gain >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {/* ── Mouvements ── */}
          <section>
            <SectionHeader title={`Mouvements (${history.length})`} />
            <ListCard>
              {history.map((transaction) => (
                <ListRow
                  key={transaction.id}
                  title={transaction.amount < 0 ? 'Achat' : 'Vente'}
                  subtitle={
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: transaction.bank.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate tabular-nums">
                        {transaction.quantity != null && transaction.unitPrice != null
                          ? `${QUANTITY.format(transaction.quantity)} × ${formatUnitPrice(transaction.unitPrice)}`
                          : transaction.description}
                      </span>
                    </span>
                  }
                  trailing={
                    <div className="flex items-center gap-1">
                      <span className="text-right">
                        <Amount value={transaction.amount} signed className={text.rowAmount} />
                        <span className="mt-0.5 block text-[12px] text-zinc-500">
                          {formatShortDate(transaction.date)}
                        </span>
                      </span>
                      {/* Le tableau desktop cache cette corbeille derrière le
                          survol : ici elle est toujours là, à taille de pouce. */}
                      <button
                        type="button"
                        onClick={() => onDelete(transaction)}
                        aria-label="Supprimer le mouvement"
                        className="tappable -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-600 active:bg-red-500/15 active:text-red-400"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  }
                />
              ))}
            </ListCard>
          </section>
        </div>
      )}
    </Sheet>
  );
}

// ─── Ajout d'un actif ───────────────────────────────────────────────────────

interface AddErrors {
  ticker?: string;
  quantity?: string;
  unitPrice?: string;
  bankId?: string;
}

/**
 * Saisie d'une position.
 *
 * Le formulaire desktop demande un nom *et* un ticker, alors que le
 * regroupement ne se fait que sur le second : sur un clavier virtuel, c'est une
 * frappe sur deux pour rien. Le ticker sert donc aussi de libellé.
 *
 * Le montant n'est pas saisi non plus : quantité × prix unitaire le donne, et
 * un achat est toujours un débit — laisser l'utilisateur taper « −1 234,56 »
 * n'ouvrirait que la porte aux erreurs de signe.
 */
function AddAssetSheet({
  open,
  banks,
  onClose,
  onAdded,
}: {
  open: boolean;
  banks: Bank[];
  onClose: () => void;
  onAdded: (transaction: Transaction) => void;
}) {
  const [assetType, setAssetType] = useState<AssetType>('CRYPTO');
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [bankId, setBankId] = useState('');
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [errors, setErrors] = useState<AddErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssetType('CRYPTO');
    setTicker('');
    setQuantity('');
    setUnitPrice('');
    setBankId(banks[0]?.id ?? '');
    setDate(toISODate(new Date()));
    setErrors({});
    setSaving(false);
  }, [open, banks]);

  const parsedQuantity = parseAmount(quantity);
  const parsedPrice = parseAmount(unitPrice);
  const total =
    parsedQuantity !== null && parsedPrice !== null && parsedQuantity > 0 && parsedPrice > 0
      ? parsedQuantity * parsedPrice
      : null;

  const submit = async () => {
    const symbol = ticker.trim().toUpperCase();
    const found: AddErrors = {};

    if (!symbol) found.ticker = 'Indiquez le symbole de l’actif.';
    if (parsedQuantity === null || parsedQuantity <= 0) found.quantity = 'Quantité invalide.';
    if (parsedPrice === null || parsedPrice <= 0) found.unitPrice = 'Prix unitaire invalide.';
    if (!bankId) found.bankId = 'Choisissez un compte.';

    if (parsedQuantity === null || parsedPrice === null || Object.keys(found).length > 0) {
      setErrors(found);
      toast.error('Vérifiez les champs signalés.');
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: symbol,
          ticker: symbol,
          assetType,
          quantity: parsedQuantity,
          unitPrice: parsedPrice,
          amount: -(parsedQuantity * parsedPrice),
          date,
          bankId,
        }),
      });

      if (!response.ok) throw new Error(await response.text());

      onAdded(await response.json());
      toast.success(`${symbol} ajouté au portefeuille`);
      onClose();
    } catch (caught) {
      console.error('Ajout de l’actif impossible', caught);
      toast.error('Ajout impossible. Vérifiez la connexion au serveur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ajouter un actif"
      subtitle="Une position achetée sur un compte-titres."
      footer={
        <div className="space-y-2.5">
          {total !== null && (
            <div className="flex items-center justify-between px-1">
              <span className={text.caption}>Montant investi</span>
              <span className="text-[15px] font-semibold tabular-nums text-zinc-50">
                {formatMoney(total)}
              </span>
            </div>
          )}
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? 'Ajout…' : 'Ajouter'}
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <SegmentedControl<AssetType>
          value={assetType}
          onChange={setAssetType}
          options={[
            { value: 'CRYPTO', label: 'Crypto' },
            { value: 'ETF', label: 'ETF' },
            { value: 'ACTION', label: 'Action' },
          ]}
        />

        <Field
          label="Ticker"
          error={errors.ticker}
          hint={assetType === 'CRYPTO' ? 'BTC, ETH, SOL…' : 'AAPL, CW8.PA, ESE.PA…'}
        >
          <TextInput
            value={ticker}
            onChange={(event) => setTicker(event.target.value.toUpperCase())}
            placeholder={assetType === 'CRYPTO' ? 'BTC' : 'AAPL'}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
          />
        </Field>

        <Field label="Quantité" error={errors.quantity}>
          {/* `AmountInput` affiche un « € » : hors sujet pour un nombre de
              parts, mais c'est le seul champ qui accepte la virgule du clavier
              décimal français — on lui reprend juste son mode de saisie. */}
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={quantity}
            placeholder="0"
            onChange={(event) => setQuantity(event.target.value.replace(/[^\d.,]/g, ''))}
            className={cx(fieldControl, 'text-[17px] font-semibold tabular-nums')}
          />
        </Field>

        <Field label="Prix unitaire" error={errors.unitPrice}>
          <AmountInput value={unitPrice} onChange={setUnitPrice} />
        </Field>

        <Field label="Compte" error={errors.bankId}>
          <SelectInput value={bankId} onChange={setBankId}>
            {banks.length === 0 && <option value="">Aucun compte-titres</option>}
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Date d’achat">
          <DateInput value={date} onChange={setDate} />
        </Field>
      </div>
    </Sheet>
  );
}
