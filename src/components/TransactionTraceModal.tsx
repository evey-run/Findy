import { useEffect, useState } from 'react';
import { merchantName } from '../lib/merchant';
import type { TraceNode, TraceStep, TraceBank, TraceCategory, TransactionTrace } from '../types';

/**
 * Trajet de l'argent — diagramme Sankey style Finary.
 *
 * Flux de GAUCHE à DROITE :
 *   Colonne 0 (gauche) = SOURCE d'origine (revenu, argent antérieur)
 *   Colonne 1 (centre) = PARCOURS (virements entre comptes)
 *   Colonne 2 (droite) = DESTINATIONS (dépenses, argent resté)
 *
 * Le focus (transaction cliquée) n'est PAS une colonne — il fait partie
 * du parcours ou est la source elle-même.
 */

const money = (amount: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);

const pct = (part: number, total: number): string =>
  total === 0 ? '0%' : Math.round((Math.abs(part) / Math.abs(total)) * 100) + '%';

interface Props { transactionId: string | null; onClose: () => void; }

export default function TransactionTraceModal({ transactionId, onClose }: Props) {
  const [trace, setTrace] = useState<TransactionTrace | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!transactionId) return;
    let cancelled = false;
    setTrace(null);
    setFailed(false);
    fetch(`/api/transactions/${transactionId}/trace`)
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); if (!cancelled) setTrace(await r.json()); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [transactionId]);

  if (!transactionId) return null;
  const focus = trace?.nodes.find((n) => n.id === trace.focusId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-[800px] max-w-full max-h-[85vh] flex flex-col rounded-2xl border border-white/5 bg-[#0a0a0c] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-white">Trajet de l'argent</h3>
            {focus && <p className="mt-0.5 text-[13px] text-zinc-500 truncate">{merchantName(focus.description) || focus.description}</p>}
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-6">
          {failed ? (
            <p className="py-12 text-center text-[13px] text-zinc-600">Impossible de reconstituer le trajet.</p>
          ) : !trace ? (
            <div className="space-y-3 py-8">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.02]" />)}</div>
          ) : (
            <Sankey trace={trace} nodesFor={new Map(trace.nodes.map((n) => [n.id, n]))} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Types ──────────────────────────────────────────────────────────── */

interface FlowNode { id: string; label: string; amount: number; color: string; col: 0 | 1 | 2 }
interface FlowBand { from: string; to: string; amount: number; color: string }

/* ─── Sankey ─────────────────────────────────────────────────────────── */

function Sankey({ trace, nodesFor }: { trace: TransactionTrace; nodesFor: Map<string, TraceNode> }) {
  const banks = new Map(trace.banks.map((b) => [b.id, b]));
  const categories = new Map(trace.categories.map((c) => [c.id, c]));
  const focus = nodesFor.get(trace.focusId);
  if (!focus) return null;

  const total = Math.abs(focus.amount);
  const { nodes, bands } = buildGraph(trace, nodesFor, banks, categories, total);

  if (nodes.length === 0) {
    return <p className="py-12 text-center text-[13px] text-zinc-600">Aucun flux détecté.</p>;
  }

  return <SankeySVG nodes={nodes} bands={bands} total={total} />;
}

function buildGraph(
  trace: TransactionTrace,
  nodesFor: Map<string, TraceNode>,
  banks: Map<string, TraceBank>,
  categories: Map<string, TraceCategory>,
  total: number,
): { nodes: FlowNode[]; bands: FlowBand[] } {
  const nodes: FlowNode[] = [];
  const bands: FlowBand[] = [];
  const focus = nodesFor.get(trace.focusId);
  if (!focus) return { nodes, bands };

  // ── Identifier les étapes clés ──
  const entryStep = trace.steps.find((s): s is Extract<TraceStep, { kind: 'entry' }> => s.kind === 'entry');
  const unexplainedStep = trace.steps.find((s): s is Extract<TraceStep, { kind: 'unexplained' }> => s.kind === 'unexplained');
  const exitSteps = trace.steps.filter((s): s is Extract<TraceStep, { kind: 'exit' }> => s.kind === 'exit');
  const inLeg = trace.steps.find((s): s is Extract<TraceStep, { kind: 'leg' }> => s.kind === 'leg' && s.inId === trace.focusId);
  const outLeg = trace.steps.find((s): s is Extract<TraceStep, { kind: 'leg' }> => s.kind === 'leg' && s.outId === trace.focusId);

  // ── Colonne 0 : SOURCE ──
  // D'où vient cet argent ? (revenu, virement entrant, ou argent antérieur)
  if (entryStep) {
    const srcNode = nodesFor.get(entryStep.txnId);
    if (srcNode) {
      const bank = banks.get(srcNode.bankId);
      nodes.push({
        id: `src-${srcNode.id}`,
        label: bank?.shortName || bank?.name || 'Compte',
        amount: total,
        color: '#22c55e',
        col: 0,
      });
    }
  } else if (inLeg) {
    // L'argent vient d'un virement depuis un autre compte
    const outNode = nodesFor.get(inLeg.outId);
    if (outNode) {
      const bank = banks.get(outNode.bankId);
      nodes.push({
        id: `src-${outNode.id}`,
        label: bank?.shortName || bank?.name || 'Compte',
        amount: total,
        color: '#22c55e',
        col: 0,
      });
    }
  } else if (unexplainedStep) {
    const bank = banks.get(unexplainedStep.bankId);
    nodes.push({
      id: 'src-anterior',
      label: bank?.shortName || bank?.name || 'Solde antérieur',
      amount: total,
      color: '#71717a',
      col: 0,
    });
  } else if (focus.amount > 0) {
    // Focus est une entrée d'argent (salaire, etc.)
    const bank = banks.get(focus.bankId);
    nodes.push({
      id: 'src-focus',
      label: bank?.shortName || bank?.name || 'Compte',
      amount: total,
      color: '#22c55e',
      col: 0,
    });
  } else {
    // Argent déjà présent
    const bank = banks.get(focus.bankId);
    nodes.push({
      id: 'src-anterior',
      label: bank?.shortName || bank?.name || 'Solde',
      amount: total,
      color: '#71717a',
      col: 0,
    });
  }

  // ── Colonne 1 : PARCOURS ──
  // Par quels comptes l'argent est-il passé ?
  // Le focus + éventuels virements intermédiaires

  // Virement entrant vers le focus
  if (inLeg) {
    const outN = nodesFor.get(inLeg.outId);
    const inN = nodesFor.get(inLeg.inId);
    if (outN && inN) {
      const ob = banks.get(outN.bankId);
      const ib = banks.get(inN.bankId);
      nodes.push({
        id: `leg-${inLeg.outId}-${inLeg.inId}`,
        label: `${ob?.shortName || '→'} → ${ib?.shortName || '→'}`,
        amount: total,
        color: '#3b82f6',
        col: 1,
      });
    }
  }

  // Le focus lui-même (s'il n'est pas déjà couvert par un leg)
  if (!inLeg && !outLeg) {
    nodes.push({
      id: 'focus',
      label: merchantName(focus.description) || focus.description,
      amount: total,
      color: '#8b5cf6',
      col: 1,
    });
  }

  // Virement sortant depuis le focus
  if (outLeg) {
    const outN = nodesFor.get(outLeg.outId);
    const inN = nodesFor.get(outLeg.inId);
    if (outN && inN) {
      const ob = banks.get(outN.bankId);
      const ib = banks.get(inN.bankId);
      nodes.push({
        id: `leg-${outLeg.outId}-${outLeg.inId}`,
        label: `${ob?.shortName || '→'} → ${ib?.shortName || '→'}`,
        amount: total,
        color: '#3b82f6',
        col: 1,
      });
    }
  }

  // ── Colonne 2 : DESTINATIONS ──
  // Où va cet argent ? (dépenses, virement sortant, argent resté)

  if (exitSteps.length > 0) {
    for (const exit of exitSteps) {
      const node = nodesFor.get(exit.txnId);
      if (!node) continue;
      const cat = node.categoryId ? categories.get(node.categoryId) : null;
      const bank = banks.get(node.bankId);
      nodes.push({
        id: `dst-${node.id}`,
        label: cat ? `${cat.icon || '•'} ${cat.name}` : (merchantName(node.description) || bank?.shortName || 'Dépense'),
        amount: Math.abs(node.amount),
        color: '#ef4444',
        col: 2,
      });
    }
  } else if (outLeg) {
    // L'argent est transféré vers un autre compte
    const inN = nodesFor.get(outLeg.inId);
    if (inN) {
      const bank = banks.get(inN.bankId);
      nodes.push({
        id: `dst-${outLeg.inId}`,
        label: bank?.shortName || bank?.name || 'Compte',
        amount: total,
        color: '#3b82f6',
        col: 2,
      });
    }
  } else {
    // L'argent reste sur le compte
    const bank = banks.get(focus.bankId);
    nodes.push({
      id: 'dst-remain',
      label: bank?.shortName || bank?.name || 'Solde',
      amount: total,
      color: '#71717a',
      col: 2,
    });
  }

  // ── Bandes ──
  // Source → premier nœud colonne 1
  const col0 = nodes.filter((n) => n.col === 0);
  const col1 = nodes.filter((n) => n.col === 1);
  const col2 = nodes.filter((n) => n.col === 2);

  for (const src of col0) {
    for (const mid of col1) {
      if (mid.amount > 0 && src.amount > 0) {
        bands.push({ from: src.id, to: mid.id, amount: Math.min(src.amount, mid.amount), color: '#22c55e' });
      }
    }
  }

  for (const mid of col1) {
    for (const dst of col2) {
      if (dst.amount > 0 && mid.amount > 0) {
        bands.push({ from: mid.id, to: dst.id, amount: Math.min(mid.amount, dst.amount), color: dst.color });
      }
    }
  }

  return { nodes, bands };
}

/* ─── SVG ────────────────────────────────────────────────────────────── */

function SankeySVG({ nodes, bands, total }: { nodes: FlowNode[]; bands: FlowBand[]; total: number }) {
  const W = 720;
  const H = 200;
  const COL_X = [40, 310, 580];
  const BAR_W = 6;
  const PAD = 12;

  const cols: FlowNode[][] = [[], [], []];
  for (const n of nodes) cols[n.col].push(n);

  const pos = new Map<string, { x: number; y: number; h: number }>();

  for (let col = 0; col < 3; col++) {
    const items = cols[col];
    if (items.length === 0) continue;
    const colTotal = items.reduce((s, n) => s + n.amount, 0) || 1;
    const gap = Math.max(0, (items.length - 1) * PAD);
    const avail = H - 20 - gap;
    let y = 10;
    for (const item of items) {
      const h = Math.max(10, (item.amount / colTotal) * avail);
      pos.set(item.id, { x: COL_X[col], y, h });
      y += h + PAD;
    }
  }

  // Bandes
  const rendered: Array<{ d: string; color: string }> = [];
  const sOff = new Map<string, number>();
  const tOff = new Map<string, number>();

  for (const band of bands) {
    const sp = pos.get(band.from);
    const tp = pos.get(band.to);
    if (!sp || !tp) continue;

    const so = sOff.get(band.from) || 0;
    const to = tOff.get(band.to) || 0;

    const srcNode = nodes.find((n) => n.id === band.from);
    const bandH = Math.max(3, (band.amount / (srcNode?.amount || 1)) * sp.h);

    const sx = sp.x + BAR_W;
    const sy = sp.y + so;
    const tx = tp.x;
    const ty = tp.y + to;
    const mx = (sx + tx) / 2;

    const d = `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty} L${tx},${ty + bandH} C${mx},${ty + bandH} ${mx},${sy + bandH} ${sx},${sy + bandH} Z`;

    const gradId = band.color === '#22c55e' ? 'g' : band.color === '#3b82f6' ? 'b' : band.color === '#ef4444' ? 'r' : 'p';
    rendered.push({ d, color: gradId });

    sOff.set(band.from, so + bandH);
    tOff.set(band.to, to + bandH);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} /><stop offset="100%" stopColor="#22c55e" stopOpacity={0.25} /></linearGradient>
        <linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0.25} /></linearGradient>
        <linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0.5} /></linearGradient>
        <linearGradient id="p" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.3} /></linearGradient>
      </defs>

      {/* Bandes */}
      {rendered.map((r, i) => <path key={i} d={r.d} fill={`url(#${r.color})`} />)}

      {/* Barres verticales */}
      {COL_X.map((x, i) => <rect key={i} x={x} y={5} width={BAR_W} height={H - 10} rx={3} fill="#1c1c1f" />)}

      {/* Nœuds colorés sur les barres */}
      {[...pos.entries()].map(([id, p]) => {
        const node = nodes.find((n) => n.id === id);
        if (!node) return null;
        return <rect key={id} x={p.x} y={p.y} width={BAR_W} height={p.h} rx={3} fill={node.color} opacity={0.9} />;
      })}

      {/* Labels colonne 0 (gauche des barres) */}
      {cols[0].map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        return (
          <g key={n.id}>
            <text x={p.x - 12} y={p.y + p.h / 2 - 7} textAnchor="end" dominantBaseline="central" fill="#d4d4d8" fontSize={12} fontWeight={500}>{n.label}</text>
            <text x={p.x - 12} y={p.y + p.h / 2 + 8} textAnchor="end" dominantBaseline="central" fill="#52525b" fontSize={10}>{pct(n.amount, total)} · {money(n.amount)}</text>
          </g>
        );
      })}

      {/* Labels colonne 1 (centre) */}
      {cols[1].map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        const cx = (COL_X[0] + COL_X[1]) / 2 + 10;
        return (
          <g key={n.id}>
            <text x={cx} y={p.y + p.h / 2 - 7} textAnchor="middle" dominantBaseline="central" fill="#d4d4d8" fontSize={12} fontWeight={500}>{n.label}</text>
            <text x={cx} y={p.y + p.h / 2 + 8} textAnchor="middle" dominantBaseline="central" fill="#52525b" fontSize={10}>{pct(n.amount, total)} · {money(n.amount)}</text>
          </g>
        );
      })}

      {/* Labels colonne 2 (droite des barres) */}
      {cols[2].map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        return (
          <g key={n.id}>
            <text x={p.x + BAR_W + 12} y={p.y + p.h / 2 - 7} textAnchor="start" dominantBaseline="central" fill="#d4d4d8" fontSize={12} fontWeight={500}>{n.label}</text>
            <text x={p.x + BAR_W + 12} y={p.y + p.h / 2 + 8} textAnchor="start" dominantBaseline="central" fill="#52525b" fontSize={10}>{pct(n.amount, total)} · {money(n.amount)}</text>
          </g>
        );
      })}
    </svg>
  );
}
