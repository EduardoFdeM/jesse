/*
  Warnings:

  - Added the required column `updatedAt` to the `GlossaryEntry` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `embedding` on the `GlossaryEntry` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `filePath` to the `KnowledgeBase` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GlossaryEntry" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "embedding",
ADD COLUMN     "embedding" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "KnowledgeBase" ADD COLUMN     "filePath" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "errorMessage" TEXT,
ALTER COLUMN "status" SET DEFAULT 'pending';
