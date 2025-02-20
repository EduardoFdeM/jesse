import fs from 'fs';
import PDFDocument from 'pdfkit';
import prisma from '../config/database.js';
import { uploadToS3 } from '../config/storage.js';
import { Document, Paragraph, Packer, TextRun } from 'docx';
import openaiClient from '../config/openai.js';
import { emitTranslationCompleted, emitTranslationError, emitTranslationProgress } from './socket.service.js';
import * as pdfjsLib from 'pdfjs-dist';
import { BaseError } from '../utils/errors.js';
import { parseFile } from '../utils/fileParser/index.js';

interface TranslationData {
    id: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    fileType: string;
    sourceLanguage: string;
    targetLanguage: string;
    status: string;
    errorMessage?: string | null;
    translatedUrl?: string | null;
    costData?: string | null;
    userId: string;
    knowledgeBaseId?: string | null;
    threadId?: string | null;
    runId?: string | null;
    assistantId?: string | null;
    usedAssistant: boolean;
    assistant?: {
        id: string;
        name: string;
        model: string;
    } | null;
}

interface TranslateFileParams {
    filePath: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
    translationId: string;
    outputFormat: string;
    originalName: string;
    knowledgeBaseId?: string;
    assistantId?: string;
}

// Função para extrair texto de diferentes tipos de arquivo
const extractTextFromBuffer = async (buffer: Buffer, mimeType: string): Promise<string> => {
    try {
        const result = await parseFile(buffer, mimeType);
        return result.content;
    } catch (error: unknown) {
        console.error('Erro ao extrair texto:', error);
        
        if (error instanceof Error) {
            throw new BaseError(
                `Falha ao extrair texto do arquivo: ${error.message}`,
                500,
                'EXTRACTION_ERROR'
            );
        }
        
        throw new BaseError(
            'Falha ao extrair texto do arquivo',
            500,
            'EXTRACTION_ERROR'
        );
    }
};

// Função unificada para salvar/atualizar arquivo
const saveFileContent = async (
    text: string, 
    fileName: string, 
    outputFormat: string
): Promise<{ filePath: string; fileSize: number; fileName: string }> => {
    try {
        let fileBuffer: Buffer;
        const finalFileName = fileName.replace(/\.[^/.]+$/, `.${outputFormat}`);

        switch (outputFormat.toLowerCase()) {
            case 'txt':
            case 'text': {
                fileBuffer = Buffer.from(text, 'utf-8');
                break;
            }
            case 'docx':
            case 'document': {
                const doc = new Document({
                    sections: [{
                        properties: {},
                        children: text.split('\n').map(line => 
                            new Paragraph({
                                children: [new TextRun(line)],
                                spacing: { before: 200, after: 200 }
                            })
                        )
                    }]
                });
                fileBuffer = await Packer.toBuffer(doc);
                break;
            }
            case 'pdf': {
                const pdfDoc = new PDFDocument({
                    margin: 50,
                    size: 'A4'
                });
                const chunks: Buffer[] = [];

                return new Promise((resolve, reject) => {
                    pdfDoc.on('data', chunk => chunks.push(chunk));
                    pdfDoc.on('end', async () => {
                        try {
                            fileBuffer = Buffer.concat(chunks);
                            const fileUrl = await uploadToS3(fileBuffer, finalFileName);
                            resolve({
                                filePath: fileUrl,
                                fileSize: fileBuffer.length,
                                fileName: finalFileName
                            });
                        } catch (err) {
                            reject(err);
                        }
                    });

                    if (text.includes('---PAGE---')) {
                        const pages = text.split('---PAGE---');
                        pages.forEach((pageContent, pageIndex) => {
                            if (pageIndex > 0) pdfDoc.addPage();
                            pdfDoc.text(pageContent.trim(), {
                                align: 'left',
                                continued: false
                            });
                        });
                    } else {
                        pdfDoc.text(text, { align: 'left' });
                    }
                    pdfDoc.end();
                });
            }
            default: {
                throw new Error(`Formato de saída '${outputFormat}' não suportado`);
            }
        }

        const fileUrl = await uploadToS3(fileBuffer, finalFileName);
        return {
            filePath: fileUrl,
            fileSize: fileBuffer.length,
            fileName: finalFileName
        };
    } catch (err) {
        console.error('Erro ao salvar arquivo:', err);
        throw err;
    }
};

