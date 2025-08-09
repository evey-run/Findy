import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import type { Objective, Transaction } from '../types';
import { 
  TrophyIcon, 
  ChartBarIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface ObjectiveProgress {
  objective: Objective;
  transactions: Transaction[];
  totalSaved: number;
  remaining: number;
  percentage: number;
  isCompleted: boolean;
  searchPattern: string;
  recentTransactions: Transaction[];
}



export default function Budgets() {
  const navigate = useNavigate();
  const { loadCategories, loadBanks, transactions, loadTransactions } = useAppStore();
  
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [objectiveProgress, setObjectiveProgress] = useState<{ [key: string]: ObjectiveProgress }>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [loading, setLoading] = useState(true);

  // Formulaire
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetAmount: '',
    deadline: '',
    icon: 'TrophyIcon'
  });

  // Inject custom scrollbar styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: #1f2226;
        border-radius: 3px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #6226fa;
        border-radius: 3px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #7c3aed;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    loadObjectives();
    loadCategories();
    loadBanks();
    // Charger toutes les transactions sans filtrage par banque
    loadTransactions({ forceLoadAll: true });
  }, [loadCategories, loadBanks, loadTransactions]);

  useEffect(() => {
    // Charger les données de progression pour chaque objectif
    objectives.forEach(objective => {
      fetchObjectiveProgress(objective.id);
    });
  }, [objectives]);

  const loadObjectives = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/objectives');
      if (response.ok) {
        const data = await response.json();
        setObjectives(data);
      }
    } catch (error) {
      console.error('Error loading objectives:', error);
      toast.error('Erreur lors du chargement des objectifs');
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour filtrer les transactions par objectif
  const getObjectiveTransactions = (objectiveTitle: string): Transaction[] => {
    // Créer plusieurs patterns possibles pour être plus flexible
    const possiblePatterns = [
      `economie ${objectiveTitle.toLowerCase()}`,
      `économie ${objectiveTitle.toLowerCase()}`,
      `epargne ${objectiveTitle.toLowerCase()}`,
      `épargne ${objectiveTitle.toLowerCase()}`,
      objectiveTitle.toLowerCase()
    ];
    
    return transactions
      .filter(transaction => {
        const lowerDesc = transaction.description.toLowerCase();
        // Vérifier si au moins un des patterns correspond
        return possiblePatterns.some(pattern => lowerDesc.includes(pattern));
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3); // Afficher les 3 dernières transactions
  };

  const fetchObjectiveProgress = async (objectiveId: string) => {
    try {
      const response = await fetch(`/api/objectives/${objectiveId}/progress`);
      if (response.ok) {
        const data = await response.json();
        setObjectiveProgress(prev => ({
          ...prev,
          [objectiveId]: data
        }));
      }
    } catch (error) {
      console.error('Error fetching objective progress:', error);
    }
  };

  const handleEdit = (objective: Objective) => {
    // Fermer le formulaire d'ajout s'il est ouvert
    setShowAddForm(false);
    setEditingId(objective.id);
    setEditingObjective(objective);
    setFormData({
      title: objective.title,
      description: objective.description || '',
      targetAmount: objective.targetAmount.toString(),
      deadline: objective.deadline ? objective.deadline.split('T')[0] : '',
      icon: objective.icon || 'TrophyIcon'
    });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!editingObjective || !formData.title || !formData.targetAmount) {
      toast.error('Veuillez remplir tous les champs requis');
      return;
    }

    try {
      const objectiveData = {
        ...formData,
        targetAmount: parseFloat(formData.targetAmount),
        deadline: formData.deadline || null
      };

      console.log('Sending objective data:', objectiveData); // Debug log

      const response = await fetch(`/api/objectives/${editingObjective.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(objectiveData)
      });

      if (response.ok) {
        const updatedObjective = await response.json();
        console.log('Updated objective received:', updatedObjective); // Debug log
        setObjectives(prev => prev.map(obj => 
          obj.id === editingObjective.id ? updatedObjective : obj
        ));
        toast.success('Objectif mis à jour avec succès');
        handleCancel();
      } else {
        const errorData = await response.text();
        console.error('Server error:', errorData);
        throw new Error('Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating objective:', error);
      toast.error('Erreur lors de la sauvegarde de l\'objectif');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingObjective(null);
    setShowAddForm(false);
    resetForm();
  };

  const handleAddObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.targetAmount) {
      toast.error('Veuillez remplir tous les champs requis');
      return;
    }

    try {
      const objectiveData = {
        ...formData,
        targetAmount: parseFloat(formData.targetAmount),
        deadline: formData.deadline || null
      };

      console.log('Creating objective with data:', objectiveData); // Debug log

      const response = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(objectiveData)
      });

      if (response.ok) {
        const newObjective = await response.json();
        console.log('New objective received:', newObjective); // Debug log
        setObjectives(prev => [newObjective, ...prev]);
        toast.success('Objectif créé avec succès');
        handleCancel();
      } else {
        const errorData = await response.text();
        console.error('Server error during creation:', errorData);
        throw new Error('Erreur lors de la création');
      }
    } catch (error) {
      console.error('Error creating objective:', error);
      toast.error('Erreur lors de la création de l\'objectif');
    }
  };

  const handleDelete = async (objectiveId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet objectif ?')) {
      return;
    }

    try {
      const response = await fetch(`/api/objectives/${objectiveId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setObjectives(prev => prev.filter(obj => obj.id !== objectiveId));
        toast.success('Objectif supprimé avec succès');
      } else {
        throw new Error('Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting objective:', error);
      toast.error('Erreur lors de la suppression de l\'objectif');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      targetAmount: '',
      deadline: '',
      icon: 'TrophyIcon'
    });
    setEditingObjective(null);
  };

  const isOverdue = (deadline: string) => {
    return new Date(deadline) < new Date();
  };

  // Calculer les statistiques
  const totalObjectives = objectives.length;
  const completedObjectives = objectives.filter(obj => obj.isCompleted).length;
  const totalTargetAmount = objectives.reduce((sum, obj) => sum + obj.targetAmount, 0);
  const totalSaved = objectives.reduce((sum, obj) => {
    const progress = objectiveProgress[obj.id];
    return sum + (progress ? progress.totalSaved : 0);
  }, 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen custom-scrollbar" style={{ backgroundColor: '#202427' }}>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
              Objectifs d'Épargne
            </h2>
            <p className="mt-1 text-sm text-gray-300">
              Créez et suivez vos objectifs d'épargne. Ajoutez des transactions "Économie [NomObjectif]" pour les alimenter automatiquement.
            </p>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-lg shadow p-6" style={{ backgroundColor: '#272a2f' }}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ChartBarIcon className="h-8 w-8" style={{ color: '#6226fa' }} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-300 truncate">
                    Objectifs Totaux
                  </dt>
                  <dd className="text-lg font-medium text-white">
                    {totalObjectives}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="rounded-lg shadow p-6" style={{ backgroundColor: '#272a2f' }}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrophyIcon className="h-8 w-8 text-yellow-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-300 truncate">
                    Objectifs Atteints
                  </dt>
                  <dd className="text-lg font-medium text-white">
                    {completedObjectives}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="rounded-lg shadow p-6" style={{ backgroundColor: '#272a2f' }}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrophyIcon className="h-8 w-8 text-green-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-300 truncate">
                    Économisé
                  </dt>
                  <dd className="text-lg font-medium text-white">
                    {totalSaved.toLocaleString('fr-FR')} €
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="rounded-lg shadow p-6" style={{ backgroundColor: '#272a2f' }}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrophyIcon className="h-8 w-8" style={{ color: '#6226fa' }} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-300 truncate">
                    Objectif Total
                  </dt>
                  <dd className="text-lg font-medium text-white">
                    {totalTargetAmount.toLocaleString('fr-FR')} €
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des objectifs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-fr">
          {objectives.map(objective => {
            const progress = objectiveProgress[objective.id];
            const percentage = progress ? progress.percentage : 0;
            const isCompleted = progress ? progress.isCompleted : objective.isCompleted;
            const deadline = objective.deadline;
            // Suppression du carré rouge autour des objectifs en retard
            
            return (
              <div key={objective.id} className="shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-80" style={{ backgroundColor: '#272a2f' }}>
              {editingId === objective.id ? (
                <form onSubmit={handleSave} className="flex flex-col h-full">
                  <div className="p-6 flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
                          style={{ backgroundColor: '#6226fa', color: 'white' }}
                          title="Icône de l'objectif"
                        >
                          <TrophyIcon className="h-6 w-6" />
                        </div>
                        
                        <div className="ml-4 flex-1">
                          <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="text-lg font-medium text-white border-none focus:ring-0 p-0 bg-transparent w-full mb-1"
                            placeholder="Titre de l'objectif"
                            required
                          />
                          
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              step="1"
                              value={formData.targetAmount}
                              onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                              className="text-sm text-gray-300 border-none focus:ring-0 p-0 bg-transparent w-20"
                              placeholder="1000"
                              required
                            />
                            <span className="text-sm text-gray-300">€</span>
                            
                            <input
                              type="date"
                              value={formData.deadline}
                              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                              className="text-sm text-gray-300 border-none focus:ring-0 p-0 bg-transparent"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full text-sm text-gray-300 border-none focus:ring-0 p-0 bg-transparent resize-none"
                        rows={3}
                        placeholder="Description de l'objectif..."
                      />
                    </div>
                  </div>
                  
                  <div className="px-6 py-3 rounded-b-lg" style={{ backgroundColor: '#1f2226' }}>
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-500">
                        Modifier l'objectif
                      </div>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={handleCancel}
                          className="px-3 py-1 text-xs border border-gray-300 rounded text-white hover:text-gray-700 hover:bg-gray-100"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 text-xs border border-transparent rounded text-white hover:opacity-80"
                          style={{ backgroundColor: '#6227f5' }}
                        >
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              ) : (
                <>
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: '#6226fa', color: 'white' }}
                        >
                          <TrophyIcon className="h-6 w-6" />
                        </div>
                        <div className="ml-4">
                          <h3 className="text-lg font-medium text-white">{objective.title}</h3>
                          {objective.description && (
                            <p className="text-sm text-gray-300">
                              {objective.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(objective)}
                          className="transition-colors"
                          style={{ color: '#616875' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#6226fa'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#616875'}
                          title="Modifier"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(objective.id)}
                          className="transition-colors"
                          style={{ color: '#616875' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#616875'}
                          title="Supprimer"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-medium text-gray-300">
                          Objectif {objective.targetAmount.toLocaleString('fr-FR')} €
                        </span>
                        <span 
                          className="text-xl font-bold"
                          style={{ color: isCompleted ? '#10b981' : '#6226fa' }}
                        >
                          {Math.round(percentage)}%
                        </span>
                      </div>
                      
                      <div className="w-full rounded-full h-3" style={{ backgroundColor: '#1f2226' }}>
                        <div
                          className="h-3 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${Math.min(percentage, 100)}%`,
                            backgroundColor: isCompleted ? '#10b981' : '#6226fa'
                          }}
                        />
                      </div>
                      
                      <div className="flex justify-between text-sm text-gray-400 mt-2">
                        <span className={deadline && isOverdue(deadline) && !isCompleted ? 'text-red-500 font-medium' : ''}>{deadline ? `Échéance: ${new Date(deadline).toLocaleDateString('fr-FR')}` : 'Pas d\'échéance'}</span>
                        <span className={isCompleted ? 'text-green-400' : 'text-gray-400'}>
                          {progress ? 
                            (progress.remaining > 0 ? 
                              `${progress.remaining.toLocaleString('fr-FR')} € restant` : 
                              'Objectif atteint ! 🎉'
                            ) : 
                            `${objective.targetAmount.toLocaleString('fr-FR')} € restant`
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-4" style={{ backgroundColor: '#1f2226' }}>
                    {(() => {
                      const objectiveTransactions = getObjectiveTransactions(objective.title);
                      return objectiveTransactions.length > 0 ? (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-gray-300">
                              Dernières transactions ({objectiveTransactions.length})
                            </p>
                            {objectiveTransactions.length > 0 && (
                              <button 
                                className="text-purple-400 hover:text-purple-300 transition-colors flex items-center"
                                onClick={() => {
                                  // Créer le pattern de recherche pour la page transactions
                                  const searchPattern = `Économie ${objective.title}`;
                                  // Naviguer vers la page transactions avec le paramètre de recherche
                                  navigate(`/transactions?search=${encodeURIComponent(searchPattern)}`);
                                }}
                                title="Voir toutes les transactions"
                              >
                                <ArrowRightIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="space-y-2 mb-4">
                            {objectiveTransactions.map((transaction) => (
                              <div 
                                key={transaction.id} 
                                className="flex flex-col mb-2 pb-2 border-b border-gray-700 last:border-b-0 last:pb-0 last:mb-0"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-400 truncate flex-1 mr-2 text-xs">
                                    {transaction.description}
                                  </span>
                                  <div className="flex items-center space-x-2">
                                    <span className="font-semibold text-green-400 text-xs">
                                      +{transaction.amount.toLocaleString('fr-FR')} €
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-gray-300">
                              Transactions
                            </p>
                          </div>
                          <div className="text-sm text-gray-400 mb-4">
                            Créez des transactions "Économie {objective.title}" pour alimenter cet objectif
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Add Objective Form Card */}
        {showAddForm ? (
          <div className="shadow rounded-lg border-2 flex flex-col h-80" style={{ backgroundColor: '#272a2f', borderColor: '#6226fa' }}>
            <form onSubmit={handleAddObjective} className="flex flex-col h-full">
              <div className="p-6 flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
                      style={{ backgroundColor: '#6226fa', color: 'white' }}
                      title="Icône de l'objectif"
                    >
                      <TrophyIcon className="h-6 w-6" />
                    </div>
                    
                    <div className="ml-4 flex-1">
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="text-lg font-medium text-white border-none focus:ring-0 p-0 bg-transparent w-full mb-1"
                        placeholder="Titre de l'objectif"
                        required
                      />
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          step="1"
                          value={formData.targetAmount}
                          onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                          className="text-sm text-gray-300 border-none focus:ring-0 p-0 bg-transparent w-20"
                          placeholder="1000"
                          required
                        />
                        <span className="text-sm text-gray-300">€</span>
                        
                        <input
                          type="date"
                          value={formData.deadline}
                          onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                          className="text-sm text-gray-300 border-none focus:ring-0 p-0 bg-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mb-4">
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full text-sm text-gray-300 border-none focus:ring-0 p-0 bg-transparent resize-none"
                    rows={3}
                    placeholder="Description de l'objectif..."
                  />
                </div>

                {/* Astuce */}
                <div className="mt-4 p-3 rounded-md" style={{ backgroundColor: '#1f2226' }}>
                  <p className="text-xs text-blue-400">
                    <strong>💡 Astuce:</strong> Créez des transactions "Économie {formData.title || '[Titre]'}" pour alimenter cet objectif.
                  </p>
                </div>
              </div>
              
              <div className="px-6 py-3 rounded-b-lg" style={{ backgroundColor: '#1f2226' }}>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    Nouvel objectif
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-3 py-1 text-xs border border-gray-300 rounded text-white hover:text-gray-700 hover:bg-gray-100"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs border border-transparent rounded text-white hover:opacity-80"
                      style={{ backgroundColor: '#6227f5' }}
                    >
                      Créer
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        ) : (
          <div 
            className="shadow rounded-lg border-2 border-dashed transition-colors flex flex-col h-80 cursor-pointer group"
            style={{ 
              borderColor: '#616875' // couleur intermédiaire
            } as React.CSSProperties}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#6226fa';
              const icon = e.currentTarget.querySelector('.icon-plus') as HTMLElement;
              const text = e.currentTarget.querySelector('.text-add') as HTMLElement;
              if (icon) icon.style.color = '#6226fa';
              if (text) text.style.color = '#6226fa';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#616875';
              const icon = e.currentTarget.querySelector('.icon-plus') as HTMLElement;
              const text = e.currentTarget.querySelector('.text-add') as HTMLElement;
              if (icon) icon.style.color = '#616875';
              if (text) text.style.color = '#616875';
            }}
            onClick={() => {
              setEditingId(null);
              setEditingObjective(null);
              setShowAddForm(true);
              setFormData({
                title: '',
                description: '',
                targetAmount: '',
                deadline: '',
                icon: 'TrophyIcon'
              });
            }}
          >
            <div className="flex flex-col items-center justify-center h-full p-6">
              <div className="mb-4 transition-colors icon-plus" style={{ color: '#616875' }}>
                <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-center font-medium transition-colors text-add" style={{ color: '#616875' }}>
                Ajouter un objectif
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
