import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChartPieIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import type { Budget, Category } from '../../types';
import { formatMoneyCompact, formatMoneyRounded, formatPercent, toISODate } from '../../lib/format';
import { ScreenBody, ScreenHeader } from '../components/Screen';
import Sheet from '../components/Sheet';
import Avatar from '../components/Avatar';
import { ListCard, ListRow } from '../components/ListRow';
import { DangerButton, Fab, PrimaryButton, SegmentedControl } from '../components/Controls';
import { AmountInput, DateInput, Field, SelectInput, TextInput } from '../components/Field';
import { parseAmount } from '../../lib/amount';
import { EmptyState, SkeletonList } from '../components/Feedback';
import { cx, GUTTER, radii, surfaces, text } from '../theme';

/**
 * Catégories.
 *
 * L'écran desktop met la liste et un camembert côte à côte, et cache les
 * actions derrière un menu « … » qui n'apparaît qu'au survol. Sur un
 * téléphone, la répartition n'a pas la place d'être lisible à côté d'autre
 * chose : elle vit dans l'onglet Analyse, et cet écran ne garde que ce qu'on
 * vient y chercher — combien il reste sur chaque enveloppe, et de quoi la
 * corriger d'un appui.
 *
 * Les catégories sans limite ne sont pas reléguées en bas d'une liste
 * indifférenciée : elles ont leur section, parce que « poser une limite » est
 * précisément l'action que l'on vient faire ici.
 */

type Tab = 'expense' | 'income';

const PALETTE = [
  '#7c3aed', '#2c699a', '#048ba8', '#0db39e', '#16db93', '#83e377',
  '#b9e769', '#efea5a', '#f1c453', '#f29e4c', '#ef4444', '#ec4899',
];

const ICONS = [
  '🛒', '🍽️', '☕', '🚗', '🚌', '🏠',
  '💡', '📱', '👕', '🎬', '✈️', '💊',
  '🏋️', '🎓', '🐶', '🎁', '💼', '💰',
];

const PERIOD_LABELS: Record<Budget['period'], string> = {
  WEEKLY: 'par semaine',
  MONTHLY: 'par mois',
  QUARTERLY: 'par trimestre',
  YEARLY: 'par an',
};

interface Spending {
  budget: Budget;
  spent: number;
  percentage: number;
  over: boolean;
}

/**
 * Fenêtre du budget en cours.
 *
 * `startDate` est la date de mise en place, pas celle de la période courante :
 * un budget mensuel créé il y a deux ans a sa première fenêtre en 2024. On
 * avance donc de période en période jusqu'à celle qui contient aujourd'hui —
 * sans quoi l'écran afficherait « 0 € dépensés » sur une enveloppe pourtant
 * entamée. Le garde-fou borne la boucle : une date corrompue ne doit pas figer
 * l'interface.
 */
function currentWindow(budget: Budget, now: Date): { start: Date; end: Date } {
  const advance = (date: Date): Date => {
    const next = new Date(date);
    if (budget.period === 'WEEKLY') next.setDate(next.getDate() + 7);
    else if (budget.period === 'QUARTERLY') next.setMonth(next.getMonth() + 3);
    else if (budget.period === 'YEARLY') next.setFullYear(next.getFullYear() + 1);
    else next.setMonth(next.getMonth() + 1);
    return next;
  };

  const parsed = new Date(budget.startDate);
  let start = Number.isNaN(parsed.getTime())
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : parsed;
  let end = advance(start);

  for (let guard = 0; end <= now && guard < 2_000; guard += 1) {
    start = end;
    end = advance(start);
  }

  return { start, end };
}

