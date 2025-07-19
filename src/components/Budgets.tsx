import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Objective, Transaction } from '../types';
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  ChartBarIcon,
  CheckCircleIcon,
  CalendarIcon,
  CurrencyEuroIcon,
  TrophyIcon,
  ClockIcon,
  HeartIcon,
  HomeIcon,
  TruckIcon,
  AcademicCapIcon,
  GiftIcon,
  BeakerIcon,
  CameraIcon,
  MusicalNoteIcon,
  SunIcon,
  StarIcon
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

// Mapping des icônes disponibles
const iconMap = {
  TrophyIcon,
  HeartIcon,
  HomeIcon,
  TruckIcon,
  AcademicCapIcon,
  GiftIcon,
  BeakerIcon,
  CameraIcon,
  MusicalNoteIcon,
  SunIcon,
  StarIcon,
  CurrencyEuroIcon,
  CalendarIcon,
  ChartBarIcon
};

const iconOptions = [
  { name: 'TrophyIcon', label: '🏆 Trophée' },
  { name: 'HeartIcon', label: '❤️ Cœur' },
  { name: 'HomeIcon', label: '🏠 Maison' },
  { name: 'TruckIcon', label: '🚚 Véhicule' },
  { name: 'AcademicCapIcon', label: '🎓 Éducation' },
  { name: 'GiftIcon', label: '🎁 Cadeau' },
  { name: 'BeakerIcon', label: '🧪 Science' },
  { name: 'CameraIcon', label: '📷 Photo' },
  { name: 'MusicalNoteIcon', label: '🎵 Musique' },
  { name: 'SunIcon', label: '☀️ Vacances' },
  { name: 'StarIcon', label: '⭐ Favori' },
  { name: 'CurrencyEuroIcon', label: '💰 Argent' },
  { name: 'CalendarIcon', label: '📅 Événement' },
  { name: 'ChartBarIcon', label: '📊 Investissement' }
];

const getIconComponent = (iconName: string) => {
  const IconComponent = iconMap[iconName as keyof typeof iconMap] || TrophyIcon;
  return IconComponent;
};

