import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatMoneyCompact } from '../../lib/format';
import { SegmentedControl } from './Controls';
import { Skeleton } from './Feedback';
import { cx, text } from '../theme';

/**
 * Flux sur six périodes.
 *
 * Le graphique du tableau de bord desktop livre ses chiffres au survol : sur un
 * téléphone, les barres ne sont plus que des formes muettes. Deux changements
 * suffisent à le rendre utilisable au doigt — la colonne entière devient la
 * cible (viser une barre de 12 points au pouce est un exercice d'adresse), et
 * la valeur s'épingle à l'appui au lieu de suivre un curseur qui n'existe pas.
 *
 * Les deux lectures du desktop sont conservées, mais deviennent un choix
 * explicite plutôt qu'un interrupteur discret : « Flux » compare mois par mois,
 * « Cumulé » montre la trajectoire du solde. C'est la même arithmétique des
 * deux côtés — seule la présentation change.
 */

export interface FluxPoint {
  label: string;
  income: number;
  expense: number;
  start: string; // ISO date string
  end: string; // ISO date string
}

/** Le sens choisi à l'appui d'une barre : revenus ou dépenses de la période. */
export type FluxDrillKind = 'income' | 'expense';

type Mode = 'flux' | 'cumulative';

const MODES: { value: Mode; label: string }[] = [
  { value: 'flux', label: 'Flux' },
  { value: 'cumulative', label: 'Cumulé' },
];

/**
 * Hauteur du tracé.
 *
 * Fixe et non relative : les barres sont dimensionnées en pourcentage, et un
 * pourcentage ne se résout que sur un parent de hauteur définie. 180 points
 * laissent lire un rapport de un à dix sans manger la moitié de l'écran.
 */
const PLOT_HEIGHT = 'h-[180px]';

/** Couloir réservé à la pastille de valeur, au-dessus du tracé. */
const CHIP_LANE = 'top-8';

/** Hauteur minimale d'une barre non nulle, en % — sinon un petit mois disparaît. */
const MIN_BAR = 3;

/** Blanc minimal entre deux intitulés voisins, sans quoi ils se touchent. */
const LABEL_GUTTER = 10;

/**
 * Largeur réelle d'un texte dans la police d'un élément.
 *
 * Une estimation au nombre de caractères suffirait pour « août » et « 2026 »,
 * mais pas quand le système agrandit les textes : c'est justement le cas où
 * six intitulés cessent de tenir, et où il faut donc en masquer un sur deux.
 */
let measurer: CanvasRenderingContext2D | null = null;

function textWidth(value: string, node: HTMLElement): number {
  if (!measurer) measurer = document.createElement('canvas').getContext('2d');
  if (!measurer) return value.length * 6.2;

  const style = getComputedStyle(node);
  measurer.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return measurer.measureText(value).width;
}

/** Le montant signé, abrégé : une pastille doit tenir dans une colonne. */
function signedCompact(amount: number): string {
  if (amount === 0) return formatMoneyCompact(0);
  return `${amount > 0 ? '+' : '−'}${formatMoneyCompact(Math.abs(amount))}`;
}

interface FluxChartProps {
  data: FluxPoint[];
  loading?: boolean;
  /**
   * Ce qui s'affiche à la place du tracé quand il n'y a rien à tracer.
   *
   * L'appelant sait, lui, si les six seaux sont vides parce que la période
   * l'était ou parce que la requête est tombée — deux situations qui ne se
   * racontent pas de la même façon.
   */
  emptyLabel?: string;
  className?: string;
  /**
   * Callback triggered when a bar (period + sens) is pressed.
   * Receives the point representing the period and the chosen side —
   * `income` (barre verte) ou `expense` (barre rouge). En mode cumulé, le
   * point n'a pas de sens : seul `point` est transmis.
   */
  onColumnPress?: (point: FluxPoint, kind?: FluxDrillKind) => void;
}

