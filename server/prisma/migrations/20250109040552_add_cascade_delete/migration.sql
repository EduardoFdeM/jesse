-- DropForeignKey
ALTER TABLE "GlossaryEntry" DROP CONSTRAINT "GlossaryEntry_knowledgeBaseId_fkey";

-- AddForeignKey
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
