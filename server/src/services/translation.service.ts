import fs from 'fs';
import OpenAI from 'openai';
import PDFParser from 'pdf2json';
import PDFDocument from 'pdfkit';
import prisma from '../config/database.js';
import { uploadToS3 } from '../config/storage.js';
import { Server } from 'socket.io';
import { Document, Paragraph, Packer, TextRun } from 'docx';
import { DEFAULT_TRANSLATION_PROMPT } from '../constants/prompts.js';
import axios from 'axios';
import { KnowledgeBase } from '@prisma/client';

interface PDFTextR {
    T: string;
    x: number;
    y: number;
}

interface PDFText {
    R: PDFTextR[];
    x: number;
    y: number;
}

interface PDFPage {
    Texts: PDFText[];
}

interface PDFData {
    Pages: PDFPage[];
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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
}

// Declaração do tipo global
declare global {
    var io: Server | undefined;
}

interface TextChunk {
    content: string;
    index: number;
    wordCount: number;
}

const splitTextIntelligently = (text: string): TextChunk[] => {
    // Dividir em parágrafos primeiro
    const paragraphs = text.split(/\n{2,}/);
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let currentWordCount = 0;
    let chunkIndex = 0;

    // Limite de palavras por chunk (aproximadamente 2000 palavras)
    const WORD_LIMIT = 2000;

    for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/);
        
        // Se o parágrafo sozinho excede o limite
        if (words.length > WORD_LIMIT) {
            // Se temos conteúdo acumulado, salvamos primeiro
            if (currentChunk) {
                chunks.push({
                    content: currentChunk.trim(),
                    index: chunkIndex++,
                    wordCount: currentWordCount
                });
                currentChunk = '';
                currentWordCount = 0;
            }

            // Dividimos o parágrafo grande mantendo sentenças juntas
            const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
            let sentenceChunk = '';
            let sentenceWordCount = 0;

            for (const sentence of sentences) {
                const sentenceWords = sentence.split(/\s+/).length;
                
                if (sentenceWordCount + sentenceWords > WORD_LIMIT) {
                    if (sentenceChunk) {
                        chunks.push({
                            content: sentenceChunk.trim(),
                            index: chunkIndex++,
                            wordCount: sentenceWordCount
                        });
                    }
                    sentenceChunk = sentence;
                    sentenceWordCount = sentenceWords;
                } else {
                    sentenceChunk += ' ' + sentence;
                    sentenceWordCount += sentenceWords;
                }
            }

            if (sentenceChunk) {
                chunks.push({
                    content: sentenceChunk.trim(),
                    index: chunkIndex++,
                    wordCount: sentenceWordCount
                });
            }
        } 
        // Se adicionar o parágrafo atual excede o limite
        else if (currentWordCount + words.length > WORD_LIMIT) {
            chunks.push({
                content: currentChunk.trim(),
                index: chunkIndex++,
                wordCount: currentWordCount
            });
            currentChunk = paragraph;
            currentWordCount = words.length;
        } 
        // Caso contrário, acumula
        else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            currentWordCount += words.length;
        }
    }

    // Adiciona o último chunk se houver
    if (currentChunk) {
        chunks.push({
            content: currentChunk.trim(),
            index: chunkIndex,
            wordCount: currentWordCount
        });
    }

    return chunks;
};

