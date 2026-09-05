-- AlterTable
ALTER TABLE "readings" ADD COLUMN     "promptVersionId" TEXT;

-- AddForeignKey
ALTER TABLE "readings" ADD CONSTRAINT "readings_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
