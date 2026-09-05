-- CreateEnum
CREATE TYPE "ReadingStatus" AS ENUM ('DRAFT', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CardOrientation" AS ENUM ('UPRIGHT', 'REVERSED');

-- CreateTable
CREATE TABLE "readings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "spreadId" TEXT,
    "status" "ReadingStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_inputs" (
    "id" TEXT NOT NULL,
    "readingId" TEXT NOT NULL,
    "formVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarot_draws" (
    "id" TEXT NOT NULL,
    "readingId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "orientation" "CardOrientation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarot_draws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "readings_userId_status_idx" ON "readings"("userId", "status");

-- CreateIndex
CREATE INDEX "readings_status_createdAt_idx" ON "readings"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reading_inputs_readingId_key" ON "reading_inputs"("readingId");

-- CreateIndex
CREATE INDEX "tarot_draws_readingId_idx" ON "tarot_draws"("readingId");

-- CreateIndex
CREATE UNIQUE INDEX "tarot_draws_readingId_position_key" ON "tarot_draws"("readingId", "position");

-- AddForeignKey
ALTER TABLE "readings" ADD CONSTRAINT "readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readings" ADD CONSTRAINT "readings_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readings" ADD CONSTRAINT "readings_spreadId_fkey" FOREIGN KEY ("spreadId") REFERENCES "tarot_spreads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_inputs" ADD CONSTRAINT "reading_inputs_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "readings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarot_draws" ADD CONSTRAINT "tarot_draws_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "readings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarot_draws" ADD CONSTRAINT "tarot_draws_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "tarot_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
