import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { User } from '../types/index.js';
import { assetUrl } from '../lib/url';

export default function Users() {
  const { users, loadUsers, loadBanks } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const initUsers = async () => {
      setLoading(true);
      try {
        await loadUsers();
        await loadBanks();
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initUsers();
  }, [loadUsers, loadBanks]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Vérifier le type de fichier
      if (!file.type.startsWith('image/')) {
        alert('Veuillez sélectionner un fichier image');
        return;
      }
      
      // Vérifier la taille (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('L\'image doit faire moins de 5MB');
        return;
      }
      
      setAvatarFile(file);
      
      // Créer une prévisualisation
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingId) return;
    
    setIsSaving(true);
    
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      
      if (avatarFile) {
        formDataToSend.append('avatar', avatarFile);
      }
      
      const response = await fetch(`/api/users/${editingId}`, {
        method: 'PUT',
        body: formDataToSend,
      });

      if (response.ok) {
        await loadUsers();
        setAvatarFile(null);
        // Mettre à jour l'aperçu avec la nouvelle image si elle a été uploadée
        if (avatarFile) {
          const updatedUser = await response.json();
          setAvatarPreview(updatedUser.avatar ? assetUrl(updatedUser.avatar) : null);
        }
        alert('Utilisateur mis à jour avec succès');
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 overflow-y-auto custom-scrollbar pb-2">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-zinc-50 sm:text-3xl sm:truncate">
            Famille
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Gérez les membres de la famille
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {users.map((user) => (
          <div
            key={user.id}
            className="rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 transition-all duration-200 hover:border-violet-500/20"
          >
            {editingId === user.id ? (
              <form onSubmit={handleSubmitEdit} className="flex items-center gap-4 p-3">
                {/* Avatar cliquable */}
                <label className="relative cursor-pointer flex-shrink-0" htmlFor={`avatar-upload-${user.id}`}>
                  <span className="absolute inset-0 w-12 h-12 rounded-full border-2 border-dashed border-violet-500/60 pointer-events-none"></span>
                  {avatarPreview ? (
                    <>
                      <img
                        src={avatarPreview}
                        alt={editingUser?.name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-transparent hover:opacity-80 transition relative"
                        style={{ zIndex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        tabIndex={-1}
                        style={{ zIndex: 3 }}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-white text-lg font-bold hover:opacity-80 transition relative">
                      {formData.name ? formData.name[0].toUpperCase() : '?'}
                    </div>
                  )}
                  <input
                    id={`avatar-upload-${user.id}`}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
                {/* Champ nom */}
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="flex-1 min-w-0 rounded-lg border border-zinc-700 focus:ring-1 focus:ring-violet-500 focus:border-violet-500 text-zinc-50 bg-zinc-900 py-2 px-3 h-10 text-sm"
                  placeholder="Nom"
                  required
                  maxLength={20}
                />
                {/* Boutons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    className="px-3 py-2 border border-zinc-700 rounded-lg text-xs font-medium text-zinc-300 bg-transparent hover:bg-white/5 transition-colors"
                    onClick={() => {
                      setEditingId(null);
                      setEditingUser(null);
                      setAvatarFile(null);
                      setAvatarPreview(null);
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-3 py-2 border border-transparent rounded-lg text-xs font-medium text-white bg-violet-700 hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSaving ? '...' : 'Sauvegarder'}
                  </button>
                </div>
              </form>
            ) : (
              /* AFFICHAGE NORMAL — horizontal */
              <div className="flex items-center gap-4 p-3">
                {user.avatar ? (
                  <img
                    src={assetUrl(user.avatar)}
                    alt={user.name}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                    {user.name ? user.name[0].toUpperCase() : '?'}
                  </div>
                )}
                <h4 className="text-sm font-medium text-zinc-50 flex-1 min-w-0 truncate">{user.name}</h4>
                <button
                  type="button"
                  className="flex-shrink-0 text-zinc-500 hover:text-violet-400 transition-colors p-1"
                  onClick={() => {
                    setEditingId(user.id);
                    setEditingUser(user);
                    setFormData({ name: user.name });
                    setAvatarPreview(user.avatar ? assetUrl(user.avatar) : null);
                    setAvatarFile(null);
                  }}
                  title="Modifier"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}