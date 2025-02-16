import fs from 'fs';
import OpenAI from 'openai';
import PDFParser from 'pdf2json';
import PDFDocument from 'pdfkit';
import prisma from '../config/database.js';
import { uploadToS3 } from '../config/storage.js';
import { Document, Paragraph, Packer, TextRun } from 'docx';

interface PDFParserData {
    Pages: Array<{
        Texts: Array<{
            R: Array<{
                T: string;
            }>;
        }>;
    }>;
}

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

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Função para extrair texto do PDF com timeout
const extractTextFromPDF = (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout ao extrair texto do PDF'));
        }, 30000);

        const pdfParser = new PDFParser();
        
        pdfParser.on('pdfParser_dataReady', (data: PDFParserData) => {
            clearTimeout(timeout);
            try {
                const text = data.Pages.map((page) => {
                    return page.Texts.map((text) => 
                        text.R.map((r) => decodeURIComponent(r.T)).join('')
                    ).join('\n');
                }).join('\n\n---PAGE---\n\n');

                resolve(text);
            } catch {
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
            reject(error instanceof Error ? error : new Error('Erro desconhecido'));
        }
    });
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

export const translateFile = async (params: TranslateFileParams): Promise<TranslationData> => {
    try {
        // Extrair texto do arquivo
        const fileContent = params.filePath.endsWith('.pdf')
            ? await extractTextFromPDF(params.filePath)
            : await fs.promises.readFile(params.filePath, 'utf-8');

        // Criar thread para a tradução
        const thread = await openai.beta.threads.create();

        // Atualizar com o threadId
        await prisma.translation.update({
            where: { id: params.translationId },
            data: { 
                threadId: thread.id,
                status: 'processing'
            }
        });

        // Adicionar a mensagem com o texto para tradução
        await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: `Traduza o seguinte texto de ${params.sourceLanguage} para ${params.targetLanguage}. Mantenha a formatação original:\n\n${fileContent}`
        });

        // Executar o assistant padrão
        const run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!
        });

        // Aguardar conclusão
        let translatedContent = '';
        while (true) {
            const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            if (runStatus.status === 'completed') {
                const messages = await openai.beta.threads.messages.list(thread.id);
                const assistantMessage = messages.data.find(m => m.role === 'assistant');
                if (assistantMessage?.content[0]?.type === 'text') {
                    translatedContent = assistantMessage.content[0].text.value;
                }
                break;
            } else if (runStatus.status === 'failed') {
                throw new Error('Falha na tradução');
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Salvar arquivo traduzido
        const savedFile = await saveFileContent(
            translatedContent,
            params.originalName,
            'pdf'
        );

        // Atualizar registro da tradução
        const updatedTranslation = await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'completed',
                filePath: savedFile.filePath,
                fileSize: savedFile.fileSize,
                fileName: savedFile.fileName,
                plainTextContent: translatedContent
            }
        });

        global.io?.emit('translation:completed', updatedTranslation);
        return updatedTranslation;

    } catch (error) {
        await handleTranslationError(error, params.translationId);
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

// Funções de acesso ao banco
export const getTranslation = async (id: string) => {
    return prisma.translation.findUnique({ 
        where: { id },
        include: {
            knowledgeBase: true,
            prompt: true
        }
    });
};

export const getTranslations = async (userId: string) => {
    return prisma.translation.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
            knowledgeBase: true,
            prompt: true
        }
    });
};

