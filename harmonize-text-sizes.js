/**
 * Script pour harmoniser les tailles de texte dans tous les composants
 * Ce script uniformise les tailles de texte dans toute l'application
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as globModule from 'glob';
const glob = globModule.glob;

// Obtenir le chemin du répertoire actuel en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fonction pour lire récursivement tous les fichiers .tsx dans le répertoire src/components
async function findTsxFiles(directory) {
  return new Promise((resolve, reject) => {
    glob(path.join(directory, '**/*.tsx'), (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });
}

// Fonction pour harmoniser les tailles de texte
function harmonizeTextSizes(filePath) {
  console.log(`Harmonizing text sizes in: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Remplacer les tailles de texte pour les uniformiser
  // Utiliser des tailles plus grandes pour une meilleure lisibilité
  const textSizeReplacements = [
    // Titres
    { from: /text-xl/g, to: 'text-2xl' },
    { from: /text-lg/g, to: 'text-xl' },
    
    // Texte normal
    { from: /text-xs/g, to: 'text-sm' },
    
    // Conserver text-sm et text-base tels quels
  ];
  
  // Appliquer les remplacements de tailles de texte
  textSizeReplacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });
  
  // Harmoniser les styles de police
  content = content.replace(/font-medium/g, 'font-semibold');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Harmonized text sizes in: ${filePath}`);
}

// Fonction principale
async function main() {
  const componentsDir = path.join(__dirname, 'src', 'components');
  const tsxFiles = await findTsxFiles(componentsDir);
  
  console.log(`Found ${tsxFiles.length} TSX files to harmonize text sizes`);
  
  for (const filePath of tsxFiles) {
    harmonizeTextSizes(filePath);
  }
  
  console.log('Text size harmonization completed!');
}

// Exécuter la fonction principale
main().catch(error => {
  console.error('Error during text size harmonization:', error);
  process.exit(1);
});
