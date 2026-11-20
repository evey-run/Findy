import { Routes, Route, Navigate } from 'react-router-dom';
import TabBar from './components/TabBar';
import Home from './screens/Home';
import TransactionsScreen from './screens/TransactionsScreen';
import StatsScreen from './screens/StatsScreen';
import WalletScreen from './screens/WalletScreen';
import MoreScreen from './screens/MoreScreen';
import GoalsScreen from './screens/GoalsScreen';
import CategoriesScreen from './screens/CategoriesScreen';
import InvestmentsScreen from './screens/InvestmentsScreen';
import SettingsScreen from './screens/SettingsScreen';
import TricountScreen from './screens/TricountScreen';
import ServerScreen from './screens/ServerScreen';

/**
 * Application mobile.
 *
 * Les écrans ne sont pas les composants desktop rendus plus étroits : ceux-ci
 * sont bâtis sur une grille à hauteur fixe de douze colonnes, avec des tableaux
 * et des actions au survol qui n'ont pas d'équivalent tactile. Ils partagent en
 * revanche exactement le même magasin de données — un écran mobile n'est
 * qu'une autre lecture des mêmes états et des mêmes actions.
 *
 * Les chemins sont identiques à ceux du desktop : passer d'une fenêtre étroite
 * à une fenêtre large conserve l'écran courant, et un lien partagé mène au même
 * endroit sur les deux interfaces.
 */
export default function MobileApp() {
  return (
    <div className="min-h-dvh bg-[#09090b]">
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Home />} />
        <Route path="/transactions" element={<TransactionsScreen />} />
        <Route path="/stats" element={<StatsScreen />} />
        <Route path="/banks" element={<WalletScreen />} />
        <Route path="/more" element={<MoreScreen />} />

        <Route path="/budgets" element={<GoalsScreen />} />
        <Route path="/categories" element={<CategoriesScreen />} />
        <Route path="/investissement" element={<InvestmentsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/tricount/:userId" element={<TricountScreen />} />
        <Route path="/server" element={<ServerScreen />} />

        {/* Les routes desktop absentes ici ne doivent pas donner un écran vide. */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      <TabBar />
    </div>
  );
}
