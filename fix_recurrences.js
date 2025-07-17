const fs = require('fs');

// Lire le fichier
let content = fs.readFileSync('server/src/routes/recurrences.ts', 'utf8');

// Remplacer toutes les occurrences de la sélection de banque sans image par la version avec image
const oldBankSelect = `bank: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }`;

const newBankSelect = `bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true
          }
        }`;

content = content.replace(new RegExp(oldBankSelect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newBankSelect);

// Écrire le fichier modifié
fs.writeFileSync('server/src/routes/recurrences.ts', content);

console.log('Fichier recurrences.ts mis à jour avec succès !');
