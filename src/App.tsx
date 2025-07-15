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
import { Toaster } from 'react-hot-toast';

function App() {
  const { 
    loadBanks, 
    loadCategories, 
    loadTransactions, 
    loadBudgets, 
    loadRecurrences, 
    loadDashboardOverview,
    setSelectedBank 
  } = useAppStore();

  useEffect(() => {
    // Charger toutes les données au démarrage
    const initializeApp = async () => {
      await loadBanks();
      await loadCategories();
      await loadTransactions();
      await loadBudgets();
      await loadRecurrences();
      await loadDashboardOverview();
      
      // Sélectionner la première banque par défaut
      const banks = useAppStore.getState().banks;
      if (banks.length > 0) {
        setSelectedBank(banks[0]);
      }
    };

    initializeApp();
  }, [loadBanks, loadCategories, loadTransactions, loadBudgets, loadRecurrences, loadDashboardOverview, setSelectedBank]);

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