/** Montant réinjecté dans un champ : entier nu, ou virgule française s'il y a des centimes. */
function amountToInput(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

/**
 * Décalage du bandeau collant des sections.
 *
 * L'en-tête d'écran est lui-même collant et sa hauteur dépend de l'encoche du
 * téléphone : une valeur écrite en dur laisserait selon l'appareil une bande
 * noire ou une ligne de liste tronquée sous le titre. On mesure donc le bas de
 * l'en-tête — constant en coordonnées de fenêtre, puisqu'il est collé en haut.
 */
function useHeaderBottom(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [bottom, setBottom] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => setBottom(Math.round(node.getBoundingClientRect().bottom));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return [ref, bottom];
}

export default function CategoriesScreen() {
  const navigate = useNavigate();
  const {
    categories,
    budgets,
    allTransactions,
    currentSpace,
    authUser,
    loadCategories,
    loadBudgets,
    loadAllTransactions,
    addCategory,
    updateCategory,
    removeCategory,
    addBudget,
    updateBudget,
    removeBudget,
    requestConfirm,
  } = useAppStore();

  const [tab, setTab] = useState<Tab>('expense');
  const [loading, setLoading] = useState(true);
  const [filterRef, headerBottom] = useHeaderBottom();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<Category['type']>('EXPENSE');
  const [color, setColor] = useState(PALETTE[0]);
  const [icon, setIcon] = useState('');
  const [limit, setLimit] = useState('');
  const [period, setPeriod] = useState<Budget['period']>('MONTHLY');
  const [start, setStart] = useState(() => toISODate(new Date()));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      // Historique complet : la fenêtre d'un budget trimestriel ou annuel
      // commence bien avant le mois courant, et la période de filtrage de
      // l'écran des opérations n'a pas de sens ici.
      await Promise.allSettled([
        loadCategories(),
        loadBudgets(true),
        loadAllTransactions({ forceIgnoreSelectedBank: true, ignoreDateRange: true }),
      ]);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadCategories, loadBudgets, loadAllTransactions, currentSpace?.id]);

  const budgetByCategory = useMemo(() => {
    const map: Record<string, Budget> = {};
    for (const budget of budgets) map[budget.categoryId] = budget;
    return map;
  }, [budgets]);

  const spendingByCategory = useMemo(() => {
    const now = new Date();
    const map: Record<string, Spending> = {};

    for (const budget of budgets) {
      const { start: from, end: to } = currentWindow(budget, now);

      const spent = allTransactions.reduce((sum, transaction) => {
        if (transaction.categoryId !== budget.categoryId || transaction.amount >= 0) return sum;
        if (budget.bankId && transaction.bankId !== budget.bankId) return sum;
        const date = new Date(transaction.date);
        if (date < from || date >= to) return sum;
        return sum + Math.abs(transaction.amount);
      }, 0);

      map[budget.categoryId] = {
        budget,
        spent,
        percentage: budget.amount > 0 ? (spent / budget.amount) * 100 : 0,
        over: spent > budget.amount,
      };
    }

    return map;
  }, [budgets, allTransactions]);

  /** Totaux du mois civil : le repère qu'on a en tête pour une enveloppe libre. */
  const monthByCategory = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const map: Record<string, { amount: number; count: number }> = {};

    for (const transaction of allTransactions) {
      if (!transaction.categoryId) continue;
      const date = new Date(transaction.date);
      if (date < from || date >= to) continue;

      const entry = (map[transaction.categoryId] ??= { amount: 0, count: 0 });
      entry.amount += transaction.amount;
      entry.count += 1;
    }

    return map;
  }, [allTransactions]);

  const visible = useMemo(
    () =>
      categories.filter((category) =>
        tab === 'income' ? category.type === 'INCOME' : category.type !== 'INCOME',
      ),
    [categories, tab],
  );

  // Les plus proches de leur limite en premier : c'est là que se joue la fin
  // de mois, et c'est ce qu'on veut voir sans faire défiler.
  const withLimit = useMemo(
    () =>
      visible
        .filter((category) => budgetByCategory[category.id])
        .sort(
          (a, b) =>
            (spendingByCategory[b.id]?.percentage ?? 0) - (spendingByCategory[a.id]?.percentage ?? 0),
        ),
    [visible, budgetByCategory, spendingByCategory],
  );

  const withoutLimit = useMemo(
    () =>
      visible
        .filter((category) => !budgetByCategory[category.id])
        .sort((a, b) => {
          const spentA = Math.abs(monthByCategory[a.id]?.amount ?? 0);
          const spentB = Math.abs(monthByCategory[b.id]?.amount ?? 0);
          return spentB - spentA || a.name.localeCompare(b.name);
        }),
    [visible, budgetByCategory, monthByCategory],
  );

  const monthTotal = useMemo(
    () =>
      visible.reduce((sum, category) => sum + Math.abs(monthByCategory[category.id]?.amount ?? 0), 0),
    [visible, monthByCategory],
  );

  // Un seul groupe à l'écran se passe de titre : le bandeau collant n'aurait
  // rien à distinguer.
  const showHeadings = withLimit.length > 0 && withoutLimit.length > 0;

  // ── Formulaire ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    setName('');
    setType(tab === 'income' ? 'INCOME' : 'EXPENSE');
    setColor(PALETTE[0]);
    setIcon('');
    setLimit('');
    setPeriod('MONTHLY');
    setStart(toISODate(new Date()));
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = useCallback(
    (category: Category) => {
      const budget = budgetByCategory[category.id];
      setEditing(category);
      setName(category.name);
      setType(category.type);
      setColor(category.color);
      setIcon(category.icon ?? '');
      setLimit(budget ? amountToInput(budget.amount) : '');
      setPeriod(budget?.period ?? 'MONTHLY');
      setStart(budget ? budget.startDate.split('T')[0] : toISODate(new Date()));
      setFormError(null);
      setFormOpen(true);
    },
    [budgetByCategory],
  );

  const submit = async () => {
    if (!name.trim()) {
      setFormError('Donnez un nom à la catégorie.');
      return;
    }

    const parsedLimit = limit.trim() ? parseAmount(limit) : null;
    if (limit.trim() && (parsedLimit === null || parsedLimit <= 0)) {
      setFormError('La limite doit être un montant positif.');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const response = await fetch(
        editing ? `/api/categories/${editing.id}` : '/api/categories',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), type, color, icon: icon || null }),
        },
      );
      if (!response.ok) throw new Error(await response.text());

      const saved: Category = await response.json();
      if (editing) updateCategory(editing.id, saved);
      else addCategory(saved);

      await syncBudget(saved.id, parsedLimit);

      toast.success(editing ? 'Catégorie mise à jour' : 'Catégorie créée');
      setFormOpen(false);
    } catch (caught) {
      console.error('Enregistrement de la catégorie impossible', caught);
      setFormError('Enregistrement impossible. Vérifiez la connexion au serveur.');
    } finally {
      setSaving(false);
    }
  };

  /** Crée, met à jour ou retire la limite selon ce que contient le champ. */
  const syncBudget = async (categoryId: string, amount: number | null) => {
    const existing = budgetByCategory[categoryId];

    // Une limite n'a de sens que sur une dépense : sur un revenu, le champ
    // n'est même pas affiché, et une limite héritée doit disparaître.
    if (type === 'INCOME' || amount === null) {
      if (!existing) return;
      const response = await fetch(`/api/budgets/${existing.id}`, { method: 'DELETE' });
      if (response.ok) removeBudget(existing.id);
      return;
    }

    const payload = {
      amount,
      period,
      startDate: start,
      categoryId,
      // Sans espace, le budget serait créé hors de toute portée et deviendrait
      // invisible au rechargement : la lecture filtre toujours par espace.
      spaceId: currentSpace?.id,
      userId: authUser?.id,
    };

    const response = await fetch(existing ? `/api/budgets/${existing.id}` : '/api/budgets', {
      method: existing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());

    const savedBudget: Budget = await response.json();
    if (existing) updateBudget(existing.id, savedBudget);
    else addBudget(savedBudget);
  };

  const remove = async (category: Category) => {
    const confirmed = await requestConfirm(
      'Les opérations déjà classées ici perdront leur catégorie.',
      { title: `Supprimer ${category.name} ?`, confirmLabel: 'Supprimer', danger: true },
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/categories/${category.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Suppression refusée');
      }

      // Le serveur supprime aussi le budget lié : le retirer du magasin évite
      // une ligne fantôme dans « Avec limite ».
      const budget = budgetByCategory[category.id];
      if (budget) removeBudget(budget.id);
      removeCategory(category.id);

      setFormOpen(false);
      toast.success('Catégorie supprimée');
    } catch (caught) {
      console.error('Suppression de la catégorie impossible', caught);
      toast.error('Suppression impossible.');
    }
  };

  // ── Rendu ───────────────────────────────────────────────────────────────

  const rowsFor = (list: Category[]) =>
    list.map((category) => (
      <CategoryRow
        key={category.id}
        category={category}
        spending={spendingByCategory[category.id]}
        month={monthByCategory[category.id]}
        income={tab === 'income'}
        onPress={() => openEdit(category)}
      />
    ));

  return (
    <>
      <ScreenHeader title="Catégories" back backTo="/stats">
        <div ref={filterRef} className={cx(GUTTER, 'pb-3')}>
          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'expense', label: 'Dépenses' },
              { value: 'income', label: 'Revenus' },
            ]}
          />
        </div>
      </ScreenHeader>

      <ScreenBody>
        <div className="space-y-5 pt-1">
          {loading ? (
            <SkeletonList rows={6} />
          ) : categories.length === 0 ? (
            <div className={cx(radii.tile, surfaces.card)}>
              <EmptyState
                icon="🗂️"
                title="Aucune catégorie"
                description="Les catégories rangent vos opérations et permettent de fixer des limites de dépenses."
                action={<PrimaryButton onClick={openCreate}>Créer une catégorie</PrimaryButton>}
              />
            </div>
          ) : (
            <>
              {/* Le camembert vit dans l'onglet Analyse : le dupliquer ici
                  donnerait deux graphiques concurrents sur le même chiffre. */}
              <ListCard>
                <ListRow
                  leading={
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600/15 text-violet-300">
                      <ChartPieIcon className="h-5 w-5" />
                    </span>
                  }
                  title="Voir la répartition"
                  subtitle={tab === 'income' ? 'Revenus du mois' : 'Dépenses du mois'}
                  trailing={
                    <span className="text-[15px] font-semibold tabular-nums text-zinc-100">
                      {formatMoneyCompact(monthTotal)}
                    </span>
                  }
                  onClick={() => navigate('/stats')}
                  chevron
                />
              </ListCard>

              {visible.length === 0 ? (
                <div className={cx(radii.tile, surfaces.card)}>
                  <EmptyState
                    icon={tab === 'income' ? '💶' : '💸'}
                    title={tab === 'income' ? 'Aucune catégorie de revenu' : 'Aucune catégorie de dépense'}
                    description="Créez-en une pour classer vos opérations."
                    action={<PrimaryButton onClick={openCreate}>Créer une catégorie</PrimaryButton>}
                  />
                </div>
              ) : (
                <>
                  {withLimit.length > 0 && (
                    <section>
                      {showHeadings && (
                        <StickyHeading title="Avec limite" count={withLimit.length} top={headerBottom} />
                      )}
                      <ListCard>{rowsFor(withLimit)}</ListCard>
                    </section>
                  )}

                  {withoutLimit.length > 0 && (
                    <section>
                      {showHeadings && (
                        <StickyHeading title="Sans limite" count={withoutLimit.length} top={headerBottom} />
                      )}
                      <ListCard>{rowsFor(withoutLimit)}</ListCard>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </ScreenBody>

      <Fab onClick={openCreate} label="Catégorie" />

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        footer={
          <div className="space-y-2">
            <PrimaryButton onClick={submit} disabled={saving}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
            </PrimaryButton>
            {editing && (
              <DangerButton
                onClick={() => editing && void remove(editing)}
                className="bg-transparent text-red-400"
              >
                <TrashIcon className="h-5 w-5" />
                Supprimer
              </DangerButton>
            )}
          </div>
        }
      >
        <div className="space-y-4 pt-1">
          <Field label="Nom" error={formError ?? undefined}>
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alimentation, loyer, salaire…"
              enterKeyHint="next"
              autoCapitalize="sentences"
            />
          </Field>

          <Field label="Type">
            <SegmentedControl<Tab>
              // Les anciennes catégories « FIXED » n'ont plus de bouton : elles
              // se présentent comme des dépenses et gardent leur type tant
              // qu'on n'y touche pas.
              value={type === 'INCOME' ? 'income' : 'expense'}
              onChange={(value) => setType(value === 'income' ? 'INCOME' : 'EXPENSE')}
              options={[
                { value: 'expense', label: 'Dépense' },
                { value: 'income', label: 'Revenu' },
              ]}
            />
          </Field>

          <Field label="Couleur">
            <div className="grid grid-cols-6 gap-2">
              {(PALETTE.includes(color) ? PALETTE : [color, ...PALETTE]).map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Couleur ${swatch}`}
                  aria-pressed={color === swatch}
                  className={cx(
                    'tappable h-11 rounded-2xl transition-shadow',
                    color === swatch
                      ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-[#141419]'
                      : 'ring-1 ring-white/10',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </Field>

          <Field label="Icône" hint="Facultative — à défaut, l’initiale du nom.">
            <div className="grid grid-cols-6 gap-2">
              <button
                type="button"
                onClick={() => setIcon('')}
                aria-pressed={icon === ''}
                className={cx(
                  'tappable flex h-11 items-center justify-center rounded-2xl text-[15px] font-semibold text-zinc-400',
                  icon === '' ? 'bg-violet-600/25 ring-1 ring-violet-500/70' : 'bg-white/[0.05]',
                )}
              >
                {name.trim().charAt(0).toUpperCase() || 'A'}
              </button>
              {ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  aria-pressed={icon === emoji}
                  className={cx(
                    'tappable flex h-11 items-center justify-center rounded-2xl text-[20px]',
                    icon === emoji ? 'bg-violet-600/25 ring-1 ring-violet-500/70' : 'bg-white/[0.05]',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Field>

          {type !== 'INCOME' && (
            <div className="space-y-4 border-t border-white/[0.06] pt-4">
              <Field
                label="Limite de dépense"
                hint="Laissez vide pour suivre la catégorie sans plafond."
              >
                <AmountInput value={limit} onChange={setLimit} placeholder="300" />
              </Field>

              {limit.trim() !== '' && (
                <>
                  <Field label="Période">
                    <SelectInput
                      value={period}
                      onChange={(value) => setPeriod(value as Budget['period'])}
                    >
                      <option value="WEEKLY">Par semaine</option>
                      <option value="MONTHLY">Par mois</option>
                      <option value="QUARTERLY">Par trimestre</option>
                      <option value="YEARLY">Par an</option>
                    </SelectInput>
                  </Field>

                  <Field label="Début" hint="La période se renouvelle à partir de cette date.">
                    <DateInput value={start} onChange={setStart} />
                  </Field>
                </>
              )}
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** Bandeau de section, collé sous l'en-tête pendant le défilement. */
function StickyHeading({ title, count, top }: { title: string; count: number; top: number }) {
  return (
    <div
      className="sticky z-20 -mx-5 bg-[#09090b]/85 px-5 pb-2 pt-1.5 backdrop-blur-xl"
      style={{ top }}
    >
      <div className="flex items-baseline gap-2">
        <h2 className={text.section}>{title}</h2>
        <span className="text-[13px] tabular-nums text-zinc-600">{count}</span>
      </div>
    </div>
  );
}

/**
 * Ligne d'une catégorie.
 *
 * La barre passe sous les deux lignes de texte plutôt qu'à droite : à 390
 * points, une barre de progression coincée dans une colonne latérale n'a plus
 * assez de longueur pour qu'on distingue 60 % de 80 %.
 */
function CategoryRow({
  category,
  spending,
  month,
  income,
  onPress,
}: {
  category: Category;
  spending?: Spending;
  month?: { amount: number; count: number };
  income: boolean;
  onPress: () => void;
}) {
  const monthAmount = Math.abs(month?.amount ?? 0);
  const count = month?.count ?? 0;

  return (
    <button
      type="button"
      onClick={onPress}
      className="tappable flex min-h-[60px] w-full items-center gap-3 py-3 text-left"
    >
      <Avatar label={category.name} emoji={category.icon} color={category.color} />

      <div className="min-w-0 flex-1">
        <p className={cx(text.rowTitle, 'truncate')}>{category.name}</p>

        {spending ? (
          <>
            <p className="mt-0.5 truncate text-[13px] tabular-nums text-zinc-500">
              <span className={spending.over ? 'font-medium text-red-400' : 'text-zinc-300'}>
                {formatMoneyRounded(spending.spent)}
              </span>
              {' / '}
              {formatMoneyRounded(spending.budget.amount)}
              {spending.budget.period !== 'MONTHLY' && ` ${PERIOD_LABELS[spending.budget.period]}`}
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className={cx(
                  'h-full rounded-full transition-[width] duration-500',
                  spending.over ? 'bg-red-500' : 'bg-violet-400',
                )}
                style={{ width: `${Math.min(spending.percentage, 100)}%` }}
              />
            </div>
          </>
        ) : (
          <p className="mt-0.5 truncate text-[13px] text-zinc-500">
            {count === 0
              ? 'Aucune opération ce mois-ci'
              : `${count} opération${count > 1 ? 's' : ''} ce mois-ci`}
          </p>
        )}
      </div>

      {spending ? (
        <span
          className={cx(
            'shrink-0 text-[15px] font-semibold tabular-nums',
            spending.over ? 'text-red-400' : 'text-zinc-100',
          )}
        >
          {formatPercent(spending.percentage)}
        </span>
      ) : (
        <span
          className={cx(
            'shrink-0 text-[15px] font-semibold tabular-nums',
            monthAmount === 0 ? 'text-zinc-600' : income ? 'text-emerald-400' : 'text-zinc-100',
          )}
        >
          {formatMoneyRounded(monthAmount)}
        </span>
      )}
    </button>
  );
}
