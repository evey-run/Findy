import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  LinkIcon,
  PencilSquareIcon,
  PhotoIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useAppStore } from '../../store';
import type { Bank } from '../../types';
import { assetUrl } from '../../lib/url';
import { formatMoney, toISODate } from '../../lib/format';
import Sheet from './Sheet';
import Avatar from './Avatar';
import { AmountInput, DateInput, Field, SelectInput, SettingRow, TextInput } from './Field';
import { parseAmount } from '../../lib/amount';
import { GhostButton, PrimaryButton, SegmentedControl, Toggle } from './Controls';
import { EmptyState, SkeletonRow } from './Feedback';
import { ACCOUNT_TYPE_LABEL, formatSyncDate, spendableForBank } from '../bank';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Tout ce qu'on peut faire d'un compte, en feuilles.
 *
 * Le desktop pose ces actions dans un menu déroulant de 208 points ancré sous
 * un bouton « … », et son formulaire dans une fenêtre centrée. Les deux gestes
 * n'existent pas au doigt : le menu s'ouvre hors du champ visuel dès qu'on est
 * en bas de page, et la fenêtre centrée passe sous le clavier virtuel à la
 * première mise au point d'un champ.
 *
 * Trois feuilles, donc, dans l'ordre où on les rencontre :
 *   • `BankSheet` — les actions du compte qu'on vient d'ouvrir ;
 *   • `BankFormSheet` — sa création ou sa modification ;
 *   • `BankLinkSheet` — le parcours d'autorisation bancaire (PSD2).
 */

/**
 * Ouvre l'autorisation PSD2 hors de l'application.
 *
 * `window.open` n'ouvre aucun navigateur externe depuis la WebView de Tauri :
 * la page d'authentification de la banque s'y afficherait sans barre d'adresse,
 * ce qu'aucun établissement n'accepte. Le plugin Opener délègue l'URL au
 * navigateur du système, seul endroit où l'utilisateur peut vérifier qu'il
 * saisit bien ses identifiants chez sa banque.
 */
async function openAuthenticationUrl(url: string): Promise<void> {
  const target = new URL(url);
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error('Le lien d’autorisation bancaire est invalide.');
  }

  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || window.location.protocol === 'tauri:');

  if (isTauri) {
    await openUrl(target.toString());
    return;
  }

  const opened = window.open(target.toString(), '_blank', 'noopener,noreferrer');
  if (!opened) throw new Error('Le navigateur a bloqué l’ouverture du lien bancaire.');
}

// ─── Actions du compte ──────────────────────────────────────────────────────

interface BankSheetProps {
  /** Compte concerné ; `null` pendant l'animation de fermeture. */
  bank: Bank | null;
  open: boolean;
  onClose: () => void;
  /** Ouvre le formulaire de modification. */
  onEdit: (bank: Bank) => void;
  /** Ouvre le parcours d'autorisation bancaire. */
  onLink: (bank: Bank) => void;
}

