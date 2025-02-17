import prisma from '../config/database.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { files, vectorStore } from '../config/openai.js';

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

const MAX_FILES_PER_STORE = 10;

// Interface para parâmetros
interface ProcessKnowledgeBaseParams {
    name: string;
    description: string;
    userId: string;
    files: Express.Multer.File[];
    existingFileIds?: string[];
}

// Adicionar após a linha 31
const ALLOWED_FILE_TYPES = ['pdf', 'txt', 'doc', 'docx'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function validateFile(file: Express.Multer.File) {
    const fileType = file.originalname.split('.').pop()?.toLowerCase();
    
    if (!fileType || !ALLOWED_FILE_TYPES.includes(fileType)) {
        throw new BadRequestError(`Tipo de arquivo não permitido. Tipos permitidos: ${ALLOWED_FILE_TYPES.join(', ')}`);
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new BadRequestError('Arquivo muito grande. Tamanho máximo: 20MB');
    }
}

// Funções principais
export const createKnowledgeBase = async (params: ProcessKnowledgeBaseParams) => {
    let createdStore;
    try {
        // Validar limite de arquivos
        if ((params.files?.length || 0) + (params.existingFileIds?.length || 0) > MAX_FILES_PER_STORE) {
            throw new BadRequestError(`Limite máximo de ${MAX_FILES_PER_STORE} arquivos por base de conhecimento`);
        }

        // Criar Vector Store na OpenAI
        createdStore = await vectorStore.create(`kb_${params.name}_${Date.now()}`);

        const uploadedFiles: KnowledgeBaseFile[] = [];

        // Processar arquivos existentes primeiro
        if (params.existingFileIds?.length) {
            const service = new KnowledgeService();
            await processExistingFiles(createdStore.id, params.existingFileIds, uploadedFiles, service);
        }

        // Depois processar novos arquivos
        if (params.files?.length) {
            const service = new KnowledgeService();
            await processNewFiles(createdStore.id, params.files, uploadedFiles, service);
        }

        // Criar base de conhecimento no banco
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                name: params.name,
                description: params.description,
                userId: params.userId,
                vectorStoreId: createdStore.id,
                fileIds: uploadedFiles.map(f => f.id),
                fileMetadata: JSON.stringify(uploadedFiles.map(f => f.metadata)),
                fileName: uploadedFiles[0]?.fileName || 'knowledge_base',
                filePath: uploadedFiles[0]?.fileName || '',
                fileSize: uploadedFiles.reduce((acc, file) => acc + file.fileSize, 0),
                fileType: uploadedFiles[0]?.fileType || 'application/json'
            }
        });
        return knowledgeBase;
    } catch (error) {
        // Se falhar, limpar Vector Store
        if (createdStore?.id) {
            await vectorStore.delete(createdStore.id);
        }
        throw error;
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

interface VectorStoreFile {
    id: string;
    vectorStoreId: string;
}

export class KnowledgeService {
    public detectLanguage(fileName: string): string {
        // Padrões comuns em nomes de arquivos que indicam idioma
        const languagePatterns = {
            pt: /(pt|pt-br|port|portuguese|portugues)/i,
            en: /(en|eng|english|ingles)/i,
            es: /(es|esp|spanish|espanol)/i,
            fr: /(fr|fra|french|frances)/i,
            de: /(de|deu|german|alemao)/i,
            it: /(it|ita|italian|italiano)/i,
            ja: /(ja|jap|japanese|japones)/i,
            ko: /(ko|kor|korean|coreano)/i,
            zh: /(zh|chi|chinese|chines)/i,
            ar: /(ar|ara|arabic|arabe)/i,
            nl: /(nl|dutch|holland)/i,
            pl: /(pl|pol|polish|polaco)/i,
            tr: /(tr|tur|turkish|turco)/i,
            ru: /(ru|rus|russian|russo)/i,
            ro: /(ro|rum|romanian|rumano)/i,
            bg: /(bg|bul|bulgarian|bulgaro)/i,
            cs: /(cs|cze|czech|checo)/i,
            sk: /(sk|slo|slovak|eslovaco)/i,
            hr: /(hr|cro|croatian|croata)/i,
            el: /(el|gre|greek|grego)/i,
            he: /(he|heb|hebrew|hebraico)/i,
            hi: /(hi|hin|hindi|hindi)/i,
            id: /(id|ind|indonesian|indonesio)/i,
            ms: /(ms|mal|malay|malayo)/i,
            th: /(th|tha|thai|tailandesa)/i,
            vi: /(vi|vie|vietnamese|vietnamita)/i,
            
            
            
        };

        // Primeiro tenta detectar pelo nome do arquivo
        const fileName_lower = fileName.toLowerCase();
        
        for (const [lang, pattern] of Object.entries(languagePatterns)) {
            if (pattern.test(fileName_lower)) {
                return lang;
            }
        }

        // Se não encontrar no nome, verifica extensões comuns por região
        const extension = fileName.split('.').pop()?.toLowerCase();
        
        // Algumas extensões são mais comuns em certas regiões
        if (extension) {
            switch (extension) {
                case 'docx':
                case 'pdf':
                    // Verifica se tem caracteres especiais do português
                    if (/[áàâãéèêíïóôõöúüç]/i.test(fileName)) {
                        return 'pt';
                    }
                    break;
            }
        }

        // Se não conseguir detectar, retorna 'auto'
        return 'auto';
    }

    async addFileToVectorStore(vectorStoreId: string, file: Express.Multer.File) {
        const fileData = await files.upload(file.buffer, file.originalname);
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
        // Primeiro remover o arquivo da OpenAI
        await files.delete(fileId);
        
        // Depois atualizar a Vector Store
        const updatedFiles = await vectorStore.files.list(vectorStoreId);
        return !updatedFiles.data.some(f => f.id === fileId);
    }

    async listOpenAIFiles() {
        return await files.list();
    }

    async createOpenAIFile(file: Express.Multer.File) {
        return await files.upload(file.buffer, file.originalname);
    }

    async deleteOpenAIFile(fileId: string) {
        return await files.delete(fileId);
    }

    async updateMetadata(id: string, metadata: any) {
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

    async listKnowledgeBaseFiles(id: string) {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id }
        });

        if (!knowledgeBase?.vectorStoreId) {
            throw new NotFoundError('Base de conhecimento não encontrada');
        }

        return vectorStore.files.list(knowledgeBase.vectorStoreId);
    }

    async deleteVectorStore(vectorStoreId: string) {
        try {
            await vectorStore.delete(vectorStoreId);
            return true;
        } catch (error) {
            console.error('❌ Erro ao deletar vector store:', error);
            throw new Error('Erro ao deletar vector store');
        }
    }

    public async createKnowledgeBase(params: ProcessKnowledgeBaseParams) {
        let createdStore;
        try {
            // Validar limite de arquivos
            if ((params.files?.length || 0) + (params.existingFileIds?.length || 0) > MAX_FILES_PER_STORE) {
                throw new BadRequestError(`Limite máximo de ${MAX_FILES_PER_STORE} arquivos por base de conhecimento`);
            }

            // 1. Primeiro criar a Vector Store
            createdStore = await vectorStore.create(params.name);
            const uploadedFiles: KnowledgeBaseFile[] = [];

            // 2. Se tiver arquivos novos, fazer upload primeiro
            if (params.files?.length) {
                for (const file of params.files) {
                    const fileData = await files.upload(file.buffer, file.originalname);
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
                }
            }

            // 3. Adicionar arquivos existentes à Vector Store
            if (params.existingFileIds?.length) {
                for (const fileId of params.existingFileIds) {
                    const fileInfo = await files.get(fileId);
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
                }
            }

            // 4. Criar registro no banco
            const knowledgeBase = await prisma.knowledgeBase.create({
                data: {
                    name: params.name,
                    description: params.description,
                    userId: params.userId,
                    vectorStoreId: createdStore.id,
                    fileIds: uploadedFiles.map(f => f.id),
                    fileMetadata: JSON.stringify(uploadedFiles.map(f => f.metadata)),
                    fileName: uploadedFiles.map(f => f.fileName).join(', '),
                    filePath: 'vector_store', // Agora sempre será vector_store
                    fileSize: uploadedFiles.reduce((acc, file) => acc + file.fileSize, 0),
                    fileType: uploadedFiles.map(f => f.fileType).join(', ')
                }
            });

            return knowledgeBase;
        } catch (error) {
            // Se falhar, limpar Vector Store
            if (createdStore?.id) {
                await vectorStore.delete(createdStore.id);
            }
            throw error;
        }
    }

    public async deleteKnowledgeBase(id: string): Promise<boolean> {
        try {
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
        } catch (err) {
            const error = err as Error;
            console.error('❌ Erro ao deletar base de conhecimento:', error.message);
            throw new BadRequestError(`Erro ao deletar base de conhecimento: ${error.message}`);
        }
    }
}