// Função para extrair texto do PDF com timeout
const extractTextFromPDF = (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout ao extrair texto do PDF'));
        }, 30000);

        const pdfParser = new PDFParser();
        
        pdfParser.on('pdfParser_dataReady', (data: any) => {
            clearTimeout(timeout);
            try {
                // Extrair texto mantendo a estrutura de colunas
                const text = data.Pages.map((page: PDFPage) => {
                    // Agrupar textos por posição X para identificar colunas
                    const columnGroups: { [key: number]: PDFText[] } = {};
                    
                    page.Texts.forEach((text: PDFText) => {
                        // Usar a posição X do primeiro elemento R se disponível
                        const xPos = Math.round((text.x || text.R[0]?.x || 0) / 10) * 10;
                        if (!columnGroups[xPos]) {
                            columnGroups[xPos] = [];
                        }
                        columnGroups[xPos].push(text);
                    });

                    // Ordenar colunas da esquerda para direita
                    const sortedColumns = Object.entries(columnGroups)
                        .sort(([a], [b]) => Number(a) - Number(b));

                    // Ordenar textos dentro de cada coluna por posição Y
                    sortedColumns.forEach(([_, texts]) => {
                        texts.sort((a, b) => (a.y || a.R[0]?.y || 0) - (b.y || b.R[0]?.y || 0));
                    });

                    // Montar texto por coluna
                    return sortedColumns.map(([_, texts]) => 
                        texts.map((text: PDFText) => 
                            text.R.map((r: PDFTextR) => decodeURIComponent(r.T)).join('')
                        ).join('\n')
                    ).join('\n\n');
                }).join('\n\n---PAGE---\n\n');

                resolve(text);
            } catch (error) {
                reject(new Error('Erro ao processar texto do PDF'));
            }
        });
        
        pdfParser.on('pdfParser_dataError', (error: Error) => {
            clearTimeout(timeout);
            reject(error);
        });

        try {
            pdfParser.loadPDF(filePath);
        } catch (error) {
            clearTimeout(timeout);
            reject(error);
        }
    });
};

