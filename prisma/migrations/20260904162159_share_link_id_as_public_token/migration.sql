/*
  Warnings:

  - You are about to drop the column `tokenHash` on the `share_links` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "share_links_tokenHash_key";

-- AlterTable
ALTER TABLE "share_links" DROP COLUMN "tokenHash";
