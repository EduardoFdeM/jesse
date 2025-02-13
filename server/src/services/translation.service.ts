import { PrismaClient } from '@prisma/client';
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import { 
    TranslateFileParams, 
    TranslationData, 
    TranslationStatus,
    Translation,
    Prompt,
    EVENTS,
    FileType
} from '../types';
import { 
    emitTranslationStarted, 
    emitTranslationProgress, 
    emitTranslationCompleted,
    emitTranslationError 
} from './socket.service';
import prisma from '../config/database';
import openai from '../config/openai';
import PDFParser from 'pdf2json';
import PDFDocument from 'pdfkit';
import { Document, Paragraph, Packer, TextRun } from 'docx';
import { DEFAULT_TRANSLATION_PROMPT } from '../constants/prompts';
import { simpleSearchKnowledgeBaseContext } from './knowledge.service';
import { uploadToS3 } from '../config/storage';
import path from 'path';
import pdf from 'pdf-parse';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { streamToBuffer } from '../utils/streamToBuffer';
import mammoth from 'mammoth';
import { Readable } from 'stream';
import { s3Client } from '../config/storage';
import { calculateTranslationCost } from '../utils/costCalculator';

type KnowledgeBase = {
    id: string;
    name: string;
    description: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    fileType: string;
    userId: string;
    vectorStoreId: string | null;
    fileIds: string[];
    fileMetadata: string | null;
    createdAt: Date;
    updatedAt: Date;
};

interface PDFParserData {
    Pages: Array<{
        Texts: Array<{
            R: Array<{
                T: string;
            }>;
        }>;
    }>;
}

// Interface para o resultado do pdf-parse
interface PDFParseResult {
    text: string;
    numpages: number;
    info: any;
    metadata: any;
    version: string;
    pages: {
        content: { str: string }[];
    }[];
}

// Função para extrair texto de PDF
const extractTextFromPDF = async (fileBuffer: Buffer): Promise<string> => {
    try {
        const data = await pdf(fileBuffer);
        
        return data.text
            .replace(/\r\n/g, '\n')
            .replace(/\s+/g, ' ')
            .trim();
    } catch (error) {
        console.error('Erro ao extrair texto do PDF:', error);
        throw new Error(`Falha ao extrair texto do PDF: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
};

interface SavedFileResult {
    filePath: string;
    fileSize: number;
    fileName: string;
}

const saveTranslatedFile = async (
    content: string,
    originalName: string,
    outputFormat: string
): Promise<SavedFileResult> => {
    try {
        const fileName = `translated_${Date.now()}_${path.basename(originalName)}`;
        let buffer: Buffer;
        
        switch (outputFormat) {
            case 'application/pdf':
                buffer = await createPDF(content);
                break;
            
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                buffer = await createDOCX(content);
                break;
            
            case 'text/plain':
                buffer = Buffer.from(content, 'utf-8');
                break;
                
            default:
                throw new Error(`Formato não suportado: ${outputFormat}`);
        }

        // Upload para S3
        const s3Path = `translations/${fileName}`;
        await uploadToS3(buffer, s3Path, 'translation');

        return {
            filePath: s3Path,
            fileSize: buffer.length,
            fileName
        };

    } catch (error) {
        console.error('Erro ao salvar arquivo traduzido:', error);
        throw new Error(`Falha ao salvar arquivo traduzido: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
};

const createPDF = async (content: string): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const chunks: Buffer[] = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        
        doc.text(content);
        doc.end();
    });
};

const createDOCX = async (content: string): Promise<Buffer> => {
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: content
                        })
                    ]
                })
            ]
        }]
    });

    return await Packer.toBuffer(doc);
};

// Função auxiliar para extrair conteúdo do arquivo
const extractFileContent = async (filePath: string): Promise<string> => {
    try {
        const s3Response = await s3Client.send(
            new GetObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET || '',
                Key: filePath.replace(`https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`, '')
            })
        );

        const fileBuffer = await streamToBuffer(s3Response.Body as Readable);
        const fileExtension = path.extname(filePath).toLowerCase();

        let content = '';
        if (fileExtension === '.pdf') {
            content = await extractTextFromPDF(fileBuffer);
        } else if (fileExtension === '.docx') {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            content = result.value;
        } else {
            content = fileBuffer.toString('utf-8');
        }

        return content
            .replace(/\r\n/g, '\n')
            .replace(/\s+/g, ' ')
            .trim();

    } catch (error) {
        console.error('Erro ao extrair conteúdo do arquivo:', error);
        throw error;
    }
};