export default function BankSheet({ bank, open, onClose, onEdit, onLink }: BankSheetProps) {
  const { loadBanks, loadTransactions, loadDashboardOverview, requestConfirm } = useAppStore();

  const [syncing, setSyncing] = useState(false);
  // Copie locale de l'inclusion au reste à vivre : l'interrupteur doit suivre
  // le doigt sans attendre l'aller-retour réseau, qui le rendrait mou.
  const [spendable, setSpendable] = useState(false);
  // Le parent remet `bank` à `null` en fermant ; la feuille garderait alors
  // 220 ms d'écran vide en glissant vers le bas. On retient le dernier compte.
  const [shown, setShown] = useState<Bank | null>(bank);

  useEffect(() => {
    if (!bank) return;
    setShown(bank);
    setSpendable(spendableForBank(bank));
  }, [bank]);

  const target = bank ?? shown;
  if (!target) return null;
  const account = target;

  const linked = account.ebStatus === 'LINKED';
  const expired = account.ebStatus === 'EXPIRED';
  const lastSync = formatSyncDate(account.ebLastSyncAt);

  const toggleSpendable = async (next: boolean) => {
    setSpendable(next);
    try {
      const response = await fetch(`/api/banks/${account.id}/spendable`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spendable: next }),
      });
      if (!response.ok) throw new Error(await response.text());
      await loadBanks();
      void loadDashboardOverview();
      toast.success(next ? 'Compté dans le reste à vivre' : 'Exclu du reste à vivre');
    } catch (caught) {
      console.error('Modification du reste à vivre impossible', caught);
      setSpendable(!next);
      toast.error('Modification impossible.');
    }
  };

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const response = await fetch(`/api/enablebanking/banks/${account.id}/sync-manual`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      // La banque impose un quota d'appels : insister n'apporterait rien.
      if (response.status === 429) {
        toast.error(data.message || 'Patientez avant de resynchroniser.');
        return;
      }
      // Consentement échu ou session expirée : dans les deux cas il faut
      // repasser par la banque, et le statut du compte vient de changer.
      if (response.status === 403) {
        toast.error(data.message || 'Connexion bancaire à renouveler.', { duration: 6000 });
        await loadBanks();
        return;
      }
      if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);

      toast.success(
        `${data.imported ?? 0} nouvelle(s), ${data.pendingReconciled ?? 0} réconciliée(s)`,
      );
      await loadBanks();
      await loadTransactions({ forceRefresh: true });
      void loadDashboardOverview();
      onClose();
    } catch (caught) {
      console.error('Synchronisation impossible', caught);
      toast.error('Synchronisation impossible.');
    } finally {
      setSyncing(false);
    }
  };

  const remove = async () => {
    const confirmed = await requestConfirm(
      'Toutes les opérations de ce compte seront définitivement supprimées.',
      { title: `Supprimer ${account.name} ?`, confirmLabel: 'Supprimer', danger: true },
    );
    if (!confirmed) return;

    try {
      // `/permanent` et non l'archivage : sans lui, les opérations du compte
      // restent visibles et faussent tous les totaux (cf. issue #48).
      const response = await fetch(`/api/banks/${account.id}/permanent`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await response.text());

      await loadBanks();
      await loadTransactions({ forceRefresh: true });
      void loadDashboardOverview();
      toast.success('Compte supprimé');
      onClose();
    } catch (caught) {
      console.error('Suppression du compte impossible', caught);
      toast.error('Suppression impossible.');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={account.name}
      subtitle={`${ACCOUNT_TYPE_LABEL[account.accountType]} · ${formatMoney(account.balance)}`}
    >
      <div className="divide-y divide-white/[0.05]">
        <SettingRow
          icon={<LinkIcon className={cx('h-5 w-5', expired && 'text-amber-400')} />}
          title={expired ? 'Relier le compte' : linked ? 'Réautoriser la banque' : 'Lier à ma banque'}
          subtitle={
            expired
              ? 'Consentement expiré'
              : linked
                ? 'Compte lié'
                : account.ebStatus === 'PENDING' || account.ebStatus === 'SELECTING_ACCOUNT'
                  ? 'Autorisation en cours'
                  : 'Import automatique des opérations'
          }
          onClick={() => {
            onClose();
            onLink(account);
          }}
        />

        {linked && (
          <SettingRow
            icon={<ArrowPathIcon className={cx('h-5 w-5', syncing && 'animate-spin')} />}
            title={syncing ? 'Synchronisation…' : 'Synchroniser'}
            subtitle={lastSync ? `Dernière fois le ${lastSync}` : 'Jamais synchronisé'}
            onClick={sync}
          />
        )}

        <SettingRow
          icon={<BanknotesIcon className="h-5 w-5" />}
          title="Compter dans le reste à vivre"
          subtitle={
            spendable
              ? 'Ce solde finance le quotidien'
              : 'Mis de côté, hors du budget du mois'
          }
          trailing={
            <Toggle
              checked={spendable}
              onChange={toggleSpendable}
              label="Compter ce compte dans le reste à vivre"
            />
          }
        />

        <SettingRow
          icon={<PencilSquareIcon className="h-5 w-5" />}
          title="Modifier"
          subtitle="Nom, type, solde initial, membres"
          onClick={() => {
            onClose();
            onEdit(account);
          }}
        />

        <SettingRow
          icon={<TrashIcon className="h-5 w-5" />}
          title="Supprimer le compte"
          subtitle="Le compte et ses opérations"
          onClick={remove}
          danger
        />
      </div>
    </Sheet>
  );
}

