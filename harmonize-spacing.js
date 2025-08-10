/**
 * Script pour harmoniser les marges et paddings dans tous les composants
 * Ce script uniformise les espacements dans toute l'application
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

// Fonction pour harmoniser les marges et paddings
function harmonizeSpacing(filePath) {
  console.log(`Harmonizing spacing in: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Remplacer les paddings pour les uniformiser
  const paddingReplacements = [
    { from: /p-2/g, to: 'p-4' },
    { from: /p-3/g, to: 'p-4' },
    { from: /p-4/g, to: 'p-6' },
    { from: /p-5/g, to: 'p-6' },
    { from: /px-2/g, to: 'px-4' },
    { from: /px-3/g, to: 'px-4' },
    { from: /py-2/g, to: 'py-3' },
    { from: /py-1/g, to: 'py-2' },
  ];
  
  // Remplacer les marges pour les uniformiser
  const marginReplacements = [
    { from: /mt-2/g, to: 'mt-4' },
    { from: /mt-3/g, to: 'mt-4' },
    { from: /mb-2/g, to: 'mb-4' },
    { from: /mb-3/g, to: 'mb-4' },
    { from: /my-2/g, to: 'my-4' },
    { from: /my-3/g, to: 'my-4' },
  ];
  
  // Appliquer les remplacements de padding
  paddingReplacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });
  
  // Appliquer les remplacements de margin
  marginReplacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });
  
  // Harmoniser les espacements dans les grilles
  content = content.replace(/gap-2/g, 'gap-4');
  content = content.replace(/gap-3/g, 'gap-4');
  content = content.replace(/space-x-2/g, 'space-x-4');
  content = content.replace(/space-x-3/g, 'space-x-4');
  content = content.replace(/space-y-2/g, 'space-y-4');
  content = content.replace(/space-y-3/g, 'space-y-4');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Harmonized spacing in: ${filePath}`);
}

// Fonction principale
async function main() {
  const componentsDir = path.join(__dirname, 'src', 'components');
  const tsxFiles = await findTsxFiles(componentsDir);
  
  console.log(`Found ${tsxFiles.length} TSX files to harmonize spacing`);
  
  for (const filePath of tsxFiles) {
    harmonizeSpacing(filePath);
  }
  
  console.log('Spacing harmonization completed!');
}

// Exécuter la fonction principale
main().catch(error => {
  console.error('Error during spacing harmonization:', error);
  process.exit(1);
});
