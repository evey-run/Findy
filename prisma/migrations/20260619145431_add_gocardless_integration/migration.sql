-- AlterTable
ALTER TABLE "banks" ADD COLUMN "goCardlessAccountId" TEXT;
ALTER TABLE "banks" ADD COLUMN "goCardlessExpiresAt" DATETIME;
ALTER TABLE "banks" ADD COLUMN "goCardlessLinkedAt" DATETIME;
ALTER TABLE "banks" ADD COLUMN "goCardlessRequisitionId" TEXT;
ALTER TABLE "banks" ADD COLUMN "goCardlessStatus" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "externalId" TEXT;
