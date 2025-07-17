import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Categories from './components/Categories';
import Budgets from './components/Budgets';
import Recurrences from './components/Recurrences';
import Banks from './components/Banks';
import Users from './components/Users';
import { Toaster } from 'react-hot-toast';

function App() {
  const { 
    loadUsers,
    loadCategories, 
    loadTransactions, 
    loadBudgets, 
    loadRecurrences, 
    loadDashboardOverview,
    processRecurrences
  } = useAppStore();

  useEffect(() => {
    // Charger toutes les données au démarrage
    const initializeApp = async () => {
      try {
        await loadUsers();
        await loadCategories();
        await loadTransactions();
        await loadBudgets();
        await loadRecurrences();
        await loadDashboardOverview();
        
        // Traiter automatiquement les récurrences dues aujourd'hui
        await processRecurrences();
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, [loadUsers, loadCategories, loadTransactions, loadBudgets, loadRecurrences, loadDashboardOverview, processRecurrences]);

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
            <Route path="/banks" element={<Banks />} />
            <Route path="/users" element={<Users />} />
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
