import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { NotFoundError } from '../utils/errors';
import prisma from '../config/database';
import { Translation } from '@prisma/client';
import PDFParser from 'pdf2json';
import PDFDocument from 'pdfkit';
import { emitTranslationProgress } from './socket.service';

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
        }, 30000); // 30 segundos de timeout

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

// Constantes para cálculo de custo
const COST_PER_1K_INPUT_TOKENS = 0.0015;   // $0.0015 por 1K tokens de entrada
const COST_PER_1K_OUTPUT_TOKENS = 0.0020;  // $0.0020 por 1K tokens de saída

// Função para estimar número de tokens (aproximado)
const estimateTokens = (text: string): number => {
    // Aproximadamente 4 caracteres por token
    return Math.ceil(text.length / 4);
};

// Interface para log de custos
interface CostLog {
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
}

// Função para traduzir um chunk com retry e tratamento de timeout
const translateChunkWithRetry = async (
    chunk: string,
    params: TranslateFileParams,
    knowledgeBaseContent: string,
    retries = 2,
    isRetry = false
): Promise<{ text: string; costLog: CostLog }> => {
    // Se o chunk for muito grande, dividir antes de tentar traduzir
    if (!isRetry && chunk.length > 24000) {
        const halfPoint = Math.floor(chunk.length / 2);
        const splitPoint = chunk.lastIndexOf('. ', halfPoint) + 1 || halfPoint;
        
        const firstHalf = await translateChunkWithRetry(
            chunk.slice(0, splitPoint),
            params,
            knowledgeBaseContent,
            retries,
            true
        );
        const secondHalf = await translateChunkWithRetry(
            chunk.slice(splitPoint),
            params,
            knowledgeBaseContent,
            retries,
            true
        );
        
        return {
            text: firstHalf.text + ' ' + secondHalf.text,
            costLog: {
                inputTokens: firstHalf.costLog.inputTokens + secondHalf.costLog.inputTokens,
                outputTokens: firstHalf.costLog.outputTokens + secondHalf.costLog.outputTokens,
                inputCost: firstHalf.costLog.inputCost + secondHalf.costLog.inputCost,
                outputCost: firstHalf.costLog.outputCost + secondHalf.costLog.outputCost,
                totalCost: firstHalf.costLog.totalCost + secondHalf.costLog.totalCost
            }
        };
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Prompt mais conciso para economizar tokens
            const prompt = `Traduza de ${params.sourceLanguage} para ${params.targetLanguage}:${
                knowledgeBaseContent ? `\nGlossário:${knowledgeBaseContent}\nTexto:` : '\nTexto:'
            }${chunk}`;

            // Adicionar timeout para evitar chamadas muito longas
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout na tradução')), 60000); // 1 minuto
            });

            const translationPromise = openai.completions.create({
                model: "gpt-3.5-turbo-instruct",
                prompt: prompt,
                temperature: 0.3,
                max_tokens: Math.min(4096, Math.floor(chunk.length * 1.3)),
                frequency_penalty: 0,
                presence_penalty: 0,
                top_p: 1
            });

            // Usar Promise.race para implementar timeout
            const completion = await Promise.race([translationPromise, timeoutPromise]) as OpenAI.Completion;

            // Se chegou aqui, a tradução foi bem sucedida
            const translatedText = completion.choices[0]?.text?.trim() || '';
            
            // Verificar se a tradução parece válida
            if (translatedText.length < chunk.length * 0.3) {
                throw new Error('Tradução parece incompleta');
            }

            // Calcular custos
            const inputTokens = estimateTokens(prompt);
            const outputTokens = estimateTokens(translatedText);
            const inputCost = (inputTokens / 1000) * COST_PER_1K_INPUT_TOKENS;
            const outputCost = (outputTokens / 1000) * COST_PER_1K_OUTPUT_TOKENS;

            return {
                text: translatedText,
                costLog: {
                    inputTokens,
                    outputTokens,
                    inputCost,
                    outputCost,
                    totalCost: inputCost + outputCost
                }
            };
        } catch (error: unknown) {
            console.error(`Tentativa ${attempt} falhou:`, error);
            
            if (error instanceof Error && error.message?.includes('context_length_exceeded')) {
                // Se excedeu o limite de contexto e não é uma retry, dividir o chunk
                if (!isRetry && chunk.length > 1000) {
                    const halfPoint = Math.floor(chunk.length / 2);
                    const splitPoint = chunk.lastIndexOf('. ', halfPoint) + 1 || halfPoint;
                    
                    const firstHalf = await translateChunkWithRetry(
                        chunk.slice(0, splitPoint),
                        params,
                        knowledgeBaseContent,
                        retries,
                        true
                    );
                    const secondHalf = await translateChunkWithRetry(
                        chunk.slice(splitPoint),
                        params,
                        knowledgeBaseContent,
                        retries,
                        true
                    );
                    
                    return {
                        text: firstHalf.text + ' ' + secondHalf.text,
                        costLog: {
                            inputTokens: firstHalf.costLog.inputTokens + secondHalf.costLog.inputTokens,
                            outputTokens: firstHalf.costLog.outputTokens + secondHalf.costLog.outputTokens,
                            inputCost: firstHalf.costLog.inputCost + secondHalf.costLog.inputCost,
                            outputCost: firstHalf.costLog.outputCost + secondHalf.costLog.outputCost,
                            totalCost: firstHalf.costLog.totalCost + secondHalf.costLog.totalCost
                        }
                    };
                }
            }

            if (attempt === retries) throw error;
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
}

