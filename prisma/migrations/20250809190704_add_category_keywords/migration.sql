-- CreateTable
CREATE TABLE "category_keywords" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "category_keywords_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "category_keywords_categoryId_value_key" ON "category_keywords"("categoryId", "value");