const extractTextFromDOCX = async (filePath: string): Promise<string> => {
    // Implementação básica para DOCX
    const content = await fs.readFile(filePath);
    // Aqui precisaríamos usar uma biblioteca para extrair texto do DOCX
    return content.toString();
};

// Função para atualizar status da tradução
const updateTranslationStatus = async (
    translationId: string,
    status: TranslationStatus,
    threadId?: string,
    runId?: string,
    errorMessage?: string
): Promise<void> => {
    try {
        const updateData: any = { status };
        
        if (threadId) {
            updateData.threadId = threadId;
        }
        
        if (runId) {
            updateData.runId = runId;
        }

        if (errorMessage) {
            updateData.errorMessage = errorMessage;
        }

        const translation = await prisma.translation.update({
            where: { id: translationId },
            data: updateData,
            include: {
                knowledgeBase: true,
                prompt: true
            }
        });

        // Calcula o progresso baseado no status
        const progress = calculateProgress({ status });
        
        // Emite evento de progresso detalhado
        emitDetailedProgress(translationId, status, progress);

        // Emite eventos específicos baseados no status
        if (status === 'completed') {
            emitTranslationCompleted(translation);
        } else if (status === 'error') {
            emitTranslationError(translationId, errorMessage || 'Erro durante a tradução');
        }

    } catch (error) {
        console.error('Erro ao atualizar status da tradução:', error);
        throw error;
    }
};

// Função para obter ID do assistente personalizado
const getCustomAssistantId = async (promptId?: string): Promise<string> => {
    if (!promptId) {
        return process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!;
    }

    try {
        const prompt = await prisma.prompt.findUnique({
            where: { id: promptId }
        });

        if (!prompt) {
            throw new Error('Prompt não encontrado');
        }

        // Se já existe um assistant, verifica se está ativo
        if (prompt.assistantId && prompt.status === 'active') {
            return prompt.assistantId;
        }

        // Cria novo assistant
        const assistant = await openai.beta.assistants.create({
            name: prompt.name,
            instructions: `${prompt.instructions}\n${prompt.content}`,
            model: prompt.model || 'gpt-4-turbo-preview',
            tools: [{ type: "code_interpreter" }],
            metadata: {
                promptId: prompt.id,
                temperature: prompt.temperature.toString(),
                createdAt: new Date().toISOString()
            }
        });

        // Atualiza o prompt com o novo assistantId
        await prisma.prompt.update({
            where: { id: promptId },
            data: {
                assistantId: assistant.id,
                status: 'active',
                updatedAt: new Date()
            }
        });

        return assistant.id;

    } catch (error) {
        console.error('Erro ao obter/criar assistant personalizado:', error);
        // Em caso de erro, usa o assistant padrão
        return process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!;
    }
};

// Interface para parâmetros da mensagem de tradução
interface TranslationMessageParams {
    content: string;
    sourceLanguage: string;
    targetLanguage: string;
}

// Cria a mensagem inicial para o thread de tradução
const createTranslationMessage = async (
    threadId: string,
    params: TranslationMessageParams
): Promise<void> => {
    try {
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: `Traduza o seguinte texto de ${params.sourceLanguage} para ${params.targetLanguage}. 
                     Mantenha a formatação e estilo do texto original.
                     Texto para tradução:
                     
                     ${params.content}`
        });
        
    } catch (error) {
        console.error('Erro ao criar mensagem de tradução:', error);
        throw error;
    }
};

