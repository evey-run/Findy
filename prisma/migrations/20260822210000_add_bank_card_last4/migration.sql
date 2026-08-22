-- Quatre derniers chiffres de la carte, affichés sur la tuile du portefeuille.
-- Volontairement pas le numéro complet : il n'est jamais utilisé, et cette base
-- est exportée telle quelle dans les sauvegardes.
ALTER TABLE "banks" ADD COLUMN "cardLast4" TEXT;
