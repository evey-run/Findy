import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import type { Category, Transaction } from '../../types';
import {
  formatDayLabel,
  formatMonthYear,
  formatSigned,
  monthRange,
  toISODate,
} from '../../lib/format';
import { ScreenBody, ScreenHeader } from '../components/Screen';
import { Fab, GhostButton, PrimaryButton, Chip, ChipRow } from '../components/Controls';
import { ListCard } from '../components/ListRow';
import TransactionRow from '../components/TransactionRow';
import TransactionSheet from '../components/TransactionSheet';
import TransactionTraceSheet from '../components/TransactionTraceSheet';
import TransactionGroupRow from '../components/TransactionGroupRow';
import { groupDayRows } from '../../lib/groupTransactions';
import Amount from '../components/Amount';
import { EmptyState, ErrorNotice, SkeletonList } from '../components/Feedback';
import { cx, GUTTER, radii, surfaces, TAP_TARGET, text } from '../theme';

/**
 * Opérations.
 *
 * L'écran desktop est un tableau de six colonnes : cases à cocher, édition de
 * cellule au clic, suppression au survol. Rien de tout cela ne survit au
 * tactile — il n'y a pas de survol, une cellule de 24 points ne se vise pas au
 * pouce, et l'enregistrement à la perte du focus part tout seul dès qu'on fait
 * défiler la page pour voir le clavier.
 *
 * La transposition garde ce que le tableau apportait vraiment — chercher,
 * filtrer, remonter loin dans l'historique — et change la façon d'y accéder :
 * la recherche et les filtres restent collés en haut, la liste se lit par
 * journées, et toute modification passe par une feuille avec validation
 * explicite.
 */

const PAGE_NAME = 'transactions';

/**
 * Taille de page.
 *
 * Assez pour couvrir deux hauteurs d'écran d'un coup — donc pour que le
 * défilement ne bute jamais sur un chargement — assez peu pour que la première
 * page arrive vite sur une connexion mobile.
 */
const PAGE_SIZE = 25;

/** Au-delà, la rangée de pastilles cesse d'être un filtre et devient un catalogue. */
const TOP_CATEGORIES = 8;

