/*
  Warnings:

  - Added the required column `userId` to the `banks` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "avatar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Insert default users
INSERT INTO "users" ("id", "name", "email", "createdAt", "updatedAt") VALUES
    ('user1', 'Utilisateur 1', 'user1@example.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('user2', 'Utilisateur 2', 'user2@example.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "banks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Insert banks with default user assignment (distribute banks between users)
INSERT INTO "new_banks" ("balance", "color", "createdAt", "iban", "id", "name", "shortName", "updatedAt", "userId") 
SELECT "balance", "color", "createdAt", "iban", "id", "name", "shortName", "updatedAt", 
       CASE 
           WHEN ROW_NUMBER() OVER (ORDER BY "id") % 2 = 1 THEN 'user1'
           ELSE 'user2'
       END as "userId"
FROM "banks";

DROP TABLE "banks";
ALTER TABLE "new_banks" RENAME TO "banks";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
