-- Compter ou non un compte dans le reste à vivre.
-- Nullable et sans valeur par défaut : `NULL` signifie « déduis-le du type de
-- compte », ce qui préserve le comportement des comptes existants.
ALTER TABLE "banks" ADD COLUMN "spendable" BOOLEAN;
