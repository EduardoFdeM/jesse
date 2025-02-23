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
import { DocumentStructure, PageStructure, PageElement, DocumentElement, PDFTable, PDFTableRow, PDFTableCell, TableOptions } from '../utils/fileParser/types.js';
import { MARKERS } from '../utils/fileParser/types.js';

interface TranslationData {
    id: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    fileType: string;
    sourceLanguage: string;
    targetLanguage: string;
    status: string;
    errorMessage?: string;
    translatedUrl?: string;
    costData?: string;
    userId: string;
    knowledgeBaseId?: string;
    threadId?: string;
    runId?: string;
    assistantId?: string;
    usedAssistant: boolean;
    assistant?: {
        id: string;
        name: string;
        model: string;
    } | undefined;
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

interface ChunkInfo {
    text: string;
    startIndex: number;
    endIndex: number;
    overlap: {
        before?: string;
        after?: string;
    };
}

// Constantes para gerenciamento de chunks
const CHUNK_SIZE = 16000; // aumentado para 16k caracteres por chunk
const OVERLAP_SIZE = 800; // reduzido para 800 caracteres de sobreposição
const MAX_RETRIES = 5; // aumentado para 5 tentativas
const RETRY_DELAY = 5000; // aumentado para 5 segundos
const MAX_RUN_TIME = 15 * 60 * 1000; // aumentado para 15 minutos

interface TranslationChunk {
    content: string;
    metadata: {
        pageIndex: number;
        elementIndices: number[];
        style: Record<string, any>;
    };
}

// Função auxiliar para desenhar tabela
function drawPDFTable(doc: PDFKit.PDFDocument, table: PDFTable, options: TableOptions = {}) {
    const cellWidth = (options.width || 500) / table.rows[0].cells.length;
    const startX = doc.page.margins.left;
    const padding = options.padding || 5;

    table.rows.forEach((row, rowIndex) => {
        let currentX = startX;
        const maxHeight = Math.max(...row.cells.map(cell => 
            doc.heightOfString(cell.content, { width: cellWidth - padding * 2 })
        ));

        row.cells.forEach((cell) => {
            doc.text(cell.content, currentX, doc.y, {
                width: cellWidth - padding * 2,
                align: cell.style?.alignment || 'left'
            });
            currentX += cellWidth;
        });

        doc.moveDown();
        if (rowIndex === 0 && row.isHeader) {
            doc.moveDown(0.5);
        }
    });
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
        console.log('📝 Iniciando salvamento do arquivo...', {
            fileName,
            outputFormat,
            tamanhoTexto: text.length
        });

        let fileBuffer: Buffer;
        const finalFileName = fileName.replace(/\.[^/.]+$/, `.${outputFormat}`);

        switch (outputFormat.toLowerCase()) {
            case 'txt':
            case 'text':
            case 'plain': {
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
                    size: 'A4',
                    autoFirstPage: false // Importante para controlar melhor as páginas
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

                    // Verificar se temos uma estrutura de documento
                    const structure = text.includes('<structure>') ? 
                        JSON.parse(text.split('<structure>')[1].split('</structure>')[0]) : null;

                    if (structure) {
                        // Usar a estrutura para reconstruir o PDF
                        structure.elements.forEach((element: DocumentElement, index: number) => {
                            if (index === 0 || element.type === 'column') {
                                pdfDoc.addPage();
                            }

                            switch (element.type) {
                                case 'heading1':
                                    pdfDoc.fontSize(24).font('Helvetica-Bold')
                                        .text(element.content, {
                                            align: element.style?.alignment || 'left'
                                        });
                                    break;

                                case 'heading2':
                                    pdfDoc.fontSize(20).font('Helvetica-Bold')
                                        .text(element.content, {
                                            align: element.style?.alignment || 'left'
                                        });
                                    break;

                                case 'heading3':
                                    pdfDoc.fontSize(16).font('Helvetica-Bold')
                                        .text(element.content, {
                                            align: element.style?.alignment || 'left'
                                        });
                                    break;

                                case 'paragraph':
                                    pdfDoc.fontSize(12).font('Helvetica')
                                        .text(element.content, {
                                            align: element.style?.alignment || 'left',
                                            columns: element.style?.columnSpan,
                                            columnGap: 20
                                        });
                                    break;

                                case 'table':
                                    if (element.children) {
                                        const tableRows: PDFTableRow[] = element.children.map((row: DocumentElement) => ({
                                            cells: row.children?.map((cell: DocumentElement) => ({
                                                content: cell.content,
                                                style: cell.style
                                            })) || [],
                                            isHeader: row.style?.isHeader
                                        }));

                                        const table: PDFTable = {
                                            rows: tableRows,
                                            style: element.style
                                        };

                                        drawPDFTable(pdfDoc, table, {
                                            width: 500,
                                            padding: 5
                                        });
                                    }
                                    break;

                                case 'column':
                                    if (element.children) {
                                        const columnWidth = element.position?.width || pdfDoc.page.width / 2;
                                        const x = element.position?.x || 50;
                                        element.children.forEach((child: DocumentElement) => {
                                            pdfDoc.text(child.content, x, element.position?.y || 50, {
                                                width: columnWidth,
                                                align: child.style?.alignment || 'left'
                                            });
                                        });
                                    }
                                    break;
                            }
                        });
                    } else {
                        // Manter o comportamento anterior para compatibilidade
                        if (text.includes(MARKERS.PAGE_BREAK)) {
                            const pages = text.split(MARKERS.PAGE_BREAK);
                            pages.forEach((pageContent, pageIndex) => {
                                pdfDoc.addPage();
                                if (pageContent.includes(MARKERS.COLUMN_BREAK)) {
                                    const columns = pageContent.split(MARKERS.COLUMN_BREAK);
                                    const columnWidth = (pdfDoc.page.width - 100) / columns.length;
                                    
                                    columns.forEach((columnContent, columnIndex) => {
                                        pdfDoc.text(columnContent.trim(), {
                                            columns: columns.length,
                                            columnGap: 20,
                                            width: columnWidth,
                                            align: 'left',
                                            continued: false
                                        });
                                    });
                                } else {
                                    pdfDoc.text(pageContent.trim(), {
                                        align: 'left',
                                        continued: false
                                    });
                                }
                            });
                        } else {
                            pdfDoc.addPage();
                            pdfDoc.text(text, { align: 'left' });
                        }
                    }
                    pdfDoc.end();
                });
            }
            default: {
                throw new Error(`Formato de saída '${outputFormat}' não suportado`);
            }
        }

        console.log('📤 Fazendo upload para S3...');
        const fileUrl = await uploadToS3(fileBuffer, finalFileName);
        console.log('✅ Upload concluído:', fileUrl);

        return {
            filePath: fileUrl,
            fileSize: fileBuffer.length,
            fileName: finalFileName
        };
    } catch (err) {
        console.error('❌ Erro ao salvar arquivo:', err);
        throw err;
    }
};

