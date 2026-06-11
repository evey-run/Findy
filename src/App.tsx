import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Investissement from './components/Investissement';
import Categories from './components/Categories';
import Budgets from './components/Budgets';
import Banks from './components/Banks';
import Users from './components/Users';
import { Toaster } from 'react-hot-toast';

function App() {
  const { 
    loadUsers,
    loadCategories, 
    loadTransactions, 
    loadBudgets, 
    loadDashboardOverview
  } = useAppStore();

  useEffect(() => {
    // Charger toutes les données au démarrage
    const initializeApp = async () => {
      try {
        await loadUsers();
        await loadCategories();
        // Only load transactions when the app initializes
        // We'll use the modified loadTransactions function which has caching
        await loadTransactions();
        await loadBudgets();
        await loadDashboardOverview();
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, [loadUsers, loadCategories, loadBudgets, loadDashboardOverview]); // Removed loadTransactions from dependencies

  return (
    <Router>
      <div className="min-h-screen bg-[#09090b]">
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/investissement" element={<Investissement />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/banks" element={<Banks />} />
            <Route path="/users" element={<Users />} />
          </Routes>
        </Layout>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#18181b',
              color: '#fafafa',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(24px)',
            },
          }}
        />
      </div>
    </Router>
  );
}

export default App;
