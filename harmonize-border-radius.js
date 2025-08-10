/**
 * Script pour harmoniser les border-radius dans tous les composants
 * Ce script augmente et uniformise les border-radius dans toute l'application
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

// Fonction pour harmoniser les border-radius
function harmonizeBorderRadius(filePath) {
  console.log(`Harmonizing border-radius in: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Remplacer les border-radius pour les augmenter
  const borderRadiusReplacements = [
    { from: /rounded-md/g, to: 'rounded-lg' },
    { from: /rounded-lg/g, to: 'rounded-xl' },
    { from: /rounded-xl/g, to: 'rounded-2xl' },
    { from: /rounded-2xl/g, to: 'rounded-2xl' }, // Garder les plus grands tels quels
  ];
  
  // Appliquer les remplacements de border-radius
  borderRadiusReplacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
  });
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Harmonized border-radius in: ${filePath}`);
}

// Fonction principale
async function main() {
  const componentsDir = path.join(__dirname, 'src', 'components');
  const tsxFiles = await findTsxFiles(componentsDir);
  
  console.log(`Found ${tsxFiles.length} TSX files to harmonize border-radius`);
  
  for (const filePath of tsxFiles) {
    harmonizeBorderRadius(filePath);
  }
  
  console.log('Border-radius harmonization completed!');
}

// Exécuter la fonction principale
main().catch(error => {
  console.error('Error during border-radius harmonization:', error);
  process.exit(1);
});