// Executa e monitora o processo de tradução
const executeAndMonitorTranslation = async (
    threadId: string,
    assistantId: string,
    translationId: string
): Promise<string> => {
    try {
        // Criar run
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId
        });

        // Atualizar runId no banco
        await prisma.translation.update({
            where: { id: translationId },
            data: { runId: run.id }
        });

        // Monitorar status
        let status = await openai.beta.threads.runs.retrieve(threadId, run.id);
        
        while (!['completed', 'failed', 'cancelled'].includes(status.status)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            status = await openai.beta.threads.runs.retrieve(threadId, run.id);
            
            // Emitir progresso detalhado
            emitDetailedProgress(
                translationId,
                mapOpenAIStatusToTranslation(status.status),
                calculateProgressPercentage(status)
            );
        }

        if (status.status !== 'completed') {
            throw new Error(`Tradução falhou: ${status.last_error?.message || 'Erro desconhecido'}`);
        }

        // Recuperar mensagens traduzidas
        const messages = await openai.beta.threads.messages.list(threadId);
        return extractTranslatedContent(messages.data[0].content);
    } catch (error) {
        console.error('Erro na execução da tradução:', error);
        throw error;
    }
};

interface ProgressParams {
    status: TranslationStatus | string;
    step?: number;
    totalSteps?: number;
}

const calculateProgress = (params: ProgressParams): number => {
    const baseProgress = {
        'pending': 0,
        'processing': 10,
        'retrieving_context': 25,
        'translating': 40,
        'formatting': 75,
        'completed': 100,
        'expired': 0,
        'error': 0
    };

    let progress = baseProgress[params.status as TranslationStatus] || 0;

    // Se temos informações de etapas, calculamos o progresso proporcional
    if (params.step && params.totalSteps) {
        const stepProgress = (params.step / params.totalSteps) * 100;
        
        // Para status em andamento, mesclamos com o progresso base
        if (params.status === 'translating') {
            progress = 40 + (stepProgress * 0.35); // 40-75%
        } else if (params.status === 'formatting') {
            progress = 75 + (stepProgress * 0.25); // 75-100%
        }
    }

    // Garante que o progresso está entre 0 e 100
    return Math.min(Math.max(Math.round(progress), 0), 100);
};

// Função auxiliar para calcular progresso do run do Assistant
const calculateRunProgress = (status: any): number => {
    const runStatus = status.status;
    const step = status.step_details?.step_number || 1;
    const totalSteps = status.step_details?.total_steps || 1;

    return calculateProgress({
        status: runStatus === 'in_progress' ? 'translating' : runStatus,
        step,
        totalSteps
    });
};

interface SaveTranslationResultParams extends TranslateFileParams {
    translationId: string;
}

const saveTranslationResult = async (
    params: TranslateFileParams,
    translatedContent: string
): Promise<TranslationData> => {
    try {
        // Salva o arquivo traduzido
        const savedFile = await saveTranslatedFile(
            translatedContent,
            params.originalName,
            params.outputFormat
        );

        // Atualiza o registro da tradução
        const updatedTranslation = await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'completed',
                filePath: savedFile.filePath,
                fileSize: savedFile.fileSize,
                translationMetadata: JSON.stringify({
                    completedAt: new Date(),
                    stage: 'completed'
                })
            }
        });

        return {
            ...updatedTranslation,
            fileName: savedFile.fileName
        };

    } catch (error) {
        await updateTranslationStatus(params.translationId, 'error');
        console.error('Erro ao salvar resultado da tradução:', error);
        throw error;
    }
};

const handleTranslationError = async (error: unknown, translationId: string) => {
    console.error('Erro na tradução:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido durante a tradução';
    await prisma.translation.update({
        where: { id: translationId },
        data: {
            status: 'error',
            errorMessage
        }
    });
    global.io?.emit('translation:error', { id: translationId, error: errorMessage });
};

const emitDetailedProgress = (translationId: string, status: TranslationStatus, progress?: number) => {
    global.io?.emit('translation:progress', {
        translationId,
        status,
        progress: progress || calculateProgress({ status }),
        timestamp: new Date()
    });
};

// Interface para o contexto da base de conhecimento
interface KnowledgeBaseContext {
    vectorStoreId: string;
    relevantContext?: string;
}

// Função para adicionar contexto da base de conhecimento
const addKnowledgeBaseContext = async (
    threadId: string, 
    knowledgeBaseId: string
): Promise<void> => {
    try {
        const kb = await prisma.knowledgeBase.findUnique({
            where: { id: knowledgeBaseId }
        });

        if (!kb?.vectorStoreId) {
            throw new Error('Base de conhecimento não encontrada ou sem Vector Store');
        }

        // Atualiza status para indicar busca de contexto
        await updateTranslationStatus(knowledgeBaseId, 'retrieving_context');

        // Cria mensagem com contexto da Vector Store
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: `Use o contexto da Vector Store ${kb.vectorStoreId} para melhorar a tradução. 
                     Mantenha a formatação original e use o contexto apenas para melhorar a precisão da tradução.`
        });

    } catch (error) {
        console.error('Erro ao adicionar contexto da base de conhecimento:', error);
        throw error;
    }
};

