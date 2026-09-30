import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import type { Objective } from '../../types';
import { formatMoneyRounded, formatPercent } from '../../lib/format';
import { ScreenBody, ScreenHeader, SectionHeader } from '../components/Screen';
import BalanceCard from '../components/BalanceCard';
import Sheet from '../components/Sheet';
import Avatar from '../components/Avatar';
import { ListRow } from '../components/ListRow';
import { DangerButton, Fab, PrimaryButton } from '../components/Controls';
import { AmountInput, DateInput, Field, SelectInput, TextInput } from '../components/Field';
import { parseAmount } from '../../lib/amount';
import { EmptyState, ErrorNotice, Skeleton } from '../components/Feedback';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Objectifs d'épargne.
 *
 * L'écran desktop est une grille de cartes surmontée de quatre indicateurs de
 * même poids : sur un téléphone, ces quatre chiffres ne sont plus lisibles et
 * répondent de toute façon à une question qu'on ne se pose pas. Ici, un seul
 * montant domine — ce qui est déjà mis de côté, tous objectifs confondus — et
 * chaque objectif devient une tuile dont la barre de progression se lit d'un
 * coup d'œil.
 *
 * Les actions par objectif vivaient derrière un menu « … » qui n'apparaissait
 * qu'au survol. Ici, la tuile entière est la cible et ouvre une feuille : c'est
 * la seule affordance qui existe au doigt.
 */

interface ObjectiveProgress {
  totalSaved: number;
  remaining: number;
  percentage: number;
  isCompleted: boolean;
}

/** Émojis proposés — assez pour couvrir les projets courants, pas plus. */
const ICONS = [
  '🎯', '✈️', '🏠', '🚗', '💍', '🎓',
  '🏖️', '💻', '🎁', '🛟', '👶', '🐶',
  '🚲', '📱', '🏔️', '💰', '🛠️', '🎸',
];

const DEFAULT_ICON = '🎯';

/**
 * Délai entre la fermeture d'une feuille et l'ouverture de la suivante.
 *
 * Chaque feuille empile une entrée d'historique pour capter le retour Android
 * et la dépile en se fermant. Présenter la seconde dans le même rendu laisse la
 * dépile arriver après coup : la nouvelle feuille se refermerait aussitôt. On
 * attend donc la fin de l'animation de sortie — ce que fait aussi le système.
 */
const SHEET_HANDOVER_MS = 260;

/**
 * Mémoire locale des émojis.
 *
 * La table `objectives` n'a pas de colonne `icon` : l'API accepte le champ
 * dans le corps de la requête mais ne l'écrit nulle part. Plutôt que d'afficher
 * un choix qui disparaîtrait au rechargement, on le conserve sur l'appareil —
 * c'est une décoration, pas une donnée. Le jour où la colonne existera,
 * `objective.icon` reprendra la main (cf. `iconOf`).
 */
const ICON_STORAGE_KEY = 'findy-objective-icons';

function readIcons(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ICON_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function rememberIcon(objectiveId: string, icon: string): void {
  if (typeof localStorage === 'undefined') return;
  const icons = { ...readIcons(), [objectiveId]: icon };
  localStorage.setItem(ICON_STORAGE_KEY, JSON.stringify(icons));
}

/**
 * Émoji d'un objectif.
 *
 * Les objectifs créés depuis le desktop portent un nom de composant Heroicon
 * (« TrophyIcon ») dans ce champ : ce n'est pas un caractère affichable, on
 * retombe alors sur l'émoji par défaut.
 */
function iconOf(objective: Objective, local: Record<string, string>): string {
  const stored = objective.icon;
  if (stored && !/^[A-Za-z]+$/.test(stored)) return stored;
  return local[objective.id] ?? DEFAULT_ICON;
}

/** Montant réinjecté dans un champ : entier nu, ou virgule française s'il y a des centimes. */
function amountToInput(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

/**
 * Échéance en clair.
 *
 * Une date brute (« 12/06 ») oblige à compter mentalement les mois qui
 * restent ; c'est le délai, pas la date, qui dit si l'objectif est tenable.
 */
function deadlineLabel(deadline?: string): { text: string; late: boolean } {
  if (!deadline) return { text: 'Sans échéance', late: false };

  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return { text: 'Sans échéance', late: false };

  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(target) - startOfDay(new Date())) / 86_400_000);

  if (days < 0) {
    const late = Math.abs(days);
    if (late === 1) return { text: 'En retard d’un jour', late: true };
    if (late < 30) return { text: `En retard de ${late} jours`, late: true };
    return { text: 'Échéance dépassée', late: true };
  }
  if (days === 0) return { text: 'Aujourd’hui', late: false };
  if (days === 1) return { text: 'Demain', late: false };
  if (days < 31) return { text: `Dans ${days} jours`, late: false };

  const months = Math.round(days / 30.4);
  if (months < 18) return { text: `Dans ${months} mois`, late: false };
  return { text: `Dans ${Math.round(months / 12)} ans`, late: false };
}

