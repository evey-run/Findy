-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_banks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "image" TEXT,
    "iban" TEXT,
    "balance" REAL NOT NULL DEFAULT 0,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_banks" ("balance", "color", "createdAt", "iban", "id", "image", "isShared", "name", "shortName", "updatedAt") SELECT "balance", "color", "createdAt", "iban", "id", "image", "isShared", "name", "shortName", "updatedAt" FROM "banks";
DROP TABLE "banks";
ALTER TABLE "new_banks" RENAME TO "banks";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