export type ChatCompletionMessageParam = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};

// Função para salvar texto como PDF
const saveTextAsPDF = async (text: string, outputPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                margin: 50,
                size: 'A4'
            });

            const writeStream = fs.createWriteStream(outputPath);
            doc.pipe(writeStream);

            // Configurar fonte e tamanho
            doc.fontSize(12);
            
            // Adicionar o texto, quebrando em páginas automaticamente
            doc.text(text, {
                align: 'left',
                lineGap: 5
            });

            // Finalizar o documento
            doc.end();

            writeStream.on('finish', () => {
                resolve();
            });

            writeStream.on('error', (error) => {
                reject(error);
            });
        } catch (error) {
            reject(error);
        }
    });
};

interface TranslationLock {
    translationId: string;
    userId: string;
    timestamp: number;
    status: 'pending' | 'processing' | 'completed' | 'error';
}

// Cache para controle de traduções ativas
const activeTranslations = new Map<string, TranslationLock>();
const TRANSLATION_LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutos

// Função para limpar locks antigos
const cleanupTranslationLocks = () => {
    const now = Date.now();
    for (const [key, lock] of activeTranslations.entries()) {
        if (now - lock.timestamp > TRANSLATION_LOCK_TIMEOUT) {
            activeTranslations.delete(key);
            // Atualizar status no banco se necessário
            if (lock.status === 'processing' || lock.status === 'pending') {
                prisma.translation.update({
                    where: { id: lock.translationId },
                    data: {
                        status: 'error',
                        errorMessage: 'Tradução expirou por timeout'
                    }
                }).catch(console.error);
            }
        }
    }
};

// Função para verificar e atualizar o estado da tradução
const checkAndLockTranslation = async (translationId: string, userId: string): Promise<boolean> => {
    // Limpar locks antigos primeiro
    cleanupTranslationLocks();

    const lockKey = `${userId}-${translationId}`;
    const existingLock = activeTranslations.get(lockKey);

    if (existingLock) {
        // Se o lock existe e não expirou, não permitir nova tradução
        if (Date.now() - existingLock.timestamp < TRANSLATION_LOCK_TIMEOUT) {
            return false;
        }
        // Se expirou, remover o lock antigo
        activeTranslations.delete(lockKey);
    }

    const translation = await prisma.translation.findUnique({
        where: { id: translationId }
    });

    if (!translation || translation.status !== 'pending') {
        return false;
    }

    // Criar novo lock
    activeTranslations.set(lockKey, {
        translationId,
        userId,
        timestamp: Date.now(),
        status: 'processing'
    });

    return true;
};

