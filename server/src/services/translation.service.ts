import { OpenAI } from 'openai';
import fs from 'fs/promises';
import { 
    TranslationStatus,
    Translation,
    Prompt,
    EVENTS,
    FileType,
    TranslateFileParams,
    TranslationResult 
} from '../types/index.js';
import { 
    emitTranslationStarted, 
    emitTranslationProgress, 
    emitTranslationCompleted,
    emitTranslationError
} from './socket.service.js';
import prisma from '../config/database.js';
import openai from '../config/openai.js';
import PDFParser from 'pdf2json';
import PDFDocument from 'pdfkit';
import { Document, Paragraph, Packer, TextRun } from 'docx';
import { DEFAULT_TRANSLATION_PROMPT } from '../constants/prompts.js';
import { simpleSearchKnowledgeBaseContext } from './knowledge.service.js';
import { generateSignedUrl, uploadToS3, deleteFromS3 } from '../config/storage.js';
import path from 'path';
import pdf from 'pdf-parse';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { streamToBuffer } from '../utils/streamToBuffer.js';
import mammoth from 'mammoth';
import { Readable } from 'stream';
import { s3Client } from '../config/storage.js';
import { calculateTranslationCost } from '../utils/costCalculator.js';
import { BadRequestError } from '../utils/errors.js';

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
        emitDetailedProgress(
            translationId,
            mapOpenAIStatusToTranslation(status as unknown as RunStatus),
            calculateRunProgress(status as unknown as RunStatusDetails)
        );

        // Emite eventos específicos baseados no status
        if (status === TranslationStatus.COMPLETED) {
            emitTranslationCompleted({
                ...translation,
                status: translation.status as TranslationStatus,
                createdAt: translation.createdAt.toISOString(),
                updatedAt: translation.updatedAt.toISOString(),
                translationMetadata: translation.translationMetadata || ''
            } as Translation);
        } else if (status === TranslationStatus.ERROR) {
            emitTranslationError(translationId, errorMessage || 'Erro durante a tradução');
        }

    } catch (error) {
        console.error('Erro ao atualizar status da tradução:', error);
        throw error;
    }
};

// Função para obter ID do assistente personalizado
const getCustomAssistantId = async (promptId: string): Promise<string> => {
    try {
        const prompt = await prisma.prompt.findUnique({
            where: { id: promptId }
        });

        if (!prompt?.assistantId) {
            throw new Error('Assistant não encontrado para o prompt');
        }

        return prompt.assistantId;
    } catch (error) {
        console.error('Erro ao buscar assistant customizado:', error);
        throw new Error('Falha ao configurar assistant personalizado');
    }
};

// Interface para parâmetros da mensagem de tradução
interface TranslationMessageParams {
    content: string;
    sourceLanguage: string;
    targetLanguage: string;
    preserveFormatting?: boolean;
}

// Cria a mensagem inicial para o thread de tradução
const createTranslationMessage = async (
    threadId: string,
    params: TranslationMessageParams
): Promise<void> => {
    try {
        const systemInstructions = `
            Instruções de Tradução:
            1. Traduzir de ${params.sourceLanguage} para ${params.targetLanguage}
            2. Manter a formatação original ${params.preserveFormatting ? 'estritamente' : 'quando possível'}
            3. Preservar marcações especiais (tags, símbolos)
            4. Manter o mesmo tom e estilo do texto original
            5. Respeitar terminologia técnica
            6. Não adicionar ou remover informações
            7. Manter quebras de linha e espaçamento originais
        `;

        // Criar mensagem com instruções do sistema
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: systemInstructions
        });

        // Criar mensagem com o conteúdo a ser traduzido
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: params.content
        });

    } catch (error) {
        console.error('Erro ao criar mensagem de tradução:', error);
        throw new Error('Falha ao configurar instruções de tradução');
    }
};

