import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import PDFParser from 'pdf2json';
import PDFDocument from 'pdfkit';
import prisma from '../config/database.js';
import { uploadToS3 } from '../config/storage.js';
import { validateOpenAIConnection } from '../config/openai.js';
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
        } catch (err) {
            if (err instanceof Error && 'status' in err && err.status === 401) {
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
                throw err;
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
    originalName: string;
}

export type ChatCompletionMessageParam = {
    role: 'user' | 'assistant' | 'system';
    content: string;
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
                        children: [
                            new Paragraph({
                                children: [new TextRun(text)]
                            })
                        ]
                    }]
                });
                fileBuffer = await Packer.toBuffer(doc);
                break;
            }
            case 'pdf':
            default: {
                const pdfDoc = new PDFDocument({
                    margin: 50,
                    size: 'A4'
                });
                const chunks: Buffer[] = [];
                pdfDoc.on('data', chunk => chunks.push(chunk));
                
                return new Promise((resolve, reject) => {
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

                    pdfDoc.fontSize(12);
                    pdfDoc.text(text, {
                        align: 'left',
                        lineGap: 5
                    });
                    pdfDoc.end();
                });
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

// Função para preservar a formatação do texto
const preserveFormatting = (originalText: string, translatedText: string): string => {
    // Preservar quebras de linha
    if (originalText.includes('\n')) {
        const originalLines = originalText.split('\n');
        const translatedLines = translatedText.split('\n');
        return translatedLines.map((line, index) => {
            // Preservar indentação
            const originalIndentation = originalLines[index]?.match(/^\s*/)?.[0] || '';
            return `${originalIndentation}${line}`;
        }).join('\n');
    }

    // Preservar espaços iniciais e finais
    const originalSpacesBefore = originalText.match(/^\s*/)?.[0] || '';
    const originalSpacesAfter = originalText.match(/\s*$/)?.[0] || '';
    return `${originalSpacesBefore}${translatedText.trim()}${originalSpacesAfter}`;
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

// Função para gerar nome do arquivo traduzido
const generateTranslatedFileName = (originalName: string, outputFormat: string): string => {
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    return `${nameWithoutExt}_traduzido.${outputFormat}`;
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

        // Gerar nome do arquivo traduzido
        const translatedFileName = generateTranslatedFileName(
            params.originalName || 'documento',
            params.outputFormat || 'pdf'
        );

        // Salvar resultado
        const savedFile = await saveTranslatedFile(
            translatedChunks.join('\n'),
            translatedFileName,
            params.outputFormat
        );

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

