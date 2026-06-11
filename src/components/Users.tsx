import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { User, Bank } from '../types/index.js';

export default function Users() {
  const { users, loadUsers, loadBanks } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [_selectedUserBanks, _setSelectedUserBanks] = useState<Bank[]>([]);
  const [selectedUserId, _setSelectedUserId] = useState<string | null>(null);
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
      
      const response = await fetch(`/api/users/${selectedUserId}`, {
        method: 'PUT',
        body: formDataToSend,
      });

      if (response.ok) {
        await loadUsers();
        setAvatarFile(null);
        // Mettre à jour l'aperçu avec la nouvelle image si elle a été uploadée
        if (avatarFile) {
          const updatedUser = await response.json();
          setAvatarPreview(updatedUser.avatar ? `http://localhost:3001${updatedUser.avatar}` : null);
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
            Gestion des utilisateurs
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Gérez les utilisateurs et leurs banques associées
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
        {/* Liste des utilisateurs */}
        {users.map((user) => (
          <div
            key={user.id}
            className={`rounded-2xl overflow-hidden h-80 bg-white/5 backdrop-blur-xl border border-white/10 transition-all duration-300 hover:border-violet-500/20 ${selectedUserId === user.id ? 'ring-2 ring-violet-500' : ''}`}
          >
            {editingId === user.id ? (
              <form onSubmit={handleSubmitEdit} className="h-full w-full flex flex-col">
                <div className="flex-1 flex flex-col justify-center p-6 w-full">
                  <div className="flex flex-col items-center w-full">
                    {/* Avatar cliquable avec contour pointillé et icône plus */}
                    <div className="mb-4 flex justify-center w-full">
                      <label className="relative cursor-pointer mx-auto block" htmlFor={`avatar-upload-${user.id}`}> 
                        <span className="absolute inset-0 w-20 h-20 rounded-full border-2 border-dashed border-violet-500/60 pointer-events-none"></span>
                        {avatarPreview ? (
                          <>
                            <img
                              src={avatarPreview}
                              alt={editingUser?.name}
                              className="w-20 h-20 rounded-full object-cover border-2 border-transparent hover:opacity-80 transition"
                              style={{ position: 'relative', zIndex: 1 }}
                            />
                            <button
                              type="button"
                              onClick={handleRemoveAvatar}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                              tabIndex={-1}
                              style={{ zIndex: 3 }}
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <div className="w-20 h-20 rounded-full bg-zinc-700 flex items-center justify-center text-white text-2xl font-bold mx-auto hover:opacity-80 transition relative">
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
                    </div>
                    {/* Champ nom */}
                    <div className="mb-4 flex justify-center w-full">
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="mt-1 block rounded-lg border border-zinc-700 focus:ring-1 focus:ring-violet-500 focus:border-violet-500 text-zinc-50 bg-zinc-900 py-2 px-3 h-10 min-h-[2.5rem] text-base text-center"
                        style={{ minWidth: '180px', maxWidth: '220px' }}
                        placeholder="Nom de l'utilisateur"
                        required
                        maxLength={20}
                      />
                    </div>
                  </div>
                </div>
                {/* Zone des boutons - toujours en bas, pleine largeur */}
                <div className="px-6 py-3 rounded-b-2xl flex justify-end items-center gap-2 w-full bg-zinc-900/60">
                  <button
                    type="button"
                    className="px-4 py-2 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 bg-transparent hover:bg-white/5 transition-colors"
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
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-violet-700 hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                </div>
              </form>
            ) : (
              /* AFFICHAGE NORMAL */
              <div className="h-full flex flex-col items-center justify-center relative">
                <button
                  type="button"
                  className="absolute top-4 right-4 transition-colors z-10"
                  style={{ color: '#52525b' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#a78bfa'}
                  onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
                  onClick={() => { 
                    setEditingId(user.id); 
                    setEditingUser(user); 
                    setFormData({ name: user.name }); 
                    setAvatarPreview(user.avatar ? `http://localhost:3001${user.avatar}` : null); 
                    setAvatarFile(null); 
                  }}
                  title="Modifier l'utilisateur"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {user.avatar ? (
                  <img
                    src={`http://localhost:3001${user.avatar}`}
                    alt={user.name}
                    className="w-24 h-24 rounded-full object-cover ring-2 ring-white/10 mb-4"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-zinc-700 flex items-center justify-center text-white text-3xl font-bold mb-4">
                    {user.name ? user.name[0].toUpperCase() : '?'}
                  </div>
                )}
                <h4 className="text-xl font-medium text-zinc-50 text-center px-4">{user.name}</h4>
              </div>
            )}
          </div>
        ))}

        {/* Détails de l'utilisateur sélectionné */}
        {/* Détails de l'utilisateur sélectionné */}
        {/* Section supprimée : message 'Sélectionnez un utilisateur' */}
      </div>
    </div>
  );
}