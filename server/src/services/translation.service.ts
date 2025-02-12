import fs from 'fs';
import OpenAI from 'openai';
import PDFParser from 'pdf2json';
import PDFDocument from 'pdfkit';
import prisma from '../config/database.js';
import { uploadToS3 } from '../config/storage.js';
import { Document, Paragraph, Packer, TextRun } from 'docx';
import { DEFAULT_TRANSLATION_PROMPT } from '../constants/prompts.js';
import { simpleSearchKnowledgeBaseContext } from './knowledge.service.js';

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
        console.error('Erro ao salvar arquivo traduzido:', err);
        throw err;
    }
};

// Função principal de tradução
export const translateFile = async (params: TranslateFileParams): Promise<TranslationData> => {
    try {
        let knowledgeBaseData: KnowledgeBase | null = null;
        let customPrompt = DEFAULT_TRANSLATION_PROMPT;
        
        // Carregar base de conhecimento se necessário
        if (params.useKnowledgeBase && params.knowledgeBaseId) {
            knowledgeBaseData = await prisma.knowledgeBase.findUnique({
                where: { id: params.knowledgeBaseId }
            });
            
            if (knowledgeBaseData) {
                try {
                    // Buscar metadados dos arquivos
                    const fileMetadata = JSON.parse(knowledgeBaseData.fileMetadata || '[]');
                    const relevantContext = await simpleSearchKnowledgeBaseContext(
                        await fs.promises.readFile(params.filePath, 'utf-8'),
                        params.knowledgeBaseId
                    );
                    
                    // Adicionar informações dos idiomas ao prompt
                    const languageInfo = fileMetadata.map((file: any) => 
                        `${file.fileName}: ${file.sourceLanguage} -> ${file.targetLanguage}`
                    ).join('\n');
                    
                    customPrompt = `${customPrompt}\n\nContexto relevante:\n${relevantContext}\n\nIdiomas dos arquivos:\n${languageInfo}`;
                } catch (error) {
                    console.error('Erro ao carregar base de conhecimento:', error);
                }
            }
        }

        // Carregar prompt personalizado
        if (params.useCustomPrompt && params.promptId) {
            const prompt = await prisma.prompt.findUnique({
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

        // Criar thread para a tradução
        const thread = await openai.beta.threads.create();

        // Atualizar com o threadId
        await prisma.translation.update({
            where: { id: params.translationId },
            data: { threadId: thread.id }
        });

        // Adicionar a mensagem com o texto para tradução
        await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: customPrompt
                .replace('{sourceLanguage}', params.sourceLanguage)
                .replace('{targetLanguage}', params.targetLanguage)
                .replace('{text}', fileContent)
        });

        // Executar o assistant
        const run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: process.env.DEFAULT_TRANSLATOR_ASSISTANT_ID!,
            model: "gpt-4o-mini"
        });

        // Atualizar com o runId
        await prisma.translation.update({
            where: { id: params.translationId },
            data: { 
                runId: run.id,
                status: 'processing'
            }
        });

        // Aguardar conclusão
        let translatedContent = '';
        while (true) {
            const runStatus = await openai.beta.threads.runs.retrieve(
                thread.id,
                run.id
            );

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

            // Aguardar 1 segundo antes de verificar novamente
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Armazenar o conteúdo traduzido em texto plano
        await prisma.translation.update({
            where: { id: params.translationId },
            data: { plainTextContent: translatedContent }
        });

        // Salvar arquivo traduzido
        const savedFile = await saveTranslatedFile(
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
                usedPrompt: params.useCustomPrompt,
                usedKnowledgeBase: params.useKnowledgeBase,
                promptId: params.promptId,
                knowledgeBaseId: params.knowledgeBaseId,
                translationMetadata: JSON.stringify({
                    usedKnowledgeBase: params.useKnowledgeBase,
                    usedPrompt: params.useCustomPrompt,
                    knowledgeBaseName: knowledgeBaseData?.name || null,
                    promptName: params.promptId ? 'Custom Prompt' : 'Default'
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

