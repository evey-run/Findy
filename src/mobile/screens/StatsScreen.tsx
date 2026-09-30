import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import type { DashboardOverview, Transaction } from '../../types';
import {
  formatMoney,
  formatMoneyCompact,
  formatMonthShort,
  formatMonthYear,
  formatPercent,
} from '../../lib/format';
import { ScreenBody, ScreenHeader } from '../components/Screen';
import { GhostButton, SegmentedControl } from '../components/Controls';
import Sheet from '../components/Sheet';
import Donut, { type DonutSlice } from '../components/Donut';
import FluxChart, { type FluxPoint } from '../components/FluxChart';
import { EmptyState, ErrorNotice, Skeleton } from '../components/Feedback';
import { useForecast } from '../hooks/useForecast';
import { cx, GUTTER, radii, surfaces, TAP_TARGET, text, tones } from '../theme';

/**
 * Analyse.
 *
 * Le tableau de bord desktop met sur un même plan quatre indicateurs, deux
 * graphiques, une liste de budgets et trois listes d'opérations. C'est tenable
 * dans une fenêtre de 1280 points ; sur un téléphone, cela donne une bouillie
 * de chiffres de 10 pixels. L'accueil mobile a donc gardé le solde et les
 * dernières opérations, et tout ce qui relève de la lecture — la comparaison
 * entre périodes, la répartition, la projection — a été déplacé ici.
 *
 * Une seule question structure l'écran : « où est parti l'argent, et est-ce que
 * ça tient ? ». D'où l'ordre — la trajectoire sur six périodes, la répartition
 * du mois, les trois totaux, puis ce qu'il reste à vivre.
 *
 * La semaine du desktop n'est pas reprise : six barres de sept jours ne disent
 * rien qu'on ne lise déjà dans la liste des opérations, et le sélecteur y
 * gagne une cible tactile de plus.
 */

type PeriodType = 'month' | 'year';

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' },
];

/**
 * Retard appliqué aux changements de période.
 *
 * Chaque période coûte deux requêtes, dont une qui ramène jusqu'à 5000
 * opérations. Sans ce délai, un doigt qui reste sur le chevron pour remonter
 * six mois en lance douze — sur un réseau mobile, les réponses reviennent dans
 * le désordre et l'écran clignote.
 */
const COMMIT_DELAY = 250;

/** Nombre de périodes comparées dans le graphique de flux. */
const FLUX_PERIODS = 6;

/**
 * Catégories détaillées dans la légende.
 *
 * Au-delà, les parts font moins de quelques degrés : elles ne se distinguent
 * plus dans l'anneau et ne se visent plus au doigt. Le reste est regroupé, et
 * le détail complet vit dans une feuille.
 */
const LEGEND_LIMIT = 5;

/** Teinte du regroupement « Autres » : neutre, pour ne pas concurrencer une vraie catégorie. */
const OTHERS_COLOR = '#52525b';

/** Couleur de repli quand une catégorie n'en a pas — celle de l'accent. */
const FALLBACK_COLOR = '#7c3aed';

/** Dit là où un chiffre manque, plutôt que d'écrire un zéro qu'on croirait vrai. */
const UNAVAILABLE = 'Données indisponibles.';

/**
 * Réserves et blocages de la prévision, en français.
 *
 * `/api/dashboard/forecast` renvoie des codes (`STALE_DATA`, `AGING_DATA`…) et
 * non des phrases : le serveur ne connaît pas la langue de l'interface. Le
 * tableau de bord desktop se contente de masquer la carte quand le calcul est
 * bloqué, sans jamais dire pourquoi — c'est précisément ce qui rend la
 * prévision incompréhensible le jour où elle disparaît.
 *
 * Un code inconnu n'est pas affiché : mieux vaut une réserve manquante qu'un
 * identifiant technique au milieu de l'écran.
 */
