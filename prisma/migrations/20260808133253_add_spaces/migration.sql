-- CreateTable
CREATE TABLE "spaces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PERSONAL',
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "space_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "space_members_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "space_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "spaceId" TEXT,
    CONSTRAINT "banks_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_banks" ("accountType", "archived", "archivedAt", "balance", "color", "createdAt", "ebAccountUid", "ebAspspCountry", "ebAspspName", "ebExpiresAt", "ebLastSyncAt", "ebLinkedAt", "ebSessionId", "ebState", "ebStatus", "iban", "id", "image", "name", "shortName", "updatedAt") SELECT "accountType", "archived", "archivedAt", "balance", "color", "createdAt", "ebAccountUid", "ebAspspCountry", "ebAspspName", "ebExpiresAt", "ebLastSyncAt", "ebLinkedAt", "ebSessionId", "ebState", "ebStatus", "iban", "id", "image", "name", "shortName", "updatedAt" FROM "banks";
DROP TABLE "banks";
ALTER TABLE "new_banks" RENAME TO "banks";
CREATE TABLE "new_budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "bankId" TEXT,
    "categoryId" TEXT NOT NULL,
    "spaceId" TEXT,
    CONSTRAINT "budgets_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budgets_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_budgets" ("amount", "bankId", "categoryId", "createdAt", "id", "period", "shared", "startDate", "updatedAt") SELECT "amount", "bankId", "categoryId", "createdAt", "id", "period", "shared", "startDate", "updatedAt" FROM "budgets";
DROP TABLE "budgets";
ALTER TABLE "new_budgets" RENAME TO "budgets";
CREATE TABLE "new_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "icon" TEXT,
    "spaceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "categories_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_categories" ("color", "createdAt", "icon", "id", "name", "type", "updatedAt") SELECT "color", "createdAt", "icon", "id", "name", "type", "updatedAt" FROM "categories";
DROP TABLE "categories";
ALTER TABLE "new_categories" RENAME TO "categories";
CREATE TABLE "new_objectives" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetAmount" REAL NOT NULL,
    "deadline" DATETIME,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "spaceId" TEXT,
    CONSTRAINT "objectives_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_objectives" ("archived", "createdAt", "deadline", "description", "id", "isCompleted", "targetAmount", "title", "updatedAt") SELECT "archived", "createdAt", "deadline", "description", "id", "isCompleted", "targetAmount", "title", "updatedAt" FROM "objectives";
DROP TABLE "objectives";
ALTER TABLE "new_objectives" RENAME TO "objectives";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "space_members_spaceId_userId_key" ON "space_members"("spaceId", "userId");
