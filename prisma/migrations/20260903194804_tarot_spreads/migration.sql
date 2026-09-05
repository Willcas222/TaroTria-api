-- CreateTable
CREATE TABLE "tarot_spreads" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarot_spreads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarot_spread_positions" (
    "id" TEXT NOT NULL,
    "spreadId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarot_spread_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarot_spreads_code_key" ON "tarot_spreads"("code");

-- CreateIndex
CREATE INDEX "tarot_spread_positions_spreadId_orderIndex_idx" ON "tarot_spread_positions"("spreadId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "tarot_spread_positions_spreadId_code_key" ON "tarot_spread_positions"("spreadId", "code");

-- AddForeignKey
ALTER TABLE "tarot_spread_positions" ADD CONSTRAINT "tarot_spread_positions_spreadId_fkey" FOREIGN KEY ("spreadId") REFERENCES "tarot_spreads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
