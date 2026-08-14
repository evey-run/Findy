-- DropIndex
DROP INDEX "user_banks_userId_bankId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "user_banks";
PRAGMA foreign_keys=on;

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
    "accountType" TEXT NOT NULL DEFAULT 'CURRENT',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ebAspspName" TEXT,
    "ebAspspCountry" TEXT,
    "ebState" TEXT,
    "ebSessionId" TEXT,
    "ebAccountUid" TEXT,
    "ebStatus" TEXT,
    "ebLinkedAt" DATETIME,
    "ebExpiresAt" DATETIME,
    "ebLastSyncAt" DATETIME,
    "spaceId" TEXT NOT NULL,
    CONSTRAINT "banks_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_banks" ("accountType", "archived", "archivedAt", "balance", "color", "createdAt", "ebAccountUid", "ebAspspCountry", "ebAspspName", "ebExpiresAt", "ebLastSyncAt", "ebLinkedAt", "ebSessionId", "ebState", "ebStatus", "iban", "id", "image", "name", "shortName", "spaceId", "updatedAt") SELECT "accountType", "archived", "archivedAt", "balance", "color", "createdAt", "ebAccountUid", "ebAspspCountry", "ebAspspName", "ebExpiresAt", "ebLastSyncAt", "ebLinkedAt", "ebSessionId", "ebState", "ebStatus", "iban", "id", "image", "name", "shortName", "spaceId", "updatedAt" FROM "banks";
DROP TABLE "banks";
ALTER TABLE "new_banks" RENAME TO "banks";
CREATE TABLE "new_budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "bankId" TEXT,
    "categoryId" TEXT NOT NULL,
    "spaceId" TEXT,
    CONSTRAINT "budgets_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budgets_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_budgets" ("amount", "bankId", "categoryId", "createdAt", "id", "period", "spaceId", "startDate", "updatedAt") SELECT "amount", "bankId", "categoryId", "createdAt", "id", "period", "spaceId", "startDate", "updatedAt" FROM "budgets";
DROP TABLE "budgets";
ALTER TABLE "new_budgets" RENAME TO "budgets";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

