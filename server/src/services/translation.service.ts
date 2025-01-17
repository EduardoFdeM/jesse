import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import PDFParser from 'pdf2json';
import PDFDocument from 'pdfkit';
import prisma from '../config/database.js';
import { uploadToS3 } from '../config/storage.js';
import { validateOpenAIConnection } from '../config/openai.js';
import { Server } from 'socket.io';

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

// Função otimizada para dividir o texto em chunks muito maiores
const splitTextIntoChunks = (text: string, maxChunkSize: number = 24000): string[] => {
    // Remover quebras de linha extras e espaços em branco
    text = text.replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
    
    // Dividir em parágrafos primeiro
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        // Se o parágrafo sozinho é maior que o tamanho máximo, dividir em sentenças
        if (paragraph.length > maxChunkSize) {
            const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [];
            for (const sentence of sentences) {
                if ((currentChunk + sentence).length <= maxChunkSize) {
                    currentChunk += sentence;
                } else {
                    if (currentChunk) chunks.push(currentChunk.trim());
                    currentChunk = sentence;
                }
            }
        } else if ((currentChunk + paragraph).length <= maxChunkSize) {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        } else {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
        }
    }
    
    if (currentChunk) chunks.push(currentChunk.trim());
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

// Função para estimar número de tokens (aproximado)
const estimateTokens = (text: string): number => {
    // Aproximadamente 4 caracteres por token
    return Math.ceil(text.length / 4);
};

// Interface para custos de tradução
interface TranslationCost {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// Função para traduzir um chunk com retry
const translateChunkWithRetry = async (
    chunk: string,
    params: TranslateFileParams,
    knowledgeBaseContent: string,
    retries = 3
): Promise<{ text: string; costLog: TranslationCost }> => {
    // Validar conexão com OpenAI antes de tentar traduzir
    const isValid = await validateOpenAIConnection();
    if (!isValid) {
        throw new Error('Não foi possível conectar com o serviço OpenAI. Verifique a chave API.');
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const prompt = `Traduza o seguinte texto de ${params.sourceLanguage} para ${params.targetLanguage}:\n\n${chunk}`;

            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "Você é um tradutor profissional. Traduza o texto mantendo o formato e estilo original."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 4000
            });

            const translatedText = completion.choices[0]?.message?.content || '';

            if (!translatedText) {
                throw new Error('Resposta vazia da OpenAI');
            }

            return {
                text: translatedText,
                costLog: {
                    inputTokens: completion.usage?.prompt_tokens || 0,
                    outputTokens: completion.usage?.completion_tokens || 0,
                    totalTokens: completion.usage?.total_tokens || 0
                }
            };
        } catch (error: unknown) {
            if (error instanceof Error && 'status' in error && error.status === 401) {
                // Erro de autenticação - não tentar novamente
                await prisma.translation.update({
                    where: { id: params.translationId },
                    data: {
                        status: 'error',
                        errorMessage: 'Erro de autenticação com OpenAI. Contate o administrador.'
                    }
                });
                throw new Error('Erro de autenticação com OpenAI');
            }

            if (attempt === retries) {
                throw error;
            }

            // Delay exponencial entre tentativas
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
    throw new Error('Falha após todas as tentativas de tradução');
};

interface TranslateFileParams {
    filePath: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
    knowledgeBasePath?: string;
    translationId: string;
    outputFormat: string;
}

export type ChatCompletionMessageParam = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};

// Função para gerar nome único de arquivo
const generateUniqueFileName = (originalName: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    return `${baseName}_${timestamp}_${random}${ext}`;
};

// Função para salvar texto como PDF e fazer upload para o Spaces
const saveTextAsPDF = async (text: string, fileName: string): Promise<{ filePath: string; fileSize: number }> => {
    try {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                margin: 50,
                size: 'A4'
            });

            const chunks: Buffer[] = [];
            
            doc.on('data', chunk => chunks.push(chunk));
            
            doc.on('end', async () => {
                try {
                    const fileBuffer = Buffer.concat(chunks);
                    const fileUrl = await uploadToS3(fileBuffer, fileName);
                    
                    resolve({
                        filePath: fileUrl,
                        fileSize: fileBuffer.length
                    });
                } catch (err) {
                    reject(err);
                }
            });

            doc.fontSize(12);
            doc.text(text, {
                align: 'left',
                lineGap: 5
            });

            doc.end();
        });
    } catch (err) {
        console.error('Erro ao gerar ou fazer upload do PDF:', err);
        throw err;
    }
};

// Função para salvar arquivo traduzido
const saveTranslatedFile = async (text: string, fileName: string, outputFormat: string): Promise<{ filePath: string; fileSize: number; fileName: string }> => {
    try {
        const result = await saveTextAsPDF(text, fileName);
        return {
            ...result,
            fileName: fileName.replace(/\.[^/.]+$/, '.pdf')
        };
    } catch (err) {
        console.error('Erro ao salvar arquivo traduzido:', err);
        throw err;
    }
};

