import prisma from '../config/database.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { files as openaiFiles, vectorStore } from '../config/openai.js';

interface FileMetadata {
    lastUpdated: Date;
    language: string;
    category?: string;
    tags?: string[];
}

interface KnowledgeBaseFile {
    id: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    metadata: FileMetadata;
}

interface ProcessKnowledgeBaseParams {
    name: string;
    description: string;
    userId: string;
    files: Express.Multer.File[];
    existingFileIds?: string[];
}

const MAX_FILES_PER_STORE = 10;

export class KnowledgeService {
    private detectLanguage(fileName: string): string {
        // Padrões comuns em nomes de arquivos que indicam idioma
        const languagePatterns = {
            pt: /(pt|pt-br|port|portuguese|portugues)/i,
            en: /(en|eng|english|ingles)/i,
            es: /(es|esp|spanish|espanol)/i,
            // ... outros idiomas ...
        };

        const fileName_lower = fileName.toLowerCase();
        
        for (const [lang, pattern] of Object.entries(languagePatterns)) {
            if (pattern.test(fileName_lower)) {
                return lang;
            }
        }

        return 'auto';
    }

    async createKnowledgeBase(params: ProcessKnowledgeBaseParams) {
        let createdStore;
        try {
            // Validar limite de arquivos
            if ((params.files?.length || 0) + (params.existingFileIds?.length || 0) > MAX_FILES_PER_STORE) {
                throw new BadRequestError(`Limite máximo de ${MAX_FILES_PER_STORE} arquivos por base de conhecimento`);
            }

            // Criar Vector Store na OpenAI
            createdStore = await vectorStore.create(params.name);
            const uploadedFiles: KnowledgeBaseFile[] = [];

            // Função auxiliar para aguardar o processamento do arquivo
            const waitForFileProcessing = async (fileId: string) => {
                let attempts = 0;
                const maxAttempts = 5;
                
                while (attempts < maxAttempts) {
                    try {
                        const fileInfo = await openaiFiles.get(fileId);
                        if (fileInfo.status === 'processed') {
                            return fileInfo;
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
                        attempts++;
                    } catch (error) {
                        console.error(`Tentativa ${attempts + 1} falhou:`, error);
                        if (attempts === maxAttempts - 1) throw error;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                throw new Error('Timeout ao aguardar processamento do arquivo');
            };

            // Processar arquivos existentes
            if (params.existingFileIds?.length) {
                for (const fileId of params.existingFileIds) {
                    try {
                        const fileInfo = await openaiFiles.get(fileId);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await vectorStore.files.add(createdStore.id, fileId);
                        uploadedFiles.push({
                            id: fileId,
                            fileName: fileInfo.filename,
                            fileSize: fileInfo.bytes,
                            fileType: fileInfo.filename.split('.').pop() || 'unknown',
                            metadata: {
                                lastUpdated: new Date(),
                                language: this.detectLanguage(fileInfo.filename)
                            }
                        });
                    } catch (error: unknown) {
                        console.error(`Erro ao processar arquivo existente ${fileId}:`, error);
                        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
                        throw new Error(`Erro ao processar arquivo existente: ${errorMessage}`);
                    }
                }
            }

            // Processar novos arquivos
            if (params.files?.length) {
                for (const file of params.files) {
                    try {
                        const fileData = await openaiFiles.upload(file.buffer, file.originalname);
                        await waitForFileProcessing(fileData.id);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await vectorStore.files.add(createdStore.id, fileData.id);
                        uploadedFiles.push({
                            id: fileData.id,
                            fileName: file.originalname,
                            fileSize: file.size,
                            fileType: file.originalname.split('.').pop() || 'unknown',
                            metadata: {
                                lastUpdated: new Date(),
                                language: this.detectLanguage(file.originalname)
                            }
                        });
                    } catch (error: unknown) {
                        console.error(`Erro ao processar novo arquivo ${file.originalname}:`, error);
                        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
                        throw new Error(`Erro ao processar novo arquivo: ${errorMessage}`);
                    }
                }
            }

            // Criar registro no banco
            const knowledgeBase = await prisma.knowledgeBase.create({
                data: {
                    name: params.name,
                    description: params.description,
                    userId: params.userId,
                    vectorStoreId: createdStore.id,
                    fileIds: uploadedFiles.map(f => f.id),
                    fileMetadata: JSON.stringify(uploadedFiles.map(f => f.metadata)),
                    fileName: uploadedFiles.map(f => f.fileName).join(', '),
                    filePath: 'vector_store',
                    fileSize: uploadedFiles.reduce((acc, file) => acc + file.fileSize, 0),
                    fileType: uploadedFiles.map(f => f.fileType).join(', ')
                }
            });

            return knowledgeBase;
        } catch (error) {
            if (createdStore?.id) {
                try {
                    await vectorStore.delete(createdStore.id);
                } catch (deleteError) {
                    console.error('Erro ao limpar Vector Store após falha:', deleteError);
                }
            }
            throw error;
        }
    }

    async updateKnowledgeBase(params: {
        id: string;
        name: string;
        description: string;
        userId: string;
        files?: Express.Multer.File[];
        existingFileIds?: string[];
    }) {
        const { id, name, description, userId, files = [], existingFileIds = [] } = params;

        // Verificar se existe e pertence ao usuário
        const existingBase = await prisma.knowledgeBase.findFirst({
            where: { id, userId }
        });

        if (!existingBase) {
            throw new NotFoundError('Base de conhecimento não encontrada');
        }

        if (!existingBase.vectorStoreId) {
            throw new BadRequestError('Base de conhecimento não possui uma Vector Store associada');
        }

        try {
            // 1. Listar arquivos atuais da Vector Store existente
            const currentFiles = await vectorStore.files.list(existingBase.vectorStoreId);
            const currentFileIds = currentFiles.data.map(f => f.id);

            // 2. Determinar alterações
            const filesToRemove = currentFileIds.filter(fileId => !existingFileIds.includes(fileId));
            const filesToAdd = existingFileIds.filter(fileId => !currentFileIds.includes(fileId));

            // 3. Remover arquivos que não estão mais na lista
            for (const fileId of filesToRemove) {
                await vectorStore.files.remove(existingBase.vectorStoreId, fileId);
            }

            // 4. Adicionar arquivos existentes à Vector Store existente
            const uploadedFiles: KnowledgeBaseFile[] = [];
            for (const fileId of filesToAdd) {
                const fileInfo = await openaiFiles.get(fileId);
                await vectorStore.files.add(existingBase.vectorStoreId, fileId);
                uploadedFiles.push({
                    id: fileId,
                    fileName: fileInfo.filename,
                    fileSize: fileInfo.bytes,
                    fileType: fileInfo.filename.split('.').pop() || 'unknown',
                    metadata: {
                        lastUpdated: new Date(),
                        language: this.detectLanguage(fileInfo.filename)
                    }
                });
            }

            // 5. Upload e adicionar novos arquivos à Vector Store existente
            for (const file of files) {
                const fileData = await openaiFiles.upload(file.buffer, file.originalname);
                await vectorStore.files.add(existingBase.vectorStoreId, fileData.id);
                uploadedFiles.push({
                    id: fileData.id,
                    fileName: file.originalname,
                    fileSize: file.size,
                    fileType: file.originalname.split('.').pop() || 'unknown',
                    metadata: {
                        lastUpdated: new Date(),
                        language: this.detectLanguage(file.originalname)
                    }
                });
            }

            // 6. Atualizar no banco
            const allFiles = [...uploadedFiles];
            const remainingFiles = currentFileIds
                .filter(id => !filesToRemove.includes(id))
                .map(id => {
                    const file = currentFiles.data.find(f => f.id === id);
                    return {
                        id,
                        fileName: file?.filename || id,
                        fileSize: file?.usage_bytes || 0,
                        fileType: file?.filename?.split('.').pop() || 'unknown',
                        metadata: {
                            lastUpdated: new Date(),
                            language: this.detectLanguage(file?.filename || '')
                        }
                    };
                });

            const updatedBase = await prisma.knowledgeBase.update({
                where: { id },
                data: {
                    name,
                    description,
                    fileIds: [...remainingFiles.map(f => f.id), ...uploadedFiles.map(f => f.id)],
                    fileMetadata: JSON.stringify([...remainingFiles, ...uploadedFiles].map(f => f.metadata)),
                    fileName: [...remainingFiles, ...uploadedFiles].map(f => f.fileName).join(', '),
                    fileSize: [...remainingFiles, ...uploadedFiles].reduce((acc, file) => acc + file.fileSize, 0),
                    fileType: [...remainingFiles, ...uploadedFiles].map(f => f.fileType).join(', '),
                    updatedAt: new Date()
                }
            });

            return updatedBase;
        } catch (error) {
            console.error('❌ Erro ao atualizar base de conhecimento:', error);
            throw error;
        }
    }

    async listKnowledgeBaseFiles(id: string) {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id }
        });

        if (!knowledgeBase?.vectorStoreId) {
            throw new NotFoundError('Base de conhecimento não encontrada');
        }

        return vectorStore.files.list(knowledgeBase.vectorStoreId);
    }

