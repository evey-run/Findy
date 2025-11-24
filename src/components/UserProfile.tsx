import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Bank } from '../types/index.js';

export default function UserProfile() {
  const { selectedUser, users, banks: _banks, loadUsers, loadBanks } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [userBanks, setUserBanks] = useState<Bank[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    email: ''
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Utiliser le premier utilisateur si aucun n'est sélectionné
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
    if (currentUser) {
      loadUserBanks();
    }
  }, [currentUser]);

  const loadUserBanks = async () => {
    if (!currentUser) return;
    
    try {
      const response = await fetch(`/api/users/${currentUser.id}`);
      if (response.ok) {
        const userData = await response.json();
        console.log('User data loaded:', userData);
        // Transformer les données pour obtenir les banques
        const banks = userData.userBanks.map((userBank: any) => userBank.bank);
        console.log('Banks loaded:', banks);
        setUserBanks(banks);
      }
    } catch (error) {
      console.error('Error loading user banks:', error);
    }
  };

  const handleEdit = () => {
    if (currentUser) {
      setFormData({
        name: currentUser.name,
        email: currentUser.email || ''
      });
      setAvatarPreview(currentUser.avatar ? `http://localhost:3001${currentUser.avatar}` : null);
      setEditing(true);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) return;
    
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('email', formData.email);
      
      if (avatarFile) {
        formDataToSend.append('avatar', avatarFile);
      }
      
      const response = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        body: formDataToSend,
      });

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
    
    if (!confirm('Êtes-vous sûr de vouloir retirer l\'accès à cette banque ?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/banks/${bankId}/share/${currentUser.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadUserBanks();
      }
    } catch (error) {
      console.error('Error removing bank access:', error);
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderBottomColor: '#6226fa' }}></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun utilisateur trouvé</h3>
        <p className="mt-1 text-sm text-gray-500">Créez un utilisateur pour voir son profil.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Profil utilisateur
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Gérez les informations de profil et les banques associées
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          {!editing && (
            <button
              onClick={handleEdit}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Modifier
            </button>
          )}
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Informations personnelles
          </h3>
        </div>
        
        <div className="px-6 py-4">
          {editing ? (
            <form onSubmit={handleSubmit} className="space-y-6">
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
                        className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <div>
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

              {/* Name and Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Nom
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="exemple@email.com"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Sauvegarder
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                {currentUser.avatar ? (
                  <img
                    src={`http://localhost:3001${currentUser.avatar}`}
                    alt={currentUser.name}
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-medium text-gray-900">{currentUser.name}</h3>
                  <p className="text-sm text-gray-500">{currentUser.email || 'Aucun email'}</p>
                  <p className="text-xs text-gray-400">
                    Créé le {new Date(currentUser.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Banks Section */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Banques associées ({userBanks.length})
          </h3>
        </div>
        
        <div className="px-6 py-4">
          {userBanks.length === 0 ? (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8v-2a1 1 0 011-1h1a1 1 0 011 1v2M7 19h10" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune banque associée</h3>
              <p className="mt-1 text-sm text-gray-500">Cet utilisateur n'a accès à aucune banque.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userBanks.map((bank) => {
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
                          onClick={() => handleRemoveBankAccess(bank.id)}
                          className="transition-colors"
                          style={{ color: '#616875' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#616875'}
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
  );
}
