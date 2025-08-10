import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtenir le chemin du répertoire actuel
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin vers le fichier Dashboard.tsx
const dashboardPath = path.join(__dirname, 'src', 'components', 'Dashboard.tsx');

// Lire le contenu du fichier
let content = fs.readFileSync(dashboardPath, 'utf8');

// Remplacer toutes les occurrences de transactions par allTransactions dans les calculs
// Mais pas dans les déclarations ou imports
const newContent = content.replace(/(?<!\s*const\s*{\s*[^}]*?|\s*import\s*{\s*[^}]*?)transactions(?![^{]*?\})/g, 'allTransactions');

// Écrire le contenu modifié dans le fichier
fs.writeFileSync(dashboardPath, newContent, 'utf8');

console.log('Dashboard.tsx a été mis à jour pour utiliser allTransactions au lieu de transactions.');
