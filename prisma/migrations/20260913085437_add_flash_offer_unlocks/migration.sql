-- CreateTable
CREATE TABLE "flash_offer_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageCode" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flash_offer_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flash_offer_unlocks_userId_expiresAt_idx" ON "flash_offer_unlocks"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "flash_offer_unlocks" ADD CONSTRAINT "flash_offer_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
