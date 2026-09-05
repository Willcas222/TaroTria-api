-- CreateEnum
CREATE TYPE "ArcanaType" AS ENUM ('MAJOR', 'MINOR');

-- CreateEnum
CREATE TYPE "MinorSuit" AS ENUM ('WANDS', 'CUPS', 'SWORDS', 'PENTACLES');

-- CreateTable
CREATE TABLE "tarot_decks" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarot_decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarot_cards" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "arcana" "ArcanaType" NOT NULL,
    "suit" "MinorSuit",
    "numberInSuit" INTEGER,
    "orderIndex" INTEGER NOT NULL,
    "uprightMeaning" TEXT NOT NULL,
    "reversedMeaning" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarot_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarot_decks_code_key" ON "tarot_decks"("code");

-- CreateIndex
CREATE INDEX "tarot_cards_deckId_orderIndex_idx" ON "tarot_cards"("deckId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "tarot_cards_deckId_code_key" ON "tarot_cards"("deckId", "code");

-- AddForeignKey
ALTER TABLE "tarot_cards" ADD CONSTRAINT "tarot_cards_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "tarot_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