export default function GoalsScreen() {
  const { spaces, currentSpace, authUser, scopeParams, requestConfirm } = useAppStore();

  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [progress, setProgress] = useState<Record<string, ObjectiveProgress>>({});
  const [localIcons, setLocalIcons] = useState<Record<string, string>>(readIcons);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Feuille d'actions (appui sur une tuile) et feuille de formulaire.
  const [actionsFor, setActionsFor] = useState<Objective | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Objective | null>(null);

  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [spaceId, setSpaceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handover = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (handover.current !== null) window.clearTimeout(handover.current);
    },
    [],
  );

  const fetchProgress = useCallback(async (objectiveId: string): Promise<ObjectiveProgress | null> => {
    try {
      const response = await fetch(`/api/objectives/${objectiveId}/progress`);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams(scopeParams());
      const response = await fetch(`/api/objectives?${params}`);
      if (!response.ok) throw new Error(await response.text());

      const list: Objective[] = await response.json();
      const visible = list.filter((objective) => !objective.archived);
      setObjectives(visible);

      // Une requête de progression par objectif, mais toutes en parallèle :
      // en série, une liste de dix objectifs mettrait une seconde à se remplir
      // et les barres apparaîtraient une par une.
      const entries = await Promise.all(
        visible.map(async (objective) => [objective.id, await fetchProgress(objective.id)] as const),
      );

      const next: Record<string, ObjectiveProgress> = {};
      for (const [id, value] of entries) if (value) next[id] = value;
      setProgress(next);
    } catch (caught) {
      console.error('Chargement des objectifs impossible', caught);
      setError('Impossible de charger vos objectifs.');
    } finally {
      setLoading(false);
    }
  }, [fetchProgress, scopeParams]);

  useEffect(() => {
    void load();
  }, [load, currentSpace?.id]);

  const done = useCallback(
    (objective: Objective) => progress[objective.id]?.isCompleted ?? objective.isCompleted,
    [progress],
  );

  const active = useMemo(() => objectives.filter((o) => !done(o)), [objectives, done]);
  const completed = useMemo(() => objectives.filter((o) => done(o)), [objectives, done]);

  const totals = useMemo(() => {
    const targetAmount = objectives.reduce((sum, o) => sum + o.targetAmount, 0);
    const saved = objectives.reduce((sum, o) => sum + (progress[o.id]?.totalSaved ?? 0), 0);
    return {
      targetAmount,
      saved,
      percentage: targetAmount > 0 ? Math.min(100, (saved / targetAmount) * 100) : 0,
    };
  }, [objectives, progress]);

  // ── Formulaire ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setTarget('');
    setDeadline('');
    setIcon(DEFAULT_ICON);
    setSpaceId('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (objective: Objective) => {
    setEditing(objective);
    setTitle(objective.title);
    setTarget(amountToInput(objective.targetAmount));
    setDeadline(objective.deadline ? objective.deadline.split('T')[0] : '');
    setIcon(iconOf(objective, localIcons));
    setSpaceId(objective.spaceId ?? '');
    setFormError(null);
    setActionsFor(null);
    handover.current = window.setTimeout(() => setFormOpen(true), SHEET_HANDOVER_MS);
  };

  const submit = async () => {
    const parsed = parseAmount(target);
    if (!title.trim()) {
      setFormError('Donnez un nom à votre objectif.');
      return;
    }
    if (parsed === null || parsed <= 0) {
      setFormError('Saisissez un montant cible.');
      return;
    }

    const payload = {
      title: title.trim(),
      // Le PUT réécrit la description à partir du corps reçu : sans ce report,
      // modifier le montant d'un objectif effacerait sa note.
      description: editing?.description ?? '',
      targetAmount: parsed,
      deadline: deadline || null,
      icon,
      // L'espace décide qui voit l'objectif : en groupe il est partagé, sinon
      // il reste privé. Sans choix explicite, il suit le sélecteur actif.
      spaceId: spaceId || currentSpace?.id || undefined,
      userId: authUser?.id,
    };

    setSaving(true);
    setFormError(null);

    try {
      const response = await fetch(
        editing ? `/api/objectives/${editing.id}` : '/api/objectives',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await response.text());

      const saved: Objective = await response.json();
      rememberIcon(saved.id, icon);
      setLocalIcons((icons) => ({ ...icons, [saved.id]: icon }));

      setObjectives((list) =>
        editing ? list.map((o) => (o.id === editing.id ? saved : o)) : [saved, ...list],
      );

      // Le titre sert de motif de recherche côté serveur : le renommer change
      // les opérations rattachées, donc la progression.
      const fresh = await fetchProgress(saved.id);
      if (fresh) setProgress((current) => ({ ...current, [saved.id]: fresh }));

      toast.success(editing ? 'Objectif mis à jour' : 'Objectif créé');
      setFormOpen(false);
    } catch (caught) {
      console.error('Enregistrement de l’objectif impossible', caught);
      setFormError('Enregistrement impossible. Vérifiez la connexion au serveur.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (objective: Objective) => {
    const confirmed = await requestConfirm('Supprimer cet objectif ?', {
      title: objective.title,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/objectives/${objective.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await response.text());

      setObjectives((list) => list.filter((o) => o.id !== objective.id));
      setActionsFor(null);
      toast.success('Objectif supprimé');
    } catch (caught) {
      console.error('Suppression de l’objectif impossible', caught);
      toast.error('Suppression impossible.');
    }
  };

  // ── Rendu ───────────────────────────────────────────────────────────────

  const actionsProgress = actionsFor ? progress[actionsFor.id] : undefined;

  return (
    <>
      <ScreenHeader title="Objectifs" back backTo="/more" />

      <ScreenBody>
        <div className="space-y-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className={cx(radii.hero, 'h-[188px] w-full')} />
              <Skeleton className={cx(radii.tile, 'h-[132px] w-full')} />
              <Skeleton className={cx(radii.tile, 'h-[132px] w-full')} />
            </div>
          ) : error ? (
            <ErrorNotice message={error} onRetry={() => void load()} />
          ) : objectives.length === 0 ? (
            <div className={cx(radii.tile, surfaces.card)}>
              <EmptyState
                icon="🎯"
                title="Aucun objectif"
                description="Vacances, voiture, matelas de sécurité : fixez une cible et suivez ce que vous avez déjà mis de côté."
                action={<PrimaryButton onClick={openCreate}>Créer un objectif</PrimaryButton>}
              />
            </div>
          ) : (
            <>
              <BalanceCard
                label="Total épargné"
                amount={totals.saved}
                // Pas d'œil ici : masquer l'épargne tout en laissant la cible et
                // le pourcentage visibles ne cacherait rien, mais rendrait la
                // carte incohérente.
                hideToggle
                selector={
                  <span className="flex h-9 items-center rounded-full bg-white/15 px-3.5 text-[13px] font-semibold text-white backdrop-blur-sm">
                    {active.length} en cours
                    {completed.length > 0 && ` · ${completed.length} atteint${completed.length > 1 ? 's' : ''}`}
                  </span>
                }
                footer={
                  <>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full rounded-full bg-white transition-[width] duration-500"
                        style={{ width: `${totals.percentage}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between text-[13px] text-white/70">
                      <span className="tabular-nums">
                        sur {formatMoneyRounded(totals.targetAmount)} visés
                      </span>
                      <span className="text-[15px] font-semibold tabular-nums text-white">
                        {formatPercent(totals.percentage)}
                      </span>
                    </div>
                  </>
                }
              />

              {active.length > 0 && (
                <div className="space-y-3">
                  {active.map((objective) => (
                    <GoalTile
                      key={objective.id}
                      objective={objective}
                      progress={progress[objective.id]}
                      icon={iconOf(objective, localIcons)}
                      onPress={() => setActionsFor(objective)}
                    />
                  ))}
                </div>
              )}

              {completed.length > 0 && (
                <section>
                  <SectionHeader title="Atteints" />
                  <div className="space-y-3">
                    {completed.map((objective) => (
                      <GoalTile
                        key={objective.id}
                        objective={objective}
                        progress={progress[objective.id]}
                        icon={iconOf(objective, localIcons)}
                        onPress={() => setActionsFor(objective)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </ScreenBody>

      <Fab onClick={openCreate} label="Objectif" />

      {/* ── Actions d'un objectif ── */}
      <Sheet
        open={Boolean(actionsFor)}
        onClose={() => setActionsFor(null)}
        title={actionsFor?.title}
        subtitle={
          actionsProgress
            ? actionsProgress.isCompleted
              ? 'Objectif atteint 🎉'
              : `${formatMoneyRounded(actionsProgress.remaining)} restants`
            : undefined
        }
      >
        <div className="divide-y divide-white/[0.05]">
          <ListRow
            leading={<ActionIcon><PencilSquareIcon className="h-5 w-5" /></ActionIcon>}
            title="Modifier"
            onClick={() => actionsFor && openEdit(actionsFor)}
          />
          <ListRow
            leading={
              <ActionIcon danger>
                <TrashIcon className="h-5 w-5" />
              </ActionIcon>
            }
            title={<span className="text-red-400">Supprimer</span>}
            onClick={() => actionsFor && void remove(actionsFor)}
          />
        </div>

        {actionsFor && (
          <p className={cx(text.caption, 'px-1 pb-1 pt-3 leading-relaxed')}>
            Une opération intitulée «&nbsp;Économie {actionsFor.title}&nbsp;» alimente
            automatiquement cet objectif.
          </p>
        )}
      </Sheet>

      {/* ── Création / modification ── */}
      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Modifier l’objectif' : 'Nouvel objectif'}
        footer={
          <div className="space-y-2">
            <PrimaryButton onClick={submit} disabled={saving}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
            </PrimaryButton>
            {editing && (
              <DangerButton
                onClick={() => {
                  const objective = editing;
                  setFormOpen(false);
                  void remove(objective);
                }}
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
          <Field label="Titre" error={formError ?? undefined}>
            <TextInput
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Vacances, voiture, épargne…"
              enterKeyHint="next"
              autoCapitalize="sentences"
            />
          </Field>

          <Field label="Montant cible">
            <AmountInput value={target} onChange={setTarget} placeholder="3 000" />
          </Field>

          <Field label="Échéance" hint="Facultative — elle sert de repère, pas de contrainte.">
            <DateInput value={deadline} onChange={setDeadline} />
          </Field>

          <Field label="Icône">
            <div className="grid grid-cols-6 gap-2">
              {ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  aria-pressed={icon === emoji}
                  className={cx(
                    'tappable flex h-11 items-center justify-center rounded-2xl text-[20px]',
                    icon === emoji
                      ? 'bg-violet-600/25 ring-1 ring-violet-500/70'
                      : 'bg-white/[0.05] ring-1 ring-transparent',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Visible dans"
            hint="Un groupe rend l’objectif visible par tous ses membres."
          >
            <SelectInput value={spaceId} onChange={setSpaceId}>
              {currentSpace && <option value="">{currentSpace.name} (espace actif)</option>}
              {spaces
                .filter((space) => space.id !== currentSpace?.id)
                .map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                    {space.kind === 'SHARED' ? ' — groupe' : ''}
                  </option>
                ))}
            </SelectInput>
          </Field>

          {!editing && (
            <p className={cx(text.caption, 'leading-relaxed')}>
              Astuce : nommez vos versements «&nbsp;Économie {title.trim() || '[Titre]'}&nbsp;»
              pour qu’ils soient comptés ici.
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** Pastille d'icône d'une ligne d'action, aux dimensions d'un avatar de liste. */
function ActionIcon({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <span
      className={cx(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
        danger ? 'bg-red-500/12 text-red-400' : 'bg-white/[0.06] text-zinc-300',
      )}
    >
      {children}
    </span>
  );
}

/**
 * Tuile d'un objectif.
 *
 * Trois bandes seulement : identité, progression, chiffres. Le montant restant
 * et les actions, qui encombraient la carte desktop, sont repoussés dans la
 * feuille d'actions — sur un téléphone, une tuile qui tient dans le pouce vaut
 * mieux qu'une tuile exhaustive.
 */
function GoalTile({
  objective,
  progress,
  icon,
  onPress,
}: {
  objective: Objective;
  progress?: ObjectiveProgress;
  icon: string;
  onPress: () => void;
}) {
  const saved = progress?.totalSaved ?? 0;
  const percentage = progress?.percentage ?? 0;
  const completed = progress?.isCompleted ?? objective.isCompleted;
  const deadline = deadlineLabel(objective.deadline);
  const accent = completed ? '#34d399' : '#a78bfa';

  return (
    <button
      type="button"
      onClick={onPress}
      className={cx('tappable w-full p-4 text-left', radii.tile, surfaces.card)}
    >
      <div className="flex items-center gap-3">
        <Avatar label={objective.title} emoji={icon} color={accent} />
        <div className="min-w-0 flex-1">
          <p className={cx(text.rowTitle, 'truncate')}>{objective.title}</p>
          <p
            className={cx(
              'mt-0.5 truncate text-[13px]',
              completed ? 'text-emerald-400' : deadline.late ? 'text-red-400' : 'text-zinc-500',
            )}
          >
            {completed ? 'Objectif atteint 🎉' : deadline.text}
          </p>
        </div>
      </div>

      <div className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: accent }}
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] tabular-nums text-zinc-500">
          <span className="font-medium text-zinc-100">{formatMoneyRounded(saved)}</span>
          {' / '}
          {formatMoneyRounded(objective.targetAmount)}
        </p>
        <span
          className="shrink-0 text-[15px] font-semibold tabular-nums"
          style={{ color: accent }}
        >
          {formatPercent(percentage)}
        </span>
      </div>
    </button>
  );
}
