import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Categories from './components/Categories';
import Budgets from './components/Budgets';
import Recurrences from './components/Recurrences';
import { Toaster } from 'react-hot-toast';

function App() {
  const { 
    loadUsers, 
    loadCategories, 
    loadTransactions, 
    loadBudgets, 
    loadRecurrences, 
    loadDashboardOverview,
    setSelectedUser 
  } = useAppStore();

  useEffect(() => {
    // Charger toutes les données au démarrage
    const initializeApp = async () => {
      await loadUsers();
      await loadCategories();
      await loadTransactions();
      await loadBudgets();
      await loadRecurrences();
      await loadDashboardOverview();
      
      // Sélectionner le premier utilisateur par défaut
      const users = useAppStore.getState().users;
      if (users.length > 0) {
        setSelectedUser(users[0]);
      }
    };

    initializeApp();
  }, [loadUsers, loadCategories, loadTransactions, loadBudgets, loadRecurrences, loadDashboardOverview, setSelectedUser]);

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/recurrences" element={<Recurrences />} />
          </Routes>
        </Layout>
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#363636',
              color: '#fff',
            },
          }}
        />
      </div>
    </Router>
  );
}

export default App;