function processExistingFiles(storeId: string, existingFileIds: string[], uploadedFiles: KnowledgeBaseFile[], service: KnowledgeService) {
    return Promise.all(
        existingFileIds.map(async (fileId) => {
            const fileInfo = await files.get(fileId);
            await vectorStore.files.add(storeId, fileId);
            
            uploadedFiles.push({
                id: fileId,
                fileName: fileInfo.filename,
                fileSize: fileInfo.bytes,
                fileType: fileInfo.filename.split('.').pop() || 'unknown',
                metadata: {
                    lastUpdated: new Date(),
                    language: service.detectLanguage(fileInfo.filename)
                }
            });
        })
    );
}

async function processNewFiles(storeId: string, newFiles: Express.Multer.File[], uploadedFiles: KnowledgeBaseFile[], service: KnowledgeService) {
    return Promise.all(
        newFiles.map(async (file) => {
            const fileData = await files.upload(file.buffer, file.originalname);
            await vectorStore.files.add(storeId, fileData.id);
            
            uploadedFiles.push({
                id: fileData.id,
                fileName: file.originalname,
                fileSize: file.size,
                fileType: file.originalname.split('.').pop() || 'unknown',
                metadata: {
                    lastUpdated: new Date(),
                    language: service.detectLanguage(file.originalname)
                }
            });
        })
    );
}