-- CreateEnum
CREATE TYPE "PalmImageStatus" AS ENUM ('UPLOADED', 'PENDING_REVIEW', 'VALID', 'INVALID');

-- CreateTable
CREATE TABLE "palm_images" (
    "id" TEXT NOT NULL,
    "readingId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "PalmImageStatus" NOT NULL DEFAULT 'UPLOADED',
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "validationError" TEXT,
    "consentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "palm_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "palm_images_storageKey_key" ON "palm_images"("storageKey");

-- CreateIndex
CREATE INDEX "palm_images_readingId_idx" ON "palm_images"("readingId");

-- CreateIndex
CREATE INDEX "palm_images_expiresAt_deletedAt_idx" ON "palm_images"("expiresAt", "deletedAt");

-- AddForeignKey
ALTER TABLE "palm_images" ADD CONSTRAINT "palm_images_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "readings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
