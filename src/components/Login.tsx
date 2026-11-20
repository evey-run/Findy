import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { assetUrl } from '../lib/url';
import type { AuthProfile } from '../types';
import { LockClosedIcon, PlusIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

/**
 * Écran de connexion.
 *
 * Un profil = un utilisateur de l'app (le même objet que les membres du
 * Portefeuille). Le mot de passe est optionnel : sans mot de passe on entre
 * d'un clic, avec mot de passe le profil est protégé. Créer un compte ici,
 * c'est donc exactement « ajouter un utilisateur ».
 */
export default function Login() {
  const { loadAuthProfiles, login, register } = useAppStore();

  const [profiles, setProfiles] = useState<AuthProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Profil sélectionné en attente de mot de passe
  const [pending, setPending] = useState<AuthProfile | null>(null);
  const [password, setPassword] = useState('');

  // Mode création de profil
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    loadAuthProfiles()
      .then((list) => {
        setProfiles(list);
        // Aucun profil en base : on démarre directement sur la création.
        if (list.length === 0) setCreating(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Chargement des profils impossible'))
      .finally(() => setLoading(false));
  }, [loadAuthProfiles]);

  const resetForms = () => {
    setError(null);
    setPassword('');
    setNewName('');
    setNewPassword('');
  };

  const handleSelect = async (profile: AuthProfile) => {
    setError(null);
    if (profile.hasPassword) {
      setPending(profile);
      setPassword('');
      return;
    }
    await doLogin(profile.id);
  };

  const doLogin = async (userId: string, pwd?: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(userId, pwd);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await register(newName.trim(), newPassword || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const renderAvatar = (profile: { name: string; avatar?: string | null }, size = 'h-14 w-14') => {
    if (profile.avatar) {
      return (
        <img
          src={assetUrl(profile.avatar)}
          alt={profile.name}
          className={`${size} rounded-full object-cover ring-2 ring-white/10`}
        />
      );
    }
    return (
      <div className={`${size} rounded-full bg-violet-600 flex items-center justify-center text-white text-lg font-semibold ring-2 ring-violet-500/30`}>
        {profile.name.charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    // `dvh` plutôt que `vh` : sur iOS, `100vh` vaut la hauteur SANS la barre
    // d'adresse, et l'écran de connexion déborde alors d'une centaine de pixels.
    // Les zones sûres évitent que le logo ne passe sous l'encoche.
    <div className="flex min-h-dvh items-center justify-center bg-[#09090b] px-6 pb-[max(3rem,var(--safe-bottom))] pt-[max(3rem,var(--safe-top))]">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <img src="/assets/findy-logo.png" alt="Findy" className="h-9 w-auto" />
          <p className="text-zinc-500 text-sm">
            {creating ? 'Créer un profil' : pending ? 'Profil protégé' : 'Choisis ton profil'}
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          {loading ? (
            <p className="text-zinc-500 text-sm text-center py-8">Chargement…</p>
          ) : pending ? (
            /* ── Saisie du mot de passe ── */
            <form
              onSubmit={(e) => { e.preventDefault(); doLogin(pending.id, password); }}
              className="space-y-4"
            >
              <div className="flex flex-col items-center gap-3">
                {renderAvatar(pending, 'h-16 w-16')}
                <p className="text-zinc-50 font-medium">{pending.name}</p>
              </div>
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                autoComplete="current-password"
                enterKeyHint="go"
                className="h-12 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 text-sm text-zinc-50 placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none"
              />
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !password}
                className="tappable h-12 w-full rounded-xl bg-violet-600 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Connexion…' : 'Se connecter'}
              </button>
              <button
                type="button"
                onClick={() => { setPending(null); resetForms(); }}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-300"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" /> Changer de profil
              </button>
            </form>
          ) : creating ? (
            /* ── Création d'un profil (= ajout d'un utilisateur) ── */
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-zinc-400 text-xs mb-1.5">Nom</label>
                <input
                  autoFocus
                  type="text"
                  maxLength={20}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ton prénom"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  className="h-12 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 text-sm text-zinc-50 placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-1.5">
                  Mot de passe <span className="text-zinc-600">— optionnel</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Laisser vide pour un profil ouvert"
                  autoComplete="new-password"
                  enterKeyHint="done"
                  className="h-12 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 text-sm text-zinc-50 placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none"
                />
                <p className="text-zinc-600 text-[11px] mt-1.5">
                  Sans mot de passe, le profil sert juste à séparer les données. Tu pourras en
                  ajouter un plus tard dans les Paramètres.
                </p>
              </div>
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !newName.trim()}
                className="tappable h-12 w-full rounded-xl bg-violet-600 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Création…' : 'Créer et continuer'}
              </button>
              {profiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setCreating(false); resetForms(); }}
                  className="flex min-h-[44px] w-full items-center justify-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-300"
                >
                  <ArrowLeftIcon className="h-3.5 w-3.5" /> Retour aux profils
                </button>
              )}
            </form>
          ) : (
            /* ── Liste des profils ── */
            <div className="space-y-2">
              {error && <p className="text-red-400 text-xs text-center pb-2">{error}</p>}
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleSelect(profile)}
                  disabled={submitting}
                  className="tappable flex min-h-[60px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                  {renderAvatar(profile, 'h-11 w-11')}
                  <span className="text-zinc-50 text-sm font-medium truncate">{profile.name}</span>
                  {profile.hasPassword && (
                    <LockClosedIcon className="ml-auto h-4 w-4 text-zinc-500 flex-shrink-0" />
                  )}
                </button>
              ))}
              <button
                onClick={() => { setCreating(true); resetForms(); }}
                className="tappable mt-3 flex min-h-[60px] w-full items-center gap-3 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-left transition-colors hover:border-violet-500/40 hover:bg-white/[0.03]"
              >
                <div className="h-11 w-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <PlusIcon className="h-5 w-5 text-zinc-400" />
                </div>
                <span className="text-zinc-400 text-sm font-medium">Ajouter un profil</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
