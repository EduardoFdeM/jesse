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

interface TextChunkWithContext {
    content: string;
    index: number;
    overlap: {
        previous?: string;
        next?: string;
    };
}

const MAX_TOKENS_PER_REQUEST = 4000; // Reduzido para garantir margem
const OVERLAP_SIZE = 200; // Caracteres de sobreposição entre chunks
const MIN_CHUNK_SIZE = 1000; // Tamanho mínimo do chunk

const splitTextIntelligently = (text: string): TextChunkWithContext[] => {
    const chunks: TextChunkWithContext[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    let currentChunk = '';
    let index = 0;

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const nextSentence = sentences[i + 1];
        
        // Adicionar sentença atual
        if ((currentChunk.length + sentence.length) < MAX_TOKENS_PER_REQUEST * 4) {
            currentChunk += sentence;
        } else {
            // Preparar sobreposição
            const previousOverlap = i > 0 ? sentences[i - 1] : undefined;
            const nextOverlap = nextSentence;

            chunks.push({
                content: currentChunk.trim(),
                index: index++,
                overlap: {
                    previous: previousOverlap,
                    next: nextOverlap
                }
            });

            currentChunk = sentence; // Começar novo chunk com a sentença atual
        }
    }

    // Adicionar último chunk se houver
    if (currentChunk) {
        chunks.push({
            content: currentChunk.trim(),
            index: index,
            overlap: {
                previous: sentences[sentences.length - 2],
                next: undefined
            }
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
    previousChunk?: TextChunkWithContext;
    nextChunk?: TextChunkWithContext;
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
    chunk: TextChunkWithContext,
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

        // Dividir em chunks com sobreposição
        const chunks = splitTextIntelligently(fileContent);
        const translatedChunks: string[] = [];
        let totalCost = {
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0
        };

        // Traduzir cada chunk com contexto
        for (let i = 0; i < chunks.length; i++) {
            const context: TranslationContext = {
                knowledgeBase: knowledgeBaseData,
                prompt: customPrompt,
                sourceLanguage: params.sourceLanguage,
                targetLanguage: params.targetLanguage
            };

            const result = await translateChunkWithRetry(chunks[i], params, context);
            
            // Remover sobreposições duplicadas
            let translatedText = result.text;
            if (i > 0 && chunks[i].overlap.previous) {
                // Remover sobreposição com chunk anterior
                translatedText = removeDuplicateOverlap(translatedChunks[i-1], translatedText);
            }
            
            translatedChunks.push(translatedText);

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

        // Juntar chunks traduzidos removendo duplicações nas sobreposições
        const translatedContent = translatedChunks.join('\n\n');
        
        // Salvar arquivo traduzido
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

const translateWithContext = async (chunk: TextChunkWithContext, context: TranslationContext) => {
    try {
        let messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: context.prompt || DEFAULT_TRANSLATION_PROMPT
            }
        ];

        // Adicionar contexto de sobreposição
        if (chunk.overlap.previous) {
            messages.push({
                role: 'user',
                content: `Contexto anterior:\n${chunk.overlap.previous}\n`
            });
        }

        // Adicionar base de conhecimento se disponível
        if (context.knowledgeBase) {
            const relevantContext = await extractRelevantContext(chunk.content, context.knowledgeBase);
            if (relevantContext) {
                messages.push({
                    role: 'user',
                    content: `Contexto relevante:\n${relevantContext}\n`
                });
            }
        }

        // Adicionar o texto principal para tradução
        messages.push({
            role: 'user',
            content: `Traduza de ${context.sourceLanguage} para ${context.targetLanguage}:\n${chunk.content}`
        });

        // Adicionar contexto posterior se disponível
        if (chunk.overlap.next) {
            messages.push({
                role: 'user',
                content: `Próximo contexto:\n${chunk.overlap.next}\n`
            });
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages,
            temperature: 0.3,
            max_tokens: MAX_TOKENS_PER_REQUEST
        });

        return response;
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

// Função auxiliar para remover sobreposições duplicadas
const removeDuplicateOverlap = (previousChunk: string, currentChunk: string): string => {
    const words1 = previousChunk.split(/\s+/);
    const words2 = currentChunk.split(/\s+/);
    
    // Encontrar a maior sequência comum no final do chunk anterior
    let maxOverlap = 0;
    for (let i = 1; i <= Math.min(OVERLAP_SIZE, words1.length); i++) {
        const end1 = words1.slice(-i).join(' ');
        const start2 = words2.slice(0, i).join(' ');
        if (end1 === start2) {
            maxOverlap = i;
        }
    }
    
    // Remover a sobreposição do início do chunk atual
    return words2.slice(maxOverlap).join(' ');
};

// Função para extrair contexto relevante da base de conhecimento
const extractRelevantContext = async (text: string, knowledgeBase: KnowledgeBase): Promise<string> => {
    try {
        const chunks = await prisma.knowledgeBaseChunk.findMany({
            where: {
                knowledgeBaseId: knowledgeBase.id
            },
            select: {
                content: true
            }
        });

        // Extrair termos técnicos do texto atual
        const textTerms = extractTechnicalTerms(text);
        
        // Filtrar chunks relevantes
        const relevantChunks = chunks
            .filter(chunk => {
                const chunkTerms = extractTechnicalTerms(chunk.content);
                return hasRelevantOverlap(chunkTerms, textTerms);
            })
            .map(chunk => chunk.content)
            .slice(0, 3); // Limitar a 3 chunks mais relevantes

        return relevantChunks.join('\n\n');
    } catch (error) {
        console.error('Erro ao extrair contexto relevante:', error);
        return '';
    }
};

// Função auxiliar para extrair termos técnicos
const extractTechnicalTerms = (text: string): string[] => {
    const patterns = [
        /[A-Z][a-z]+(?:[A-Z][a-z]+)*/g,  // CamelCase
        /\b[A-Z]+\b/g,                    // Siglas
        /\b[A-Z][a-z]+\b/g,              // Palavras capitalizadas
        /\b\w+(?:[-_]\w+)+\b/g           // Termos com hífen ou underscore
    ];

    const terms = new Set<string>();
    patterns.forEach(pattern => {
        const matches = text.match(pattern) || [];
        matches.forEach(term => terms.add(term));
    });

    return Array.from(terms);
};

// Função auxiliar para verificar sobreposição relevante de termos
const hasRelevantOverlap = (terms1: string[], terms2: string[]): boolean => {
    const overlap = terms1.filter(term => terms2.includes(term));
    // Considerar relevante se houver pelo menos 2 termos em comum
    return overlap.length >= 2;
};

