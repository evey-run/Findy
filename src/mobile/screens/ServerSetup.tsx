import { useState } from 'react';
import { ArrowRightIcon, SignalIcon } from '@heroicons/react/24/outline';
import { getServerUrl, probeServer, setServerUrl } from '../../lib/apiBase';
import { PrimaryButton } from '../components/Controls';
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

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 pb-[max(2rem,var(--safe-bottom))] pt-[max(2rem,var(--safe-top))]">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <img src="/assets/findy-logo.png" alt="Findy" className="h-11 w-auto" />
          <div>
            <h1 className={text.screenTitle}>Connecter votre serveur</h1>
            <p className={cx(text.caption, 'mt-2')}>
              Vos données restent sur votre ordinateur. Saisissez l’adresse affichée dans
              Findy&nbsp;→&nbsp;Réglages&nbsp;→&nbsp;Accès mobile.
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
      </div>
    </div>
  );
}
