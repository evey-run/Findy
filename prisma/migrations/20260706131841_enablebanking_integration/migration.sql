/*
  Warnings:

  - You are about to drop the column `goCardlessAccountId` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `goCardlessExpiresAt` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `goCardlessLinkedAt` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `goCardlessRequisitionId` on the `banks` table. All the data in the column will be lost.
  - You are about to drop the column `goCardlessStatus` on the `banks` table. All the data in the column will be lost.

*/
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
    "ebExpiresAt" DATETIME
);
INSERT INTO "new_banks" ("accountType", "archived", "archivedAt", "balance", "color", "createdAt", "iban", "id", "image", "name", "shortName", "updatedAt") SELECT "accountType", "archived", "archivedAt", "balance", "color", "createdAt", "iban", "id", "image", "name", "shortName", "updatedAt" FROM "banks";
DROP TABLE "banks";
ALTER TABLE "new_banks" RENAME TO "banks";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
