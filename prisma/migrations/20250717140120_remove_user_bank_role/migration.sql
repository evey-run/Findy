/*
  Warnings:

  - You are about to drop the column `role` on the `user_banks` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_banks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    CONSTRAINT "user_banks_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_banks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_banks" ("bankId", "id", "userId") SELECT "bankId", "id", "userId" FROM "user_banks";
DROP TABLE "user_banks";
ALTER TABLE "new_user_banks" RENAME TO "user_banks";
CREATE UNIQUE INDEX "user_banks_userId_bankId_key" ON "user_banks"("userId", "bankId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
