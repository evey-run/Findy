-- Logotype officiel de la banque, récupéré une fois via Enable Banking puis
-- servi depuis `uploads/` : l'affichage ne dépend d'aucun serveur tiers.
ALTER TABLE "banks" ADD COLUMN "brandLogo" TEXT;