// Melhorar o progresso para incluir todas as etapas
const PROGRESS_STEPS = {
    EXTRACTION: 10,
    TRANSLATION: 60,
    FILE_PROCESSING: 20,
    UPLOAD: 10
};

// Função para dividir o texto em chunks com sobreposição
function splitIntoChunks(content: string): ChunkInfo[] {
    console.log('📊 Iniciando divisão em chunks:', {
        tamanhoTotal: content.length,
        chunkSize: CHUNK_SIZE,
        overlapSize: OVERLAP_SIZE
    });

    const chunks: ChunkInfo[] = [];
    const pages = content.split(MARKERS.PAGE_BREAK).filter(Boolean);
    let currentChunk = '';
    let startIndex = 0;

    console.log(`📄 Total de páginas detectadas: ${pages.length}`);

    for (const page of pages) {
        if (currentChunk.length + page.length <= CHUNK_SIZE) {
            currentChunk += page + '\n';
        } else {
            // Adicionar chunk atual com sobreposição
            if (currentChunk) {
                const overlap = {
                    before: chunks.length > 0 ? chunks[chunks.length - 1].text.slice(-OVERLAP_SIZE) : undefined,
                    after: page.slice(0, OVERLAP_SIZE)
                };

                chunks.push({
                    text: currentChunk,
                    startIndex,
                    endIndex: startIndex + currentChunk.length,
                    overlap
                });

                console.log(`📦 Chunk ${chunks.length} criado:`, {
                    tamanho: currentChunk.length,
                    possuiOverlapAntes: !!overlap.before,
                    possuiOverlapDepois: !!overlap.after
                });
            }

            startIndex += currentChunk.length;
            currentChunk = page + '\n';
        }
    }

    // Adicionar último chunk
    if (currentChunk) {
        chunks.push({
            text: currentChunk,
            startIndex,
            endIndex: startIndex + currentChunk.length,
            overlap: {
                before: chunks.length > 0 ? chunks[chunks.length - 1].text.slice(-OVERLAP_SIZE) : undefined
            }
        });

        console.log(`📦 Último chunk ${chunks.length} criado:`, {
            tamanho: currentChunk.length,
            possuiOverlapAntes: chunks.length > 0
        });
    }

    console.log(`✅ Divisão em chunks concluída. Total: ${chunks.length} chunks`);
    return chunks;
}

