-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('DAILY_CARD_UNLOCK', 'TAROT_READING_UNLOCK', 'FLASH_OFFER_UNLOCK');

-- CreateEnum
CREATE TYPE "RewardSessionStatus" AS ENUM ('CREATED', 'STARTED', 'COMPLETED', 'EXPIRED', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "reward_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "RewardSessionStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardSessionId" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "rewardAmount" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reward_sessions_idempotencyKey_key" ON "reward_sessions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "reward_sessions_userId_rewardType_status_idx" ON "reward_sessions"("userId", "rewardType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reward_transactions_rewardSessionId_key" ON "reward_transactions"("rewardSessionId");

-- CreateIndex
CREATE INDEX "reward_transactions_userId_rewardType_idx" ON "reward_transactions"("userId", "rewardType");

-- CreateIndex
CREATE UNIQUE INDEX "reward_progress_userId_rewardType_key" ON "reward_progress"("userId", "rewardType");

-- AddForeignKey
ALTER TABLE "reward_sessions" ADD CONSTRAINT "reward_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_transactions" ADD CONSTRAINT "reward_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_transactions" ADD CONSTRAINT "reward_transactions_rewardSessionId_fkey" FOREIGN KEY ("rewardSessionId") REFERENCES "reward_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_progress" ADD CONSTRAINT "reward_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
