import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowPathIcon, ChevronDownIcon, EllipsisHorizontalIcon, LinkIcon } from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import type { Bank } from '../../types';
import { assetUrl } from '../../lib/url';
import { formatMoney, formatMoneyCompact, formatPercent } from '../../lib/format';
import { sparklinePath } from '../../lib/sparkline';
import { ScreenBody, ScreenHeader, SectionHeader } from '../components/Screen';
import BalanceCard from '../components/BalanceCard';
import BankCard from '../components/BankCard';
import BankSheet, { BankFormSheet, BankLinkSheet } from '../components/BankSheet';
import { ACCOUNT_TYPE_LABEL, formatSyncDate, spendableForBank } from '../bank';
import SpaceSheet from '../components/SpaceSheet';
import Avatar from '../components/Avatar';
import { Fab, IconButton, LightPill, PrimaryButton } from '../components/Controls';
import { EmptyState, Skeleton, SkeletonHero, SkeletonList } from '../components/Feedback';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Comptes.
 *
 * L'écran desktop range les comptes dans trois grilles de tuiles de même
 * densité. Transposé tel quel sur 390 points de large, cela donne des vignettes
 * de 160 points où le solde — la seule chose qu'on vient chercher — tombe à
 * douze pixels de haut.
 *
 * On distingue donc deux natures d'objets, parce qu'on ne les consulte pas de
 * la même façon :
 *   • les comptes courants sont des CARTES, feuilletées du pouce dans un
 *     carrousel comme on feuillette un portefeuille ;
 *   • l'épargne et les placements sont des LIGNES : on n'y regarde pas un
 *     numéro de carte mais une trajectoire, d'où la courbe pleine largeur.
 *
 * Les actions par compte vivaient derrière un « … » qui n'apparaissait qu'au
 * survol : ici, la carte entière ouvre la feuille d'actions.
 */

/**
 * Repère de la courbe d'évolution.
 *
 * Les dimensions ne sont qu'un système de coordonnées : le SVG est étiré à la
 * largeur disponible (`preserveAspectRatio="none"`), et le trait garde son
 * épaisseur grâce à `vector-effect`. Une largeur en pixels, comme sur le
 * desktop, laisserait un trognon de courbe au milieu d'une ligne large.
 */
const SPARK_VIEWBOX = { width: 100, height: 26 };

/** Au-delà de six heures, les soldes affichés ne veulent plus dire grand-chose. */
const AUTO_SYNC_AFTER_MS = 6 * 60 * 60 * 1000;