export default function TransactionsScreen() {
  const {
    transactions,
    categories,
    banks,
    selectedBank,
    setSelectedBank,
    loadTransactions,
    loadMoreTransactions,
    appendTransactions,
    loadCategories,
    loadBanks,
    currentSpace,
  } = useAppStore();

  // ── Filtres ───────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  /** Valeur réellement envoyée au serveur, en retrait de la frappe. */
  const [searchText, setSearchText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  /** Sens du flux : revenus (`positive`) ou dépenses (`negative`), sinon tout. */
  const [sign, setSign] = useState<'' | 'positive' | 'negative'>('');
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [allTime, setAllTime] = useState(false);

  // ── Chargement et pagination ──────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  /**
   * Interdit de demander la page 2 tant que la page 1 n'est pas revenue :
   * les deux requêtes partiraient avec le même offset local et un bloc entier
   * de la liste manquerait.
   */
  const initialLoadDone = useRef(false);

  // ── Feuilles ──────────────────────────────────────────────────────────────
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  /** L'opération dont on regarde le trajet de l'argent. */
  const [tracing, setTracing] = useState<Transaction | null>(null);

  const spaceId = currentSpace?.id;
  const bankId = selectedBank?.id ?? '';

  const { startDate, endDate } = useMemo(
    () => (allTime ? { startDate: '', endDate: '' } : monthRange(monthCursor)),
    [allTime, monthCursor],
  );

  // ── Navigation depuis le graphique de flux ────────────────────────────────
  //
  // Les barres de l'écran Analyse ouvrent `/transactions?startDate&endDate&type`
  // pour montrer les revenus ou dépenses de la période touchée. Ces paramètres
  // pilotent le mois affiché et le sens filtré — un écran qui les ignorerait
  // rouvrirait le mois courant, sans rapport avec la barre appuyée.
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const from = params.get('startDate') ?? params.get('endDate');
    if (from) {
      const date = new Date(from);
      if (!Number.isNaN(date.getTime())) {
        setMonthCursor(new Date(date.getFullYear(), date.getMonth(), 1));
        setAllTime(false);
      }
    }
    const type = params.get('type');
    setSign(type === 'income' ? 'positive' : type === 'expense' ? 'negative' : '');
  }, [location]);

  useEffect(() => {
    void loadCategories();
    void loadBanks();
  }, [loadCategories, loadBanks, spaceId]);

  // La frappe ne doit pas partir en requêtes : on attend que le doigt s'arrête.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchText(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const selectableBanks = useMemo(
    () => banks.filter((bank) => !bank.archived && bank.accountType !== 'INVESTMENT'),
    [banks],
  );

  /**
   * `selectedBank` est un état global, partagé avec les autres écrans. Une
   * sélection héritée d'ailleurs est acceptée telle quelle — la pastille
   * correspondante s'allume, l'utilisateur voit sur quoi il regarde — sauf si
   * ce compte n'a pas de pastille ici : il filtrerait alors la liste sans que
   * rien ne l'indique.
   */
  useEffect(() => {
    if (!selectedBank || banks.length === 0) return;
    if (!selectableBanks.some((bank) => bank.id === selectedBank.id)) setSelectedBank(null);
  }, [selectedBank, selectableBanks, banks.length, setSelectedBank]);

  /**
   * Chargement de la page 1.
   *
   * Tout changement de filtre repasse par ici — c'est le seul endroit qui
   * remet la pagination à zéro. Un second chemin de chargement « initial »
   * finirait toujours par diverger de celui-ci d'un paramètre ou d'un compteur.
   */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      initialLoadDone.current = false;
      setLoading(true);
      setFailed(false);
      setPage(1);
      setHasMore(true);

      try {
        // `forceRefresh` : sans lui, revenir sur l'écran réutilise la liste en
        // cache — déjà agrandie par le défilement infini — alors que la
        // pagination locale repart à 1. L'offset de la page suivante saute
        // alors autant de lignes que le cache en contenait de trop.
        await loadTransactions({
          searchText: searchText || undefined,
          categoryId: categoryId || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          amountSign: sign || undefined,
          excludeAccountType: 'INVESTMENT',
          pageName: PAGE_NAME,
          limit: PAGE_SIZE,
          forceRefresh: true,
        });
        if (cancelled) return;

        // Le backend renvoie un tableau nu, sans total ni indicateur : une page
        // pleine est la seule façon de soupçonner qu'il en reste.
        setHasMore(useAppStore.getState().transactions.length >= PAGE_SIZE);
        initialLoadDone.current = true;
      } catch (caught) {
        if (cancelled) return;
        console.error('Chargement des opérations impossible', caught);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [loadTransactions, searchText, categoryId, startDate, endDate, bankId, spaceId, retryToken, sign]);

  const loadMore = useCallback(async () => {
    if (!initialLoadDone.current || loading || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      // Les mêmes filtres qu'à la page 1, explicitement : `loadMoreTransactions`
      // ne retombe volontairement sur aucune plage de dates globale, laquelle
      // est pilotée par le tableau de bord et ramènerait un mois vide.
      const result = await loadMoreTransactions(nextPage, PAGE_SIZE, {
        searchText,
        categoryId,
        startDate,
        endDate,
        amountSign: sign || undefined,
        excludeAccountType: 'INVESTMENT',
        pageName: PAGE_NAME,
      });

      if (result.newTransactions.length > 0) {
        appendTransactions(result.newTransactions);
        setPage(nextPage);
      }
      // Une page vide arrête la pagination quoi qu'en dise le serveur :
      // continuer à l'interroger au même offset boucle indéfiniment.
      setHasMore(result.hasMore && result.newTransactions.length > 0);
    } finally {
      setLoadingMore(false);
    }
  }, [
    appendTransactions,
    categoryId,
    endDate,
    hasMore,
    loading,
    loadMoreTransactions,
    loadingMore,
    page,
    searchText,
    sign,
    startDate,
  ]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  /**
   * Défilement infini.
   *
   * La racine d'observation est la fenêtre — c'est le document qui défile, pas
   * un conteneur interne. L'observateur est recréé après chaque page : il
   * délivre une première mesure à l'observation, ce qui relance le chargement
   * tant que la sentinelle reste dans la marge. Sans cela, une liste trop
   * courte pour défiler resterait bloquée sur sa première page.
   */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '300px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // ── Pastilles de catégorie ────────────────────────────────────────────────
  const [rankedCategoryIds, setRankedCategoryIds] = useState<string[]>([]);

  useEffect(() => {
    // Le classement se fige dès qu'une catégorie est choisie : la liste chargée
    // ne contient alors plus qu'elle, et recalculer ferait disparaître toutes
    // les autres pastilles — c'est-à-dire le moyen d'en changer.
    if (categoryId) return;

    const counts = new Map<string, number>();
    for (const transaction of transactions) {
      if (!transaction.categoryId) continue;
      counts.set(transaction.categoryId, (counts.get(transaction.categoryId) ?? 0) + 1);
    }

    const next = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_CATEGORIES)
      .map(([id]) => id);

    setRankedCategoryIds((previous) =>
      previous.length === next.length && previous.every((id, index) => id === next[index])
        ? previous
        : next,
    );
  }, [transactions, categoryId]);

  const categoryChips = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const chips = rankedCategoryIds
      .map((id) => byId.get(id))
      .filter((category): category is Category => Boolean(category));

    // La catégorie active reste visible même si elle n'est pas dans le haut du
    // classement : sans sa pastille, on ne pourrait plus la désélectionner.
    const active = categoryId ? byId.get(categoryId) : undefined;
    if (active && !chips.some((category) => category.id === active.id)) chips.unshift(active);

    return chips;
  }, [categories, rankedCategoryIds, categoryId]);

  // ── Liste ─────────────────────────────────────────────────────────────────

  /**
   * Filet de sécurité côté client.
   *
   * Le serveur applique déjà ces trois filtres, mais le magasin est partagé :
   * une autre page a pu y laisser des lignes hors périmètre, et elles
   * apparaîtraient le temps que la requête revienne.
   */
  const visible = useMemo(() => {
    const investmentBankIds = new Set(
      banks.filter((bank) => bank.accountType === 'INVESTMENT').map((bank) => bank.id),
    );

    return transactions.filter((transaction) => {
      if (investmentBankIds.has(transaction.bankId)) return false;
      if (selectedBank && transaction.bankId !== selectedBank.id) return false;
      if (categoryId && transaction.categoryId !== categoryId) return false;
      if (sign === 'positive' && transaction.amount <= 0) return false;
      if (sign === 'negative' && transaction.amount >= 0) return false;
      return true;
    });
  }, [transactions, banks, selectedBank, categoryId, sign]);

  const sections = useMemo(() => {
    // Le magasin trie à chaque ajout de page, mais une opération créée à la
    // main est insérée en tête quelle que soit sa date : sans retri, une même
    // journée formerait deux groupes — donc deux clés React identiques.
    const ordered = [...visible].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const groups: { key: string; label: string; total: number; items: Transaction[] }[] = [];
    for (const transaction of ordered) {
      // Clé et libellé tirés du même calendrier local. Une clé en temps universel
      // et un libellé local se contredisent un soir d'été : deux groupes voisins
      // portent alors le même intitulé.
      const key = toISODate(new Date(transaction.date));
      const last = groups[groups.length - 1];

      if (last && last.key === key) {
        last.items.push(transaction);
        last.total += transaction.amount;
      } else {
        groups.push({
          key,
          label: formatDayLabel(transaction.date),
          total: transaction.amount,
          items: [transaction],
        });
      }
    }
    return groups;
  }, [visible]);

  const total = useMemo(
    () => visible.reduce((sum, transaction) => sum + transaction.amount, 0),
    [visible],
  );

  const filtering = Boolean(searchText || categoryId || selectedBank || sign) || !allTime;

  const now = new Date();
  const atCurrentMonth =
    monthCursor.getFullYear() === now.getFullYear() && monthCursor.getMonth() === now.getMonth();

  const shiftMonth = (delta: number) => {
    setAllTime(false);
    setMonthCursor((current) => {
      const base = allTime ? new Date() : current;
      // Toujours le premier du mois : partir du 31 janvier et ajouter un mois
      // donnerait le 3 mars.
      return new Date(base.getFullYear(), base.getMonth() + delta, 1);
    });
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearchText('');
    setCategoryId('');
    setSign('');
    setSelectedBank(null);
    setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    // Réinitialiser élargit au maximum : cet appel vient d'une liste vide, et
    // revenir au mois en cours la laisserait vide aussi.
    setAllTime(true);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearchText(searchInput.trim());
    // Rendre l'écran : le clavier masque la moitié des résultats demandés.
    (document.activeElement as HTMLElement | null)?.blur();
  };

  // ── Décalage des intitulés de journée ─────────────────────────────────────
  const filtersRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  /**
   * Les intitulés de journée se collent juste sous l'en-tête, dont la hauteur
   * dépend de son contenu (titre, recherche, rangée de pastilles) et de la
   * police du système. Une valeur écrite en dur laisserait un trou ou ferait
   * passer l'intitulé sous la barre.
   */
  useEffect(() => {
    const header = filtersRef.current?.closest('header');
    if (!header) return;

    const measure = () => setHeaderHeight(header.getBoundingClientRect().height);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <ScreenHeader title="Transactions">
        <div ref={filtersRef} className={cx(GUTTER, 'space-y-2 pb-2')}>
          <form onSubmit={submitSearch}>
            <div className="relative">
              <MagnifyingGlassIcon
                className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
                aria-hidden="true"
              />
              <input
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Rechercher une opération"
                aria-label="Rechercher une opération"
                className={cx(
                  // 16 px : sous ce seuil, Safari zoome à la mise au point du
                  // champ et ne dézoome jamais.
                  'h-11 w-full rounded-2xl pl-11 pr-11 text-[16px] text-zinc-50 placeholder-zinc-600',
                  'outline-none transition-colors',
                  surfaces.input,
                )}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Effacer la recherche"
                  className="tappable absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-2xl text-zinc-500"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </form>

          <ChipRow>
            <Chip
              label="Tout"
              active={!categoryId && !selectedBank && !sign}
              onClick={() => {
                setCategoryId('');
                setSelectedBank(null);
                setSign('');
              }}
            />

            <Chip
              label="Revenus"
              leading={
                <span
                  aria-hidden="true"
                  className={cx('h-2 w-2 shrink-0 rounded-full', sign === 'positive' ? 'bg-emerald-400' : 'bg-emerald-400/50')}
                />
              }
              active={sign === 'positive'}
              onClick={() => setSign((current) => (current === 'positive' ? '' : 'positive'))}
            />
            <Chip
              label="Dépenses"
              leading={
                <span
                  aria-hidden="true"
                  className={cx('h-2 w-2 shrink-0 rounded-full', sign === 'negative' ? 'bg-red-400' : 'bg-red-400/50')}
                />
              }
              active={sign === 'negative'}
              onClick={() => setSign((current) => (current === 'negative' ? '' : 'negative'))}
            />

            {categoryChips.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                leading={category.icon ? <span aria-hidden="true">{category.icon}</span> : undefined}
                active={categoryId === category.id}
                onClick={() => setCategoryId((current) => (current === category.id ? '' : category.id))}
              />
            ))}

            {categoryChips.length > 0 && selectableBanks.length > 0 && (
              <span aria-hidden="true" className="my-1.5 w-px shrink-0 bg-white/[0.08]" />
            )}

            {selectableBanks.map((bank) => (
              <Chip
                key={bank.id}
                label={bank.shortName || bank.name}
                leading={
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: bank.color || '#7c3aed' }}
                  />
                }
                active={selectedBank?.id === bank.id}
                onClick={() => setSelectedBank(selectedBank?.id === bank.id ? null : bank)}
              />
            ))}
          </ChipRow>
        </div>
      </ScreenHeader>

      <ScreenBody>
        {/* ── Période ── */}
        <div className="flex items-center gap-2 pt-1">
          <div className={cx('flex flex-1 items-center px-1', radii.pill, surfaces.card)}>
            <StepperButton label="Mois précédent" onClick={() => shiftMonth(-1)}>
              <ChevronLeftIcon className="h-5 w-5" />
            </StepperButton>
            <button
              type="button"
              onClick={() => {
                setAllTime(false);
                setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
              aria-label="Revenir au mois en cours"
              className={cx(
                'tappable min-w-0 flex-1 truncate px-1 text-center text-[14px] font-medium text-zinc-200',
                TAP_TARGET,
              )}
            >
              {allTime ? 'Toute la période' : formatMonthYear(monthCursor)}
            </button>
            {/* Les mois à venir sont vides : l'application n'enregistre que des
                opérations passées, les échéances futures sont des récurrences. */}
            <StepperButton
              label="Mois suivant"
              onClick={() => shiftMonth(1)}
              disabled={!allTime && atCurrentMonth}
            >
              <ChevronRightIcon className="h-5 w-5" />
            </StepperButton>
          </div>

          <button
            type="button"
            onClick={() => setAllTime((current) => !current)}
            aria-pressed={allTime}
            className={cx(
              'tappable flex h-11 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium',
              allTime
                ? 'border-violet-500/60 bg-violet-600/20 text-violet-200'
                : 'border-white/[0.08] bg-white/[0.04] text-zinc-400',
            )}
          >
            Tout
          </button>
        </div>

        {/* ── Total de la sélection ──
            Le décompte porte sur ce qui est chargé, pas sur ce que la requête
            trouverait : le backend ne renvoie pas de total. Tant qu'il reste
            des pages, le libellé le dit plutôt que d'annoncer un chiffre faux. */}
        {!loading && !failed && visible.length > 0 && (
          <p className={cx(text.caption, 'pt-3 tabular-nums')}>
            {visible.length} opération{visible.length > 1 ? 's' : ''}
            {hasMore ? (visible.length > 1 ? ' chargées' : ' chargée') : ''} ·{' '}
            {formatSigned(total)}
          </p>
        )}

        <div className="pt-3">
          {failed ? (
            <ErrorNotice
              message="Impossible de charger les opérations."
              onRetry={() => setRetryToken((token) => token + 1)}
            />
          ) : loading ? (
            <SkeletonList rows={7} />
          ) : sections.length === 0 ? (
            <div className={cx(radii.tile, surfaces.card)}>
              <EmptyState
                icon="🧾"
                title="Aucune opération"
                description={
                  filtering
                    ? 'Rien ne correspond à cette période et à ces filtres.'
                    : 'Ajoutez votre première opération pour voir votre suivi démarrer.'
                }
                action={
                  <div className="space-y-2">
                    {filtering && (
                      <GhostButton onClick={resetFilters}>Réinitialiser les filtres</GhostButton>
                    )}
                    <PrimaryButton onClick={() => setAdding(true)}>Ajouter</PrimaryButton>
                  </div>
                }
              />
            </div>
          ) : (
            <>
              {sections.map((section) => (
                <section key={section.key} className="pt-4 first:pt-0">
                  <div
                    className={cx(
                      'sticky z-10 -mx-5 flex items-center justify-between gap-3 px-5 py-2',
                      'bg-[#09090b]/85 backdrop-blur-xl',
                    )}
                    style={{ top: headerHeight }}
                  >
                    <h2 className="truncate text-[13px] font-medium text-zinc-400">
                      {section.label}
                    </h2>
                    {/* Un total de journée en couleur mettrait une barre rouge à
                        chaque jour ; la teinte reste aux montants des lignes. */}
                    <Amount
                      value={section.total}
                      signed
                      tone="muted"
                      className="shrink-0 text-[13px] font-medium"
                    />
                  </div>

                  <ListCard className="mt-2">
                    {groupDayRows(section.items).map((row) =>
                      row.kind === 'single' ? (
                        <TransactionRow
                          key={row.key}
                          transaction={row.transaction}
                          showDate={false}
                          onPress={setTracing}
                        />
                      ) : (
                        <TransactionGroupRow
                          key={row.key}
                          merchant={row.merchant}
                          total={row.total}
                          items={row.items}
                          onPressItem={setTracing}
                        />
                      ),
                    )}
                  </ListCard>
                </section>
              ))}

              <div ref={sentinelRef} aria-hidden="true" className="h-px" />

              <div className="pt-4">
                {loadingMore ? (
                  <SkeletonList rows={2} />
                ) : hasMore ? (
                  // Repli visible : dans une WebView, l'observateur peut ne
                  // jamais se déclencher si la page ne défile pas assez.
                  <GhostButton onClick={() => void loadMore()}>Charger plus</GhostButton>
                ) : (
                  <p className="pb-2 text-center text-[13px] text-zinc-600">Fin de la liste</p>
                )}
              </div>
            </>
          )}
        </div>
      </ScreenBody>

      <Fab label="Ajouter" onClick={() => setAdding(true)} />

      <TransactionSheet
        open={adding}
        onClose={() => setAdding(false)}
        defaultBankId={selectedBank?.id}
      />
      <TransactionSheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        transaction={editing}
      />
      <TransactionTraceSheet
        open={Boolean(tracing)}
        transaction={tracing}
        onClose={() => setTracing(null)}
        onEdit={() => {
          setEditing(tracing);
          setTracing(null);
        }}
      />
    </>
  );
}

/**
 * Flèche du sélecteur de mois.
 *
 * 44 points de côté pour une icône de 20 : la cible est la zone, pas le
 * dessin — c'est précisément ce qui manque aux chevrons du desktop.
 */
function StepperButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cx(
        'tappable flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
        'text-zinc-300 active:bg-white/[0.08] disabled:opacity-25',
      )}
    >
      {children}
    </button>
  );
}
