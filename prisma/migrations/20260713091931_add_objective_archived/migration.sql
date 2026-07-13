-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_objectives" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetAmount" REAL NOT NULL,
    "deadline" DATETIME,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_objectives" ("createdAt", "deadline", "description", "id", "isCompleted", "targetAmount", "title", "updatedAt") SELECT "createdAt", "deadline", "description", "id", "isCompleted", "targetAmount", "title", "updatedAt" FROM "objectives";
DROP TABLE "objectives";
ALTER TABLE "new_objectives" RENAME TO "objectives";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