// Função para atualizar o status do lock
const updateTranslationLock = (translationId: string, userId: string, status: TranslationLock['status']) => {
    const lockKey = `${userId}-${translationId}`;
    const lock = activeTranslations.get(lockKey);
    if (lock) {
        lock.status = status;
        activeTranslations.set(lockKey, lock);
    }
};

// Função para liberar o lock da tradução
const unlockTranslation = (translationId: string, userId: string) => {
    const lockKey = `${userId}-${translationId}`;
    activeTranslations.delete(lockKey);
};

export const translateFile = async (params: TranslateFileParams): Promise<Translation> => {
    console.log('🔄 Iniciando tradução do arquivo:', params);
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(params.filePath)) {
        throw new Error('Arquivo não encontrado');
    }

    // Verificar status atual da tradução
    const translation = await prisma.translation.findUnique({
        where: { id: params.translationId }
    });

    if (!translation) {
        throw new Error('Tradução não encontrada');
    }

    if (translation.status !== 'pending' && translation.status !== 'processing') {
        throw new Error('Tradução já está em andamento ou finalizada');
    }

    let totalCostLog: CostLog = {
        inputTokens: 0,
        outputTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0
    };

    try {
        // Atualizar status para processing
        await prisma.translation.update({
            where: { id: params.translationId },
            data: { status: 'processing (0%)' }
        });

        // Extrair e limpar texto do arquivo
        let fileContent: string;
        try {
            if (params.filePath.endsWith('.pdf')) {
                fileContent = await extractTextFromPDF(params.filePath);
            } else {
                fileContent = fs.readFileSync(params.filePath, 'utf-8');
            }

            // Limpeza agressiva do texto para reduzir tokens
            fileContent = fileContent
                .replace(/\s+/g, ' ')
                .replace(/\n\s*\n/g, '\n')
                .replace(/[^\S\n]+/g, ' ')
                .replace(/\s*\n\s*/g, '\n')
                .trim();

        } catch (error) {
            await prisma.translation.update({
                where: { id: params.translationId },
                data: { 
                    status: 'error',
                    errorMessage: 'Erro ao extrair texto do arquivo'
                }
            });
            throw error;
        }

        // Preparar base de conhecimento de forma mais compacta
        let knowledgeBaseContent = '';
        if (params.knowledgeBasePath) {
            try {
                const rawContent = fs.readFileSync(params.knowledgeBasePath, 'utf-8');
                // Limpeza agressiva do glossário
                knowledgeBaseContent = rawContent
                    .replace(/\s+/g, ' ')
                    .replace(/\n\s*\n/g, ';')
                    .replace(/[^\S\n]+/g, ' ')
                    .trim();
            } catch (error) {
                console.warn('Erro ao ler base de conhecimento:', error);
            }
        }

        // Dividir em chunks maiores e traduzir
        const chunks = splitTextIntoChunks(fileContent);
        let translatedChunks: string[] = [];
        let failedChunks = 0;

        // Cache para evitar traduções duplicadas
        const translatedCache = new Map<string, { text: string; costLog: CostLog }>();

        // Processar um chunk por vez para melhor controle
        for (let i = 0; i < chunks.length; i++) {
            try {
                const chunk = chunks[i];
                let result;

                // Verificar se o chunk já foi traduzido (ignorando espaços extras)
                const normalizedChunk = chunk.replace(/\s+/g, ' ').trim();
                if (translatedCache.has(normalizedChunk)) {
                    result = translatedCache.get(normalizedChunk)!;
                    console.log('🔄 Usando tradução em cache');
                } else {
                    result = await translateChunkWithRetry(
                        chunk,
                        params,
                        knowledgeBaseContent
                    );
                    translatedCache.set(normalizedChunk, result);
                }

                translatedChunks.push(result.text);

                // Acumular custos
                totalCostLog.inputTokens += result.costLog.inputTokens;
                totalCostLog.outputTokens += result.costLog.outputTokens;
                totalCostLog.inputCost += result.costLog.inputCost;
                totalCostLog.outputCost += result.costLog.outputCost;
                totalCostLog.totalCost += result.costLog.totalCost;

                // Atualizar progresso e custos
                const progress = Math.round((i + 1) / chunks.length * 100);
                await prisma.translation.update({
                    where: { id: params.translationId },
                    data: { 
                        status: `processing (${progress}%)`,
                        costData: JSON.stringify(totalCostLog)
                    }
                });

                // Emitir progresso via WebSocket
                emitTranslationProgress(params.translationId, progress);

                console.log(`Progresso da tradução ${params.translationId}: ${progress}%`);
                console.log('💰 Custos até agora:', {
                    inputTokens: totalCostLog.inputTokens,
                    outputTokens: totalCostLog.outputTokens,
                    inputCost: `$${totalCostLog.inputCost.toFixed(4)}`,
                    outputCost: `$${totalCostLog.outputCost.toFixed(4)}`,
                    totalCost: `$${totalCostLog.totalCost.toFixed(4)}`
                });

                // Pequeno delay entre chunks
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                failedChunks++;
                console.error(`Erro ao traduzir chunk ${i + 1}:`, error);
                
                if (failedChunks > 2) {
                    throw new Error('Muitos erros durante a tradução');
                }

                await prisma.translation.update({
                    where: { id: params.translationId },
                    data: { 
                        status: 'processing_with_errors',
                        errorMessage: `Erro ao traduzir parte ${i + 1}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
                    }
                });
            }
        }

        if (translatedChunks.length === 0) {
            throw new Error('Nenhum texto foi traduzido com sucesso');
        }

        // Salvar resultado
        const translatedText = translatedChunks.join('\n');
        const translatedFileName = `translated_${Date.now()}${path.extname(params.filePath)}`;
        const translatedDir = path.join(process.cwd(), 'translated_pdfs');
        const translatedFilePath = path.join(translatedDir, translatedFileName);

        console.log('📁 Salvando arquivo traduzido:', {
            dir: translatedDir,
            filePath: translatedFilePath,
            fileName: translatedFileName
        });

        // Garantir que o diretório existe
        if (!fs.existsSync(translatedDir)) {
            console.log('📂 Criando diretório:', translatedDir);
            fs.mkdirSync(translatedDir, { recursive: true });
        }

        // Salvar o arquivo no formato apropriado
        if (path.extname(params.filePath).toLowerCase() === '.pdf') {
            console.log('📄 Salvando como PDF');
            await saveTextAsPDF(translatedText, translatedFilePath);
        } else {
            console.log('📝 Salvando como texto');
            fs.writeFileSync(translatedFilePath, translatedText, 'utf-8');
        }

        console.log('✅ Arquivo salvo com sucesso');

        // Verificar se o arquivo foi salvo corretamente
        if (!fs.existsSync(translatedFilePath)) {
            throw new Error('Falha ao salvar o arquivo traduzido');
        }

        // Atualizar custos finais
        await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                costData: JSON.stringify(totalCostLog)
            }
        });

        // Atualizar status final
        updateTranslationLock(params.translationId, params.userId, 'completed');

        // Retornar o resultado
        return {
            filePath: translatedFilePath,
            fileName: translatedFileName,
            costData: JSON.stringify(totalCostLog)
        } as Translation;
    } catch (error) {
        console.error('❌ Erro ao traduzir arquivo:', error);
        
        // Atualizar status para erro
        await prisma.translation.update({
            where: { id: params.translationId },
            data: {
                status: 'error',
                errorMessage: error instanceof Error ? error.message : 'Erro desconhecido durante a tradução'
            }
        });
        updateTranslationLock(params.translationId, params.userId, 'error');
        
        throw error;
    } finally {
        // Liberar o lock da tradução
        unlockTranslation(params.translationId, params.userId);
    }
};
