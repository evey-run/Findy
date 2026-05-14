import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';

export default function Auth() {
  const { login, register, signupOpen, fetchStatus, loading, error } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Si l'inscription est ouverte (1er démarrage), on bascule par défaut sur register
  useEffect(() => {
    if (signupOpen) setMode('register');
  }, [signupOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (mode === 'register' && name.trim().length === 0) {
      setLocalError('Nom requis');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setLocalError('Le mot de passe doit faire au moins 8 caractères');
      return;
    }

    try {
      if (mode === 'register') {
        await register(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch {
      // l'erreur est déjà dans le store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-md rounded-lg p-8" style={{ backgroundColor: '#1f2226' }}>
        <h1 className="text-2xl font-semibold text-white text-center mb-6">
          {mode === 'register' ? 'Créer votre compte' : 'Connexion'}
        </h1>

        {signupOpen && mode === 'register' && (
          <p className="text-sm text-gray-400 text-center mb-4">
            Aucun compte n'existe encore. Le premier compte créé sera l'administrateur.
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm text-gray-300 mb-1">Nom</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                required
                autoComplete="name"
                className="w-full px-3 py-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-violet-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : 1}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              className="w-full px-3 py-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-violet-500"
            />
          </div>

          {(localError || error) && (
            <div className="text-sm text-red-400">{localError || error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: '#6226fa' }}
          >
            {loading ? '...' : mode === 'register' ? 'Créer le compte' : 'Se connecter'}
          </button>
        </form>

        {/* Toggle */}
        {!signupOpen && (
          <div className="text-center mt-4 text-sm text-gray-400">
            {mode === 'login' ? (
              <span>L'inscription est fermée. Contactez l'administrateur.</span>
            ) : (
              <button
                onClick={() => setMode('login')}
                className="text-violet-400 hover:underline"
              >
                Déjà un compte ? Se connecter
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
