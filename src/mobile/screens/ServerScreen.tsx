import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowPathIcon, SignalIcon } from '@heroicons/react/24/outline';
import {
  getServerUrl,
  normalizeServerUrl,
  probeServer,
  setAuthToken,
  setServerUrl,
} from '../../lib/apiBase';
import { isNativeMobile } from '../../lib/platform';
import { useAppStore } from '../../store';
import { ScreenBody, ScreenHeader } from '../components/Screen';
import { DangerButton, PrimaryButton } from '../components/Controls';
import { Field, TextInput } from '../components/Field';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Changer de serveur.
 *
 * `ServerSetup` pose la question une fois, avant la connexion. Elle se repose
 * ensuite régulièrement : le Mac a changé d'adresse IP, on passe du Wi-Fi de la
 * maison à un tunnel HTTPS, ou l'on teste une autre installation. Sans cet
 * écran, la seule issue serait de désinstaller l'application.
 *
 * L'adresse n'est jamais enregistrée sans avoir répondu : une saisie fautive
 * donnerait un écran de connexion qui échoue, et rien n'indiquerait que le
 * problème est réseau et non un mot de passe.
 */

type Status = 'checking' | 'online' | 'offline';

export default function ServerScreen() {
  const requestConfirm = useAppStore((state) => state.requestConfirm);

  // L'adresse enregistrée ne bouge qu'au rechargement : la retenir au montage
  // évite qu'elle change sous les yeux de l'utilisateur pendant qu'il la corrige.
  const [saved] = useState(getServerUrl);
  const [url, setUrl] = useState(saved);
  const [status, setStatus] = useState<Status>('checking');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Sonde l'adresse enregistrée pour dire, à l'ouverture, où l'on en est. */
  const refreshStatus = useCallback(async (target: string) => {
    if (!target) {
      setStatus('offline');
      setStatusError('Aucune adresse enregistrée.');
      return;
    }
    setStatus('checking');
    const result = await probeServer(target);
    setStatus(result.ok ? 'online' : 'offline');
    setStatusError(result.ok ? null : (result.error ?? 'Serveur injoignable.'));
  }, []);

  useEffect(() => {
    void refreshStatus(saved);
  }, [refreshStatus, saved]);

  const save = async () => {
    setChecking(true);
    setError(null);

    const normalized = normalizeServerUrl(url);
    const result = await probeServer(url);

    if (!result.ok) {
      setError(result.error ?? 'Connexion impossible.');
      setChecking(false);
      return;
    }

    setServerUrl(url);
    setChecking(false);

    // Même adresse : rien à recharger, la sonde qui vient de réussir suffit à
    // remettre l'indicateur au vert.
    if (normalized === saved) {
      setStatus('online');
      setStatusError(null);
      toast.success('Serveur joignable');
      return;
    }

    // Nouvelle adresse : tout ce qui est déjà chargé vient de l'ancienne base.
    // Un rechargement complet est plus sûr que de rejouer chaque `load*` du
    // magasin, dont certains ne sont déclenchés qu'à l'entrée d'un écran.
    toast.success('Serveur enregistré');
    setTimeout(() => window.location.reload(), 700);
  };

  const forget = async () => {
    const confirmed = await requestConfirm(
      'L’application redemandera l’adresse du serveur et votre mot de passe au prochain démarrage.',
      { title: 'Se déconnecter du serveur ?', confirmLabel: 'Se déconnecter', danger: true },
    );
    if (!confirmed) return;

    setServerUrl('');
    // Le jeton n'a de valeur que pour le serveur qui l'a émis : le garder ferait
    // échouer la prochaine connexion par un 401 sans explication.
    setAuthToken(null);
    window.location.reload();
  };

  return (
    <>
      <ScreenHeader title="Serveur" back backTo="/more" />

      <ScreenBody>
        <div className="space-y-5">
          {/* ── État de la connexion ── */}
          <div className={cx(radii.tile, surfaces.card, 'px-4 py-4')}>
            <p className={text.label}>Adresse actuelle</p>
            <p className="mt-1.5 break-all text-[15px] font-medium text-zinc-100" data-selectable>
              {saved || 'Aucune adresse enregistrée'}
            </p>

            <div className="mt-3.5 flex items-center gap-2.5 border-t border-white/[0.06] pt-3">
              <span
                aria-hidden="true"
                className={cx(
                  'h-2 w-2 shrink-0 rounded-full',
                  status === 'online' && 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
                  status === 'offline' && 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]',
                  status === 'checking' && 'animate-pulse bg-zinc-500',
                )}
              />
              <p
                className={cx(
                  'min-w-0 flex-1 text-[13px]',
                  status === 'online' ? 'text-emerald-300' : 'text-zinc-400',
                )}
                role="status"
              >
                {status === 'checking'
                  ? 'Vérification…'
                  : status === 'online'
                    ? 'Connecté'
                    : (statusError ?? 'Serveur injoignable.')}
              </p>
              <button
                type="button"
                onClick={() => void refreshStatus(saved)}
                disabled={status === 'checking'}
                aria-label="Revérifier la connexion"
                className="tappable -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400 active:bg-white/[0.08] disabled:opacity-40"
              >
                <ArrowPathIcon className={cx('h-5 w-5', status === 'checking' && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* ── Nouvelle adresse ── */}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Field
              label="Adresse du serveur"
              error={error ?? undefined}
              hint="Elle est affichée dans Findy → Réglages → Accès mobile, sur l’ordinateur."
            >
              <TextInput
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="192.168.1.20:36321"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="url"
                enterKeyHint="go"
                spellCheck={false}
              />
            </Field>

            <PrimaryButton type="submit" disabled={checking || !url.trim()}>
              {checking ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Vérification…
                </>
              ) : (
                'Tester et enregistrer'
              )}
            </PrimaryButton>
          </form>

          <div className={cx(radii.tile, surfaces.card, 'flex gap-3 p-4')}>
            <SignalIcon className="h-5 w-5 shrink-0 text-violet-400" aria-hidden="true" />
            <p className="text-[13px] leading-relaxed text-zinc-400">
              {isNativeMobile()
                ? 'L’ordinateur et le téléphone doivent être sur le même réseau Wi-Fi, et l’accès mobile activé dans les réglages de Findy sur l’ordinateur.'
                : 'Dans un navigateur, Findy interroge le serveur qui sert cette page : l’adresse enregistrée ici ne s’applique qu’à l’application installée.'}
            </p>
          </div>

          <DangerButton onClick={forget}>Se déconnecter du serveur</DangerButton>
        </div>
      </ScreenBody>
    </>
  );
}