export default function Budgets() {
  const { loadCategories, loadBanks, transactions } = useAppStore();
  
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

  useEffect(() => {
    loadObjectives();
    loadCategories();
    loadBanks();
  }, []);

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
    const searchPattern = `economie ${objectiveTitle.toLowerCase()}`;
    return transactions
      .filter(transaction => 
        transaction.description.toLowerCase().includes(searchPattern)
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
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

  const handleSave = async () => {
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

      const response = await fetch(`/api/objectives/${editingObjective.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(objectiveData)
      });

      if (response.ok) {
        const updatedObjective = await response.json();
        setObjectives(prev => prev.map(obj => 
          obj.id === editingObjective.id ? updatedObjective : obj
        ));
        toast.success('Objectif mis à jour avec succès');
        handleCancel();
      } else {
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

      const response = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(objectiveData)
      });

      if (response.ok) {
        const newObjective = await response.json();
        setObjectives(prev => [newObjective, ...prev]);
        toast.success('Objectif créé avec succès');
        handleCancel();
      } else {
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

  const getProgressColor = (percentage: number, isCompleted: boolean) => {
    if (isCompleted) return 'bg-green-500';
    if (percentage >= 80) return 'bg-blue-500';
    if (percentage >= 60) return 'bg-yellow-500';
    if (percentage >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getStatusIcon = (percentage: number, isCompleted: boolean, objective?: Objective) => {
    if (isCompleted) return <TrophyIcon className="h-6 w-6 text-yellow-500" />;
    if (percentage >= 80) return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
    if (percentage >= 40) return <ChartBarIcon className="h-6 w-6 text-blue-500" />;
    
    // Utiliser l'icône personnalisée de l'objectif au lieu de l'icône d'attention
    if (objective?.icon) {
      const IconComponent = getIconComponent(objective.icon);
      return <IconComponent className="h-6 w-6 text-gray-600" />;
    }
    return <TrophyIcon className="h-6 w-6 text-gray-600" />;
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
    <div className="space-y-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Objectifs d'Épargne
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Créez et suivez vos objectifs d'épargne. Ajoutez des transactions "Économie [NomObjectif]" pour les alimenter automatiquement.
          </p>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Objectifs Totaux
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {totalObjectives}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrophyIcon className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Objectifs Atteints
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {completedObjectives}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CurrencyEuroIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Économisé
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {totalSaved.toLocaleString('fr-FR')} €
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CurrencyEuroIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Objectif Total
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {totalTargetAmount.toLocaleString('fr-FR')} €
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Liste des objectifs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
        {objectives.map(objective => {
          const progress = objectiveProgress[objective.id];
          const percentage = progress ? progress.percentage : 0;
          const isCompleted = progress ? progress.isCompleted : objective.isCompleted;
          const deadline = objective.deadline;
          const overdueClass = deadline && isOverdue(deadline) && !isCompleted ? 'ring-2 ring-red-500' : '';
          
          return (
            <div key={objective.id} className={`bg-white rounded-lg shadow p-6 flex flex-col h-full min-h-[280px] ${overdueClass}`}>
              {editingId === objective.id ? (
                <div className="flex flex-col h-[280px]">
                  <form id="edit-objective-form" onSubmit={handleSave} className="space-y-2">
                    <h3 className="text-md font-medium text-gray-900">Modifier l'objectif</h3>
                    
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                        placeholder="Titre"
                        required
                      />
                      
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                        rows={2}
                        placeholder="Description..."
                      />
                      
                      <input
                        type="number"
                        step="1"
                        value={formData.targetAmount}
                        onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                        placeholder="Montant cible (€)"
                        required
                      />
                      
                      <input
                        type="date"
                        value={formData.deadline}
                        onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                      />
                      
                      {/* Sélecteur d'icône */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Icône</label>
                        <select
                          value={formData.icon}
                          onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                        >
                          {iconOptions.map(option => (
                            <option key={option.name} value={option.name}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                        <p className="text-xs text-blue-800">
                          <strong>💡 Astuce:</strong> Créez des transactions "Économie {formData.title || '[Titre]'}" pour alimenter cet objectif.
                        </p>
                      </div>
                    </div>
                  </form>

                  <div className="flex space-x-2 mt-auto">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      form="edit-objective-form"
                      className="flex-1 px-2 py-1 border border-transparent rounded-md text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      Sauvegarder
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      {getStatusIcon(percentage, isCompleted, objective)}
                      <div className="ml-3">
                        <h3 className="text-lg font-medium text-gray-900">
                          {objective.title}
                        </h3>
                        {objective.description && (
                          <p className="text-sm text-gray-500">
                            {objective.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => handleEdit(objective)}
                        className="text-gray-400 hover:text-indigo-600"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(objective.id)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progression */}
                  <div className="mb-4 flex-1">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Économisé</span>
                      <span>Objectif</span>
                    </div>
                    <div className="flex justify-between text-lg font-semibold mb-2">
                      <span className="text-green-600">
                        {progress ? progress.totalSaved.toLocaleString('fr-FR') : '0'} €
                      </span>
                      <span className="text-gray-900">
                        {objective.targetAmount.toLocaleString('fr-FR')} €
                      </span>
                    </div>
                    
                    {/* Barre de progression */}
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-300 ${getProgressColor(percentage, isCompleted)}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>{percentage.toFixed(1)}%</span>
                      <span>
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

                  {/* Détails */}
                  <div className="border-t pt-3 mt-auto">
                    {/* Échéance */}
                    <div className={`flex items-center text-sm mb-2 ${
                      deadline ? (
                        isOverdue(deadline) && !isCompleted ? 'text-red-600' : 'text-gray-500'
                      ) : 'text-gray-400'
                    }`}>
                      <ClockIcon className="h-4 w-4 mr-2" />
                      <span>
                        {deadline ? (
                          <>
                            Échéance: {new Date(deadline).toLocaleDateString('fr-FR')}
                            {isOverdue(deadline) && !isCompleted && ' (en retard)'}
                          </>
                        ) : (
                          'Aucune échéance définie'
                        )}
                      </span>
                    </div>
                    
                    {/* Transactions */}
                    {(() => {
                      const objectiveTransactions = getObjectiveTransactions(objective.title);
                      return (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">
                            Dernières transactions "Economie {objective.title}":
                          </p>
                          {objectiveTransactions.length > 0 ? (
                            <div className="space-y-1">
                              {objectiveTransactions.map((transaction) => (
                                <div key={transaction.id} className="flex justify-between text-xs">
                                  <span className="text-gray-600 truncate">
                                    {transaction.description}
                                  </span>
                                  <span className="text-green-600 font-medium">
                                    +{transaction.amount.toLocaleString('fr-FR')} €
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic">
                              Aucune transaction trouvée
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add Objective Form Card */}
        {showAddForm ? (
          <div className="bg-white shadow rounded-lg p-6 flex flex-col h-full min-h-[280px]">
            <form id="add-objective-form" onSubmit={handleAddObjective} className="flex flex-col h-full space-y-2">
              <h3 className="text-md font-medium text-gray-900">Nouvel objectif</h3>
              
              <div className="space-y-2 flex-1">
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                  placeholder="Titre"
                  required
                />
                
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                  rows={2}
                  placeholder="Description..."
                />
                
                <input
                  type="number"
                  step="1"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                  placeholder="Montant cible (€)"
                  required
                />
                
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                />
                
                {/* Sélecteur d'icône */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Icône</label>
                  <select
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1"
                  >
                    {iconOptions.map(option => (
                      <option key={option.name} value={option.name}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                  <p className="text-xs text-blue-800">
                    <strong>💡 Astuce:</strong> Créez des transactions "Économie {formData.title || '[Titre]'}" pour alimenter cet objectif.
                  </p>
                </div>
              </div>
            </form>

            <div className="flex space-x-2 mt-auto">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="add-objective-form"
                className="flex-1 px-2 py-1 border border-transparent rounded-md text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Créer
              </button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => {
              setShowAddForm(true);
              setFormData({
                title: '',
                description: '',
                targetAmount: '',
                deadline: '',
                icon: 'TrophyIcon'
              });
            }}
            className="bg-white shadow rounded-lg p-6 flex flex-col items-center justify-center h-full min-h-[280px] cursor-pointer hover:bg-gray-50 transition-colors border-2 border-dashed border-gray-300 hover:border-gray-400"
          >
            <PlusIcon className="h-12 w-12 text-gray-400 mb-2" />
            <p className="text-gray-500 text-sm font-medium">Ajouter un objectif</p>
          </div>
        )}
      </div>
    </div>
  );
}
