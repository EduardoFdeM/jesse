import fs from 'fs';
import path from 'path';
import prisma from '../config/database.js';
import { KnowledgeBase } from '@prisma/client';
import { uploadToS3 } from '../config/storage.js';

interface CreateKnowledgeBaseParams {
    name: string;
    description: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
}

export const processKnowledgeBaseFile = async (filePath: string, params: CreateKnowledgeBaseParams): Promise<KnowledgeBase> => {
    console.log('🔄 [1/5] Iniciando processamento do arquivo:', filePath);

    try {
        // Validar arquivo
        if (!fs.existsSync(filePath)) {
            throw new Error('Arquivo temporário não encontrado');
        }

        // Ler o arquivo
        console.log('📖 [2/5] Lendo arquivo');
        const fileContent = await fs.promises.readFile(filePath);
        const fileName = `kb_${Date.now()}_${path.basename(filePath)}`;
        const fileSize = fileContent.length;
        const fileType = path.extname(filePath).slice(1);

        // Validar tipo de arquivo
        const allowedTypes = ['txt', 'csv', 'xlsx', 'xls'];
        if (!allowedTypes.includes(fileType.toLowerCase())) {
            throw new Error(`Tipo de arquivo não suportado. Tipos permitidos: ${allowedTypes.join(', ')}`);
        }

        // Fazer upload para o Spaces
        console.log('☁️ [3/5] Enviando para o Spaces');
        const spacesUrl = await uploadToS3(fileContent, fileName, 'knowledge');
        console.log('✅ [4/5] Upload concluído:', spacesUrl);

        // Criar a base de conhecimento no banco
        console.log('💾 [5/5] Salvando no banco de dados');
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                ...params,
                fileName,
                filePath: spacesUrl,
                fileType,
                fileSize
            }
        });

        // Limpar arquivo temporário
        await fs.promises.unlink(filePath);
        console.log('🧹 Arquivo temporário removido');

        return knowledgeBase;
    } catch (error) {
        console.error('❌ Erro ao processar arquivo da base de conhecimento:', error);
        
        // Limpar arquivo temporário em caso de erro
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                console.log('🧹 Arquivo temporário removido após erro');
            }
        } catch (cleanupError) {
            console.error('⚠️ Erro ao limpar arquivo temporário:', cleanupError);
        }
        
        throw error;
    }
};