import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowUturnLeftIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAppStore } from '../../store';
import type { Debt, User } from '../../types';
import { GRAIN_DATA_URI } from '../../lib/cardSurface';
import { formatDayLabel, formatMoney, toISODate } from '../../lib/format';
import { merchantColor } from '../../lib/merchant';
import { ScreenBody, ScreenHeader, SectionHeader } from '../components/Screen';
import Sheet from '../components/Sheet';
import { IconButton, PrimaryButton, SegmentedControl } from '../components/Controls';
import { ListCard, ListRow } from '../components/ListRow';
import { AmountInput, DateInput, Field, SettingRow, TextInput } from '../components/Field';
import { parseAmount } from '../../lib/amount';
import { EmptyState, ErrorNotice, SkeletonHero, SkeletonList } from '../components/Feedback';
import Amount from '../components/Amount';
import Avatar from '../components/Avatar';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Tricount — les dépenses partagées avec une personne.
 *
 * L'écran desktop pose la question « qui doit quoi ? » puis répond en quatre
 * endroits à la fois : une carte de solde, un formulaire d'ajout étalé sur une
 * rangée, un historique et une liste de virements. Sur un téléphone, cette
 * simultanéité tombe : le formulaire mange le premier écran et repousse la
 * seule information qu'on venait chercher.
 *
 * L'ordre est donc inversé. La réponse occupe le haut — un dégradé dont la
 * couleur dit le sens avant même qu'on lise le montant — l'historique suit, et
 * la saisie passe dans une feuille ouverte depuis l'en-tête.
 *
 * Les deux actions par ligne (régler, supprimer) deviennent une feuille
 * d'actions : deux boutons de 28 points côte à côte dans une ligne de liste
 * sont un piège au pouce, et rien ne distingue au toucher celui qui règle de
 * celui qui efface.
 */

interface DebtsResponse {
  me: User;
  other: User;
  debts: Debt[];
  /** > 0 : l'autre me doit ; < 0 : je lui dois. */
  balance: number;
}

interface Transfer {
  id: string;
  date: string;
  amount: number;
  direction: 'me_to_other' | 'other_to_me';
  myDescription: string;
  otherDescription: string;
}

type BalanceState = 'owed' | 'owing' | 'settled';

type Payer = 'me' | 'other';

/** En deçà d'un demi-centime, un solde n'est qu'un reliquat d'arrondi. */
const ZERO_THRESHOLD = 0.005;

/**
 * Fond de la carte de solde.
 *
 * La couleur est lue avant le chiffre : vert, on vous doit ; rose, vous devez ;
 * gris, il n'y a rien à régler. Les halos restent sombres pour que le montant
 * blanc de 34 points garde son contraste sur un écran en plein soleil.
 */
const HERO_MESH: Record<BalanceState, string> = {
  owed: [
    'radial-gradient(120% 120% at 12% 6%, rgba(16,185,129,0.45) 0%, rgba(16,185,129,0) 58%)',
    'radial-gradient(110% 110% at 90% 16%, rgba(45,212,191,0.28) 0%, rgba(45,212,191,0) 58%)',
    'linear-gradient(150deg, #0d2019 0%, #0a0d0c 100%)',
  ].join(', '),
  owing: [
    'radial-gradient(120% 120% at 12% 6%, rgba(244,63,94,0.42) 0%, rgba(244,63,94,0) 58%)',
    'radial-gradient(110% 110% at 90% 16%, rgba(217,70,239,0.24) 0%, rgba(217,70,239,0) 58%)',
    'linear-gradient(150deg, #23101a 0%, #0d0a0c 100%)',
  ].join(', '),
  settled: [
    'radial-gradient(120% 120% at 12% 6%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 60%)',
    'linear-gradient(150deg, #17171d 0%, #0b0b0e 100%)',
  ].join(', '),
};

/** Messages d'erreur de l'API traduits en phrases actionnables. */
const API_ERRORS: Record<string, string> = {
  NO_ME_USER: 'Aucun profil « Moi » n’est défini. Choisissez-en un depuis vos portefeuilles.',
  SAME_USER: 'Impossible d’ouvrir un tricount avec soi-même.',
  'User not found': 'Cette personne n’existe plus.',
};