async function waitForRunCompletion(threadId: string, runId: string, translationId: string): Promise<string> {
    let retries = 0;
    const startTime = Date.now();

    while (true) {
        try {
            const runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, runId);
            
            console.log(`🔄 Status da run ${runId}:`, {
                status: runStatus.status,
                tempoDecorrido: `${Math.round((Date.now() - startTime) / 1000)}s`
            });
            
            // Verificar timeout
            if (Date.now() - startTime > MAX_RUN_TIME) {
                throw new Error('Tempo máximo de execução excedido');
            }

            switch (runStatus.status) {
                case 'completed':
                    const messages = await openaiClient.beta.threads.messages.list(threadId);
                    const assistantMessage = messages.data.find(m => m.role === 'assistant');
                    if (assistantMessage?.content[0]?.type === 'text') {
                        const resposta = assistantMessage.content[0].text.value;
                        console.log(`✅ Tradução concluída:`, {
                            tamanhoResposta: resposta.length,
                            tempoTotal: `${Math.round((Date.now() - startTime) / 1000)}s`
                        });
                        return resposta;
                    }
                    throw new Error('Resposta do assistant em formato inválido');

                case 'failed':
                    console.error('❌ Run falhou:', runStatus.last_error);
                    throw new Error(`Run falhou: ${runStatus.last_error?.message || 'Erro desconhecido'}`);

                case 'expired':
                    throw new Error('Run expirou');

                case 'cancelled':
                    throw new Error('Run foi cancelado');

                case 'in_progress':
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;

                default:
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
            }
        } catch (error) {
            console.error('❌ Erro ao verificar status do run:', error);
            
            if (retries < MAX_RETRIES) {
                retries++;
                console.log(`🔄 Tentativa ${retries} de ${MAX_RETRIES}...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
                continue;
            }
            
            throw new Error(`Falha após ${MAX_RETRIES} tentativas: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
    }
}

export const translateFile = async (params: TranslateFileParams & { fileBuffer: Buffer }): Promise<TranslationData> => {
    let thread: { id: string } | null = null;
    let currentChunkIndex = 0;

    try {
        console.log('🚀 Iniciando tradução:', {
            id: params.translationId,
            arquivo: params.originalName,
            tamanho: `${Math.round(params.fileBuffer.length / 1024)}KB`,
            idiomas: `${params.sourceLanguage} → ${params.targetLanguage}`
        });

        // Extrair texto do buffer do arquivo
        const outputFormat = params.outputFormat.split('/').pop() || 'txt';
        const fileContent = await extractTextFromBuffer(params.fileBuffer, params.outputFormat);

        // Dividir o conteúdo em chunks
        const chunks = splitIntoChunks(fileContent);
        let translatedContent = '';

        // Criar thread principal
        thread = await openaiClient.beta.threads.create({
            messages: []
        });

        // Traduzir cada chunk sequencialmente
        for (currentChunkIndex = 0; currentChunkIndex < chunks.length; currentChunkIndex++) {
            const chunk = chunks[currentChunkIndex];
            let retries = 0;
            let success = false;

            while (!success && retries < MAX_RETRIES) {
                try {
                    console.log(`🔄 Traduzindo chunk ${currentChunkIndex + 1}/${chunks.length}:`, {
                        tamanho: chunk.text.length,
                        posicao: `${chunk.startIndex}-${chunk.endIndex}`,
                        tentativa: retries + 1
                    });

                    // Criar mensagem com o chunk atual
                    const prompt = `Traduza o seguinte texto de ${params.sourceLanguage} para ${params.targetLanguage}, mantendo a formatação original e preservando todos os números, referências e citações exatamente como estão. 
${chunk.overlap.before ? 'Contexto anterior:\n' + chunk.overlap.before + '\n---\n' : ''}
Texto para traduzir:\n${chunk.text}
${chunk.overlap.after ? '\n---\nContexto posterior:\n' + chunk.overlap.after : ''}`;

                    await openaiClient.beta.threads.messages.create(thread.id, {
                        role: 'user',
                        content: prompt
                    });

                    // Criar run para este chunk
                    const run = await openaiClient.beta.threads.runs.create(thread.id, {
                        assistant_id: params.assistantId || process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!,
                        instructions: "Mantenha todos os números, referências e citações exatamente como estão no texto original."
                    });

                    // Aguardar tradução do chunk
                    const chunkTranslation = await waitForRunCompletion(thread.id, run.id, params.translationId);

                    // Processar e adicionar a tradução do chunk
                    const processedTranslation = mergeTranslatedChunk(
                        chunkTranslation,
                        currentChunkIndex === 0,
                        currentChunkIndex === chunks.length - 1
                    );

                    translatedContent += processedTranslation;
                    success = true;

                    // Emitir progresso
                    const progress = Math.round(((currentChunkIndex + 1) / chunks.length) * 100);
                    emitTranslationProgress(params.translationId, progress);

                    // Aguardar um pouco entre chunks para evitar rate limits
                    if (currentChunkIndex < chunks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                } catch (error) {
                    console.error(`❌ Erro ao traduzir chunk ${currentChunkIndex + 1}:`, error);
                    retries++;
                    
                    if (retries >= MAX_RETRIES) {
                        throw new Error(`Falha após ${MAX_RETRIES} tentativas no chunk ${currentChunkIndex + 1}`);
                    }

                    // Esperar antes de tentar novamente
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
                }
            }
        }

        console.log('✅ Tradução completa:', {
            chunksProcessados: chunks.length,
            tamanhoOriginal: fileContent.length,
            tamanhoTraduzido: translatedContent.length
        });

        // Salvar arquivo traduzido
        const savedFile = await saveFileContent(
            translatedContent,
            params.originalName,
            outputFormat
        );

        // Atualizar registro da tradução
        const updatedTranslation = await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'completed',
                filePath: savedFile.filePath,
                fileSize: savedFile.fileSize,
                fileName: savedFile.fileName,
                plainTextContent: translatedContent,
                errorMessage: null
            }
        });

        emitTranslationCompleted(updatedTranslation);
        return {
            ...updatedTranslation,
            errorMessage: updatedTranslation.errorMessage || undefined
        } as TranslationData;

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
async function getKnowledgeBaseName(id: string): Promise<string | undefined> {
    const kb = await prisma.knowledgeBase.findUnique({
        where: { id },
        select: { name: true }
    });
    return kb?.name || undefined;
}

async function translateChunk(
    chunk: ChunkInfo,
    sourceLanguage: string,
    targetLanguage: string,
    selectedAssistant?: Assistant
): Promise<string> {
    const prompt = `Traduza o seguinte texto de ${sourceLanguage} para ${targetLanguage}. 
${chunk.overlap.before ? 'Contexto anterior:\n' + chunk.overlap.before + '\n---\n' : ''}
Texto para traduzir:\n${chunk.text}
${chunk.overlap.after ? '\n---\nContexto posterior:\n' + chunk.overlap.after : ''}`;

    // Criar thread com a mensagem inicial
    const thread = await openaiClient.beta.threads.create({
        messages: [{
            role: 'user',
            content: prompt
        }]
    });

    // Criar run com o assistant
    const run = await openaiClient.beta.threads.runs.create(thread.id, {
        assistant_id: selectedAssistant?.assistantId || process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!
    });

    // Aguardar conclusão
    while (true) {
        const status = await openaiClient.beta.threads.runs.retrieve(thread.id, run.id);
        if (status.status === 'completed') {
            const messages = await openaiClient.beta.threads.messages.list(thread.id);
            const translatedContent = messages.data[0].content[0].text.value;
            return translatedContent;
        } else if (status.status === 'failed') {
            throw new Error('Falha na tradução do chunk');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

function mergeTranslatedChunk(translatedText: string, isFirst: boolean, isLast: boolean): string {
    // Remover contextos de sobreposição se presentes
    const lines = translatedText.split('\n');
    let cleanedText = translatedText;

    if (!isFirst && lines[0].includes('Contexto anterior:')) {
        const startIndex = translatedText.indexOf('Texto para traduzir:');
        if (startIndex !== -1) {
            cleanedText = translatedText.slice(startIndex + 'Texto para traduzir:'.length);
        }

    }

    if (!isLast && cleanedText.includes('Contexto posterior:')) {
        const endIndex = cleanedText.indexOf('Contexto posterior:');
        if (endIndex !== -1) {
            cleanedText = cleanedText.slice(0, endIndex);
        }
    }

    return cleanedText.trim() + '\n';
}

async function translateStructuredDocument(
    documentStructure: DocumentStructure,
    sourceLanguage: string,
    targetLanguage: string,
    translationId: string,
    assistantId: string
): Promise<DocumentStructure> {
    const chunks: TranslationChunk[] = [];
    let currentChunk: TranslationChunk = {
        content: '',
        metadata: {
            pageIndex: 0,
            elementIndices: [],
            style: {}
        }
    };

    // Dividir o documento em chunks mantendo a estrutura
    documentStructure.pages.forEach((page: PageStructure, pageIndex: number) => {
        page.elements.forEach((element: PageElement, elementIndex: number) => {
            const elementContent = `<element type="${element.type}" style=${JSON.stringify(element.style)}>
                ${element.content}
            </element>`;

            if (currentChunk.content.length + elementContent.length > CHUNK_SIZE) {
                chunks.push(currentChunk);
                currentChunk = {
                    content: '',
                    metadata: {
                        pageIndex,
                        elementIndices: [],
                        style: {}
                    }
                };
            }

            currentChunk.content += elementContent;
            currentChunk.metadata.elementIndices.push(elementIndex);
        });
    });

    if (currentChunk.content.length > 0) {
        chunks.push(currentChunk);
    }

    // Criar thread com parâmetros corretos
    const thread = await openaiClient.beta.threads.create({
        messages: []
    });

    // Corrigir a criação do run para cada chunk
    for (const [index, chunk] of chunks.entries()) {
        // Primeiro adicionar a mensagem
        const message = await openaiClient.beta.threads.messages.create(thread.id, {
            role: 'user',
            content: `Traduza este chunk mantendo a estrutura XML:\n${chunk.content}\n\nContexto: Chunk ${index + 1} de ${chunks.length}`
        });

        // Depois criar o run
        const run = await openaiClient.beta.threads.runs.create(thread.id, {
            assistant_id: assistantId
        });

        // Aguardar conclusão
        while (true) {
            const status = await openaiClient.beta.threads.runs.retrieve(thread.id, run.id);
            if (status.status === 'completed') {
                const messages = await openaiClient.beta.threads.messages.list(thread.id);
                const translatedContent = messages.data[0].content[0].text.value;
                const translatedChunk: TranslationChunk = {
                    content: translatedContent,
                    metadata: {
                        pageIndex: chunk.metadata.pageIndex,
                        elementIndices: chunk.metadata.elementIndices,
                        style: chunk.metadata.style
                    }
                };
                chunks[index] = translatedChunk;
                break;
            } else if (status.status === 'failed') {
                throw new Error(`Falha na tradução do chunk ${index + 1}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Emitir progresso
        const progress = Math.round(((index + 1) / chunks.length) * 100);
        emitTranslationProgress(translationId, progress);
    }

    // Reconstruir o documento
    const translatedDocument: DocumentStructure = {
        ...documentStructure,
        pages: documentStructure.pages.map((page: PageStructure) => ({
            ...page,
            elements: page.elements.map((element: PageElement) => {
                const chunk = chunks.find(c => 
                    c.metadata.pageIndex === page.pageIndex &&
                    c.metadata.elementIndices.includes(element.elementIndex)
                );
                
                if (!chunk) return element;

                const translatedElement = parseTranslatedElement(chunk.content);
                return {
                    ...element,
                    content: translatedElement.content
                };
            })
        }))
    };

    return translatedDocument;
}

function parseTranslatedElement(xmlContent: string): PageElement {
    const match = xmlContent.match(/<element type="([^"]+)" style=({[^}]+})>([\s\S]+?)<\/element>/);
    if (!match) throw new Error('Formato inválido retornado pelo assistant');

    const [, type, styleStr, content] = match;
    return {
        type: type as PageElement['type'],
        content: content.trim(),
        style: JSON.parse(styleStr),
        elementIndex: 0, // Será atualizado ao reconstruir o documento
        position: {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        }
    };
}