export const translateFile = async (params: TranslateFileParams & { fileBuffer: Buffer }): Promise<TranslationData> => {
    try {
        // Extrair texto do buffer do arquivo
        const outputFormat = params.outputFormat.split('/').pop() || 'txt';
        const fileContent = await extractTextFromBuffer(params.fileBuffer, params.outputFormat);

        // Verificar se o assistant existe e está ativo
        let openaiAssistantId = process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!;
        let selectedAssistant = null;
        if (params.assistantId) {
            selectedAssistant = await prisma.assistant.findUnique({
                where: { id: params.assistantId },
                select: {
                    id: true,
                    assistantId: true,
                    name: true,
                    model: true,
                    instructions: true,
                    status: true
                }
            });

            // Verificar se o assistente existe e tem um ID da OpenAI
            if (selectedAssistant?.assistantId) {
                try {
                    // Verificar se o assistente existe na OpenAI
                    const response = await fetch(`https://api.openai.com/v1/assistants/${selectedAssistant.assistantId}`, {
                        headers: {
                            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                            'Content-Type': 'application/json',
                            'OpenAI-Beta': 'assistants=v2'
                        }
                    });

                    if (response.ok) {
                        const openaiAssistant = await response.json();
                        if (openaiAssistant) {
                            openaiAssistantId = selectedAssistant.assistantId;
                            console.log('🤖 Usando assistant personalizado:', {
                                id: selectedAssistant.id,
                                assistantId: selectedAssistant.assistantId,
                                name: selectedAssistant.name,
                                model: openaiAssistant.model
                            });
                        }
                    } else {
                        console.error('❌ Erro ao verificar assistant na OpenAI');
                        // Se houver erro, usar o assistant padrão
                        openaiAssistantId = process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!;
                    }
                } catch (error) {
                    console.error('❌ Erro ao verificar assistant na OpenAI:', error);
                    // Se houver erro, usar o assistant padrão
                    openaiAssistantId = process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!;
                }
            }
        }

        // Preparar payload para criação da thread
        const threadPayload: any = {
            messages: [{
                role: "user",
                content: `Traduza o seguinte texto de ${params.sourceLanguage} para ${params.targetLanguage}:\n\n${fileContent}`
            }]
        };

        // Se tiver base de conhecimento selecionada, adicionar ao payload
        if (params.knowledgeBaseId) {
            const knowledgeBase = await prisma.knowledgeBase.findUnique({
                where: { id: params.knowledgeBaseId }
            });

            if (knowledgeBase?.vectorStoreId) {
                threadPayload.tool_resources = {
                    file_search: {
                        vector_store_ids: [knowledgeBase.vectorStoreId]
                    }
                };
            }
        }

        // Criar thread com a mensagem inicial
        const response = await fetch('https://api.openai.com/v1/threads', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify(threadPayload)
        });

        if (!response.ok) {
            throw new Error('Erro ao criar thread');
        }

        const thread = await response.json();

        // Atualizar com o threadId e marcar uso de assistant
        await prisma.translation.update({
            where: { id: params.translationId },
            data: { 
                threadId: thread.id,
                status: 'processing',
                usedAssistant: !!params.assistantId,
                assistantId: params.assistantId || null
            }
        });

        // Criar run com o assistant apropriado
        const run = await openaiClient.beta.threads.runs.create(thread.id, {
            assistant_id: openaiAssistantId
        });

        // Aguardar conclusão
        let translatedContent = '';
        while (true) {
            const runStatus = await openaiClient.beta.threads.runs.retrieve(thread.id, run.id);

            if (runStatus.status === 'completed') {
                const messages = await openaiClient.beta.threads.messages.list(thread.id);
                const assistantMessage = messages.data.find(m => m.role === 'assistant');
                if (assistantMessage?.content[0]?.type === 'text') {
                    translatedContent = assistantMessage.content[0].text.value;
                }
                break;
            } else if (runStatus.status === 'failed') {
                throw new Error('Falha na tradução');
            }

            // Emitir progresso
            emitTranslationProgress(params.translationId, 50);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Salvar arquivo traduzido
        const savedFile = await saveFileContent(
            translatedContent,
            params.originalName,
            outputFormat // Usando a extensão extraída
        );

        // Buscar informações do assistant se usado
        let assistantInfo = null;
        if (params.assistantId) {
            const assistant = await prisma.assistant.findUnique({
                where: { id: params.assistantId },
                select: {
                    id: true,
                    name: true,
                    model: true,
                    assistantId: true
                }
            });
            if (assistant) {
                assistantInfo = {
                    id: assistant.id,
                    name: assistant.name,
                    model: assistant.model
                };
            }
        }

        // Atualizar registro da tradução
        const updatedTranslation = await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'completed',
                filePath: savedFile.filePath,
                fileSize: savedFile.fileSize,
                fileName: savedFile.fileName,
                plainTextContent: translatedContent,
                usedAssistant: !!params.assistantId,
                translationMetadata: JSON.stringify({
                    usedKnowledgeBase: !!params.knowledgeBaseId,
                    usedAssistant: !!params.assistantId,
                    knowledgeBaseName: params.knowledgeBaseId ? await getKnowledgeBaseName(params.knowledgeBaseId) : null,
                    assistantName: assistantInfo?.name || null,
                    assistantModel: assistantInfo?.model || null
                })
            },
            include: {
                knowledgeBase: {
                    select: {
                        id: true,
                        name: true,
                        description: true
                    }
                },
                assistant: {
                    select: {
                        id: true,
                        name: true,
                        model: true,
                        description: true
                    }
                }
            }
        });

        emitTranslationCompleted(updatedTranslation);
        return {
            ...updatedTranslation,
            assistant: assistantInfo
        };

    } catch (error) {
        await handleTranslationError(error, params.translationId);
        throw error;
    }
};

