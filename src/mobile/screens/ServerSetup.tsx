import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRightIcon, SignalIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { enterDemoMode, getServerUrl, probeServer, setServerUrl } from '../../lib/apiBase';
import { openExternalUrl, PRIVACY_POLICY_URL } from '../../lib/externalLink';
import { GhostButton, PrimaryButton } from '../components/Controls';
import { Field, TextInput } from '../components/Field';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Première connexion au serveur, sur iOS et Android.
 *
 * Findy garde ses données chez son propriétaire : elles vivent dans le SQLite
 * du Mac, pas dans un nuage. Le téléphone n'est donc pas une deuxième
 * installation mais une deuxième fenêtre sur la même base — et pour l'ouvrir,
 * il lui faut l'adresse du serveur.
 *
 * L'écran ne demande que cela, et la vérifie avant d'aller plus loin : une
 * adresse fautive donnerait sinon un écran de connexion qui échoue sans que
 * rien n'indique que le problème est réseau et non un mot de passe.
 *
 * Sans serveur sous la main, la démo ouvre l'application sur des comptes
 * fictifs : c'est la seule façon de la découvrir avant d'avoir installé Findy
 * sur un ordinateur — et celle qu'emprunte l'équipe de revue des magasins.
 */
export default function ServerSetup({ onConnected }: { onConnected: () => void }) {
  const [url, setUrl] = useState(getServerUrl());
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setChecking(true);
    setError(null);

    const result = await probeServer(url);
    if (!result.ok) {
      setError(result.error ?? 'Connexion impossible.');
      setChecking(false);
      return;
    }

    setServerUrl(url);
    setChecking(false);
    onConnected();
  };

  const startDemo = () => {
    enterDemoMode();
    onConnected();
  };

  const openPrivacyPolicy = () => {
    openExternalUrl(PRIVACY_POLICY_URL).catch((caught) => {
      console.error('Ouverture de la politique de confidentialité impossible', caught);
      toast.error('Impossible d’ouvrir la page.');
    });
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 pb-[max(2rem,var(--safe-bottom))] pt-[max(2rem,var(--safe-top))]">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <img src="/assets/findy-logo.png" alt="Findy" className="h-11 w-auto" />
          <div>
            <h1 className={text.screenTitle}>Connecter votre serveur</h1>
            <p className={cx(text.caption, 'mt-2')}>
              Vos données restent sur votre ordinateur. Saisissez l’adresse affichée dans
              Findy&nbsp;→&nbsp;Paramètres&nbsp;→&nbsp;Compte&nbsp;→&nbsp;Accès mobile.
            </p>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <Field label="Adresse du serveur" error={error ?? undefined}>
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
              <>
                Se connecter
                <ArrowRightIcon className="h-5 w-5" />
              </>
            )}
          </PrimaryButton>
        </form>

        <div className={cx(radii.tile, surfaces.card, 'mt-6 flex gap-3 p-4')}>
          <SignalIcon className="h-5 w-5 shrink-0 text-violet-400" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-zinc-400">
            L’ordinateur et le téléphone doivent être sur le même réseau Wi-Fi, et l’accès
            mobile activé dans les réglages de Findy sur l’ordinateur.
          </p>
        </div>

        {/* ── Démo ── */}
        <div className="mt-7 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-white/[0.08]" />
          <span className="text-[12px] text-zinc-600">ou</span>
          <span className="h-px flex-1 bg-white/[0.08]" />
        </div>

        <div className="mt-5">
          <GhostButton onClick={startDemo}>
            <SparklesIcon className="h-5 w-5 text-violet-300" aria-hidden="true" />
            Essayer avec des données de démo
          </GhostButton>
          <p className={cx(text.caption, 'mt-2 text-center')}>
            Des comptes fictifs, rien ne quitte le téléphone.
          </p>
        </div>

        <button
          type="button"
          onClick={openPrivacyPolicy}
          className="tappable mx-auto mt-6 flex min-h-[44px] items-center px-3 text-[13px] text-zinc-500 underline decoration-white/20 underline-offset-4 active:text-zinc-300"
        >
          Confidentialité
        </button>
      </div>
    </div>
  );
}
