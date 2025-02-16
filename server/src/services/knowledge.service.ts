import prisma from '../config/database.js';
import { BadRequestError } from '../utils/errors.js';
import { files, vectorStore } from '../config/openai.js';

// Interface para parâmetros
interface ProcessKnowledgeBaseParams {
    name: string;
    description: string;
    userId: string;
    files: Express.Multer.File[];
    existingFileIds?: string[];
}

// Funções principais
export const createKnowledgeBase = async (params: ProcessKnowledgeBaseParams) => {
    try {
        console.log('📝 Criando Vector Store:', params.name);
        const store = await vectorStore.create(`kb_${params.name}_${Date.now()}`);
        console.log('✅ Vector Store criada:', store.id);

        const uploadedFiles = [];

        // Processar arquivos existentes
        if (params.existingFileIds && params.existingFileIds.length > 0) {
            console.log('📎 Vinculando arquivos existentes:', params.existingFileIds);
            for (const fileId of params.existingFileIds) {
                try {
                    await vectorStore.files.add(store.id, fileId);
                    const fileInfo = await files.get(fileId);
                    uploadedFiles.push({
                        fileName: fileInfo.filename,
                        fileSize: fileInfo.bytes,
                        fileType: fileInfo.filename.split('.').pop() || 'unknown',
                        fileId: fileInfo.id
                    });
                } catch (err) {
                    const error = err as Error;
                    console.error(`❌ Erro ao vincular arquivo ${fileId}:`, error.message);
                    throw new BadRequestError(`Erro ao vincular arquivo: ${error.message}`);
                }
            }
        }

        // Processar novos arquivos
        if (params.files && params.files.length > 0) {
            console.log('📤 Enviando novos arquivos para OpenAI');
            for (const file of params.files) {
                try {
                    console.log('📤 Enviando arquivo:', file.originalname);
                    const fileData = await files.upload(file.buffer, file.originalname);
                    console.log('✅ Arquivo enviado:', fileData.id);

                    console.log('🔗 Vinculando arquivo à Vector Store:', store.id);
                    await vectorStore.files.add(store.id, fileData.id);

                    uploadedFiles.push({
                        fileName: file.originalname,
                        fileSize: file.size,
                        fileType: file.originalname.split('.').pop() || 'unknown',
                        fileId: fileData.id
                    });
                } catch (err) {
                    const error = err as Error;
                    console.error('❌ Erro ao processar arquivo:', error.message);
                    throw new BadRequestError(`Erro ao processar arquivo: ${error.message}`);
                }
            }
        }

        // Criar base de conhecimento no banco
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                name: params.name,
                description: params.description,
                userId: params.userId,
                vectorStoreId: store.id,
                fileName: uploadedFiles.map(f => f.fileName).join(', '),
                filePath: 'vector_store',
                fileSize: uploadedFiles.reduce((acc, f) => acc + f.fileSize, 0),
                fileType: uploadedFiles.map(f => f.fileType).join(', '),
                fileIds: uploadedFiles.map(f => f.fileId)
            }
        });

        return knowledgeBase;
    } catch (err) {
        const error = err as Error;
        console.error('❌ Erro ao processar base de conhecimento:', error.message);
        throw new BadRequestError(`Falha ao processar base de conhecimento: ${error.message}`);
    }
};

// Função para deletar base de conhecimento
export const deleteKnowledgeBase = async (id: string): Promise<boolean> => {
    try {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id }
        });

        if (!knowledgeBase) {
            throw new BadRequestError('Base de conhecimento não encontrada');
        }

        // Deletar Vector Store
        if (knowledgeBase.vectorStoreId) {
            await vectorStore.delete(knowledgeBase.vectorStoreId);
        }

        // Deletar do banco
        await prisma.knowledgeBase.delete({
            where: { id }
        });

        return true;
    } catch (err) {
        const error = err as Error;
        console.error('❌ Erro ao deletar base de conhecimento:', error.message);
        throw new BadRequestError(`Erro ao deletar base de conhecimento: ${error.message}`);
    }
};

// Função para listar arquivos de uma base de conhecimento
export const listKnowledgeBaseFiles = async (id: string) => {
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id }
    });

    if (!knowledgeBase?.vectorStoreId) {
        throw new BadRequestError('Base de conhecimento não encontrada');
    }

    return vectorStore.files.list(knowledgeBase.vectorStoreId);
};