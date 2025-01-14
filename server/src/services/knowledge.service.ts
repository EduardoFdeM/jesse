import fs from 'fs';
import path from 'path';
import prisma from '../config/database.js';
import { KnowledgeBase } from '@prisma/client';

interface CreateKnowledgeBaseParams {
    name: string;
    description: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
}

export const processKnowledgeBaseFile = async (filePath: string, params: CreateKnowledgeBaseParams): Promise<KnowledgeBase> => {
    console.log('🔄 Processando arquivo da base de conhecimento:', filePath);

    try {
        // Obter informações do arquivo
        const stats = fs.statSync(filePath);
        const fileType = path.extname(filePath).slice(1);
        const fileName = path.basename(filePath);

        // Criar a base de conhecimento no banco de dados
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                ...params,
                fileName,
                filePath,
                fileType,
                fileSize: stats.size
            }
        });

        return knowledgeBase;
    } catch (error) {
        console.error('❌ Erro ao processar arquivo da base de conhecimento:', error);
        // Se houver erro, tentar limpar o arquivo
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (unlinkError) {
                console.error('⚠️ Erro ao limpar arquivo após falha:', unlinkError);
            }
        }
        throw error;
    }
}; 