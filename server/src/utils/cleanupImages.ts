import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Nettoie les images non utilisées du dossier uploads
 * Compare les fichiers présents dans le dossier uploads avec les références
 * dans la base de données (User.avatar et Bank.image)
 */
export async function cleanupUnusedImages() {
  const prisma = new PrismaClient();
  const uploadsDir = path.join(process.cwd(), 'public/uploads');
  
  try {
    // Vérifier si le dossier uploads existe
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      return;
    }
    
    // Récupérer toutes les références d'images de la base de données
    const users = await prisma.user.findMany({
      select: { avatar: true },
      where: { avatar: { not: null } }
    });
    
    const banks = await prisma.bank.findMany({
      select: { image: true },
      where: { image: { not: null } }
    });
    
    // Extraire les noms de fichiers des chemins stockés dans la base de données
    const usedImages = new Set<string>();
    
    // Fonction pour normaliser le chemin et extraire le nom du fichier
    const extractFilename = (imagePath: string): string => {
      // Enlever le préfixe '/uploads/' si présent
      let normalizedPath = imagePath;
      if (imagePath.startsWith('/uploads/')) {
        normalizedPath = imagePath.substring('/uploads/'.length);
      } else if (imagePath.startsWith('uploads/')) {
        normalizedPath = imagePath.substring('uploads/'.length);
      }
      
      return normalizedPath;
    };
    
    users.forEach(user => {
      if (user.avatar) {
        const filename = extractFilename(user.avatar);
        usedImages.add(filename);
      }
    });
    
    banks.forEach(bank => {
      if (bank.image) {
        const filename = extractFilename(bank.image);
        usedImages.add(filename);
      }
    });
    
    // Fonction récursive pour traiter les fichiers et dossiers
    function processDirectory(directory: string): number {
      let deletedCount = 0;
      const items = fs.readdirSync(directory);
      
      for (const item of items) {
        const itemPath = path.join(directory, item);
        const stats = fs.lstatSync(itemPath);
        
        // Si c'est un dossier, traiter récursivement
        if (stats.isDirectory()) {
          deletedCount += processDirectory(itemPath);
          continue;
        }
        
        // Ignorer les fichiers cachés
        if (item.startsWith('.')) {
          continue;
        }
        
        // Vérifier si le fichier est utilisé
        // On doit comparer le chemin relatif au dossier uploads
        const relativePath = path.relative(uploadsDir, itemPath);
        
        if (!usedImages.has(relativePath)) {
          // Supprimer le fichier
          fs.unlinkSync(itemPath);
          deletedCount++;
        }
      }
      
      return deletedCount;
    }
    
    // Lancer le traitement récursif
    const deletedCount = processDirectory(uploadsDir);
    
    console.log(`🗑️ ${deletedCount} images non utilisées supprimées.`);
  } catch (error) {
    console.error('Erreur lors du nettoyage des images:', error);
  } finally {
    await prisma.$disconnect();
  }
}
