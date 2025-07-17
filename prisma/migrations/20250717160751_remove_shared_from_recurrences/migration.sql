/*
  Warnings:

  - You are about to drop the column `shared` on the `recurrences` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_recurrences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "nextDue" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "bankId" TEXT,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "recurrences_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recurrences_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_recurrences" ("active", "amount", "bankId", "categoryId", "createdAt", "description", "frequency", "id", "nextDue", "updatedAt") SELECT "active", "amount", "bankId", "categoryId", "createdAt", "description", "frequency", "id", "nextDue", "updatedAt" FROM "recurrences";
DROP TABLE "recurrences";
ALTER TABLE "new_recurrences" RENAME TO "recurrences";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