export default function FluxChart({
  data,
  loading = false,
  emptyLabel = 'Aucun mouvement sur cette période.',
  className,
  onColumnPress,
}: FluxChartProps) {
  const [mode, setMode] = useState<Mode>('flux');
  const [pinned, setPinned] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();

  const points = useMemo(() => {
    let income = 0;
    let expense = 0;
    return data.map((point) => {
      income += point.income;
      expense += point.expense;
      return { ...point, balance: income - expense };
    });
  }, [data]);

  // Changer de période renouvelle les six seaux : l'index épinglé désignerait
  // sinon un mois qu'on ne regarde plus.
  useEffect(() => setPinned(null), [data]);

  /**
   * Un appui hors du graphique retire la pastille.
   *
   * Sans cela, elle resterait accrochée à l'écran pendant toute la session :
   * il n'y a pas de « sortie du survol » au doigt pour la faire disparaître.
   */
  useEffect(() => {
    if (pinned === null) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setPinned(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [pinned]);

  // Mémoïsée : la rangée d'intitulés ne remesure sa police que si elle change.
  const labels = useMemo(() => points.map((point) => point.label), [points]);

  const empty = points.length === 0 || points.every((point) => point.income === 0 && point.expense === 0);

  const toggle = (index: number) => setPinned((current) => (current === index ? null : index));

  return (
    <div ref={rootRef} className={cx('space-y-3', className)}>
      <SegmentedControl
        options={MODES}
        value={mode}
        onChange={(next) => {
          setMode(next);
          // La pastille du mode précédent porte une autre grandeur : la garder
          // afficherait un solde cumulé au-dessus d'une paire de barres.
          setPinned(null);
        }}
      />

      {loading ? (
        <Skeleton className={cx(PLOT_HEIGHT, 'w-full rounded-2xl')} />
      ) : empty ? (
        <div className={cx(PLOT_HEIGHT, 'flex items-center justify-center')}>
          <p className={text.caption}>{emptyLabel}</p>
        </div>
      ) : mode === 'flux' ? (
        <BarPlot points={points} pinned={pinned} onToggle={toggle} onColumnPress={onColumnPress} />
      ) : (
        <LinePlot points={points} pinned={pinned} onToggle={toggle} gradientId={gradientId} onColumnPress={onColumnPress} />
      )}

      {/* Conservés en place pendant le chargement, mais effacés : les six
          intitulés affichés sont encore ceux de la période qu'on vient de
          quitter, et la hauteur de la rangée ne doit pas sauter. */}
      <div className={cx(loading && 'invisible')}>
        <PeriodLabels labels={labels} pinned={pinned} />
      </div>

      <div className="flex items-center gap-4">
        {mode === 'flux' ? (
          <>
            <Key color="bg-emerald-400" label="Revenus" />
            <Key color="bg-red-400" label="Dépenses" />
          </>
        ) : (
          <Key color="bg-violet-400" label="Solde cumulé" />
        )}
      </div>
    </div>
  );
}

// ─── Barres appariées ───────────────────────────────────────────────────────

type ComputedPoint = FluxPoint & { balance: number };

function BarPlot({
  points,
  pinned,
  onToggle,
  onColumnPress,
}: {
  points: ComputedPoint[];
  pinned: number | null;
  onToggle: (index: number) => void;
  onColumnPress?: (point: ComputedPoint, kind?: FluxDrillKind) => void;
}) {
  const max = Math.max(...points.flatMap((point) => [point.income, point.expense]), 1);

  return (
    <div className={cx('relative', PLOT_HEIGHT)}>
      {/* Aucun écart entre les colonnes : leur centre doit tomber exactement
          sur celui de l'intitulé correspondant, et sur celui du point de la
          courbe cumulée qui, lui, est calculé sur la largeur pleine. */}
      <div className={cx('absolute inset-x-0 bottom-0 flex items-end', CHIP_LANE)}>
        {points.map((point, index) => {
          const dimmed = pinned !== null && pinned !== index;
          const pinnedHere = pinned === index;
          return (
            <div
              key={`${point.label}-${index}`}
              className="relative flex h-full min-w-0 flex-1 items-end justify-center gap-1"
            >
              {pinnedHere && (
                <ValueChip index={index} count={points.length} lane>
                  <span className="text-emerald-600">{signedCompact(point.income)}</span>
                  <span aria-hidden="true" className="h-3 w-px bg-zinc-300" />
                  <span className="text-red-600">{signedCompact(-point.expense)}</span>
                </ValueChip>
              )}

              {/* Les deux barres sont des cibles distinctes : à l'appui, on
                  part dans les revenus ou les dépenses de la période — le clic
                  n'ouvre plus une liste panachée. */}
              <BarButton
                label={`${point.label} : revenus ${signedCompact(point.income)}`}
                ratio={point.income / max}
                value={point.income}
                barClass="bg-emerald-400"
                dimmed={dimmed}
                pinned={pinnedHere}
                onToggle={() => onToggle(index)}
                onPress={() => onColumnPress?.(point, 'income')}
              />
              <BarButton
                label={`${point.label} : dépenses ${signedCompact(-point.expense)}`}
                ratio={point.expense / max}
                value={point.expense}
                barClass="bg-red-400"
                dimmed={dimmed}
                pinned={pinnedHere}
                onToggle={() => onToggle(index)}
                onPress={() => onColumnPress?.(point, 'expense')}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarButton({
  label,
  ratio,
  value,
  barClass,
  dimmed,
  pinned,
  onToggle,
  onPress,
}: {
  label: string;
  ratio: number;
  value: number;
  barClass: string;
  dimmed: boolean;
  pinned: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pinned}
      onPointerDown={() => onToggle()}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      className="relative flex h-full w-6 shrink-0 items-end justify-center outline-none"
    >
      <span
        aria-hidden="true"
        className={cx(
          'w-3 rounded-t-md transition-all duration-300',
          barClass,
          dimmed ? 'opacity-25' : 'opacity-100',
        )}
        style={{ height: value === 0 ? 0 : `${Math.max(ratio * 100, MIN_BAR)}%` }}
      />
    </button>
  );
}

// ─── Solde cumulé ───────────────────────────────────────────────────────────

/**
 * Trajectoire du solde.
 *
 * Le tracé reprend le calcul du desktop au point près : abscisse au centre de
 * chaque colonne, ordonnée ramenée autour de la ligne de zéro à mi-hauteur, et
 * une courbe de Bézier dont les points de contrôle sont posés à mi-distance
 * horizontale — c'est ce qui donne une ligne lisse sans dépassement.
 */
function LinePlot({
  points,
  pinned,
  onToggle,
  gradientId,
  onColumnPress,
}: {
  points: ComputedPoint[];
  pinned: number | null;
  onToggle: (index: number) => void;
  gradientId: string;
  onColumnPress?: (point: ComputedPoint) => void;
}) {
  const max = Math.max(...points.map((point) => Math.abs(point.balance)), 1);
  const plotted = points.map((point, index) => ({
    point,
    index,
    x: ((index + 0.5) / Math.max(points.length, 1)) * 100,
    // 42 plutôt que 50 : la courbe garde une marge sous le bord haut, où se
    // pose la pastille de valeur.
    y: 50 - (point.balance / max) * 42,
  }));

  const linePath = plotted.reduce((path, current, index) => {
    if (index === 0) return `M ${current.x} ${current.y}`;
    const previous = plotted[index - 1];
    const controlX = (previous.x + current.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
  }, '');

  const areaPath =
    plotted.length > 0
      ? `${linePath} L ${plotted[plotted.length - 1].x} 50 L ${plotted[0].x} 50 Z`
      : '';

  return (
    <div className={cx('relative', PLOT_HEIGHT)}>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        // La boîte est déformée pour épouser le conteneur ; l'épaisseur du
        // trait, elle, doit rester constante — d'où `non-scaling-stroke`.
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.28" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <line
          x1="0"
          x2="100"
          y1="50"
          y2="50"
          stroke="#ffffff"
          strokeOpacity="0.13"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <div className="absolute inset-0 flex">
        {plotted.map(({ point, index, y }) => {
          // La pastille passe sous le point quand celui-ci frôle le haut du
          // graphe, où elle n'aurait plus la place de se poser au-dessus.
          const below = y < 18;
          const positive = point.balance >= 0;
          return (
            <button
              key={`${point.label}-${index}`}
              type="button"
              aria-pressed={pinned === index}
              aria-label={`${point.label} : solde cumulé ${signedCompact(point.balance)}`}
              onPointerDown={() => onToggle(index)}
              onClick={(e) => {
                e.stopPropagation();
                if (onColumnPress) onColumnPress(point);
              }}
              className="relative min-w-0 flex-1 outline-none"
            >
              {pinned === index && (
                <span
                  className={cx('absolute inset-x-0', below ? 'mt-2.5' : '-mt-2.5')}
                  style={{ top: `${y}%` }}
                >
                  <ValueChip index={index} count={plotted.length} above={!below}>
                    <span className={point.balance < 0 ? 'text-red-600' : 'text-zinc-900'}>
                      {signedCompact(point.balance)}
                    </span>
                  </ValueChip>
                </span>
              )}

              <span
                aria-hidden="true"
                className={cx(
                  'absolute left-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#09090b] transition-transform duration-200',
                  positive ? 'bg-emerald-400' : 'bg-red-400',
                  pinned === index && 'scale-150',
                )}
                style={{ top: `${y}%` }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pastille de valeur ─────────────────────────────────────────────────────

/**
 * Cartouche clair posé au-dessus de la colonne épinglée.
 *
 * Aux deux extrémités il s'aligne sur le bord de sa colonne plutôt que de se
 * centrer : sur six colonnes de cinquante points, un cartouche centré sur la
 * première déborderait de la carte et serait rogné.
 *
 * Il est masqué aux technologies d'assistance : le bouton qui l'ouvre porte
 * déjà la même valeur dans son `aria-label`, et l'entendre deux fois n'apporte
 * rien.
 */
function ValueChip({
  children,
  index,
  count,
  lane = false,
  above = false,
}: {
  children: ReactNode;
  index: number;
  count: number;
  /** Posé dans le couloir réservé, au-dessus du tracé. */
  lane?: boolean;
  /** Remonté au-dessus de son point d'ancrage. */
  above?: boolean;
}) {
  const anchor = index === 0 ? 'left-0' : index === count - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <span
      className={cx(
        'pointer-events-none absolute z-20 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1',
        'text-[11px] font-semibold tabular-nums shadow-[0_6px_18px_-6px_rgba(0,0,0,0.9)]',
        anchor,
        lane && '-top-7',
        above && '-translate-y-full',
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

// ─── Intitulés de période ───────────────────────────────────────────────────

/**
 * Une colonne par période, dans le même ordre et de la même largeur que le
 * tracé. Quand six intitulés ne tiennent pas — un petit écran, un intitulé
 * long — un sur deux est masqué en partant de la fin, pour que la période
 * courante garde toujours le sien.
 */
function PeriodLabels({ labels, pinned }: { labels: string[]; pinned: number | null }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [dense, setDense] = useState(false);

  useEffect(() => {
    const node = rowRef.current;
    if (!node || labels.length === 0) return;

    const measure = () => {
      const slot = node.getBoundingClientRect().width / labels.length;
      const widest = labels.reduce((max, label) => Math.max(max, textWidth(label, node)), 0);
      setDense(slot > 0 && widest + LABEL_GUTTER > slot);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [labels]);

  return (
    <div ref={rowRef} className="flex text-[11px]">
      {labels.map((label, index) => {
        // Un intitulé sur deux en partant de la fin : la période affichée étant
        // la dernière, elle garde toujours le sien.
        const hidden = dense && (labels.length - 1 - index) % 2 === 1 && pinned !== index;
        return (
          <span
            key={`${label}-${index}`}
            className={cx(
              'min-w-0 flex-1 truncate text-center capitalize transition-colors duration-200',
              pinned === index ? 'font-semibold text-zinc-200' : 'text-zinc-500',
            )}
          >
            {/* La colonne reste dans le flux même vide : la retirer décalerait
                les intitulés restants par rapport aux barres. */}
            {hidden ? ' ' : label}
          </span>
        );
      })}
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
      <span aria-hidden="true" className={cx('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  );
}
