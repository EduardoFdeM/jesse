import fs from 'fs';
import OpenAI from 'openai';
import PDFParser from 'pdf2json';
import PDFDocument from 'pdfkit';
import prisma from '../config/database.js';
import { uploadToS3 } from '../config/storage.js';
import { Server } from 'socket.io';
import { Document, Paragraph, Packer, TextRun } from 'docx';

interface PDFTextR {
    T: string;
}

interface PDFText {
    R: PDFTextR[];
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

// Função otimizada para dividir o texto mantendo a formatação
const splitTextIntoChunks = (text: string, maxChunkSize: number = 24000): string[] => {
    const lines = text.split(/\r?\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
        if (line.length > maxChunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            
            let remainingLine = line;
            while (remainingLine.length > 0) {
                const chunk = remainingLine.slice(0, maxChunkSize);
                chunks.push(chunk);
                remainingLine = remainingLine.slice(maxChunkSize);
            }
        } 
        else if ((currentChunk + line + '\n').length > maxChunkSize) {
            chunks.push(currentChunk);
            currentChunk = line + '\n';
        } 
        else {
            currentChunk += line + '\n';
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk);
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
        
        pdfParser.on('pdfParser_dataReady', (pdfData: PDFData) => {
            clearTimeout(timeout);
            try {
                const text = pdfData.Pages
                    .map((page: PDFPage) => 
                        page.Texts.map((text: PDFText) => 
                            text.R.map((r: PDFTextR) => r.T).join('')
                        ).join(' ')
                    )
                    .join('\n');
                resolve(decodeURIComponent(text));
            } catch {
                reject(new Error('Erro ao processar texto do PDF'));
            }
        });
        
        pdfParser.on('pdfParser_dataError', () => {
            clearTimeout(timeout);
            reject(new Error('Erro ao processar PDF'));
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

// Função para traduzir um chunk com retry
const translateChunkWithRetry = async (
    chunk: string,
    params: TranslateFileParams,
    _knowledgeBaseContent: string
): Promise<{ text: string; costLog: TranslationCost }> => {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Você é um tradutor profissional de ${params.sourceLanguage} para ${params.targetLanguage}. 
                             Mantenha EXATAMENTE a mesma formatação do texto original, incluindo:
                             - Espaçamentos e indentação
                             - Quebras de linha
                             - Bullets e numeração
                             - Títulos e subtítulos
                             - Tabelas e colunas
                             - Parágrafos e alinhamento
                             - Qualquer caractere especial ou símbolo
                             - Para idiomas RTL (árabe e persa), mantenha a direção correta do texto
                             - Preserve caracteres especiais e diacríticos
                             - Mantenha a formatação específica de cada idioma`
                },
                { 
                    role: "user", 
                    content: chunk 
                }
            ]
        });

        const translatedText = completion.choices[0]?.message?.content || '';

        return {
            text: translatedText,
            costLog: {
                inputTokens: completion.usage?.prompt_tokens || 0,
                outputTokens: completion.usage?.completion_tokens || 0,
                totalTokens: completion.usage?.total_tokens || 0
            }
        };
    } catch (error) {
        console.error('Erro na tradução:', error);
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

                    // Preservar quebras de linha no PDF
                    text.split('\n').forEach(line => {
                        pdfDoc.text(line, {
                            align: 'left',
                            continued: false
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
}

export type ChatCompletionMessageParam = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};

// Função principal de tradução
export const translateFile = async (params: TranslateFileParams): Promise<TranslationData> => {
    try {
        const fileContent = params.filePath.endsWith('.pdf')
            ? await extractTextFromPDF(params.filePath)
            : fs.readFileSync(params.filePath, 'utf-8');

        const chunks = splitTextIntoChunks(fileContent);
        const translatedChunks: string[] = [];
        let totalCost = 0;

        for (let i = 0; i < chunks.length; i++) {
            const result = await translateChunkWithRetry(chunks[i], params, '');
            translatedChunks.push(result.text);
            totalCost += result.costLog.totalTokens;
            
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

        // Forçar formato de saída como PDF
        const translatedFileName = generateTranslatedFileName(
            params.originalName || 'documento',
            'pdf'
        );
        
        const savedFile = await saveTranslatedFile(
            translatedChunks.join('\n'),
            translatedFileName,
            'pdf' // Forçar PDF
        );

        // Finalizar tradução e emitir evento de conclusão
        const updatedTranslation = await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'completed',
                filePath: savedFile.filePath,
                fileSize: savedFile.fileSize,
                fileName: savedFile.fileName,
                costData: calculateCost(totalCost, 0)
            }
        });

        // Emitir evento de conclusão
        if (global.io) {
            global.io.emit('translation:completed', updatedTranslation);
        }

        return updatedTranslation;
    } catch (processError) {
        const errorMessage = processError instanceof Error ? processError.message : 'Erro desconhecido';
        await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'error',
                errorMessage
            }
        });
        
        global.io?.emit('translation:error', { 
            id: params.translationId, 
            error: errorMessage
        });
        
        throw processError;
    }
};