// Executa e monitora o processo de tradução
const executeAndMonitorTranslation = async (
    threadId: string,
    assistantId: string,
    translationId: string
): Promise<string> => {
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos
    const startTime = Date.now();

    try {
        // Configurações específicas para tradução
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId,
            instructions: `Instruções para tradução:
                1. Mantenha a formatação original do texto
                2. Preserve espaços e quebras de linha
                3. Mantenha caracteres especiais e símbolos
                4. Preserve tags HTML/Markdown se presentes
                5. Não adicione ou remova quebras de linha`
        });

        // Registrar metadados da execução
        await prisma.translation.update({
            where: { id: translationId },
            data: { 
                runId: run.id,
                translationMetadata: JSON.stringify({
                    startedAt: new Date(),
                    assistantId,
                    threadId,
                    model: 'gpt-3.5-turbo'
                })
            }
        });

        let status = await openai.beta.threads.runs.retrieve(threadId, run.id);
        
        while (!['completed', 'failed', 'cancelled', 'expired'].includes(status.status)) {
            // Verificar timeout
            if (Date.now() - startTime > TIMEOUT_MS) {
                await openai.beta.threads.runs.cancel(threadId, run.id);
                throw new Error('Timeout na tradução - Limite de 5 minutos excedido');
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            status = await openai.beta.threads.runs.retrieve(threadId, run.id);
            
            emitDetailedProgress(
                translationId,
                mapOpenAIStatusToTranslation(status as unknown as RunStatus),
                calculateRunProgress(status as unknown as RunStatusDetails)
            );
        }

        if (status.status !== 'completed') {
            const errorDetails = status.last_error?.message || 'Erro desconhecido';
            throw new Error(`Falha na tradução: ${errorDetails}`);
        }

        return await retrieveTranslatedContent(threadId);
    } catch (error) {
        console.error('Erro na execução da tradução:', error);
        await handleTranslationError(error, translationId);
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

type RunStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'cancelling' | 'expired' | 'requires_action' | 'incomplete';

interface RunStatusDetails {
    status: RunStatus;
    step_details?: {
        step_number: number;
        total_steps: number;
    };
}

const calculateRunProgress = (status: RunStatusDetails): number => {
    const baseProgress: Record<string, number> = {
        'queued': 10,
        'in_progress': 45,
        'completed': 100,
        'failed': 0,
        'cancelled': 0,
        'expired': 0,
        'requires_action': 30
    };

    const progress = baseProgress[status.status] || 0;

    // Se estiver em progresso, calcula baseado nas steps
    if (status.status === 'in_progress' && status.step_details) {
        const { step_number, total_steps } = status.step_details;
        const stepProgress = (step_number / total_steps) * 55; // 45% + até 55% adicional
        return Math.min(45 + stepProgress, 99); // Nunca chega a 100 até completed
    }

    return progress;
};

interface SaveTranslationResultParams {
    translationId: string;
    sourceLanguage: string;
    targetLanguage: string;
    filePath: string;
    translatedContent: string;
    useKnowledgeBase?: boolean;
    knowledgeBaseId?: string;
    useCustomPrompt?: boolean;
    promptId?: string;
    totalTokens: number;
    threadId?: string;
    runId?: string;
    assistantId?: string;
}

const saveTranslationResult = async (
    params: SaveTranslationResultParams,
    translatedContent: string
): Promise<Translation> => {
    const translatedFileName = generateTranslatedFileName(params.filePath);
    const s3Path = `translations/${translatedFileName}`;
    
    await uploadToS3(Buffer.from(translatedContent), s3Path);
    
    const updatedTranslation = await prisma.translation.update({
        where: { id: params.translationId },
        data: {
            status: TranslationStatus.COMPLETED,
            translatedUrl: s3Path,
            threadId: params.threadId,
            runId: params.runId,
            assistantId: params.assistantId,
            translationMetadata: JSON.stringify({
                completedAt: new Date().toISOString(),
                totalTokens: params.totalTokens
            })
        }
    });

    return {
        ...updatedTranslation,
        status: updatedTranslation.status as TranslationStatus,
        createdAt: updatedTranslation.createdAt.toISOString(),
        updatedAt: updatedTranslation.updatedAt.toISOString(),
        translationMetadata: updatedTranslation.translationMetadata || ''
    } as Translation;
};

const handleTranslationError = async (error: any, translationId: string): Promise<void> => {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    await updateTranslationStatus(
        translationId,
        TranslationStatus.ERROR,
        undefined,
        undefined,
        errorMessage
    );
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
    knowledgeBaseId: string,
    translationId: string
): Promise<void> => {
    try {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id: knowledgeBaseId },
            select: {
                vectorStoreId: true,
                name: true,
                description: true
            }
        });

        if (!knowledgeBase?.vectorStoreId) {
            throw new Error('Vector Store não encontrada para esta base de conhecimento');
        }

        // Criar mensagem com contexto estruturado
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: `Instruções de Contextualização:
                1. Use a Vector Store ID: ${knowledgeBase.vectorStoreId}
                2. Nome da Base: ${knowledgeBase.name}
                3. Descrição: ${knowledgeBase.description}
                4. Aplique este contexto para melhorar a precisão da tradução
                5. Mantenha consistência com a terminologia da base de conhecimento
                6. Priorize traduções já estabelecidas neste contexto`
        });

        await updateTranslationStatus(
            translationId, 
            TranslationStatus.RETRIEVING_CONTEXT,
            threadId,
            undefined,
            `Contextualizando com base de conhecimento: ${knowledgeBase.name}`
        );

    } catch (error) {
        console.error('Erro ao adicionar contexto da base de conhecimento:', error);
        throw new Error('Falha ao configurar contexto da tradução');
    }
};