// Função para preservar a formatação do texto
const preserveFormatting = (originalText: string, translatedText: string): string => {
    // Se o texto original começa com #, mantenha o mesmo nível de heading
    const headingMatch = originalText.match(/^#+\s/);
    if (headingMatch?.length) {
        const headingLevel = headingMatch[0];
        return `${headingLevel} ${translatedText.replace(/^#+\s*/, '')}`;
    }

    // Preservar listas não ordenadas (*, -, +)
    const listMatch = originalText.match(/^[*\-+]\s/);
    if (listMatch?.length) {
        const marker = listMatch[0].charAt(0);
        return `${marker} ${translatedText.replace(/^[*\-+]\s*/, '')}`;
    }

    // Preservar listas ordenadas (1., 2., etc)
    const orderedListMatch = originalText.match(/^\d+\.\s/);
    if (orderedListMatch?.length) {
        const number = orderedListMatch[0].match(/^\d+/)?.[0] || '1';
        return `${number}. ${translatedText.replace(/^\d+\.\s*/, '')}`;
    }

    // Preservar citações (>)
    if (originalText.startsWith('> ')) {
        return `> ${translatedText.replace(/^>\s*/, '')}`;
    }

    // Preservar código inline (`code`)
    const codeMatches = originalText.match(/`[^`]+`/g);
    if (codeMatches) {
        let result = translatedText;
        codeMatches.forEach(match => {
            const code = match.replace(/`/g, '');
            result = result.replace(code, match);
        });
        return result;
    }

    // Preservar bold e italic (**bold**, *italic*, __bold__, _italic_)
    const boldMatch = originalText.match(/(\*\*|__)[^*_]+(\*\*|__)/);
    if (boldMatch) {
        const markers = boldMatch[1];
        return `${markers}${translatedText.replace(/(\*\*|__)/g, '')}${markers}`;
    }

    const italicMatch = originalText.match(/([*_])[^*_]+([*_])/);
    if (italicMatch) {
        const markers = italicMatch[1];
        return `${markers}${translatedText.replace(/[*_]/g, '')}${markers}`;
    }

    // Preservar links [texto](url)
    const linkMatch = originalText.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
        const url = linkMatch[2];
        return `[${translatedText.replace(/\[([^\]]+)\]\(([^)]+)\)/, '$1')}](${url})`;
    }

    // Preservar imagens ![alt](url)
    const imageMatch = originalText.match(/!\[([^\]]+)\]\(([^)]+)\)/);
    if (imageMatch) {
        const url = imageMatch[2];
        return `![${translatedText.replace(/!\[([^\]]+)\]\(([^)]+)\)/, '$1')}](${url})`;
    }

    return translatedText;
};

// Função para traduzir mantendo a formatação
const translateChunkWithFormatting = async (
    chunk: string, 
    params: TranslateFileParams,
    knowledgeBaseContent?: string
): Promise<string> => {
    const lines = chunk.split('\n');
    const translatedLines = await Promise.all(
        lines.map(async (line) => {
            if (!line.trim()) return line;
            const result = await translateChunkWithRetry(
                line, 
                params, 
                knowledgeBaseContent || ''
            );
            return preserveFormatting(line, result.text);
        })
    );
    return translatedLines.join('\n');
};

// Função principal de tradução
export const translateFile = async (params: TranslateFileParams): Promise<TranslationData> => {
    try {
        // Verificar e atualizar status
        const translation = await prisma.translation.findUnique({
            where: { id: params.translationId }
        });

        if (!translation) {
            throw new Error('Tradução não encontrada');
        }

        if (translation.status !== 'pending') {
            throw new Error('Tradução já está em andamento ou finalizada');
        }

        // Atualizar status para processing
        await prisma.translation.update({
            where: { id: params.translationId },
            data: { 
                status: 'processing',
                errorMessage: null
            }
        });

        // Processar tradução
        const fileContent = params.filePath.endsWith('.pdf')
            ? await extractTextFromPDF(params.filePath)
            : fs.readFileSync(params.filePath, 'utf-8');

        const chunks = splitTextIntoChunks(fileContent);
        const translatedChunks: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const translatedText = await translateChunkWithFormatting(chunks[i], params);
            translatedChunks.push(translatedText);
            
            // Emitir progresso via socket
            const progress = Math.round((i + 1) / chunks.length * 100);
            await prisma.translation.update({
                where: { id: params.translationId },
                data: { status: `processing (${progress}%)` }
            });
            
            if (global.io) {
                global.io.emit('translation:progress', { 
                    id: params.translationId, 
                    progress 
                });
            }
        }

        // Salvar resultado
        const uniqueFileName = generateUniqueFileName(params.filePath);
        const savedFile = await saveTranslatedFile(translatedChunks.join('\n'), uniqueFileName, params.outputFormat);

        // Finalizar tradução e emitir evento de conclusão
        const updatedTranslation = await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'completed',
                filePath: savedFile.filePath,
                fileSize: savedFile.fileSize,
                fileName: savedFile.fileName
            }
        });

        // Emitir evento de conclusão
        if (global.io) {
            global.io.emit('translation:completed', updatedTranslation);
        }

        return updatedTranslation;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'error',
                errorMessage
            }
        });
        
        if (global.io) {
            global.io.emit('translation:error', { 
                id: params.translationId, 
                error: errorMessage
            });
        }
        
        throw error;
    }
};

