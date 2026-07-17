-- AlterTable
ALTER TABLE "banks" ADD COLUMN "ebLastSyncAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "unitPrice" REAL,
    "quantity" REAL,
    "ticker" TEXT,
    "assetType" TEXT,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOOK',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "bankId" TEXT NOT NULL,
    "categoryId" TEXT,
    CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_transactions" ("amount", "assetType", "bankId", "categoryId", "checked", "createdAt", "date", "description", "externalId", "id", "quantity", "ticker", "unitPrice", "updatedAt") SELECT "amount", "assetType", "bankId", "categoryId", "checked", "createdAt", "date", "description", "externalId", "id", "quantity", "ticker", "unitPrice", "updatedAt" FROM "transactions";
DROP TABLE "transactions";
ALTER TABLE "new_transactions" RENAME TO "transactions";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
