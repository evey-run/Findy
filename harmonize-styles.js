/**
 * Script pour harmoniser les styles dans tous les composants
 * Ce script remplace les valeurs hardcodées par les variables de notre fichier de styles communs
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

// Fonction pour appliquer les transformations de style
function harmonizeStyles(filePath) {
  console.log(`Harmonizing styles in: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Ajouter l'import des styles communs s'il n'existe pas déjà
  if (!content.includes("import { colors, borderRadius, textSizes, spacing, commonClasses } from '../styles/commonStyles';")) {
    content = content.replace(
      /import {([^}]*)}/,
      (match) => `import {${match.slice(7, -1)}}\nimport { colors, borderRadius, textSizes, spacing, commonClasses } from '../styles/commonStyles';`
    );
  }
  
  // Remplacer les couleurs hardcodées
  const colorReplacements = [
    { from: /#202427/g, to: 'colors.background' },
    { from: /#272a2f/g, to: 'colors.cardBackground' },
    { from: /#1f2226/g, to: 'colors.inputBackground' },
    { from: /#6226fa/g, to: 'colors.primary' },
    { from: /#3a3d42/g, to: 'colors.border' },
    { from: /#616875/g, to: 'colors.borderDashed' },
  ];
  
  // Remplacer les border-radius
  const borderRadiusReplacements = [
    { from: /rounded-md/g, to: 'borderRadius.md' },
    { from: /rounded-lg/g, to: 'borderRadius.lg' },
    { from: /rounded-xl/g, to: 'borderRadius.xl' },
    { from: /rounded-2xl/g, to: 'borderRadius.xl' }, // Augmenter tous les border-radius
    { from: /rounded-full/g, to: 'borderRadius.full' },
  ];
  
  // Appliquer les remplacements de couleurs
  colorReplacements.forEach(({ from, to }) => {
    content = content.replace(
      new RegExp(`style={{([^}]*)(${from.source})([^}]*)}}`, 'g'),
      (match, before, color, after) => `style={{${before}${to}${after}}}`
    );
  });
  
  // Augmenter tous les border-radius
  content = content.replace(/rounded-lg/g, 'rounded-xl');
  content = content.replace(/rounded-md/g, 'rounded-lg');
  
  // Harmoniser les paddings des cartes
  content = content.replace(/p-4/g, 'p-6');
  content = content.replace(/p-5/g, 'p-6');
  
  // Harmoniser les tailles de texte
  content = content.replace(/text-xs/g, `${textSizes.xs}`);
  content = content.replace(/text-sm/g, `${textSizes.sm}`);
  content = content.replace(/text-base/g, `${textSizes.base}`);
  content = content.replace(/text-lg/g, `${textSizes.lg}`);
  content = content.replace(/text-xl/g, `${textSizes.xl}`);
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Harmonized styles in: ${filePath}`);
}

// Fonction principale
async function main() {
  const componentsDir = path.join(__dirname, 'src', 'components');
  const tsxFiles = await findTsxFiles(componentsDir);
  
  console.log(`Found ${tsxFiles.length} TSX files to harmonize`);
  
  for (const filePath of tsxFiles) {
    harmonizeStyles(filePath);
  }
  
  console.log('Style harmonization completed!');
}

// Exécuter la fonction principale
main().catch(error => {
  console.error('Error during style harmonization:', error);
  process.exit(1);
});