// Função principal de tradução refatorada
export const translateFile = async (params: TranslateFileParams): Promise<TranslationData> => {
    try {
        // Extrair conteúdo do arquivo
        const fileContent = await extractFileContent(params.filePath);

        // Criar thread
        const thread = await openai.beta.threads.create();
        await updateTranslationStatus(params.translationId, 'processing', thread.id);

        // Configurar assistant
        const assistantId = params.useCustomPrompt
            ? await getCustomAssistantId(params.promptId)
            : process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID;

        if (!assistantId) {
            throw new Error('AssistantId não encontrado');
        }

        // Adicionar contexto da base de conhecimento
        if (params.useKnowledgeBase && params.knowledgeBaseId) {
            await updateTranslationStatus(params.translationId, 'retrieving_context');
            await addKnowledgeBaseContext(thread.id, params.knowledgeBaseId);
        }

        // Criar mensagem com instruções de tradução
        await createTranslationMessage(thread.id, {
            content: fileContent,
            sourceLanguage: params.sourceLanguage,
            targetLanguage: params.targetLanguage
        });

        // Executar e monitorar tradução
        await updateTranslationStatus(params.translationId, 'translating');
        const translatedContent = await executeAndMonitorTranslation(
            thread.id,
            assistantId,
            params.translationId
        );

        // Salvar resultado
        return await saveTranslationResult(params, translatedContent);

    } catch (error) {
        console.error('Erro durante processo de tradução:', error);
        await updateTranslationStatus(
            params.translationId, 
            'error', 
            undefined, 
            undefined, 
            error instanceof Error ? error.message : 'Erro desconhecido'
        );
        throw error;
    }
};

const retrieveTranslatedContent = async (threadId: string): Promise<string> => {
    const messages = await openai.beta.threads.messages.list(threadId);
    const assistantMessage = messages.data.find(m => m.role === 'assistant');

    if (!assistantMessage?.content[0] || 
        assistantMessage.content[0].type !== 'text' || 
        !('text' in assistantMessage.content[0])) {
        throw new Error('Resposta do assistente não encontrada ou inválida');
    }

    return assistantMessage.content[0].text.value;
};

const mapOpenAIStatusToTranslation = (status: string): TranslationStatus => {
    const statusMap: Record<string, TranslationStatus> = {
        'queued': 'processing',
        'in_progress': 'translating',
        'requires_action': 'processing',
        'cancelling': 'processing',
        'cancelled': 'error',
        'failed': 'error',
        'completed': 'completed',
        'expired': 'error'
    };
    return statusMap[status] || 'processing';
};

const calculateProgressPercentage = (status: any): number => {
    switch (status.status) {
        case 'completed':
            return 100;
        case 'failed':
        case 'cancelled':
        case 'expired':
            return 0;
        case 'in_progress':
            return 50;
        default:
            return 25;
    }
};

const extractTranslatedContent = (content: any[]): string => {
    if (!Array.isArray(content)) {
        throw new Error('Conteúdo inválido da tradução');
    }
    
    // Pega o primeiro item do tipo 'text' do conteúdo
    const textContent = content.find(item => item.type === 'text');
    if (!textContent || !textContent.text) {
        throw new Error('Nenhum conteúdo de texto encontrado na tradução');
    }
    
    return textContent.text.value;
};

