/*
  Warnings:

  - You are about to drop the column `originalName` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `originalSize` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `progress` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `translatedSize` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the `GlossaryEntry` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `fileName` to the `KnowledgeBase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileSize` to the `KnowledgeBase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileType` to the `KnowledgeBase` table without a default value. This is not possible if the table is not empty.
  - Made the column `filePath` on table `KnowledgeBase` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `filePath` to the `Translation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileSize` to the `Translation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileType` to the `Translation` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "GlossaryEntry" DROP CONSTRAINT "GlossaryEntry_knowledgeBaseId_fkey";

-- AlterTable
ALTER TABLE "KnowledgeBase" ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "fileSize" INTEGER NOT NULL,
ADD COLUMN     "fileType" TEXT NOT NULL,
ALTER COLUMN "filePath" SET NOT NULL;

-- AlterTable
ALTER TABLE "Translation" DROP COLUMN "originalName",
DROP COLUMN "originalSize",
DROP COLUMN "progress",
DROP COLUMN "translatedSize",
ADD COLUMN     "filePath" TEXT NOT NULL,
ADD COLUMN     "fileSize" INTEGER NOT NULL,
ADD COLUMN     "fileType" TEXT NOT NULL;

-- DropTable
DROP TABLE "GlossaryEntry";