// ─── Création et modification ───────────────────────────────────────────────

/**
 * Teintes proposées pour un compte.
 *
 * Elles ne servent pas à décorer : la couleur devient le halo de la carte
 * (cf. `cardSurface`) et la pastille du compte dans les listes. Six teintes
 * franches et bien distinctes valent mieux qu'un nuancier — sur un écran
 * sombre, deux bleus voisins ne se distinguent plus.
 */
const COLOR_SWATCHES = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#14b8a6',
  '#64748b',
];

const ACCOUNT_TYPE_OPTIONS: { value: Bank['accountType']; label: string }[] = [
  { value: 'CURRENT', label: 'Courant' },
  { value: 'SAVINGS', label: 'Épargne' },
  { value: 'INVESTMENT', label: 'Invest.' },
];

interface BankFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** Compte à modifier ; absent, la feuille en crée un. */
  bank?: Bank | null;
}

export function BankFormSheet({ open, onClose, bank }: BankFormSheetProps) {
  const { users, authUser, loadBanks, loadTransactions, loadDashboardOverview } = useAppStore();
  const editing = Boolean(bank);

  const meId = useMemo(
    () => authUser?.id ?? users.find((user) => user.isMe)?.id ?? null,
    [authUser, users],
  );

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [accountType, setAccountType] = useState<Bank['accountType']>('CURRENT');
  const [balance, setBalance] = useState('');
  const [iban, setIban] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [createdAt, setCreatedAt] = useState(() => toISODate(new Date()));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Une feuille rouverte doit refléter le compte demandé, jamais le précédent.
  useEffect(() => {
    if (!open) return;

    setError(null);
    setSaving(false);
    setImageFile(null);

    if (bank) {
      setName(bank.name);
      setShortName(bank.shortName ?? '');
      setAccountType(bank.accountType);
      // `bank.balance` est le solde *calculé* (initial + mouvements) : le
      // réinjecter puis l'enregistrer doublerait tous les mouvements. C'est le
      // solde initial qu'on édite.
      setBalance(String(bank.initialBalance ?? bank.balance).replace('.', ','));
      setIban(bank.iban ?? '');
      setCardLast4(bank.cardLast4 ?? '');
      setColor(bank.color || COLOR_SWATCHES[0]);
      setUserIds((bank.userBanks ?? []).map((link) => link.userId));
      setCreatedAt(bank.createdAt.split('T')[0]);
      setImagePreview(bank.image ? assetUrl(bank.image) : null);
      return;
    }

    setName('');
    setShortName('');
    setAccountType('CURRENT');
    setBalance('');
    setIban('');
    setCardLast4('');
    setColor(COLOR_SWATCHES[0]);
    setUserIds(meId ? [meId] : []);
    setCreatedAt(toISODate(new Date()));
    setImagePreview(null);
  }, [open, bank, meId]);

  const pickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (loaded) => setImagePreview(loaded.target?.result as string);
    reader.readAsDataURL(file);
  };

  const toggleMember = (userId: string) => {
    setUserIds((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId],
    );
  };

  const submit = async () => {
    if (!name.trim()) {
      setError('Donnez un nom à ce compte.');
      return;
    }
    if (userIds.length === 0) {
      setError('Choisissez au moins un membre.');
      return;
    }

    const payload = {
      name: name.trim(),
      shortName: shortName.trim(),
      iban: iban.trim(),
      cardLast4,
      color,
      balance: parseAmount(balance) ?? 0,
      accountType,
      createdAt,
      userIds,
    };

    const body = new FormData();
    body.append('data', JSON.stringify(payload));
    // Le serveur ne lit `cardLast4` qu'à la racine du multipart, jamais dans
    // `data` : sans cette ligne, les quatre chiffres saisis sont perdus.
    body.append('cardLast4', cardLast4);
    if (imageFile) body.append('image', imageFile);

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(bank ? `/api/banks/${bank.id}` : '/api/banks', {
        method: bank ? 'PUT' : 'POST',
        body,
      });
      if (!response.ok) throw new Error(await response.text());

      await loadBanks();
      // Le type et le solde initial d'un compte déplacent tous les totaux.
      await loadTransactions({ forceRefresh: true });
      void loadDashboardOverview();

      toast.success(editing ? 'Compte mis à jour' : 'Compte créé');
      onClose();
    } catch (caught) {
      console.error('Enregistrement du compte impossible', caught);
      setError('Enregistrement impossible. Vérifiez la connexion au serveur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Modifier le compte' : 'Nouveau compte'}
      fullHeight
      footer={
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le compte'}
        </PrimaryButton>
      }
    >
      <div className="space-y-4 pt-1">
        {/* ── Logo ── */}
        <div className="flex items-center gap-3">
          <label className={cx('tappable flex flex-1 items-center gap-3', radii.row, surfaces.card, 'p-3')}>
            {imagePreview ? (
              <img
                src={imagePreview}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-500">
                <PhotoIcon className="h-6 w-6" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cx('block', text.rowTitle)}>Logo</span>
              <span className={cx('block', text.rowSubtitle)}>
                {imagePreview ? 'Appuyez pour remplacer' : 'Facultatif'}
              </span>
            </span>
            <input type="file" accept="image/*" onChange={pickImage} className="sr-only" />
          </label>
        </div>

        <Field label="Nom du compte" error={error ?? undefined}>
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Crédit Agricole courant"
            autoCapitalize="words"
            enterKeyHint="next"
          />
        </Field>

        <Field label="Nom court" hint="Affiché sur la carte, comme « CA » ou « LA ».">
          <TextInput
            value={shortName}
            onChange={(event) => setShortName(event.target.value)}
            placeholder="CA"
            maxLength={8}
            autoCapitalize="characters"
          />
        </Field>

        <Field label="Type de compte">
          <SegmentedControl<Bank['accountType']>
            value={accountType}
            onChange={setAccountType}
            options={ACCOUNT_TYPE_OPTIONS}
          />
        </Field>

        <Field
          label="Solde initial"
          hint="Le solde du jour où vous ouvrez ce compte dans Findy ; les opérations s'y ajoutent."
        >
          <AmountInput value={balance} onChange={setBalance} />
        </Field>

        <Field label="IBAN" hint="Facultatif — utile pour reconnaître le compte lors d'une liaison bancaire.">
          <TextInput
            value={iban}
            onChange={(event) => setIban(event.target.value.toUpperCase())}
            placeholder="FR14 2004 1010 0505 0001 3M02 606"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[15px]"
          />
        </Field>

        <Field label="Carte" hint="Seuls ces quatre chiffres sont enregistrés.">
          <TextInput
            value={cardLast4}
            inputMode="numeric"
            maxLength={4}
            onChange={(event) => setCardLast4(event.target.value.replace(/\D/g, '').slice(-4))}
            placeholder="4 derniers chiffres"
            className="font-mono"
          />
        </Field>

        {/* ── Couleur ── */}
        <Field label="Couleur">
          <div className="flex flex-wrap gap-2">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                aria-label={`Couleur ${swatch}`}
                aria-pressed={color === swatch}
                className={cx(
                  'tappable flex h-11 w-11 items-center justify-center rounded-full transition-shadow',
                  color === swatch ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141419]' : 'ring-1 ring-white/10',
                )}
                style={{ backgroundColor: swatch }}
              >
                {color === swatch && <CheckIcon className="h-5 w-5 text-white drop-shadow" />}
              </button>
            ))}
          </div>
        </Field>

        {/* ── Membres ── */}
        <Field
          label="Membres"
          hint="Les personnes cochées partagent ce compte et ses opérations."
        >
          {users.length === 0 ? (
            <p className={cx(text.caption, 'py-2')}>Aucun membre enregistré.</p>
          ) : (
            <div className={cx(radii.tile, surfaces.card, 'divide-y divide-white/[0.05] px-4')}>
              {users.map((user) => {
                const selected = userIds.includes(user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleMember(user.id)}
                    aria-pressed={selected}
                    className="tappable flex min-h-[56px] w-full items-center gap-3 py-2 text-left"
                  >
                    <Avatar label={user.name} image={user.avatar} size="sm" />
                    <span className={cx('min-w-0 flex-1 truncate', text.rowTitle)}>{user.name}</span>
                    <span
                      className={cx(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                        selected ? 'bg-violet-600 text-white' : 'border border-white/15',
                      )}
                    >
                      {selected && <CheckIcon className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <Field label="Ouvert le" hint="Point de départ de l'historique de ce compte.">
          <DateInput value={createdAt} onChange={setCreatedAt} />
        </Field>
      </div>
    </Sheet>
  );
}

// ─── Liaison bancaire (Enable Banking) ──────────────────────────────────────

interface EbAspsp {
  name: string;
  country: string;
  logo: string;
}

/** Pays couverts par Enable Banking, dans l'ordre de leur usage réel ici. */
const EB_COUNTRIES = ['FR', 'BE', 'LU', 'DE', 'ES', 'IT', 'NL', 'PT'];

/** 200 sondages × 3 s = 10 minutes : une authentification forte peut être longue. */
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 200;

interface BankLinkSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Compte à lier. Absent, la feuille est en mode « nouveau compte » : le
   * compte support est créé au moment où l'utilisateur choisit sa banque.
   */
  bank?: Bank | null;
  /** Repli quand l'utilisateur ne veut pas lier de banque. */
  onManual?: () => void;
}

export function BankLinkSheet({ open, onClose, bank, onManual }: BankLinkSheetProps) {
  const navigate = useNavigate();
  const { users, authUser, loadBanks, loadTransactions, loadDashboardOverview } = useAppStore();

  const [step, setStep] = useState<'search' | 'waiting'>('search');
  const [country, setCountry] = useState('FR');
  const [search, setSearch] = useState('');
  const [aspsps, setAspsps] = useState<EbAspsp[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [tunnelUrl, setTunnelUrl] = useState('');

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollBankId = useRef<string | null>(null);

  const meId = useMemo(
    () => authUser?.id ?? users.find((user) => user.isMe)?.id ?? null,
    [authUser, users],
  );

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
    pollBankId.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const loadAspsps = useCallback(
    async (target: string) => {
      setAspsps([]);
      setLoading(true);
      try {
        const response = await fetch(`/api/enablebanking/aspsps?country=${target}`);
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `Erreur ${response.status}`);
        setAspsps(Array.isArray(data) ? data : []);
      } catch (caught) {
        console.error('Liste des banques indisponible', caught);
        toast.error('Impossible de charger la liste des banques.');
        setAspsps([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Ouverture : sans identifiants Enable Banking, tout le parcours échouerait
  // au premier appel — on renvoie donc vers l'écran qui les demande.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setStep('search');
    setSearch('');
    setLinkUrl('');

    void (async () => {
      let configured = false;
      try {
        const response = await fetch('/api/enablebanking/configured');
        const data = await response.json().catch(() => ({ configured: false }));
        configured = Boolean(data?.configured);
      } catch {
        configured = false;
      }
      if (cancelled) return;

      if (!configured) {
        onClose();
        // En création, la liaison n'est qu'un raccourci : on laisse la feuille
        // de création manuelle prendre le relais plutôt que d'éjecter vers les
        // réglages quelqu'un qui voulait seulement ajouter un compte.
        if (!bank && onManual) {
          onManual();
          return;
        }
        toast.error('Enable Banking n’est pas configuré.');
        navigate('/settings?setup=enablebanking');
        return;
      }

      // L'URL publique sert à renseigner le « Redirect URI » côté Enable
      // Banking : sans elle, la première liaison échoue sans message clair.
      fetch('/api/tunnel')
        .then((response) => response.json())
        .then((data) => !cancelled && setTunnelUrl(data.publicUrl || ''))
        .catch(() => {});

      await loadAspsps(country);
    })();

    return () => {
      cancelled = true;
    };
    // `country` change par son propre gestionnaire : le relire ici rechargerait
    // la liste deux fois à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    stopPolling();
    onClose();
  };

  /** Compte support d'une liaison « nouveau compte » : nom et solde provisoires,
   *  recalés par le serveur une fois le compte bancaire choisi. */
  const createPlaceholder = async (aspspName: string): Promise<string | null> => {
    if (!meId) {
      toast.error('Aucun profil connecté pour rattacher le compte.');
      return null;
    }
    try {
      const body = new FormData();
      body.append(
        'data',
        JSON.stringify({
          name: aspspName,
          iban: '',
          balance: 0,
          accountType: 'CURRENT',
          createdAt: toISODate(new Date()),
          userIds: [meId],
        }),
      );
      const response = await fetch('/api/banks', { method: 'POST', body });
      if (!response.ok) throw new Error(await response.text());
      const created = await response.json();
      return created.id as string;
    } catch (caught) {
      console.error('Création du compte à lier impossible', caught);
      toast.error('Impossible de créer le compte à lier.');
      return null;
    }
  };

  const startLink = async (aspsp: EbAspsp) => {
    let bankId = bank?.id ?? '';
    if (!bankId) {
      const created = await createPlaceholder(aspsp.name);
      if (!created) return;
      bankId = created;
    }

    try {
      const response = await fetch('/api/enablebanking/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankId, aspspName: aspsp.name, aspspCountry: aspsp.country }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);

      setLinkUrl(data.link);
      setStep('waiting');
      pollBankId.current = bankId;

      try {
        await openAuthenticationUrl(data.link);
      } catch (caught) {
        console.error('Ouverture du lien d’autorisation impossible', caught);
        toast.error('Ouvrez le lien manuellement depuis le bouton ci-dessous.');
      }

      // L'autorisation se termine dans le navigateur, hors de l'application :
      // rien ne nous le notifie, on interroge donc le serveur.
      let polls = 0;
      stopPolling();
      pollTimer.current = setInterval(async () => {
        polls += 1;
        if (polls > MAX_POLLS) {
          stopPolling();
          toast.error('Délai dépassé — relancez la liaison.');
          return;
        }
        try {
          const status = await fetch(`/api/enablebanking/banks/${pollBankId.current}/status`);
          const payload = await status.json();
          if (payload.ebStatus === 'LINKED') {
            stopPolling();
            await loadBanks();
            await loadTransactions({ forceRefresh: true });
            void loadDashboardOverview();
            toast.success('Compte lié.');
            onClose();
          }
        } catch {
          // Une coupure passagère ne doit pas interrompre l'attente.
        }
      }, POLL_INTERVAL_MS);
    } catch (caught) {
      console.error('Liaison bancaire impossible', caught);
      toast.error(caught instanceof Error ? caught.message : 'Liaison impossible.');
    }
  };

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? aspsps.filter((aspsp) => aspsp.name.toLowerCase().includes(needle)) : aspsps;
  }, [aspsps, search]);

  const copyLink = () => {
    navigator.clipboard
      .writeText(linkUrl)
      .then(() => toast.success('Lien copié'))
      .catch(() => toast.error('Copie impossible.'));
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={bank ? 'Lier à ma banque' : 'Nouveau compte'}
      subtitle={bank ? bank.name : 'Liez votre banque — le compte est créé automatiquement'}
      fullHeight={step === 'search'}
      footer={
        step === 'search' && onManual ? (
          <GhostButton
            onClick={() => {
              close();
              onManual();
            }}
          >
            Créer un compte manuellement
          </GhostButton>
        ) : undefined
      }
    >
      {step === 'search' ? (
        <div className="space-y-3 pt-1">
          <div className="flex gap-2">
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher ma banque…"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              className="flex-1"
            />
            <SelectInput
              value={country}
              onChange={(next) => {
                setCountry(next);
                void loadAspsps(next);
              }}
              className="w-[92px]"
            >
              {EB_COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </SelectInput>
          </div>

          {tunnelUrl && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(`${tunnelUrl}/api/enablebanking/callback`)
                  .then(() => toast.success('Adresse de retour copiée'))
                  .catch(() => toast.error('Copie impossible.'));
              }}
              className={cx(
                'tappable w-full text-left',
                radii.row,
                'border border-amber-500/20 bg-amber-500/10 px-3.5 py-3',
              )}
            >
              <span className="flex items-center gap-2 text-[12px] font-medium text-amber-200">
                <ClipboardDocumentIcon className="h-4 w-4 shrink-0" />
                Copier l’adresse de retour
              </span>
              <span className="mt-1 block break-all font-mono text-[11px] text-amber-100/60">
                {tunnelUrl}/api/enablebanking/callback
              </span>
              <span className="mt-1 block text-[11px] text-amber-200/60">
                À déclarer une fois dans Enable Banking → Redirect URIs.
              </span>
            </button>
          )}

          {loading ? (
            <div className={cx(radii.tile, surfaces.card, 'divide-y divide-white/[0.05] px-4')}>
              {Array.from({ length: 6 }, (_, index) => (
                <SkeletonRow key={index} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon="🔎"
              title="Aucune banque trouvée"
              description={
                search
                  ? 'Essayez une autre orthographe, ou changez de pays.'
                  : 'Aucune banque disponible pour ce pays.'
              }
            />
          ) : (
            <div className={cx(radii.tile, surfaces.card, 'divide-y divide-white/[0.05] px-4')}>
              {visible.map((aspsp) => (
                <button
                  key={`${aspsp.country}-${aspsp.name}`}
                  type="button"
                  onClick={() => startLink(aspsp)}
                  className="tappable flex min-h-[60px] w-full items-center gap-3 py-2.5 text-left"
                >
                  {aspsp.logo ? (
                    <img
                      src={aspsp.logo}
                      alt=""
                      aria-hidden="true"
                      className="h-9 w-9 shrink-0 rounded-lg bg-white/90 object-contain p-1"
                    />
                  ) : (
                    <Avatar label={aspsp.name} size="sm" />
                  )}
                  <span className={cx('min-w-0 flex-1 truncate', text.rowTitle)}>{aspsp.name}</span>
                  <span className="shrink-0 text-[12px] text-zinc-600">{aspsp.country}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 px-2 py-8 text-center">
          <ArrowPathIcon className="h-9 w-9 animate-spin text-violet-400" />
          <div>
            <p className="text-[16px] font-semibold text-zinc-100">Autorisation en cours</p>
            <p className={cx(text.caption, 'mt-1.5')}>
              Terminez l’authentification dans votre navigateur, puis choisissez le compte à
              synchroniser. La liaison est détectée automatiquement.
            </p>
          </div>

          {linkUrl && (
            <div className="w-full space-y-2 pt-2">
              <PrimaryButton
                onClick={() => {
                  openAuthenticationUrl(linkUrl).catch((caught) => {
                    console.error('Réouverture du lien impossible', caught);
                    toast.error('Copiez le lien à la place.');
                  });
                }}
              >
                <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                Rouvrir le lien
              </PrimaryButton>
              <GhostButton onClick={copyLink}>
                <ClipboardDocumentIcon className="h-5 w-5" />
                Copier le lien
              </GhostButton>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
