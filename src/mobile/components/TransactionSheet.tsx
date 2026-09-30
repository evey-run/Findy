import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { TrashIcon } from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import type { Transaction } from '../../types';
import { merchantName } from '../../lib/merchant';
import { toISODate } from '../../lib/format';
import Sheet from './Sheet';
import { AmountInput, DateInput, Field, SelectInput, TextInput } from './Field';
import { parseAmount } from '../../lib/amount';
import { DangerButton, PrimaryButton, SegmentedControl } from './Controls';
import { cx } from '../theme';

/**
 * Création et édition d'une opération.
 *
 * L'écran desktop édite chaque cellule sur place, avec enregistrement à la
 * perte du focus. Transposé au tactile, ce geste est inutilisable : le clavier
 * virtuel prend la moitié de l'écran, la « perte du focus » survient au moindre
 * défilement, et une modification part alors sans que rien ne le signale. Ici
 * tout se décide dans une feuille, avec une validation explicite.
 *
 * Le signe du montant n'est pas saisi : on choisit « Dépense » ou « Revenu »,
 * et le signe en découle. Taper un moins sur un clavier décimal est laborieux,
 * et le sens de l'opération est ce que l'utilisateur a réellement en tête.
 */

type Direction = 'expense' | 'income';

interface TransactionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Opération existante ; absente, la feuille en crée une. */
  transaction?: Transaction | null;
  /** Compte présélectionné à la création. */
  defaultBankId?: string;
}

export default function TransactionSheet({
  open,
  onClose,
  transaction,
  defaultBankId,
}: TransactionSheetProps) {
  const {
    banks,
    categories,
    addTransaction,
    updateTransaction,
    removeTransaction,
    requestConfirm,
    loadDashboardOverview,
  } = useAppStore();

  const editing = Boolean(transaction);

  const [direction, setDirection] = useState<Direction>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [bankId, setBankId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Les comptes d'investissement ont leur propre écran, avec quantité et prix
  // unitaire : les proposer ici produirait des lignes incomplètes.
  const selectableBanks = useMemo(
    () => banks.filter((bank) => !bank.archived && bank.accountType !== 'INVESTMENT'),
    [banks],
  );

  const selectableCategories = useMemo(
    () =>
      categories
        .filter((category) => (direction === 'income' ? category.type === 'INCOME' : category.type !== 'INCOME'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, direction],
  );

  // Réinitialise à chaque ouverture : une feuille rouverte doit refléter
  // l'opération demandée, pas la précédente.
  useEffect(() => {
    if (!open) return;

    setError(null);
    setSaving(false);

    if (transaction) {
      setDirection(transaction.amount >= 0 ? 'income' : 'expense');
      setAmount(Math.abs(transaction.amount).toFixed(2).replace('.', ','));
      setDescription(transaction.description);
      setDate(toISODate(new Date(transaction.date)));
      setBankId(transaction.bankId);
      setCategoryId(transaction.categoryId ?? '');
      return;
    }

    setDirection('expense');
    setAmount('');
    setDescription('');
    setDate(toISODate(new Date()));
    setBankId(defaultBankId ?? selectableBanks[0]?.id ?? '');
    setCategoryId('');
  }, [open, transaction, defaultBankId, selectableBanks]);

  // Changer de sens rend la catégorie choisie incohérente (une catégorie de
  // dépense sur un revenu) : on la relâche plutôt que d'enregistrer un
  // classement faux.
  useEffect(() => {
    if (!categoryId) return;
    const stillValid = selectableCategories.some((category) => category.id === categoryId);
    if (!stillValid) setCategoryId('');
  }, [selectableCategories, categoryId]);

  const submit = async () => {
    const parsed = parseAmount(amount);
    if (parsed === null || parsed === 0) {
      setError('Saisissez un montant.');
      return;
    }
    if (!description.trim()) {
      setError('Saisissez un libellé.');
      return;
    }
    if (!bankId) {
      setError('Choisissez un compte.');
      return;
    }

    const payload = {
      amount: direction === 'expense' ? -Math.abs(parsed) : Math.abs(parsed),
      description: description.trim(),
      date,
      bankId,
      categoryId: categoryId || null,
    };

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        transaction ? `/api/transactions/${transaction.id}` : '/api/transactions',
        {
          method: transaction ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(transaction ? { ...transaction, ...payload } : payload),
        },
      );

      if (!response.ok) throw new Error(await response.text());

      const saved: Transaction = await response.json();
      if (transaction) updateTransaction(transaction.id, saved);
      else addTransaction(saved);

      // Le solde et les totaux du tableau de bord dépendent de cette écriture.
      void loadDashboardOverview();

      toast.success(transaction ? 'Opération modifiée' : 'Opération ajoutée');
      onClose();
    } catch (caught) {
      console.error('Enregistrement de l’opération impossible', caught);
      setError('Enregistrement impossible. Vérifiez la connexion au serveur.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!transaction) return;

    const confirmed = await requestConfirm('Supprimer cette opération ?', {
      title: merchantName(transaction.description) || 'Opération',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await response.text());

      removeTransaction(transaction.id);
      void loadDashboardOverview();
      toast.success('Opération supprimée');
      onClose();
    } catch (caught) {
      console.error('Suppression impossible', caught);
      toast.error('Suppression impossible.');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Modifier l’opération' : 'Nouvelle opération'}
      footer={
        <div className="space-y-2">
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter'}
          </PrimaryButton>
          {editing && (
            <DangerButton onClick={remove} className="bg-transparent text-red-400">
              <TrashIcon className="h-5 w-5" />
              Supprimer
            </DangerButton>
          )}
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <SegmentedControl<Direction>
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'expense', label: 'Dépense' },
            { value: 'income', label: 'Revenu' },
          ]}
        />

        <Field label="Montant" error={error ?? undefined}>
          <AmountInput value={amount} onChange={setAmount} />
        </Field>

        <Field label="Libellé">
          <TextInput
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Courses, salaire, loyer…"
            enterKeyHint="next"
            autoCapitalize="sentences"
          />
        </Field>

        <Field label="Compte">
          <SelectInput value={bankId} onChange={setBankId}>
            {selectableBanks.length === 0 && <option value="">Aucun compte</option>}
            {selectableBanks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Catégorie" hint="Facultative — elle peut être ajoutée plus tard.">
          <SelectInput value={categoryId} onChange={setCategoryId}>
            <option value="">Sans catégorie</option>
            {selectableCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon ? `${category.icon} ` : ''}
                {category.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Date">
          <DateInput value={date} onChange={setDate} />
        </Field>

        {editing && transaction && (
          <div className={cx('rounded-2xl bg-white/[0.03] px-4 py-3')}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-600">
              Libellé bancaire
            </p>
            <p className="mt-1 break-words text-[13px] text-zinc-400" data-selectable>
              {transaction.description}
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
