/*
  Warnings:

  - You are about to drop the column `userId` on the `banks` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "user_banks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    CONSTRAINT "user_banks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_banks_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Migrate existing user-bank relationships
INSERT INTO "user_banks" ("id", "userId", "bankId", "role")
SELECT 
    'ub_' || "id" as "id",
    "userId",
    "id" as "bankId",
    'OWNER' as "role"
FROM "banks";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_banks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "iban" TEXT,
    "balance" REAL NOT NULL DEFAULT 0,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_banks" ("balance", "color", "createdAt", "iban", "id", "name", "shortName", "updatedAt") SELECT "balance", "color", "createdAt", "iban", "id", "name", "shortName", "updatedAt" FROM "banks";
DROP TABLE "banks";
ALTER TABLE "new_banks" RENAME TO "banks";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "user_banks_userId_bankId_key" ON "user_banks"("userId", "bankId");