const FORECAST_MESSAGES: Record<string, string> = {
  NO_TRANSACTIONS: "Aucune opération enregistrée : il n'y a rien à projeter.",
  STALE_DATA:
    "Plus d'un mois sans nouvelle opération — la projection reposerait sur des comptes périmés.",
  AGING_DATA:
    'Vos dernières opérations datent de plus d’une semaine : la projection perd en précision.',
  UNSCOPED_RECURRENCES:
    "Des échéances ne sont rattachées à aucun compte : elles ne sont pas déduites.",
  UNKNOWN_FREQUENCY: "Une échéance a une fréquence non reconnue : elle est laissée de côté.",
  DUPLICATE_BUDGETS:
    'Plusieurs budgets visent la même catégorie ; leurs montants ont été additionnés.',
  LOW_CATEGORIZATION:
    'Moins de la moitié de vos dépenses sont catégorisées : les budgets sont ignorés.',
};

// ─── Périodes ───────────────────────────────────────────────────────────────

interface Period {
  type: PeriodType;
  start: Date;
  end: Date;
  label: string;
  /** Identité stable de la période, pour comparer sans comparer des `Date`. */
  key: string;
}

/**
 * Bornes d'une période.
 *
 * La fin est fixée à la dernière milliseconde du jour. Le desktop envoie un
 * minuit local converti en temps universel : depuis Paris, le 31 août devient
 * le 30 à 22 h, et les opérations du dernier jour du mois sortent du total.
 */
function periodOf(type: PeriodType, date: Date): Period {
  const year = date.getFullYear();

  if (type === 'year') {
    const start = new Date(year, 0, 1);
    return {
      type,
      start,
      end: new Date(year, 11, 31, 23, 59, 59, 999),
      label: `${year}`,
      key: `year:${year}`,
    };
  }

  const start = new Date(year, date.getMonth(), 1);
  return {
    type,
    start,
    end: new Date(year, date.getMonth() + 1, 0, 23, 59, 59, 999),
    label: formatMonthYear(start),
    key: `month:${start.getTime()}`,
  };
}

/** Période voisine, dans un sens ou dans l'autre. */
function shiftPeriod(period: Period, delta: number): Period {
  const { start } = period;
  return period.type === 'year'
    ? periodOf('year', new Date(start.getFullYear() + delta, 0, 1))
    : periodOf('month', new Date(start.getFullYear(), start.getMonth() + delta, 1));
}

interface Bucket {
  label: string;
  start: Date;
  end: Date;
  income: number;
  expense: number;
}

/** Les six périodes qui précèdent celle affichée, la sienne comprise. */
function buildBuckets(period: Period): Bucket[] {
  return Array.from({ length: FLUX_PERIODS }, (_, index) => {
    const offset = FLUX_PERIODS - 1 - index;
    const anchor =
      period.type === 'year'
        ? periodOf('year', new Date(period.start.getFullYear() - offset, 0, 1))
        : periodOf('month', new Date(period.start.getFullYear(), period.start.getMonth() - offset, 1));

    return {
      label: anchor.type === 'year' ? anchor.label : formatMonthShort(anchor.start),
      start: anchor.start,
      end: anchor.end,
      income: 0,
      expense: 0,
    };
  });
}