interface ChunkResult {
    chunks: string[];
    totalTokens: number;
}

const splitIntoChunks = async (content: string, maxTokens: number = 128000): Promise<ChunkResult> => {
    try {
        const totalTokens = await countTokens(content);
        
        if (totalTokens <= maxTokens) {
            return { chunks: [content], totalTokens };
        }

        const paragraphs = content.split(/\n\n+/);
        const chunks: string[] = [];
        let currentChunk = '';
        let currentTokens = 0;
        const overlap = 1000; // Overlap de tokens para manter contexto

        for (const paragraph of paragraphs) {
            const paragraphTokens = await countTokens(paragraph);
            
            if (currentTokens + paragraphTokens > maxTokens) {
                // Salvar chunk atual e começar novo
                if (currentChunk) {
                    chunks.push(currentChunk);
                }
                
                // Pegar último parágrafo do chunk anterior para overlap
                const lastParagraph = currentChunk.split(/\n\n+/).slice(-2).join('\n\n');
                currentChunk = lastParagraph + '\n\n' + paragraph;
                currentTokens = await countTokens(currentChunk);
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
                currentTokens += paragraphTokens;
            }
        }

        // Adicionar último chunk
        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return { chunks, totalTokens };
    } catch (error) {
        console.error('Erro ao dividir conteúdo em chunks:', error);
        throw new Error('Falha ao processar arquivo grande');
    }
};

const processTranslation = async (params: TranslateFileParams, content: string): Promise<TranslationResult> => {
    const thread = await openai.beta.threads.create();
    const assistantId = params.useCustomPrompt && params.promptId 
        ? await getCustomAssistantId(params.promptId)
        : process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!;

    const translatedText = await executeAndMonitorTranslation(thread.id, assistantId, params.translationId);
    
    return {
        content: translatedText,
        metadata: {
            completedAt: new Date().toISOString(),
            model: 'gpt-4-turbo-preview',
            totalTokens: await countTokens(translatedText),
            threadId: thread.id,
            assistantId,
            status: TranslationStatus.COMPLETED
        }
    };
};

