import { useState } from 'react';
import { formatPercent } from '../../lib/format';
import { cx } from '../theme';

/**
 * Camembert de répartition.
 *
 * Les deux camemberts desktop (tableau de bord et catégories) sont dessinés à
 * une taille fixe en pixels et livrent leur détail au survol. Ni l'un ni
 * l'autre ne tient sur un téléphone : 180 points figés débordent d'une carte à
 * marges variables, et le survol n'existe pas au doigt.
 *
 * Celui-ci se met donc à l'échelle de son conteneur (le `viewBox` fait tout le
 * travail) et remplace le survol par une sélection franche : on tape une part,
 * elle se détache, et le centre bascule sur sa part du total. C'est le geste
 * que les applications bancaires ont normalisé — un seul chiffre au centre, et
 * c'est le doigt qui choisit lequel.
 */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Repère du tracé. Le SVG étant mis à l'échelle, ces valeurs sont sans unité. */
const BOX = 180;
const CENTER = BOX / 2;
const OUTER = 74;
const INNER = 50;
/** Débord de la part sélectionnée : assez pour se voir, pas pour déséquilibrer. */
const LIFT = 5;
/**
 * Écart entre deux parts, en radians.
 *
 * Sans lui, deux catégories aux couleurs proches forment un aplat continu et
 * la frontière disparaît — c'est précisément ce qu'on vient lire.
 */
const GAP = 0.024;

function polar(radius: number, angle: number): { x: number; y: number } {
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function arcPath(start: number, end: number, outer: number, inner: number): string {
  const large = end - start > Math.PI ? 1 : 0;
  const p0 = polar(outer, start);
  const p1 = polar(outer, end);
  const q1 = polar(inner, end);
  const q0 = polar(inner, start);
  return [
    `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `L ${q1.x.toFixed(2)} ${q1.y.toFixed(2)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${q0.x.toFixed(2)} ${q0.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

interface DonutProps {
  data: DonutSlice[];
  /** Étiquette affichée au centre tant qu'aucune part n'est sélectionnée. */
  centerLabel: string;
  /** Valeur affichée au centre tant qu'aucune part n'est sélectionnée. */
  centerValue: string;
  /** Sélection pilotée par le parent, pour la synchroniser avec une légende. */
  selectedIndex?: number | null;
  onSelect?: (index: number | null) => void;
  className?: string;
}

export default function Donut({
  data,
  centerLabel,
  centerValue,
  selectedIndex,
  onSelect,
  className,
}: DonutProps) {
  const [internal, setInternal] = useState<number | null>(null);

  const controlled = selectedIndex !== undefined;
  const requested = controlled ? selectedIndex : internal;
  // La sélection est bornée au jeu de données courant : changer de période
  // renouvelle les parts, et l'index conservé désignerait sinon une catégorie
  // qui n'existe plus.
  const selected =
    requested !== null && requested !== undefined && requested >= 0 && requested < data.length
      ? requested
      : null;

  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  const select = (index: number | null) => {
    const next = index === selected ? null : index;
    if (!controlled) setInternal(next);
    onSelect?.(next);
  };

  let angle = -Math.PI / 2;
  const arcs = data.map((slice, index) => {
    const share = total > 0 ? slice.value / total : 0;
    const sweep = share * 2 * Math.PI;
    const start = angle;
    angle += sweep;

    // Une part unique dessinerait un arc de 360°, dont les deux extrémités se
    // confondent : le tracé disparaîtrait entièrement.
    const drawn = Math.min(Math.max(sweep - (data.length > 1 ? GAP : 0), 0), 2 * Math.PI - 0.001);
    const lifted = selected === index;

    return {
      key: `${slice.label}-${index}`,
      slice,
      share,
      visible: drawn > 0 ? arcPath(start, start + drawn, lifted ? OUTER + LIFT : OUTER, INNER) : '',
      // La zone tactile déborde de l'anneau des deux côtés et ignore l'écart
      // inter-parts : un anneau de 24 unités fait moins de 30 points à l'écran,
      // soit bien moins que le doigt qui le vise.
      hit: sweep > 0 ? arcPath(start, start + sweep, OUTER + 12, INNER - 12) : '',
    };
  });

  const active = selected !== null ? data[selected] : null;
  const activeShare = active && total > 0 ? (active.value / total) * 100 : 0;

  return (
    <div className={cx('relative mx-auto aspect-square w-full max-w-[220px]', className)}>
      <svg
        viewBox={`0 0 ${BOX} ${BOX}`}
        className="h-auto w-full"
        // Taper le vide au centre ou entre deux parts revient à désélectionner.
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) select(null);
        }}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={(OUTER + INNER) / 2}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={OUTER - INNER}
        />

        {total > 0 &&
          arcs.map((arc, index) => (
            <g key={arc.key}>
              {arc.visible && (
                <path
                  d={arc.visible}
                  fill={arc.slice.color}
                  className="pointer-events-none transition-opacity duration-200"
                  opacity={selected === null || selected === index ? 1 : 0.3}
                />
              )}
              {arc.hit && (
                <path
                  d={arc.hit}
                  fill="transparent"
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === index}
                  aria-label={`${arc.slice.label} : ${formatPercent(arc.share * 100)}`}
                  onPointerDown={() => select(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      select(index);
                    }
                  }}
                  className="cursor-pointer outline-none focus-visible:stroke-white/70 focus-visible:[stroke-width:2px]"
                />
              )}
            </g>
          ))}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[24%] text-center">
        <span className="w-full truncate text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {active ? active.label : centerLabel}
        </span>
        <span className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-white">
          {total === 0 ? '—' : active ? formatPercent(activeShare, activeShare < 10 ? 1 : 0) : centerValue}
        </span>
      </div>
    </div>
  );
}
