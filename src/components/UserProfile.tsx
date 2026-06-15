import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Bank } from '../types/index.js';
import { assetUrl } from '../lib/url';

export default function UserProfile() {
  const { selectedUser, users, banks: _banks, loadUsers, loadBanks } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [userBanks, setUserBanks] = useState<Bank[]>([]);
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const currentUser = selectedUser || users[0];

  useEffect(() => {
    const initProfile = async () => {
      setLoading(true);
      try {
        await loadUsers();
        await loadBanks();
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    };
    initProfile();
  }, [loadUsers, loadBanks]);

  useEffect(() => {
    if (currentUser) loadUserBanks();
  }, [currentUser]);

  const loadUserBanks = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch(`/api/users/${currentUser.id}`);
      if (response.ok) {
        const userData = await response.json();
        const banks = userData.userBanks.map((userBank: any) => userBank.bank);
        setUserBanks(banks);
      }
    } catch (error) {
      console.error('Error loading user banks:', error);
    }
  };

  const handleEdit = () => {
    if (currentUser) {
      setFormData({ name: currentUser.name, email: currentUser.email || '' });
      setAvatarPreview(currentUser.avatar ? assetUrl(currentUser.avatar) : null);
      setEditing(true);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) { alert('Veuillez sélectionner un fichier image'); return; }
      if (file.size > 5 * 1024 * 1024) { alert('L\'image doit faire moins de 5MB'); return; }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setAvatarPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAvatar = () => { setAvatarFile(null); setAvatarPreview(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('email', formData.email);
      if (avatarFile) formDataToSend.append('avatar', avatarFile);
      const response = await fetch(`/api/users/${currentUser.id}`, { method: 'PUT', body: formDataToSend });
      if (response.ok) {
        await loadUsers();
        setEditing(false);
        setAvatarFile(null);
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Erreur lors de la mise à jour');
    }
  };

  const handleRemoveBankAccess = async (bankId: string) => {
    if (!currentUser) return;
    if (!confirm('Êtes-vous sûr de vouloir retirer l\'accès à cette banque ?')) return;
    try {
      const response = await fetch(`/api/banks/${bankId}/share/${currentUser.id}`, { method: 'DELETE' });
      if (response.ok) await loadUserBanks();
    } catch (error) {
      console.error('Error removing bank access:', error);
    }
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-zinc-300">Aucun utilisateur trouvé</h3>
        <p className="mt-1 text-sm text-zinc-500">Créez un utilisateur pour voir son profil.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 overflow-y-auto custom-scrollbar pb-2">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-zinc-50 sm:text-3xl sm:truncate">
            Profil utilisateur
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Gérez les informations de profil et les banques associées
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          {!editing && (
            <button
              onClick={handleEdit}
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-colors duration-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Modifier
            </button>
          )}
        </div>
      </div>

      {/* Profile Card */}
      <div className="rounded-2xl overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10">
        <div className="px-6 py-4 bg-zinc-900/40 border-b border-white/[0.06]">
          <h3 className="text-base font-semibold text-zinc-50">Informations personnelles</h3>
        </div>

        <div className="px-6 py-5">
          {editing ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Avatar */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Photo de profil</label>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" className="w-20 h-20 rounded-full object-cover ring-2 ring-white/10" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center">
                        <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                    {avatarPreview && (
                      <button type="button" onClick={handleRemoveAvatar}
                        className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors">
                        ×
                      </button>
                    )}
                  </div>
                  <div>
                    <input type="file" accept="image/*" onChange={handleAvatarChange}
                      className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-violet-600/20 file:text-violet-300 hover:file:bg-violet-600/30 transition-colors" />
                    <p className="text-xs text-zinc-500 mt-1">PNG, JPG, GIF jusqu'à 5 Mo</p>
                  </div>
                </div>
              </div>

              {/* Name & Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Nom</label>
                  <input type="text" value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-50 px-3 py-2 focus:ring-1 focus:ring-violet-600 focus:border-violet-600 outline-none"
                    required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
                  <input type="email" value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-50 px-3 py-2 focus:ring-1 focus:ring-violet-600 focus:border-violet-600 outline-none"
                    placeholder="exemple@email.com" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditing(false)}
                  className="px-4 py-2.5 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors">
                  Annuler
                </button>
                <button type="submit"
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium text-white transition-colors">
                  Sauvegarder
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-4">
              {currentUser.avatar ? (
                <img src={assetUrl(currentUser.avatar)} alt={currentUser.name}
                  className="w-20 h-20 rounded-full object-cover ring-2 ring-white/10" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-2xl font-bold">
                  {currentUser.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">{currentUser.name}</h3>
                <p className="text-sm text-zinc-400">{currentUser.email || 'Aucun email'}</p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Créé le {new Date(currentUser.createdAt).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Banks */}
      <div className="rounded-2xl overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10">
        <div className="px-6 py-4 bg-zinc-900/40 border-b border-white/[0.06]">
          <h3 className="text-base font-semibold text-zinc-50">
            Banques associées ({userBanks.length})
          </h3>
        </div>

        <div className="px-6 py-5">
          {userBanks.length === 0 ? (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8v-2a1 1 0 011-1h1a1 1 0 011 1v2M7 19h10" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-zinc-400">Aucune banque associée</h3>
              <p className="mt-1 text-sm text-zinc-600">Cet utilisateur n'a accès à aucune banque.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userBanks.map((bank) => (
                <div key={bank.id} className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/40 hover:border-zinc-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {bank.image ? (
                        <img src={assetUrl(bank.image)} alt={bank.name}
                          className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300 text-sm font-bold">
                          {bank.shortName}
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-medium text-zinc-50">{bank.name}</h4>
                        <p className="text-xs text-zinc-500">Accès complet</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-semibold text-zinc-50">{formatAmount(bank.balance)}</div>
                        <div className="text-xs text-zinc-600">Solde</div>
                      </div>
                      <button onClick={() => handleRemoveBankAccess(bank.id)}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                        title="Retirer l'accès">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