export const translateFile = async (params: TranslateFileParams): Promise<TranslationResult> => {
    const thread = await openai.beta.threads.create();
    
    try {
        const fileContent = await extractFileContent(params.filePath);
        
        // Configurar contexto se necessário
        if (params.useKnowledgeBase && params.knowledgeBaseId) {
            await updateTranslationStatus(params.translationId, TranslationStatus.RETRIEVING_CONTEXT);
            await addKnowledgeBaseContext(thread.id, params.knowledgeBaseId, params.translationId);
        }

        const assistantId = params.useCustomPrompt && params.promptId 
            ? params.promptId 
            : process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!;

        const translatedContent = await executeAndMonitorTranslation(
            thread.id, 
            assistantId,
            params.translationId
        );

        return {
            content: translatedContent,
            metadata: {
                completedAt: new Date().toISOString(),
                model: 'gpt-4-turbo-preview',
                totalTokens: await countTokens(translatedContent),
                threadId: thread.id,
                assistantId,
                status: TranslationStatus.COMPLETED
            }
        };
    } catch (error) {
        console.error('Erro na tradução:', error);
        throw error;
    }
};

const retrieveTranslatedContent = async (threadId: string): Promise<string> => {
    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data[0];
    
    if (!lastMessage || !lastMessage.content[0]) {
        throw new Error('Nenhuma mensagem encontrada');
    }
    
    if ('text' in lastMessage.content[0]) {
        return lastMessage.content[0].text.value;
    }
    
    throw new Error('Formato de mensagem não suportado');
};

const mapOpenAIStatusToTranslation = (status: RunStatus): TranslationStatus => {
    const statusMap: Record<RunStatus, TranslationStatus> = {
        'queued': TranslationStatus.PENDING,
        'in_progress': TranslationStatus.TRANSLATING,
        'completed': TranslationStatus.COMPLETED,
        'failed': TranslationStatus.ERROR,
        'cancelled': TranslationStatus.ERROR,
        'cancelling': TranslationStatus.PROCESSING,
        'expired': TranslationStatus.ERROR,
        'requires_action': TranslationStatus.PROCESSING,
        'incomplete': TranslationStatus.ERROR
    };
    
    return statusMap[status] || TranslationStatus.ERROR;
};

const calculateProgressPercentage = (status: { status: string }): number => {
    const progressMap: Record<string, number> = {
        'completed': 100,
        'failed': 0,
        'cancelled': 0,
        'expired': 0,
        'in_progress': 50
    };
    
    return progressMap[status.status] || 25;
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

export class TranslationService {
    private openai: OpenAI;
    private defaultAssistantId: string;

    constructor() {
        this.openai = openai;
        this.defaultAssistantId = process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!;
    }

    private async updateStatus(translationId: string, status: TranslationStatus) {
        await prisma.translation.update({
            where: { id: translationId },
            data: { status }
        });

        global.io?.emit('translation:progress', {
            translationId,
            status,
            timestamp: new Date()
        });
    }

    private async addKnowledgeBaseContext(threadId: string, knowledgeBaseId: string) {
        const kb = await prisma.knowledgeBase.findUnique({
            where: { id: knowledgeBaseId }
        });

        if (!kb?.vectorStoreId) return;

        // Buscar contexto relevante
        const relevantContext = await simpleSearchKnowledgeBaseContext(knowledgeBaseId, 'translation_context');
        
        // Criar mensagem com contexto mais estruturado
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: `Contexto para melhorar a tradução:
                     1. Use este glossário e referências específicas: ${relevantContext}
                     2. Mantenha consistência com traduções anteriores
                     3. Preserve formatação e estilo do texto original
                     4. Mantenha termos técnicos conforme o contexto`
        });
    }

    private async executeTranslation(threadId: string, assistantId: string, content: string, sourceLanguage: string, targetLanguage: string, translationId: string): Promise<string> {
        try {
            await openai.beta.threads.messages.create(threadId, {
                role: 'user',
                content: `Traduza o seguinte texto de ${sourceLanguage} para ${targetLanguage}:\n\n${content}`
            });

            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });

            const status = await monitorRunStatus(threadId, run.id, translationId);

            if (status.status !== 'completed') {
                throw new Error(`Falha na tradução: ${status.last_error?.message || 'Erro desconhecido'}`);
            }

            return await retrieveTranslatedContent(threadId);
        } catch (error) {
            console.error('Erro na execução da tradução:', error);
            throw error;
        }
    }

    async translateFile(params: TranslateFileParams): Promise<TranslationResult> {
        const thread = await this.openai.beta.threads.create();
        
        try {
            const fileContent = await extractFileContent(params.filePath);
            
            // Configurar contexto se necessário
            if (params.useKnowledgeBase && params.knowledgeBaseId) {
                await this.updateStatus(params.translationId, TranslationStatus.RETRIEVING_CONTEXT);
                await this.addKnowledgeBaseContext(thread.id, params.knowledgeBaseId);
            }

            const assistantId = params.useCustomPrompt && params.promptId 
                ? params.promptId 
                : this.defaultAssistantId;

            const translatedContent = await this.executeTranslation(
                thread.id, 
                assistantId,
                fileContent,
                params.sourceLanguage,
                params.targetLanguage,
                params.translationId
            );

            return {
                content: translatedContent,
                metadata: {
                    completedAt: new Date().toISOString(),
                    model: 'gpt-4-turbo-preview',
                    totalTokens: await countTokens(translatedContent),
                    threadId: thread.id,
                    assistantId,
                    status: TranslationStatus.COMPLETED
                }
            };
        } catch (error) {
            console.error('Erro na tradução:', error);
            throw error;
        }
    }
}

