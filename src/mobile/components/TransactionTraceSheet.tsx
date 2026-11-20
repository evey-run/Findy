import { useEffect, useState } from 'react';
import { PencilIcon } from '@heroicons/react/24/outline';
import Sheet from './Sheet';
import Amount from './Amount';
import { PrimaryButton } from './Controls';
import { SkeletonList } from './Feedback';
import { merchantName } from '../../lib/merchant';
import { formatDayLabel } from '../../lib/format';
import type { TraceNode, TraceStep, TraceBank, TraceCategory, Transaction, TransactionTrace } from '../../types';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Trajet de l'argent d'une opération.
 *
 * Appuyer sur une opération montre ce que les comptes se racontent derrière le
 * montant : le revenu qui a porté cet argent jusqu'ici, les virements entre
 * comptes par lesquels il est passé, et ce qu'il est devenu ensuite. En clair,
 * la réponse à « d'où vient cet argent, par où est-il passé, et où va-t-il ?
 * » — pour cette opération précisément.
 *
 * Le serveur renvoie un `steps` ordonné, déjà résolu : ce composant n'a qu'à
 * le rendre. Chaque étape est un marqueur du trajet :
 *
 *   entry  → l'argent entre dans les comptes (salaire, dépôt)
 *   carry  → il est resté assis sur un compte entre deux mouvements
 *   leg    → un virement d'un compte vers un autre
 *   focus  → l'opération appuyée
 *   exit   → l'argent quitte les comptes (dépense)
 *   unexplained → pas d'origine traçable : argent déjà présent avant le suivi
 *   remain → l'argent est resté sur son compte sans autre suite
 */

interface TransactionTraceSheetProps {
  open: boolean;
  onClose: () => void;
  /** L'opération dont on veut voir le trajet. */
  transaction: Transaction | null;
  /** Ouvre la feuille d'édition de la même opération. */
  onEdit: () => void;
}

