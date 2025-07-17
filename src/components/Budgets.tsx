import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Objective } from '../types';
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
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface ObjectiveProgress {
  objective: Objective;
  transactions: any[];
  totalSaved: number;
  remaining: number;
  percentage: number;
  isCompleted: boolean;
  searchPattern: string;
}

export default function Budgets() {
  const { loadCategories, loadBanks } = useAppStore();
  
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [objectiveProgress, setObjectiveProgress] = useState<{ [key: string]: ObjectiveProgress }>({});
  const [showModal, setShowModal] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [loading, setLoading] = useState(true);

  // Formulaire
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetAmount: '',
    deadline: ''
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

  const handleSubmit = async (e: React.FormEvent) => {
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

      if (editingObjective) {
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
        } else {
          throw new Error('Erreur lors de la mise à jour');
        }
      } else {
        const response = await fetch('/api/objectives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(objectiveData)
        });

        if (response.ok) {
          const newObjective = await response.json();
          setObjectives(prev => [newObjective, ...prev]);
          toast.success('Objectif créé avec succès');
        } else {
          throw new Error('Erreur lors de la création');
        }
      }

      resetForm();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving objective:', error);
      toast.error('Erreur lors de la sauvegarde de l\'objectif');
    }
  };

  const handleEdit = (objective: Objective) => {
    setEditingObjective(objective);
    setFormData({
      title: objective.title,
      description: objective.description || '',
      targetAmount: objective.targetAmount.toString(),
      deadline: objective.deadline ? objective.deadline.split('T')[0] : ''
    });
    setShowModal(true);
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
      deadline: ''
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

  const getStatusIcon = (percentage: number, isCompleted: boolean) => {
    if (isCompleted) return <TrophyIcon className="h-6 w-6 text-yellow-500" />;
    if (percentage >= 80) return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
    if (percentage >= 40) return <ChartBarIcon className="h-6 w-6 text-blue-500" />;
    return <ExclamationTriangleIcon className="h-6 w-6 text-orange-500" />;
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
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Nouvel Objectif
          </button>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {objectives.map(objective => {
          const progress = objectiveProgress[objective.id];
          const percentage = progress ? progress.percentage : 0;
          const isCompleted = progress ? progress.isCompleted : objective.isCompleted;
          const deadline = objective.deadline;
          const overdueClass = deadline && isOverdue(deadline) && !isCompleted ? 'ring-2 ring-red-500' : '';
          
          return (
            <div key={objective.id} className={`bg-white rounded-lg shadow-lg p-6 ${overdueClass}`}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  {getStatusIcon(percentage, isCompleted)}
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
              <div className="mb-4">
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
              <div className="border-t pt-4">
                {deadline && (
                  <div className={`flex items-center text-sm mb-2 ${
                    isOverdue(deadline) && !isCompleted ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    <ClockIcon className="h-4 w-4 mr-2" />
                    <span>
                      Échéance: {new Date(deadline).toLocaleDateString('fr-FR')}
                      {isOverdue(deadline) && !isCompleted && ' (en retard)'}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center text-sm text-gray-500">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  <span>
                    Créé le {new Date(objective.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>

                {progress && progress.transactions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">
                      Dernières contributions:
                    </p>
                    <div className="space-y-1">
                      {progress.transactions.slice(0, 3).map((transaction, index) => (
                        <div key={index} className="flex justify-between text-xs">
                          <span className="text-gray-600 truncate">
                            {transaction.description}
                          </span>
                          <span className="text-green-600 font-medium">
                            +{transaction.amount.toLocaleString('fr-FR')} €
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Message si aucun objectif */}
      {objectives.length === 0 && (
        <div className="text-center py-12">
          <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun objectif</h3>
          <p className="mt-1 text-sm text-gray-500">
            Commencez par créer votre premier objectif d'épargne.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Nouvel Objectif
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingObjective ? 'Modifier l\'Objectif' : 'Nouvel Objectif'}
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Titre de l'objectif *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="ex: Moto, Vacances, Ordinateur..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={2}
                    placeholder="Description de votre objectif..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Montant cible *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date limite (optionnel)
                  </label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-800">
                    <strong>💡 Astuce:</strong> Pour alimenter cet objectif, créez des transactions avec la description "Économie {formData.title || '[Titre]'}" dans vos transactions.
                  </p>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    {editingObjective ? 'Mettre à jour' : 'Créer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