export default function WalletScreen() {
  const navigate = useNavigate();
  const {
    banks,
    users,
    currentSpace,
    loadBanks,
    loadUsers,
    loadTransactions,
    loadDashboardOverview,
    setSelectedBank,
  } = useAppStore();

  const [loading, setLoading] = useState(banks.length === 0);
  const [spaceOpen, setSpaceOpen] = useState(false);

  // Le compte survit à la fermeture de sa feuille : celle-ci s'anime pendant
  // 220 ms et afficherait un titre vide si on l'effaçait tout de suite.
  const [actionBank, setActionBank] = useState<Bank | null>(null);
  const [actionOpen, setActionOpen] = useState(false);

  const [formBank, setFormBank] = useState<Bank | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [linkBank, setLinkBank] = useState<Bank | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  // Synchronisations automatiques en cours, pour l'indicateur des cartes.
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const autoSynced = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([loadUsers(), loadBanks()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadUsers, loadBanks, currentSpace?.id]);

  /**
   * Rafraîchissement des comptes liés à leur banque.
   *
   * Un solde vieux de plusieurs jours est pire qu'un solde absent : on le lit
   * comme la vérité du jour. Les comptes liés dont la dernière synchronisation
   * remonte à plus de six heures sont donc rapatriés à l'ouverture de l'écran,
   * une seule fois par session — d'où le registre en référence, qui survit aux
   * rendus déclenchés par le rechargement des comptes.
   */
  useEffect(() => {
    const stale = banks.filter(
      (bank) =>
        bank.ebStatus === 'LINKED' &&
        bank.ebAccountUid &&
        !autoSynced.current.has(bank.id) &&
        Date.now() - (bank.ebLastSyncAt ? new Date(bank.ebLastSyncAt).getTime() : 0) >
          AUTO_SYNC_AFTER_MS,
    );
    if (stale.length === 0) return;

    stale.forEach((bank) => autoSynced.current.add(bank.id));
    setSyncing((previous) => {
      const next = new Set(previous);
      stale.forEach((bank) => next.add(bank.id));
      return next;
    });

    void (async () => {
      let imported = 0;
      for (const bank of stale) {
        try {
          const response = await fetch(`/api/enablebanking/banks/${bank.id}/sync`, {
            method: 'POST',
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            // Un consentement échu se règle en repassant par la banque : le
            // dire une fois suffit, le bandeau de la carte prend le relais.
            if (data.error === 'CONSENT_EXPIRED' || data.error === 'SESSION_EXPIRED') {
              toast.error(`${bank.name} : connexion bancaire à renouveler.`, { duration: 6000 });
            } else {
              console.error(`Synchronisation de ${bank.name} impossible`, data);
            }
            continue;
          }
          imported += (data.imported ?? 0) + (data.pendingReconciled ?? 0);
        } catch (caught) {
          console.error(`Synchronisation de ${bank.name} impossible`, caught);
        } finally {
          setSyncing((previous) => {
            const next = new Set(previous);
            next.delete(bank.id);
            return next;
          });
        }
      }

      await loadBanks();
      // L'historique n'est rechargé que si la banque a rendu quelque chose :
      // sinon, chaque ouverture de l'écran ferait clignoter les écrans voisins
      // pour rien.
      if (imported > 0) {
        await loadTransactions({ forceRefresh: true });
        void loadDashboardOverview();
        toast.success(`${imported} opération(s) importée(s)`);
      }
    })();
  }, [banks, loadBanks, loadTransactions, loadDashboardOverview]);

  /**
   * Comptes visibles, rangés par nature.
   *
   * Un compte archivé n'est pas rendu par l'API, mais le tri est fait ici pour
   * que le total affiché soit calculé exactement comme celui de l'accueil : ces
   * deux chiffres sont côte à côte dans la tête de l'utilisateur.
   */
  const { current, savings, investments, total, spendableTotal, setAside } = useMemo(() => {
    const active = banks.filter((bank) => !bank.archived);
    const daily = active.filter((bank) => bank.accountType !== 'INVESTMENT');

    return {
      current: active.filter((bank) => bank.accountType === 'CURRENT'),
      savings: active.filter((bank) => bank.accountType === 'SAVINGS'),
      investments: active.filter((bank) => bank.accountType === 'INVESTMENT'),
      // Les placements sont exclus : un portefeuille d'actions monte et descend
      // sans qu'un euro n'ait bougé, et ferait varier le « solde total » de
      // plusieurs centaines d'euros sans qu'aucune opération ne l'explique.
      total: daily.reduce((sum, bank) => sum + (bank.balance ?? 0), 0),
      spendableTotal: daily
        .filter(spendableForBank)
        .reduce((sum, bank) => sum + (bank.balance ?? 0), 0),
      setAside: daily
        .filter((bank) => !spendableForBank(bank))
        .reduce((sum, bank) => sum + (bank.balance ?? 0), 0),
    };
  }, [banks]);

  const openActions = useCallback((bank: Bank) => {
    setSelectedBank(bank);
    navigate('/transactions');
  }, [setSelectedBank, navigate]);

  const openMenu = useCallback((bank: Bank) => {
    setActionBank(bank);
    setActionOpen(true);
  }, []);

  const openCreate = useCallback(() => {
    setFormBank(null);
    setFormOpen(true);
  }, []);

  const openLink = useCallback((bank: Bank | null) => {
    setLinkBank(bank);
    setLinkOpen(true);
  }, []);

  const empty = !loading && banks.length === 0;

  return (
    <>
      <ScreenHeader
        title="Portefeuille"
        action={
          <IconButton label="Lier ma banque" onClick={() => openLink(null)}>
            <LinkIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      <ScreenBody>
        <div className="space-y-6">
          {loading ? (
            <SkeletonHero />
          ) : (
            <BalanceCard
              label="Solde total"
              amount={total}
              selector={
                <LightPill onClick={() => setSpaceOpen(true)}>
                  <span className="truncate">{currentSpace?.name ?? 'Mon espace'}</span>
                  <ChevronDownIcon className="h-4 w-4 shrink-0" />
                </LightPill>
              }
              footer={
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium text-white/85">
                  <span>
                    <span className="tabular-nums">{formatMoneyCompact(spendableTotal)}</span>
                    <span className="text-white/55"> au quotidien</span>
                  </span>
                  {setAside !== 0 && (
                    <span>
                      <span className="tabular-nums">{formatMoneyCompact(setAside)}</span>
                      <span className="text-white/55"> de côté</span>
                    </span>
                  )}
                </div>
              }
            />
          )}

          {syncing.size > 0 && (
            <div
              className={cx(
                radii.row,
                'flex items-center gap-2 border border-violet-500/20 bg-violet-500/10 px-4 py-2.5',
                'text-[13px] text-violet-200',
              )}
            >
              <ArrowPathIcon className="h-4 w-4 shrink-0 animate-spin" />
              Synchronisation en cours…
            </div>
          )}

          {loading && (
            <>
              <div className="-mx-5 flex gap-3 px-5">
                <Skeleton className="h-[190px] w-[300px] shrink-0 rounded-[24px]" />
                <Skeleton className="h-[190px] w-[300px] shrink-0 rounded-[24px]" />
              </div>
              <SkeletonList rows={3} />
            </>
          )}

          {empty && (
            <div className={cx(radii.tile, surfaces.card)}>
              <EmptyState
                icon="🏦"
                title="Aucun compte"
                description="Ajoutez un compte pour suivre son solde, ou liez directement votre banque pour importer vos opérations."
                action={<PrimaryButton onClick={openCreate}>Ajouter un compte</PrimaryButton>}
              />
            </div>
          )}

          {/* ── Comptes courants ──
              Le débord (`-mx-5 px-5`) laisse la carte suivante mordre le bord :
              c'est ce qui dit qu'on peut faire défiler. */}
          {current.length > 0 && (
            <section>
              <SectionHeader title="Comptes courants" />
              <div className="no-scrollbar snap-row -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                {current.map((bank) => (
                  <BankCard
                    key={bank.id}
                    bank={bank}
                    variant="carousel"
                    members={users.length > 1 ? (bank.users ?? []) : []}
                    syncing={syncing.has(bank.id)}
                    onPress={openActions}
                    onMenu={openMenu}
                  />
                ))}
              </div>
            </section>
          )}

          {savings.length > 0 && (
            <section>
              <SectionHeader title="Épargne" />
              <AccountList banks={savings} onPress={openActions} onMenu={openMenu} />
            </section>
          )}

          {investments.length > 0 && (
            <section>
              <SectionHeader
                title="Investissements"
                actionLabel="Détail"
                onAction={() => navigate('/investissement')}
              />
              <AccountList banks={investments} onPress={openActions} onMenu={openMenu} />
            </section>
          )}
        </div>
      </ScreenBody>

      <Fab label="Compte" onClick={openCreate} />

      <BankSheet
        bank={actionBank}
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        onEdit={(bank) => {
          setFormBank(bank);
          setFormOpen(true);
        }}
        onLink={openLink}
      />

      <BankFormSheet open={formOpen} onClose={() => setFormOpen(false)} bank={formBank} />

      <BankLinkSheet
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        bank={linkBank}
        onManual={openCreate}
      />

      <SpaceSheet open={spaceOpen} onClose={() => setSpaceOpen(false)} />

    </>
  );
}