export default function TransactionTraceSheet({ open, onClose, transaction, onEdit }: TransactionTraceSheetProps) {
  const [trace, setTrace] = useState<TransactionTrace | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !transaction) return;

    let cancelled = false;
    setTrace(null);
    setFailed(false);

    fetch(`/api/transactions/${transaction.id}/trace`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as TransactionTrace;
        if (!cancelled) setTrace(data);
      })
      .catch((caught) => {
        if (cancelled) return;
        console.error('Trajet impossible à charger', caught);
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open, transaction]);

  const banks = new Map((trace?.banks ?? []).map((bank) => [bank.id, bank]));
  const categories = new Map((trace?.categories ?? []).map((category) => [category.id, category]));
  const nodes = new Map((trace?.nodes ?? []).map((node) => [node.id, node]));
  const focusIndex = trace?.steps.findIndex((step) => step.kind === 'focus') ?? -1;

  const node = (id: string): TraceNode | undefined => nodes.get(id);
  const bank = (id: string): TraceBank | undefined => banks.get(id);
  const categoryOf = (id?: string | null): TraceCategory | undefined =>
    id ? categories.get(id) : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Trajet de l'argent"
      subtitle={transaction ? merchantName(transaction.description) || transaction.description : undefined}
      footer={
        <PrimaryButton onClick={onEdit} disabled={!transaction}>
          <PencilIcon className="h-5 w-5" />
          Modifier l'opération
        </PrimaryButton>
      }
    >
      <div className="space-y-4 pt-1">
        {failed ? (
          <p className={cx(text.caption, 'text-center')}>
            Impossible de reconstituer le trajet de cette opération.
          </p>
        ) : !trace ? (
          <SkeletonList rows={4} />
        ) : (
          <>
            {!trace.accounted && trace.steps.length <= 1 ? (
              <p className={cx(text.caption, 'text-center')}>
                Aucun virement interne détecté autour de cette opération : son argent n'a pas
                laissé de piste entre deux de vos comptes.
              </p>
            ) : null}

            {focusIndex > 0 ? (
              <section>
                <p className={cx(text.label, 'mb-2')}>D'où vient cet argent</p>
                <ol>
                  {trace.steps.slice(0, focusIndex).map((step) => (
                    <TraceRow key={`up-${stepKey(step)}`} step={step} node={node} bank={bank} categoryOf={categoryOf} />
                  ))}
                </ol>
              </section>
            ) : null}

            <FocusCard transaction={transaction} bank={bank} categoryOf={categoryOf} />

            {focusIndex >= 0 && focusIndex < trace.steps.length - 1 ? (
              <section>
                <p className={cx(text.label, 'mb-2')}>Ce que devient cet argent</p>
                <ol>
                  {trace.steps.slice(focusIndex + 1).map((step) => (
                    <TraceRow key={`down-${stepKey(step)}`} step={step} node={node} bank={bank} categoryOf={categoryOf} />
                  ))}
                </ol>
              </section>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Clé stable d'une étape, pour React, quel que soit son champ porteur. */
function stepKey(step: TraceStep): string {
  switch (step.kind) {
    case 'leg':
      return `leg-${step.outId}-${step.inId}`;
    case 'carry':
    case 'unexplained':
    case 'remain':
      return `${step.kind}-${step.bankId}`;
    default:
      return `${step.kind}-${step.txnId}`;
  }
}

/**
 * Une étape du trajet avec son rail vertical.
 *
 * La colonne de gauche porte le point et le trait qui relie les étapes entre
 * elles : c'est elle qui fait lire la suite comme un parcours et non comme une
 * simple liste de cartes.
 */
function TraceRow({
  step,
  node,
  bank,
  categoryOf,
}: {
  step: TraceStep;
  node: (id: string) => TraceNode | undefined;
  bank: (id: string) => TraceBank | undefined;
  categoryOf: (id?: string | null) => TraceCategory | undefined;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center pt-4">
        <span className="size-1.5 shrink-0 rounded-full bg-white/30" />
        <span className="w-px flex-1 bg-white/[0.08]" />
      </div>
      <div className="min-w-0 flex-1 pb-3">
        {step.kind === 'entry' || step.kind === 'exit' ? (
          <TransactionCard txnId={step.txnId} node={node} bank={bank} categoryOf={categoryOf} entry={step.kind === 'entry'} />
        ) : step.kind === 'leg' ? (
          <LegCard step={step} node={node} bank={bank} />
        ) : step.kind === 'carry' || step.kind === 'unexplained' || step.kind === 'remain' ? (
          <NoteRow
            bankName={bank(step.bankId)?.shortName || bank(step.bankId)?.name || 'ce compte'}
            kind={step.kind}
          />
        ) : null}
      </div>
    </li>
  );
}

interface TraceCardProps {
  txnId: string;
  node: (id: string) => TraceNode | undefined;
  bank: (id: string) => TraceBank | undefined;
  categoryOf: (id?: string | null) => TraceCategory | undefined;
  entry?: boolean;
}

/** Une opération du trajet : revenu d'origine ou dépense finale. */
function TransactionCard({ txnId, node, bank, categoryOf, entry = false }: TraceCardProps) {
  const txn = node(txnId);
  if (!txn) return null;

  const account = bank(txn.bankId);
  const category = categoryOf(txn.categoryId);

  return (
    <div className={cx(radii.row, surfaces.card, 'px-3.5 py-2.5')}>
      <div className="flex items-center justify-between gap-2">
        <p className={cx(text.rowTitle, 'truncate')}>{merchantName(txn.description) || txn.description}</p>
        <Amount value={txn.amount} signed className={cx(text.rowAmount, 'shrink-0')} />
      </div>
      <p className={cx(text.rowSubtitle, 'mt-1 truncate')}>
        {entry ? `Réalise la source de cet argent · ` : ''}
        {category ? `${category.icon ? category.icon + ' ' : ''}${category.name}` : 'Sans catégorie'}
        {account ? ` · ${account.shortName || account.name}` : ''}
        <span className="text-zinc-600"> · {formatDayLabel(txn.date)}</span>
      </p>
    </div>
  );
}

/** Le virement entre deux comptes : ce qui part, ce qui arrive, sur une ligne. */
function LegCard({
  step,
  node,
  bank,
}: {
  step: Extract<TraceStep, { kind: 'leg' }>;
  node: (id: string) => TraceNode | undefined;
  bank: (id: string) => TraceBank | undefined;
}) {
  const out = node(step.outId);
  const input = node(step.inId);
  if (!out || !input) return null;

  const outAccount = bank(out.bankId);
  const inAccount = bank(input.bankId);

  return (
    <div className={cx(radii.row, surfaces.card, 'px-3.5 py-3')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BankDot color={outAccount?.color} />
          <span className={cx(text.rowTitle, 'truncate')}>{outAccount?.shortName || outAccount?.name}</span>
        </div>
        <Amount value={out.amount} signed className={cx(text.rowAmount, 'shrink-0')} />
      </div>

      <div className="my-1.5 ml-[5px] h-px w-8 bg-gradient-to-r from-white/25 to-white/5" />

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BankDot color={inAccount?.color} />
          <span className={cx(text.rowTitle, 'truncate')}>{inAccount?.shortName || inAccount?.name}</span>
        </div>
        <Amount value={input.amount} signed className={cx(text.rowAmount, 'shrink-0')} />
      </div>

      <p className={cx(text.rowSubtitle, 'mt-1.5 truncate')}>
        {merchantName(out.description) || out.description} · {formatDayLabel(out.date)}
      </p>
    </div>
  );
}

function BankDot({ color, className }: { color?: string; className?: string }) {
  return <span className={cx('size-2.5 shrink-0 rounded-full', className)} style={{ backgroundColor: color ?? '#71717a' }} />;
}

/** Les pauses du trajet : l'argent posé sur un compte. */
function NoteRow({ bankName, kind }: { bankName: string; kind: TraceStep['kind'] }) {
  const label =
    kind === 'carry'
      ? `est resté sur ${bankName}`
      : kind === 'remain'
        ? `reste sur ${bankName}`
        : `argent déjà présent sur ${bankName} avant le suivi`;

  return (
    <div className="flex min-h-[44px] items-center py-2">
      <p className={cx(text.rowSubtitle, 'text-center')}>{label}</p>
    </div>
  );
}

function FocusCard({
  transaction,
  bank,
  categoryOf,
}: {
  transaction: Transaction | null;
  bank: (id: string) => TraceBank | undefined;
  categoryOf: (id?: string | null) => TraceCategory | undefined;
}) {
  if (!transaction) return null;

  // En l'absence de plus de contexte, la carte de l'opération appuyée reprend
  // l'essentiel de ce que la liste montrait déjà.
  const account = bank(transaction.bankId);
  const category = categoryOf(transaction.categoryId);

  return (
    <div className={cx(radii.tile, surfaces.cardRaised, 'border-violet-400/40 px-4 py-3.5')}>
      <div className="flex items-center justify-between gap-2">
        <p className={cx(text.rowTitle, 'truncate')}>{merchantName(transaction.description) || transaction.description}</p>
        <Amount value={transaction.amount} signed className={cx(text.rowAmount, 'shrink-0')} />
      </div>
      <p className={cx(text.rowSubtitle, 'mt-1 truncate')}>
        {category ? `${category.icon ? category.icon + ' ' : ''}${category.name}` : 'Sans catégorie'}
        {account ? ` · ${account.shortName || account.name}` : ''}
        <span className="text-zinc-600"> · {formatDayLabel(transaction.date)}</span>
      </p>
    </div>
  );
}