const handleTranslationError = async (error: unknown, translationId: string) => {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido na tradução';
    
    await prisma.translation.update({
        where: { id: translationId },
        data: {
            status: 'error',
            errorMessage
        }
    });

    emitTranslationError(translationId, errorMessage);
};

// Funções de acesso ao banco
export const getTranslation = async (id: string) => {
    return prisma.translation.findUnique({ 
        where: { id },
        include: {
            knowledgeBase: {
                select: {
                    id: true,
                    name: true,
                    description: true
                }
            },
            assistant: {
                select: {
                    id: true,
                    name: true,
                    model: true,
                    description: true
                }
            },
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            }
        }
    });
};

export const getTranslations = async (userId: string) => {
    return prisma.translation.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
            knowledgeBase: {
                select: {
                    id: true,
                    name: true,
                    description: true
                }
            },
            assistant: {
                select: {
                    id: true,
                    name: true,
                    model: true,
                    description: true
                }
            },
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            }
        }
    });
};

// Buscar traduções compartilhadas com o usuário
export const getSharedTranslations = async (userId: string) => {
    return prisma.translation.findMany({
        where: {
            shares: {
                some: {
                    sharedWithId: userId
                }
            }
        },
        include: {
            knowledgeBase: true,
            assistant: true,
            user: {
                select: {
                    name: true,
                    email: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
};

// Verificar se uma tradução está compartilhada com um usuário
export const isTranslationSharedWithUser = async (translationId: string, userId: string) => {
    const share = await prisma.translationShare.findFirst({
        where: {
            translationId,
            sharedWithId: userId
        }
    });

    return !!share;
};

// Função auxiliar para buscar o nome da base de conhecimento
async function getKnowledgeBaseName(id: string): Promise<string | null> {
    const kb = await prisma.knowledgeBase.findUnique({
        where: { id },
        select: { name: true }
    });
    return kb?.name || null;
}