// Interface para custos de tradução
interface TranslationCost {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// Função para preservar a formatação
const preserveFormatting = (originalText: string, translatedText: string): string => {
    const originalLines = originalText.split(/\r?\n/);
    const translatedParts = translatedText.split(/(?<=[.!?])\s+/);
    
    const result: string[] = [];
    let translatedIndex = 0;
    
    for (const originalLine of originalLines) {
        if (!originalLine.trim()) {
            result.push(originalLine); // Preserva linhas em branco
            continue;
        }

        // Preservar indentação
        const indentMatch = originalLine.match(/^[\s\t]*/);
        const indentation = indentMatch ? indentMatch[0] : '';
        
        // Verificar padrões de formatação
        const patterns = {
            numbered: /^(\d+[.|)]\s*)/,
            bullet: /^([-•*]\s*)/,
            specialChar: /^([→—-]\s*)/,
            heading: /^(#{1,6}\s*)/,
            quote: /^(>\s*)/,
            table: /^(\|[^|]+\|)/,
            codeBlock: /^(```|\s{4})/
        };

        let prefix = '';
        for (const [, pattern] of Object.entries(patterns)) {
            const match = originalLine.match(pattern);
            if (match) {
                prefix = match[1];
                break;
            }
        }

        if (translatedIndex < translatedParts.length) {
            const translatedLine = translatedParts[translatedIndex].trim();
            result.push(`${indentation}${prefix}${translatedLine}`);
            translatedIndex++;
        }
    }
    
    return result.join('\n');
};

// Função para calcular custo
const calculateCost = (inputTokens: number, outputTokens: number): string => {
    const COST_PER_1K_INPUT_TOKENS = 0.0015;   // $0.0015 por 1K tokens de entrada
    const COST_PER_1K_OUTPUT_TOKENS = 0.002;   // $0.002 por 1K tokens de saída
    
    const inputCost = (inputTokens / 1000) * COST_PER_1K_INPUT_TOKENS;
    const outputCost = (outputTokens / 1000) * COST_PER_1K_OUTPUT_TOKENS;
    const totalCost = inputCost + outputCost;
    
    return totalCost.toFixed(4); // Sempre usar 4 casas decimais para consistência
};

// Função para buscar e preparar o prompt
const getTranslationPrompt = async (params: TranslateFileParams): Promise<string> => {
    if (!params.promptId) {
        return DEFAULT_TRANSLATION_PROMPT;
    }

    const prompt = await prisma.prompt.findFirst({
        where: { 
            id: params.promptId,
            userId: params.userId
        },
        include: {
            versions: {
                where: {
                    version: params.promptVersion || undefined
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 1
            }
        }
    });

    if (!prompt) {
        throw new Error('Prompt não encontrado');
    }

    // Usar a versão específica se fornecida, caso contrário usar a mais recente
    const version = prompt.versions[0];
    return version ? version.content : prompt.content;
};

interface TranslationContext {
    previousChunk?: TextChunk;
    nextChunk?: TextChunk;
    knowledgeBase?: KnowledgeBase | null;
    prompt?: string;
    sourceLanguage: string;
    targetLanguage: string;
}

interface TranslationResult {
    text: string;
    costLog: {
        totalTokens: number;
        promptTokens: number;
        completionTokens: number;
    };
}

const translateChunkWithRetry = async (
    chunk: TextChunk,
    params: TranslateFileParams,
    context: TranslationContext,
    retries = 3
): Promise<TranslationResult> => {
    try {
        const response = await translateWithContext(chunk, context);
        
        return {
            text: response.choices[0].message.content || '',
            costLog: {
                totalTokens: response.usage?.total_tokens || 0,
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0
            }
        };
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return translateChunkWithRetry(chunk, params, context, retries - 1);
        }
        throw error;
    }
};

// Função para salvar arquivo traduzido
const saveTranslatedFile = async (
    text: string, 
    fileName: string, 
    outputFormat: string
): Promise<{ filePath: string; fileSize: number; fileName: string }> => {
    try {
        let fileBuffer: Buffer;
        const finalFileName = fileName.replace(/\.[^/.]+$/, `.${outputFormat}`);

        switch (outputFormat.toLowerCase()) {
            case 'txt': {
                fileBuffer = Buffer.from(text, 'utf-8');
                break;
            }
            case 'docx': {
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

                    // Configurar layout de colunas
                    const pages = text.split('---PAGE---');
                    pages.forEach((pageContent, pageIndex) => {
                        if (pageIndex > 0) pdfDoc.addPage();

                        const columns = pageContent.split('\n\n');
                        const columnWidth = (pdfDoc.page.width - 100) / columns.length;

                        columns.forEach((columnContent, columnIndex) => {
                            pdfDoc.text(columnContent.trim(), {
                                columns: columns.length,
                                width: columnWidth,
                                height: pdfDoc.page.height - 100,
                                align: 'left',
                                continued: false,
                                indent: columnIndex * columnWidth + 50
                            });
                        });
                    });

                    pdfDoc.end();
                });
            }
            default: {
                throw new Error(`Formato de saída '${outputFormat}' não suportado`);
            }
        }

        // Upload do arquivo para S3
        const fileUrl = await uploadToS3(fileBuffer, finalFileName);
        return {
            filePath: fileUrl,
            fileSize: fileBuffer.length,
            fileName: finalFileName
        };
    } catch (err) {
        console.error('Erro ao salvar arquivo traduzido:', err);
        throw err;
    }
};

// Função para gerar nome do arquivo traduzido
const generateTranslatedFileName = (originalName: string, outputFormat: string): string => {
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    return `${nameWithoutExt}_traduzido.${outputFormat}`;
};

interface TranslateFileParams {
    filePath: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
    knowledgeBasePath?: string;
    translationId: string;
    outputFormat: string;
    originalName: string;
    promptId?: string;
    promptVersion?: string;
    knowledgeBaseId?: string;
    useKnowledgeBase: boolean;
    useCustomPrompt: boolean;
}

export type ChatCompletionMessageParam = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};

// Função principal de tradução
export const translateFile = async (params: TranslateFileParams): Promise<TranslationData> => {
    try {
        let knowledgeBaseContent = '';
        let customPrompt = DEFAULT_TRANSLATION_PROMPT;
        let knowledgeBaseData: KnowledgeBase | null = null;
        
        // Carregar base de conhecimento
        if (params.useKnowledgeBase && params.knowledgeBaseId) {
            knowledgeBaseData = await prisma.knowledgeBase.findUnique({
                where: { id: params.knowledgeBaseId }
            });
            
            if (knowledgeBaseData) {
                try {
                    const response = await axios.get(knowledgeBaseData.filePath, {
                        headers: {
                            'Accept': 'text/plain',
                            'Content-Type': 'text/plain'
                        }
                    });
                    knowledgeBaseContent = response.data;
                } catch (error) {
                    console.error('Erro ao carregar base de conhecimento:', error);
                }
            }
        }

        // Carregar prompt personalizado
        let prompt = null;
        if (params.useCustomPrompt && params.promptId) {
            prompt = await prisma.prompt.findUnique({
                where: { id: params.promptId }
            });
            
            if (prompt) {
                customPrompt = prompt.content;
            }
        }

        // Extrair texto do arquivo
        const fileContent = params.filePath.endsWith('.pdf')
            ? await extractTextFromPDF(params.filePath)
            : await fs.promises.readFile(params.filePath, 'utf-8');

        // Dividir em chunks inteligentemente
        const chunks = splitTextIntelligently(fileContent);
        const translatedChunks: string[] = [];
        let totalCost = {
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0
        };

        // Traduzir cada chunk
        for (let i = 0; i < chunks.length; i++) {
            const context: TranslationContext = {
                previousChunk: i > 0 ? chunks[i - 1] : undefined,
                nextChunk: i < chunks.length - 1 ? chunks[i + 1] : undefined,
                knowledgeBase: knowledgeBaseData,
                prompt: customPrompt,
                sourceLanguage: params.sourceLanguage,
                targetLanguage: params.targetLanguage
            };

            const result = await translateChunkWithRetry(chunks[i], params, context);
            translatedChunks.push(result.text);
            
            // Atualizar custos
            totalCost.totalTokens += result.costLog.totalTokens;
            totalCost.promptTokens += result.costLog.promptTokens;
            totalCost.completionTokens += result.costLog.completionTokens;

            // Atualizar progresso
            const progress = Math.round(((i + 1) / chunks.length) * 100);
            await prisma.translation.update({
                where: { id: params.translationId },
                data: { status: `processing (${progress}%)` }
            });
            
            global.io?.emit('translation:progress', { 
                id: params.translationId, 
                progress 
            });
        }

        // Salvar arquivo traduzido
        const translatedContent = translatedChunks.join('\n\n');
        const savedFile = await saveTranslatedFile(
            translatedContent,
            params.originalName,
            'pdf'
        );

        // Atualizar registro da tradução com mais informações
        const updatedTranslation = await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'completed',
                filePath: savedFile.filePath,
                fileSize: savedFile.fileSize,
                fileName: savedFile.fileName,
                costData: JSON.stringify(totalCost),
                usedPrompt: params.useCustomPrompt,
                usedKnowledgeBase: params.useKnowledgeBase,
                promptId: params.promptId,
                knowledgeBaseId: params.knowledgeBaseId,
                translationMetadata: JSON.stringify({
                    usedKnowledgeBase: params.useKnowledgeBase,
                    usedPrompt: params.useCustomPrompt,
                    knowledgeBaseName: knowledgeBaseData?.name || null,
                    promptName: prompt?.name || null
                })
            },
            include: {
                knowledgeBase: true,
                prompt: true
            }
        });

        global.io?.emit('translation:completed', updatedTranslation);
        return updatedTranslation;

    } catch (error) {
        await handleTranslationError(error, params.translationId);
        throw error;
    }
};

const translateWithContext = async (chunk: TextChunk, context: TranslationContext) => {
    try {
        let knowledgeBaseContent = '';
        
        // Se tiver base de conhecimento, buscar do S3
        if (context.knowledgeBase) {
            try {
                const response = await axios.get(context.knowledgeBase.filePath);
                knowledgeBaseContent = response.data;
            } catch (error) {
                console.error('Erro ao buscar base de conhecimento:', error);
                // Continua sem a base de conhecimento em caso de erro
            }
        }

        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: context.prompt || DEFAULT_TRANSLATION_PROMPT
            },
            {
                role: 'user',
                content: `
                    ${knowledgeBaseContent ? `Base de Conhecimento:\n${knowledgeBaseContent}\n\n` : ''}
                    Texto para traduzir de ${context.sourceLanguage} para ${context.targetLanguage}:
                    ${chunk.content}
                `
            }
        ];

        return await openai.chat.completions.create({
            model: "gpt-4",
            messages,
            temperature: 0.3
        });
    } catch (error) {
        console.error('Erro na tradução:', error);
        throw error;
    }
};

const handleTranslationError = async (error: any, translationId: string) => {
    console.error('Erro na tradução:', error);
    await prisma.translation.update({
        where: { id: translationId },
        data: {
            status: 'error',
            errorMessage: error.message || 'Erro desconhecido durante a tradução'
        }
    });
    global.io?.emit('translation:error', { id: translationId, error: error.message });
};