// ─── Écran ──────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { currentSpace, scopeParams } = useAppStore();
  const forecast = useForecast();
  const navigate = useNavigate();

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [cursor, setCursor] = useState<Date>(() => new Date());

  const period = useMemo(() => periodOf(periodType, cursor), [periodType, cursor]);

  /** Période réellement chargée — celle-ci est en retard sur le sélecteur. */
  const [active, setActive] = useState<Period>(period);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [flux, setFlux] = useState<FluxPoint[]>([]);
  const [fluxLoading, setFluxLoading] = useState(true);
  const [fluxFailed, setFluxFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const [selectedSlice, setSelectedSlice] = useState<number | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const spaceId = currentSpace?.id;

  // ── Validation différée du sélecteur ──────────────────────────────────────
  useEffect(() => {
    if (period.key === active.key) return;
    const timer = window.setTimeout(() => setActive(period), COMMIT_DELAY);
    return () => window.clearTimeout(timer);
  }, [period, active.key]);

  // ── Totaux de la période ──────────────────────────────────────────────────
  //
  // Requête directe plutôt que `loadDashboardOverview()` : celui-ci lit la
  // plage de dates du magasin, qui est persistée et partagée avec l'accueil.
  // Consulter mars 2024 ici figerait l'accueil sur mars 2024.
  useEffect(() => {
    const controller = new AbortController();
    setOverviewLoading(true);

    const params = new URLSearchParams({
      startDate: active.start.toISOString(),
      endDate: active.end.toISOString(),
      ...scopeParams(),
    });

    fetch(`/api/dashboard/overview?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('overview'))))
      .then((data: DashboardOverview) => {
        setOverview(data);
        setOverviewFailed(false);
        setOverviewLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setOverview(null);
        setOverviewFailed(true);
        setOverviewLoading(false);
      });

    return () => controller.abort();
  }, [active, spaceId, scopeParams, retryToken]);

  // ── Six périodes de flux ──────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    setFluxLoading(true);

    const buckets = buildBuckets(active);
    const params = new URLSearchParams({
      limit: '5000',
      offset: '0',
      startDate: buckets[0].start.toISOString(),
      endDate: buckets[buckets.length - 1].end.toISOString(),
      ...scopeParams(),
    });

    fetch(`/api/transactions?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('transactions'))))
      .then((data: Transaction[] | { transactions?: Transaction[] }) => {
        // La route répond tantôt un tableau nu, tantôt un objet paginé.
        const list = Array.isArray(data) ? data : (data.transactions ?? []);

        for (const transaction of list) {
          const date = new Date(transaction.date);
          const bucket = buckets.find((candidate) => date >= candidate.start && date <= candidate.end);
          if (!bucket) continue;
          if (transaction.amount > 0) bucket.income += transaction.amount;
          else bucket.expense += Math.abs(transaction.amount);
        }

        setFlux(buckets.map(({ label, income, expense, start, end }) => ({ label, income, expense, start: start.toISOString(), end: end.toISOString() })));
        setFluxFailed(false);
        setFluxLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFlux([]);
        setFluxFailed(true);
        setFluxLoading(false);
      });

    return () => controller.abort();
  }, [active, spaceId, scopeParams, retryToken]);

  // La sélection est un index : d'une période à l'autre, le même rang désigne
  // une autre catégorie, et le centre du camembert mentirait.
  useEffect(() => setSelectedSlice(null), [active]);

  // ── Données dérivées ──────────────────────────────────────────────────────

  const summary = overview?.summary;

  /**
   * Les trois totaux et le camembert sortent du même filtre serveur (période +
   * espace, tous comptes confondus) : la tuile « Dépenses » vaut donc
   * exactement la somme des parts. Les chiffres de l'accueil, eux, sont ceux du
   * compte courant seul — l'écart entre les deux écrans, ce sont les virements
   * d'épargne et d'investissement.
   */
  const income = summary?.totalIncome ?? 0;
  const expense = summary?.totalExpenses ?? 0;
  const balance = summary?.balance ?? 0;

  // Une requête tombée laisse `summary` vide : afficher « 0 € » ferait passer
  // une panne de réseau pour un mois sans la moindre opération.
  const failed = overviewFailed || fluxFailed;

  const expenses = useMemo(
    () =>
      [...(overview?.expensesByCategory ?? [])]
        .filter((entry) => entry.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    [overview],
  );

  const expensesTotal = useMemo(
    () => expenses.reduce((sum, entry) => sum + entry.amount, 0),
    [expenses],
  );

  const slices = useMemo<DonutSlice[]>(() => {
    const head = expenses.slice(0, LEGEND_LIMIT).map((entry) => ({
      label: entry.categoryName,
      value: entry.amount,
      color: entry.categoryColor || FALLBACK_COLOR,
    }));

    const tail = expenses.slice(LEGEND_LIMIT);
    if (tail.length === 0) return head;

    return [
      ...head,
      {
        label: 'Autres',
        value: tail.reduce((sum, entry) => sum + entry.amount, 0),
        color: OTHERS_COLOR,
      },
    ];
  }, [expenses]);

  const share = (value: number) => (expensesTotal > 0 ? (value / expensesTotal) * 100 : 0);

  const now = new Date();
  const atLatestPeriod = period.key === periodOf(period.type, now).key;

  const shift = (delta: number) => setCursor(shiftPeriod(period, delta).start);

  // Décrit la période chargée, pas celle qu'on vient de demander : pendant le
  // délai de validation, le graphique montre encore la précédente.
  const fluxTitle = `Flux sur ${FLUX_PERIODS} ${active.type === 'year' ? 'ans' : 'mois'}`;

  return (
    <>
      <ScreenHeader title="Analyse">
        <div className={cx(GUTTER, 'space-y-2 pb-3')}>
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={periodType}
            onChange={(next) => {
              setPeriodType(next);
              // Le curseur repart d'aujourd'hui : passer de « août 2024 » à
              // l'année atterrirait sur 2024, une période sans rapport avec ce
              // que l'on cherchait à voir.
              setCursor(new Date());
            }}
          />

          <div className={cx('flex items-center px-1', radii.pill, surfaces.card)}>
            <StepperButton label="Période précédente" onClick={() => shift(-1)}>
              <ChevronLeftIcon className="h-5 w-5" />
            </StepperButton>

            <button
              type="button"
              onClick={() => setCursor(new Date())}
              aria-label="Revenir à la période en cours"
              className={cx(
                'tappable min-w-0 flex-1 truncate px-1 text-center text-[14px] font-medium text-zinc-200',
                TAP_TARGET,
              )}
            >
              {period.label}
            </button>

            {/* Les périodes à venir sont vides : l'application n'enregistre que
                des opérations passées. */}
            <StepperButton
              label="Période suivante"
              onClick={() => shift(1)}
              disabled={atLatestPeriod}
            >
              <ChevronRightIcon className="h-5 w-5" />
            </StepperButton>
          </div>
        </div>
      </ScreenHeader>

      <ScreenBody>
        <div className="space-y-5">
          {failed && (
            <ErrorNotice
              message="Impossible de charger l'analyse de cette période."
              onRetry={() => setRetryToken((token) => token + 1)}
            />
          )}

          {/* ── Flux ── */}
          <section className={cx(radii.tile, surfaces.card, 'p-4')}>
            <h2 className={cx(text.section, 'pb-3')}>{fluxTitle}</h2>
            <FluxChart
              data={flux}
              loading={fluxLoading}
              emptyLabel={fluxFailed ? UNAVAILABLE : undefined}
              onColumnPress={(point, kind) => {
                // Navigate to transactions page for the selected period, restreint
                // au sens de la barre touchée : revenus ou dépenses du mois.
                const startDate = point.start;
                const endDate = point.end;
                const type = kind ? `&type=${kind}` : '';
                navigate(`/transactions?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}${type}`);
              }}
            />
          </section>

          {/* ── Répartition ── */}
          <section className={cx(radii.tile, surfaces.card, 'px-4 pb-2 pt-4')}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={text.section}>Répartition des dépenses</h2>
              {expenses.length > slices.length && (
                <button
                  type="button"
                  onClick={() => setBreakdownOpen(true)}
                  className={cx(
                    'tappable -mr-2 flex items-center px-2 text-[13px] font-medium text-zinc-400 active:text-violet-300',
                    TAP_TARGET,
                  )}
                >
                  Tout voir
                </button>
              )}
            </div>

            {overviewLoading ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <Skeleton className="aspect-square w-full max-w-[220px] rounded-full" />
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            ) : overviewFailed ? (
              <p className={cx(text.caption, 'py-8 text-center')}>{UNAVAILABLE}</p>
            ) : slices.length === 0 ? (
              <EmptyState
                icon="📊"
                title="Aucune dépense"
                description="Rien n'est sorti sur cette période."
                action={
                  <GhostButton onClick={() => shift(-1)}>Voir la précédente</GhostButton>
                }
              />
            ) : (
              <>
                <div className="py-4">
                  <Donut
                    data={slices}
                    centerLabel="Dépenses"
                    centerValue={formatMoneyCompact(expensesTotal)}
                    selectedIndex={selectedSlice}
                    onSelect={setSelectedSlice}
                  />
                </div>

                <div className="divide-y divide-white/[0.05]">
                  {slices.map((slice, index) => (
                    <LegendRow
                      key={`${slice.label}-${index}`}
                      slice={slice}
                      share={share(slice.value)}
                      selected={selectedSlice === index}
                      onClick={() =>
                        setSelectedSlice((current) => (current === index ? null : index))
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ── Totaux de la période ── */}
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile
              label="Revenus"
              value={overviewFailed ? null : income}
              tone="positive"
              loading={overviewLoading}
            />
            <StatTile
              label="Dépenses"
              value={overviewFailed ? null : expense}
              tone="negative"
              loading={overviewLoading}
            />
            <StatTile
              label="Solde"
              value={overviewFailed ? null : balance}
              tone={balance < 0 ? 'negative' : 'neutral'}
              loading={overviewLoading}
            />
          </div>

          {/* ── Reste à vivre ── */}
          <ForecastCard forecast={forecast} />
        </div>
      </ScreenBody>

      <Sheet
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        title="Répartition des dépenses"
        subtitle={`${active.label} · ${formatMoney(expensesTotal)}`}
      >
        <div className="divide-y divide-white/[0.05]">
          {expenses.map((entry) => (
            <LegendRow
              key={entry.categoryId ?? entry.categoryName}
              slice={{
                label: entry.categoryName,
                value: entry.amount,
                color: entry.categoryColor || FALLBACK_COLOR,
              }}
              share={share(entry.amount)}
              icon={entry.categoryIcon}
            />
          ))}
        </div>
      </Sheet>
    </>
  );
}

// ─── Pièces de l'écran ──────────────────────────────────────────────────────

/** Chevron du sélecteur de période : 44 points, quelle que soit l'icône. */
function StepperButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cx(
        'tappable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-300',
        'active:bg-white/[0.08] disabled:pointer-events-none disabled:text-zinc-700',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Ligne de légende.
 *
 * Pleine largeur plutôt qu'en deux colonnes : le nom d'une catégorie et son
 * montant n'ont pas la place de cohabiter dans 150 points sans que l'un des
 * deux ne soit tronqué, et c'est toujours le nom qui perdrait.
 */
function LegendRow({
  slice,
  share,
  selected = false,
  onClick,
  icon,
}: {
  slice: DonutSlice;
  share: number;
  selected?: boolean;
  onClick?: () => void;
  icon?: string;
}) {
  const content = (
    <>
      {icon ? (
        <span aria-hidden="true" className="w-5 shrink-0 text-center text-[15px]">
          {icon}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: slice.color }}
        />
      )}

      <span
        className={cx(
          'min-w-0 flex-1 truncate text-[15px]',
          selected ? 'font-medium text-zinc-50' : 'text-zinc-300',
        )}
      >
        {slice.label}
      </span>

      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-zinc-100">
        {formatMoneyCompact(slice.value)}
      </span>
      <span className="w-[52px] shrink-0 text-right text-[13px] tabular-nums text-zinc-500">
        {formatPercent(share, share > 0 && share < 10 ? 1 : 0)}
      </span>
    </>
  );

  const shared = cx('flex w-full items-center gap-3 py-2.5 text-left', TAP_TARGET);

  if (!onClick) return <div className={shared}>{content}</div>;

  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={cx(shared, 'tappable')}>
      {content}
    </button>
  );
}

/**
 * Teintes des trois totaux.
 *
 * Le solde n'emprunte pas le `neutral` du thème, prévu pour du texte
 * secondaire : c'est la valeur qu'on vient chercher, elle doit être la plus
 * claire des trois quand elle est positive.
 */
const TILE_TONE = {
  positive: tones.positive,
  negative: tones.negative,
  neutral: 'text-zinc-50',
} as const;

/** Un des trois totaux de la période. */
function StatTile({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  /** `null` quand la valeur n'a pas pu être chargée. */
  value: number | null;
  tone: 'positive' | 'negative' | 'neutral';
  loading: boolean;
}) {
  return (
    <div className={cx(radii.tile, surfaces.card, 'px-3 py-3.5')}>
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-5 w-16" />
      ) : (
        <p
          className={cx(
            'mt-1.5 text-[17px] font-semibold tabular-nums',
            value === null ? 'text-zinc-600' : TILE_TONE[tone],
          )}
        >
          {value === null ? '—' : formatMoneyCompact(value)}
        </p>
      )}
    </div>
  );
}