    async deleteKnowledgeBase(id: string): Promise<boolean> {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id }
        });

        if (!knowledgeBase) {
            throw new BadRequestError('Base de conhecimento não encontrada');
        }

        if (knowledgeBase.vectorStoreId) {
            await vectorStore.delete(knowledgeBase.vectorStoreId);
        }

        await prisma.knowledgeBase.delete({
            where: { id }
        });

        return true;
    }

    // Métodos para gerenciar arquivos OpenAI
    async listOpenAIFiles() {
        return await openaiFiles.list();
    }

    async createOpenAIFile(file: Express.Multer.File) {
        return await openaiFiles.upload(file.buffer, file.originalname);
    }

    async deleteOpenAIFile(fileId: string) {
        return await openaiFiles.delete(fileId);
    }

    // Métodos para gerenciar Vector Store
    async deleteVectorStore(vectorStoreId: string) {
        try {
            await vectorStore.delete(vectorStoreId);
            return true;
        } catch (error) {
            console.error('❌ Erro ao deletar vector store:', error);
            throw new Error('Erro ao deletar vector store');
        }
    }

    // Métodos para gerenciar arquivos na Vector Store
    async addFileToVectorStore(vectorStoreId: string, file: Express.Multer.File) {
        const fileData = await openaiFiles.upload(file.buffer, file.originalname);
        await vectorStore.files.add(vectorStoreId, fileData.id);
        
        return {
            id: fileData.id,
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.originalname.split('.').pop() || 'unknown',
            metadata: {
                lastUpdated: new Date(),
                language: this.detectLanguage(file.originalname)
            }
        };
    }

    async removeFileFromVectorStore(vectorStoreId: string, fileId: string) {
        try {
            await vectorStore.files.remove(vectorStoreId, fileId);
            return true;
        } catch (error) {
            console.error('❌ Erro ao remover arquivo da vector store:', error);
            throw new Error('Erro ao remover arquivo da vector store');
        }
    }

    // Método para atualizar metadados
    async updateMetadata(id: string, metadata: Record<string, unknown>) {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id }
        });

        if (!knowledgeBase) {
            throw new NotFoundError('Base de conhecimento não encontrada');
        }

        return prisma.knowledgeBase.update({
            where: { id },
            data: {
                fileMetadata: JSON.stringify(metadata)
            }
        });
    }
}