export default function TricountScreen() {
  const { userId } = useParams<{ userId: string }>();
  const { requestConfirm } = useAppStore();

  const [data, setData] = useState<DebtsResponse | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);

  // ── Feuille d'ajout ──
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [payer, setPayer] = useState<Payer>('me');
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Feuille d'actions d'une dépense ──
  //
  // La dépense choisie survit à la fermeture : la feuille reste montée le temps
  // de son animation de sortie, et la vider tout de suite la ferait blanchir.
  const [actionOpen, setActionOpen] = useState(false);
  const [actionDebt, setActionDebt] = useState<Debt | null>(null);

  /**
   * Recharge le tricount.
   *
   * `silent` sert aux rechargements qui suivent une action : remettre les
   * squelettes après avoir réglé une dépense donnerait l'impression que
   * l'écran s'est vidé, alors que la liste est déjà à l'écran.
   */
  const load = useCallback(
    async (silent = false) => {
      if (!userId) {
        setError('Tricount introuvable.');
        setLoading(false);
        return;
      }

      if (!silent) setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/debts?userId=${encodeURIComponent(userId)}`);
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          setData(null);
          setError(API_ERRORS[body.error] ?? body.message ?? 'Chargement impossible.');
          return;
        }

        setData(body);

        // Les virements sont une commodité : leur détection peut échouer ou
        // prendre du temps sans que le tricount lui-même soit indisponible.
        try {
          const detected = await fetch(`/api/debts/transfers?userId=${encodeURIComponent(userId)}`);
          setTransfers(detected.ok ? ((await detected.json()).transfers ?? []) : []);
        } catch {
          setTransfers([]);
        }
      } catch (caught) {
        console.error('Chargement du tricount impossible', caught);
        setData(null);
        setError('Chargement impossible. Vérifiez la connexion au serveur.');
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Une feuille rouverte doit repartir à zéro, sinon elle propose encore la
  // dépense précédente comme si elle n'avait pas été enregistrée.
  useEffect(() => {
    if (!adding) return;
    setAmount('');
    setDescription('');
    setPayer('me');
    setDate(toISODate(new Date()));
    setFormError(null);
    setSaving(false);
  }, [adding]);

  const submit = async () => {
    if (!data) return;

    const parsed = parseAmount(amount);
    if (parsed === null || parsed <= 0) {
      setFormError('Saisissez un montant supérieur à zéro.');
      return;
    }
    if (!description.trim()) {
      setFormError('Saisissez une description.');
      return;
    }

    // Celui qui a avancé l'argent est le créancier : la dette part de l'autre.
    const fromUserId = payer === 'me' ? data.other.id : data.me.id;
    const toUserId = payer === 'me' ? data.me.id : data.other.id;

    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId,
          toUserId,
          amount: parsed,
          description: description.trim(),
          date,
        }),
      });
      if (!response.ok) throw new Error(await response.text());

      toast.success('Dépense ajoutée');
      setAdding(false);
      await load(true);
    } catch (caught) {
      console.error('Ajout de la dépense impossible', caught);
      setFormError('Enregistrement impossible. Vérifiez la connexion au serveur.');
    } finally {
      setSaving(false);
    }
  };

  const setSettled = async (debt: Debt, settled: boolean) => {
    try {
      const response = await fetch(`/api/debts/${debt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settled }),
      });
      if (!response.ok) throw new Error(await response.text());

      toast.success(settled ? 'Dépense réglée' : 'Dépense rouverte');
      await load(true);
    } catch (caught) {
      console.error('Mise à jour de la dépense impossible', caught);
      toast.error('Mise à jour impossible.');
    }
  };

  const remove = async (debt: Debt) => {
    const confirmed = await requestConfirm('Supprimer cette dépense ?', {
      title: debt.description,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/debts/${debt.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await response.text());

      toast.success('Dépense supprimée');
      await load(true);
    } catch (caught) {
      console.error('Suppression de la dépense impossible', caught);
      toast.error('Suppression impossible.');
    }
  };

  const settleAll = async () => {
    if (!data) return;
    const pending = data.debts.filter((debt) => !debt.settled);
    if (pending.length === 0) return;

    const confirmed = await requestConfirm(
      pending.length > 1
        ? `${pending.length} dépenses seront marquées comme réglées.`
        : 'Cette dépense sera marquée comme réglée.',
      { title: 'Solder le compte', confirmLabel: 'Solder' },
    );
    if (!confirmed) return;

    setSettling(true);
    try {
      const responses = await Promise.all(
        pending.map((debt) =>
          fetch(`/api/debts/${debt.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settled: true }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) throw new Error('Réponse en erreur');

      toast.success('Compte soldé');
      await load(true);
    } catch (caught) {
      console.error('Soldage du compte impossible', caught);
      toast.error('Soldage impossible.');
    } finally {
      setSettling(false);
    }
  };

  const peer = data?.other;
  const pending = data ? data.debts.filter((debt) => !debt.settled).length : 0;
  const state: BalanceState = !data
    ? 'settled'
    : data.balance > ZERO_THRESHOLD
      ? 'owed'
      : data.balance < -ZERO_THRESHOLD
        ? 'owing'
        : 'settled';

  return (
    <>
      <ScreenHeader
        title={peer?.name ?? 'Tricount'}
        back
        backTo="/more"
        action={
          data && (
            <IconButton
              label="Ajouter une dépense"
              onClick={() => setAdding(true)}
              className="h-11 w-11"
            >
              <PlusIcon className="h-5 w-5" strokeWidth={2} />
            </IconButton>
          )
        }
      />

      <ScreenBody>
        {error && !data ? (
          <ErrorNotice message={error} onRetry={() => void load()} />
        ) : loading || !data ? (
          <div className="space-y-5">
            <SkeletonHero />
            <SkeletonList rows={4} />
          </div>
        ) : (
          <div className="space-y-5">
            {/* ── Solde ── */}
            <section
              className={cx(
                radii.hero,
                'relative isolate overflow-hidden p-5 text-white',
                'ring-1 ring-white/[0.08] shadow-[0_20px_50px_-24px_rgba(0,0,0,0.9)]',
              )}
              style={{ backgroundImage: HERO_MESH[state] }}
            >
              {/* Sans grain, un dégradé aussi large montre ses marches de
                  quantification sur un écran OLED. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 opacity-[0.14] mix-blend-overlay"
                style={{ backgroundImage: GRAIN_DATA_URI }}
              />

              <div className="flex items-center">
                <PersonAvatar user={data.me} size="lg" />
                <span className="-ml-4 rounded-full ring-[3px] ring-black/40">
                  <PersonAvatar user={data.other} size="lg" />
                </span>
              </div>

              <p className="mt-5 text-[13px] font-medium text-white/60">
                {state === 'owed'
                  ? `${data.other.name} vous doit`
                  : state === 'owing'
                    ? `Vous devez à ${data.other.name}`
                    : 'Vous êtes à jour'}
              </p>
              <p className={cx(text.display, 'mt-1.5')} data-selectable>
                {formatMoney(Math.abs(data.balance))}
              </p>
              <p className="mt-2 text-[13px] text-white/70">
                {state === 'settled'
                  ? pending > 0
                    ? 'Les dépenses en cours s’annulent exactement.'
                    : 'Aucune dépense en attente entre vous deux.'
                  : pending > 1
                    ? `${pending} dépenses restent à régler.`
                    : '1 dépense reste à régler.'}
              </p>

              {pending > 0 && (
                <button
                  type="button"
                  onClick={settleAll}
                  disabled={settling}
                  className={cx(
                    'tappable mt-5 flex min-h-[44px] w-full items-center justify-center gap-2',
                    radii.row,
                    'bg-white/[0.14] text-[15px] font-semibold text-white active:bg-white/[0.22] disabled:opacity-50',
                  )}
                >
                  <CheckCircleIcon className="h-5 w-5" />
                  {settling ? 'Soldage…' : 'Solder le compte'}
                </button>
              )}
            </section>

            {/* ── Dépenses partagées ── */}
            <section>
              <SectionHeader title="Dépenses partagées" />
              {data.debts.length === 0 ? (
                <div className={cx(radii.tile, surfaces.card)}>
                  <EmptyState
                    icon="🧾"
                    title="Aucune dépense partagée"
                    description={`Notez ce que vous avancez l’un pour l’autre : ${data.other.name} et vous saurez toujours où vous en êtes.`}
                    action={
                      <PrimaryButton onClick={() => setAdding(true)}>
                        Ajouter une dépense
                      </PrimaryButton>
                    }
                  />
                </div>
              ) : (
                <ListCard>
                  {data.debts.map((debt) => {
                    // La dette va du débiteur au créancier : celui qui a payé
                    // est donc à l'arrivée.
                    const paidByMe = debt.toUserId === data.me.id;
                    const payerUser = paidByMe ? data.me : data.other;

                    return (
                      <ListRow
                        key={debt.id}
                        className={debt.settled ? 'opacity-55' : undefined}
                        leading={<PersonAvatar user={payerUser} />}
                        title={
                          <span className={debt.settled ? 'line-through' : undefined}>
                            {debt.description}
                          </span>
                        }
                        subtitle={`${formatDayLabel(debt.date)} · ${
                          paidByMe ? 'payé par vous' : `payé par ${data.other.name}`
                        }`}
                        trailing={
                          <Amount
                            value={paidByMe ? debt.amount : -debt.amount}
                            signed
                            tone={debt.settled ? 'muted' : undefined}
                            className={text.rowAmount}
                          />
                        }
                        trailingSub={
                          debt.settled && (
                            <span className="flex items-center gap-1 text-emerald-400/80">
                              <CheckCircleIcon className="h-3.5 w-3.5" />
                              Réglé
                            </span>
                          )
                        }
                        onClick={() => {
                          setActionDebt(debt);
                          setActionOpen(true);
                        }}
                      />
                    );
                  })}
                </ListCard>
              )}
            </section>

            {/* ── Virements détectés ── */}
            {transfers.length > 0 && (
              <section>
                <SectionHeader title="Virements détectés" />
                <p className={cx(text.caption, '-mt-1 pb-2')}>
                  Opérations repérées d’un de vos comptes à l’autre. Elles ne modifient pas le
                  solde ci-dessus.
                </p>
                <ListCard>
                  {transfers.map((transfer) => {
                    const outgoing = transfer.direction === 'me_to_other';
                    return (
                      <ListRow
                        key={transfer.id}
                        leading={
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-zinc-400">
                            <ArrowsRightLeftIcon className="h-5 w-5" />
                          </span>
                        }
                        title={
                          outgoing ? `Vous → ${data.other.name}` : `${data.other.name} → vous`
                        }
                        subtitle={`${formatDayLabel(transfer.date)} · ${
                          outgoing ? transfer.myDescription : transfer.otherDescription
                        }`}
                        trailing={
                          <Amount value={transfer.amount} tone="muted" className={text.rowAmount} />
                        }
                      />
                    );
                  })}
                </ListCard>
              </section>
            )}
          </div>
        )}
      </ScreenBody>

      {/* ── Ajout d'une dépense ── */}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Ajouter une dépense"
        subtitle={peer ? `Partagée avec ${peer.name}` : undefined}
        footer={
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Ajouter'}
          </PrimaryButton>
        }
      >
        <div className="space-y-4 pt-1">
          <Field label="Montant" error={formError ?? undefined}>
            <AmountInput value={amount} onChange={setAmount} />
          </Field>

          <Field label="Description">
            <TextInput
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Courses, restaurant, essence…"
              enterKeyHint="done"
              autoCapitalize="sentences"
            />
          </Field>

          <Field
            label="Payé par"
            hint={
              payer === 'me'
                ? `${peer?.name ?? 'L’autre personne'} vous devra ce montant.`
                : `Vous devrez ce montant à ${peer?.name ?? 'l’autre personne'}.`
            }
          >
            <SegmentedControl<Payer>
              value={payer}
              onChange={setPayer}
              options={[
                { value: 'me', label: 'Moi' },
                { value: 'other', label: peer?.name ?? 'L’autre' },
              ]}
            />
          </Field>

          <Field label="Date">
            <DateInput value={date} onChange={setDate} />
          </Field>
        </div>
      </Sheet>

      {/* ── Actions d'une dépense ── */}
      <Sheet
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        title={actionDebt?.description ?? 'Dépense'}
        subtitle={
          actionDebt
            ? `${formatDayLabel(actionDebt.date)} · ${formatMoney(actionDebt.amount)}`
            : undefined
        }
      >
        <ListCard className="mt-1">
          <SettingRow
            icon={
              actionDebt?.settled ? (
                <ArrowUturnLeftIcon className="h-5 w-5" />
              ) : (
                <CheckCircleIcon className="h-5 w-5" />
              )
            }
            title={actionDebt?.settled ? 'Marquer comme non réglé' : 'Marquer réglé'}
            subtitle={
              actionDebt?.settled
                ? 'La dépense revient dans le solde.'
                : 'La dépense sort du solde et reste dans l’historique.'
            }
            onClick={() => {
              if (!actionDebt) return;
              setActionOpen(false);
              void setSettled(actionDebt, !actionDebt.settled);
            }}
          />
          <SettingRow
            icon={<TrashIcon className="h-5 w-5" />}
            title="Supprimer la dépense"
            subtitle="Elle disparaît définitivement du tricount."
            danger
            onClick={() => {
              if (!actionDebt) return;
              setActionOpen(false);
              void remove(actionDebt);
            }}
          />
        </ListCard>
      </Sheet>
    </>
  );
}

/**
 * Portrait d'une personne du tricount.
 *
 * La photo de profil est facultative ; à défaut, la teinte est dérivée du nom
 * pour que chacun garde la même couleur d'un écran à l'autre.
 */
function PersonAvatar({ user, size = 'md' }: { user: User; size?: 'md' | 'lg' }) {
  return (
    <Avatar label={user.name} image={user.avatar} color={merchantColor(user.name)} size={size} />
  );
}
