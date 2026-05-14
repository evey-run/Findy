import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Investissement from './components/Investissement';
import Categories from './components/Categories';
import Budgets from './components/Budgets';
import Banks from './components/Banks';
import Users from './components/Users';
import Auth from './components/Auth';
import { Toaster } from 'react-hot-toast';

function App() {
  const {
    loadUsers,
    loadCategories,
    loadTransactions,
    loadBudgets,
    loadDashboardOverview,
  } = useAppStore();

  const { user, checked, fetchMe } = useAuthStore();

  // Probe la session au démarrage (avant tout autre fetch)
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Une fois authentifié, charger les données applicatives
  useEffect(() => {
    if (!user) return;
    const initializeApp = async () => {
      try {
        await Promise.all([
          loadUsers(),
          loadCategories(),
          loadTransactions(),
          loadBudgets(),
          loadDashboardOverview(),
        ]);
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };
    initializeApp();
  }, [user, loadUsers, loadCategories, loadTransactions, loadBudgets, loadDashboardOverview]);

  // Tant que /api/auth/me n'a pas répondu, on évite le flash
  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Auth />
        <Toaster
          position="top-right"
          toastOptions={{ duration: 3000, style: { background: '#363636', color: '#fff' } }}
        />
      </>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-900">
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
          toastOptions={{ duration: 3000, style: { background: '#363636', color: '#fff' } }}
        />
      </div>
    </Router>
  );
}

export default App;