const monitorRunStatus = async (
    threadId: string,
    runId: string,
    translationId: string
): Promise<{ status: string; last_error?: { message: string } }> => {
    const MAX_RETRIES = 60;
    let retries = 0;

    while (retries < MAX_RETRIES) {
        try {
            const run = await openai.beta.threads.runs.retrieve(threadId, runId);
            const status = mapOpenAIStatusToTranslation(run.status as RunStatus);
            
            await updateTranslationStatus(
                translationId,
                status,
                threadId,
                runId,
                `Status atual: ${run.status}`
            );

            if (run.status === 'completed') {
                return { status: run.status };
            } else if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                return { 
                    status: run.status,
                    last_error: { message: run.last_error?.message || 'Erro desconhecido' }
                };
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
            retries++;

        } catch (error) {
            console.error('Erro ao monitorar status da run:', error);
            await handleTranslationError(error, translationId);
            throw error;
        }
    }

    throw new Error('Timeout ao aguardar conclusão da tradução');
};

const countTokens = async (content: string): Promise<number> => {
    try {
        const encoding = await import('tiktoken');
        const enc = encoding.get_encoding("cl100k_base");
        const tokens = enc.encode(content);
        enc.free();
        return tokens.length;
    } catch (error) {
        console.error('Erro ao contar tokens:', error);
        throw new Error('Falha ao verificar tamanho do conteúdo');
    }
};

interface TranslationData {
    id: string;
    status: TranslationStatus;
    filePath: string;
    translatedFilePath: string;
    sourceLanguage: string;
    targetLanguage: string;
    cost: number;
    metadata: {
        inputTokens: number;
        outputTokens: number;
        model: string;
        threadId: string;
        runId: string;
        completedAt: string;
    };
}

const executeTranslation = async (
    threadId: string,
    assistantId: string,
    content: string,
    sourceLanguage: string,
    targetLanguage: string,
    translationId: string
): Promise<string> => {
    try {
        await openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: `Traduza o seguinte texto de ${sourceLanguage} para ${targetLanguage}:\n\n${content}`
        });

        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId
        });

        const status = await monitorRunStatus(threadId, run.id, translationId);

        if (status.status !== 'completed') {
            throw new Error(`Falha na tradução: ${status.last_error?.message || 'Erro desconhecido'}`);
        }

        return await retrieveTranslatedContent(threadId);
    } catch (error) {
        console.error('Erro na execução da tradução:', error);
        throw error;
    }
};

const generateTranslatedFileName = (originalPath: string): string => {
    const ext = path.extname(originalPath);
    const baseName = path.basename(originalPath, ext);
    return `${baseName}_translated_${Date.now()}${ext}`;
};