// ─── Épargne et placements ──────────────────────────────────────────────────

function AccountList({ banks, onPress, onMenu }: { banks: Bank[]; onPress: (bank: Bank) => void; onMenu?: (bank: Bank) => void }) {
  return (
    <div className={cx(radii.tile, surfaces.card, 'divide-y divide-white/[0.05] px-4')}>
      {banks.map((bank) => (
        <AccountRow key={bank.id} bank={bank} onPress={onPress} onMenu={onMenu} />
      ))}
    </div>
  );
}

/**
 * Un livret ou un placement, en ligne.
 *
 * Ces comptes-là ne se consultent pas pour un numéro de carte mais pour une
 * trajectoire : la courbe des six derniers mois court donc sur toute la
 * largeur, sous le solde, là où un desktop la comprime dans 88 pixels coincés
 * entre deux colonnes.
 */
function AccountRow({ bank, onPress, onMenu }: { bank: Bank; onPress: (bank: Bank) => void; onMenu?: (bank: Bank) => void }) {
  const path = sparklinePath(bank.points ?? [], SPARK_VIEWBOX.width, SPARK_VIEWBOX.height);
  const rising = (bank.trend ?? 0) >= 0;
  const sync = formatSyncDate(bank.ebLastSyncAt);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPress(bank)}
        className="tappable flex min-h-[60px] flex-1 py-3 text-left"
      >
        <span className="flex items-center gap-3">
          <BankBadge bank={bank} />

          <span className="min-w-0 flex-1">
            <span className={cx('block truncate', text.rowTitle)}>{bank.name}</span>
            <span className={cx('mt-0.5 block truncate', text.rowSubtitle)}>
              {ACCOUNT_TYPE_LABEL[bank.accountType]}
              {sync ? ` · ${sync}` : ''}
            </span>
          </span>

          <span className="shrink-0 text-right">
            <span className="block text-[15px] font-semibold tabular-nums text-zinc-50" data-selectable>
              {formatMoney(bank.balance)}
            </span>
            {bank.trend !== null && bank.trend !== undefined && (
              <span
                className={cx(
                  'mt-0.5 block text-[12px] font-medium tabular-nums',
                  rising ? 'text-emerald-400' : 'text-red-400',
                )}
              >
                {rising ? '↑' : '↓'} {formatPercent(Math.abs(bank.trend), 1)}
              </span>
            )}
          </span>
        </span>

        {path && (
          <svg
            viewBox={`0 0 ${SPARK_VIEWBOX.width} ${SPARK_VIEWBOX.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="mt-2.5 block h-6 w-full overflow-visible"
          >
            <path
              d={path}
              fill="none"
              stroke={rising ? '#a78bfa' : '#f87171'}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </button>
      {onMenu && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(bank);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 active:bg-white/10"
          aria-label="Actions du compte"
        >
          <EllipsisHorizontalIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Pastille d'un compte en liste.
 *
 * Le logotype rapatrié de la banque est un lettrage large : dans un rond de 44
 * points il faut le poser sur une plaque claire, sans quoi un lettrage sombre
 * disparaît sur le fond noir de l'écran.
 */
function BankBadge({ bank }: { bank: Bank }) {
  if (bank.image) {
    return <Avatar label={bank.name} image={bank.image} color={bank.color} />;
  }

  if (bank.brandLogo) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/95 p-2 ring-1 ring-black/5">
        <img
          src={assetUrl(bank.brandLogo)}
          alt=""
          aria-hidden="true"
          className="max-h-full max-w-full object-contain"
        />
      </span>
    );
  }

  return <Avatar label={bank.name} color={bank.color} />;
}
