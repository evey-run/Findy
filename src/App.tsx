import { useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store';
import Layout from './components/Layout';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Investissement from './components/Investissement';
import Categories from './components/Categories';
import Budgets from './components/Budgets';
import Banks from './components/Banks';
import Tricount from './components/Tricount';
import Settings from './components/Settings';
import ErrorBoundary from './components/ErrorBoundary';
import ConfirmDialog from './components/ConfirmDialog';
import MobileApp from './mobile/MobileApp';
import ServerSetup from './mobile/screens/ServerSetup';
import { useIsMobile } from './hooks/useIsMobile';
import { isNativeMobile } from './lib/platform';
import { needsServerSetup } from './lib/apiBase';
import { Toaster } from 'react-hot-toast';

/**
 * En application packagée, le front est servi par le protocole d'assets de
 * Tauri : une URL de chemin (`/transactions`) rechargée n'y correspond à aucune
 * ressource. Le routage par fragment reste toujours résoluble, ce qui compte
 * surtout sur mobile où le bouton retour du système et la reprise d'une
 * application mise en veille repassent par un chargement complet.
 */
const Router = isNativeMobile() ? HashRouter : BrowserRouter;

/**
 * Notifications.
 *
 * Le coin supérieur droit convient à une fenêtre de bureau, où le regard suit
 * la souris ; sur un téléphone il tombe sous l'encoche et hors de portée du
 * pouce. La position suit donc l'interface affichée.
 */
function AppToaster({ mobile }: { mobile: boolean }) {
  return (
    <Toaster
      position={mobile ? 'top-center' : 'top-right'}
      containerStyle={mobile ? { top: 'calc(var(--safe-top) + 12px)' } : undefined}
      toastOptions={{
        duration: 3000,
        style: {
          background: '#18181b',
          color: '#fafafa',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: mobile ? '16px' : '8px',
          maxWidth: mobile ? 'calc(100vw - 32px)' : undefined,
          backdropFilter: 'blur(24px)',
        },
      }}
    />
  );
}

/** Écran d'attente pendant la restauration de session — le noir seul ressemble à un plantage. */
function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#09090b]">
      <img src="/assets/findy-logo.png" alt="Findy" className="h-12 w-auto opacity-90" />
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
    </div>
  );
}

function App() {
  const isMobile = useIsMobile();
  const {
    authUser,
    authReady,
    restoreSession,
    loadUsers,
    loadCategories,
    loadBudgets,
    loadDashboardOverview
  } = useAppStore();

  // Les comportements « application » (pas de rebond du document, pas de loupe
  // de sélection, pas de flash bleu au tap) suivent l'interface affichée et non
  // la plateforme : une fenêtre desktop rétrécie passe en mobile, et doit
  // retrouver la sélection de texte en s'élargissant.
  useEffect(() => {
    document.documentElement.classList.toggle('native-app', isMobile);
  }, [isMobile]);

  // Sur mobile natif, aucune requête n'a de sens tant que l'adresse du serveur
  // n'est pas connue : la restauration de session partirait dans le vide et
  // l'utilisateur ne verrait qu'un échec réseau sans explication.
  const [serverConfigured, setServerConfigured] = useState(() => !needsServerSetup());

  // Restaure la session au démarrage (avant tout chargement de données).
  useEffect(() => {
    if (!serverConfigured) return;
    restoreSession();
  }, [restoreSession, serverConfigured]);

  useEffect(() => {
    // Les données sont rattachées à l'utilisateur connecté : rien à charger tant
    // que personne n'est connecté.
    if (!authUser) return;

    console.log('Bonjour et bienvenue sur findy !');
    // Charger les données globales au démarrage.
    // NB: on ne précharge PAS les transactions ici — chaque page (Transactions,
    // Investissement) charge sa propre liste paginée. Un chargement global (limit 50)
    // ré-écrasait l'état paginé de la page Transactions et désynchronisait l'offset
    // du scroll infini (liste qui ne se complétait pas).
    const initializeApp = async () => {
      try {
        await loadUsers();
        await loadCategories();
        await loadBudgets();
        await loadDashboardOverview();
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, [authUser, loadUsers, loadCategories, loadBudgets, loadDashboardOverview]);

  if (!serverConfigured) {
    return (
      <div className="min-h-dvh bg-[#09090b]">
        <ErrorBoundary>
          <ServerSetup onConnected={() => setServerConfigured(true)} />
        </ErrorBoundary>
        <AppToaster mobile={isMobile} />
      </div>
    );
  }

  // Évite le flash de l'écran de connexion le temps de restaurer la session.
  if (!authReady) {
    return <Splash />;
  }

  if (!authUser) {
    return (
      <div className="min-h-dvh bg-[#09090b]">
        <ErrorBoundary>
          <Login />
        </ErrorBoundary>
        <AppToaster mobile={isMobile} />
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-dvh bg-[#09090b]">
        {isMobile ? (
          <ErrorBoundary>
            <MobileApp />
          </ErrorBoundary>
        ) : (
          <Layout>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/investissement" element={<Investissement />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/banks" element={<Banks />} />
                <Route path="/tricount/:userId" element={<Tricount />} />
                <Route path="/users" element={<Navigate to="/banks" replace />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </ErrorBoundary>
          </Layout>
        )}
        <ConfirmDialog />
        <AppToaster mobile={isMobile} />
      </div>
    </Router>
  );
}

export default App;
