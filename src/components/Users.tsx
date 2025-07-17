import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { User, Bank } from '../types/index.js';

export default function Users() {
  const { users, loadUsers, loadBanks } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [selectedUserBanks, setSelectedUserBanks] = useState<Bank[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: ''
  });
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

  const loadUserBanks = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (response.ok) {
        const userData = await response.json();
        // Transformer les données pour obtenir les banques
        const banks = userData.userBanks.map((userBank: any) => userBank.bank);
        setSelectedUserBanks(banks);
      }
    } catch (error) {
      console.error('Error loading user banks:', error);
    }
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    loadUserBanks(userId);
    
    // Initialiser les données du formulaire avec les données de l'utilisateur sélectionné
    const selectedUser = users.find(u => u.id === userId);
    if (selectedUser) {
      setFormData({
        name: selectedUser.name
      });
      setAvatarPreview(selectedUser.avatar ? `http://localhost:3001${selectedUser.avatar}` : null);
      setAvatarFile(null);
    }
  };

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
    
    if (!selectedUserId) return;
    
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

  const handleRemoveBankAccess = async (bankId: string, userId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir retirer l\'accès à cette banque ?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/banks/${bankId}/share/${userId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadUserBanks(userId);
        alert('Accès retiré avec succès');
      }
    } catch (error) {
      console.error('Error removing bank access:', error);
      alert('Erreur lors du retrait d\'accès');
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Gestion des utilisateurs
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Gérez les utilisateurs et leurs banques associées
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des utilisateurs */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Utilisateurs ({users.length})
              </h3>
            </div>
            
            <div className="divide-y divide-gray-200">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`p-4 cursor-pointer hover:bg-gray-50 ${
                    selectedUserId === user.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''
                  }`}
                  onClick={() => handleSelectUser(user.id)}
                >
                  <div className="flex items-center">
                    {user.avatar ? (
                      <img
                        src={`http://localhost:3001${user.avatar}`}
                        alt={user.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-gray-900">{user.name}</h4>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Détails de l'utilisateur sélectionné */}
        <div className="lg:col-span-2">
          {selectedUserId ? (
            <div className="space-y-6">
              {/* Informations de l'utilisateur */}
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Informations de l'utilisateur
                  </h3>
                </div>
                
                <form onSubmit={handleSubmitEdit} className="px-6 py-4 space-y-4">
                  {(() => {
                    const user = users.find(u => u.id === selectedUserId);
                    if (!user) return null;
                    
                    return (
                      <>
                        {/* Avatar Section */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Photo de profil
                          </label>
                          <div className="flex items-center space-x-4">
                            <div className="relative">
                              {avatarPreview ? (
                                <img
                                  src={avatarPreview}
                                  alt="Avatar"
                                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                                />
                              ) : (
                                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                </div>
                              )}
                              {avatarPreview && (
                                <button
                                  type="button"
                                  onClick={handleRemoveAvatar}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            <div className="flex-1">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleAvatarChange}
                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                PNG, JPG, GIF jusqu'à 5MB
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Name */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nom
                          </label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            required
                          />
                        </div>

                        {/* Metadata */}
                        <div className="text-xs text-gray-500 pt-2">
                          Créé le {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                          {user.updatedAt !== user.createdAt && (
                            <span> • Modifié le {new Date(user.updatedAt).toLocaleDateString('fr-FR')}</span>
                          )}
                        </div>

                        {/* Save Button */}
                        <div className="pt-4">
                          <button
                            type="submit"
                            disabled={isSaving}
                            className="w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSaving ? 'Sauvegarde...' : 'Sauvegarder les modifications'}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </form>
              </div>

              {/* Banques associées */}
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Banques associées ({selectedUserBanks.length})
                  </h3>
                </div>
                
                <div className="px-6 py-4">
                  {selectedUserBanks.length === 0 ? (
                    <div className="text-center py-8">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8v-2a1 1 0 011-1h1a1 1 0 011 1v2M7 19h10" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune banque associée</h3>
                      <p className="mt-1 text-sm text-gray-500">Cet utilisateur n'a accès à aucune banque.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedUserBanks.map((bank) => {
                        return (
                          <div key={bank.id} className="border rounded-lg p-4 hover:bg-gray-50">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                {bank.image ? (
                                  <img
                                    src={`http://localhost:3001${bank.image}`}
                                    alt={bank.name}
                                    className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold bg-blue-600">
                                    {bank.shortName}
                                  </div>
                                )}
                                <div className="ml-3">
                                  <h4 className="text-sm font-medium text-gray-900">{bank.name}</h4>
                                  <p className="text-xs text-gray-500">
                                    Accès complet
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="text-right">
                                  <div className="text-sm font-medium text-gray-900">
                                    {formatAmount(bank.balance)}
                                  </div>
                                  <div className="text-xs text-gray-500">Solde</div>
                                </div>
                                <button
                                  onClick={() => handleRemoveBankAccess(bank.id, selectedUserId!)}
                                  className="text-red-600 hover:text-red-900"
                                  title="Retirer l'accès"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">Sélectionnez un utilisateur</h3>
                <p className="mt-1 text-sm text-gray-500">Choisissez un utilisateur dans la liste pour voir ses détails.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