/**
 * Reste à vivre, en détail.
 *
 * L'accueil n'en montre que le montant par jour ; c'est ici qu'on explique d'où
 * il vient — combien de jours il couvre, où le mois atterrit, et ce qui limite
 * le calcul. La prévision porte toujours sur le mois en cours, quelle que soit
 * la période consultée plus haut : « combien puis-je dépenser » ne se pose pas
 * au passé, d'où la mention explicite.
 */
function ForecastCard({ forecast }: { forecast: ReturnType<typeof useForecast> }) {
  const { data, loading, reload } = forecast;

  const alarming = data?.state === 'overdrawn' || data?.state === 'projected-overdraft';
  const note =
    data?.state === 'overdrawn'
      ? 'Votre solde est déjà négatif : il n’y a plus rien à répartir.'
      : data?.state === 'projected-overdraft'
        ? data.overdraftDay
          ? `Découvert prévu le ${data.overdraftDay} du mois.`
          : 'Un découvert est prévu avant la fin du mois.'
        : data?.state === 'last-day'
          ? 'Dernier jour du mois.'
          : data?.limitedBy === 'budget'
            ? 'Plafonné par vos budgets, pas par le solde.'
            : null;

  return (
    <section className={cx(radii.tile, surfaces.card, 'p-4')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={text.section}>Reste à vivre</h2>
        <span className="shrink-0 text-[11px] text-zinc-500">Mois en cours</span>
      </div>

      {loading ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : !data ? (
        <div className="mt-3">
          <ErrorNotice message="Prévision indisponible." onRetry={() => void reload()} />
        </div>
      ) : data.state === 'blocked' ? (
        <div className="mt-3 space-y-2">
          <p className={text.body}>Le calcul n'a pas pu aboutir.</p>
          <NoticeList codes={data.blockers} />
        </div>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="text-[34px] font-semibold leading-none tracking-tight tabular-nums text-zinc-50">
              {data.perDay !== null ? formatMoney(data.perDay) : '—'}
            </span>
            <span className="text-[15px] text-zinc-500">/ jour</span>
          </p>

          {/* Un « 0,00 € / jour » sans explication passe pour une panne. La
              raison prime donc sur la remarque budgétaire — et le serveur
              répond « cash » dès qu'aucun budget n'existe, ce qui n'apprend
              rien à personne. */}
          {note && (
            <p className={cx(text.caption, 'mt-1.5', alarming && 'text-red-300/90')}>{note}</p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <MiniStat
              label="Jours restants"
              value={`${data.daysLeft}`}
              suffix={data.daysLeft > 1 ? 'jours' : 'jour'}
            />
            {data.projectedEndOfMonth !== undefined ? (
              <MiniStat
                label="Fin de mois"
                value={formatMoneyCompact(data.projectedEndOfMonth)}
                tone={data.projectedEndOfMonth < 0 ? 'negative' : 'neutral'}
              />
            ) : (
              <MiniStat label="Disponible" value={formatMoneyCompact(data.availableNow ?? 0)} />
            )}
          </div>

          <div className="mt-3 space-y-2 empty:mt-0">
            <NoticeList codes={data.warnings} />
          </div>
        </>
      )}
    </section>
  );
}

function MiniStat({
  label,
  value,
  suffix,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: 'neutral' | 'negative';
}) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-3.5 py-3">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span
          className={cx(
            'text-[17px] font-semibold tabular-nums',
            tone === 'negative' ? tones.negative : 'text-zinc-50',
          )}
        >
          {value}
        </span>
        {suffix && <span className="text-[12px] text-zinc-500">{suffix}</span>}
      </p>
    </div>
  );
}

/** Réserves du calcul de prévision, traduites et filtrées des codes inconnus. */
function NoticeList({ codes }: { codes: string[] }) {
  return (
    <>
      {codes.map((code) => {
        const message = FORECAST_MESSAGES[code];
        if (!message) return null;
        return (
          <p
            key={code}
            className="flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-[13px] leading-relaxed text-amber-200/90"
          >
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {message}
          </p>
        );
      })}
    </>
  );
}
