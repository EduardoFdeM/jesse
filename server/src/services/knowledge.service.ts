import fs from 'fs';
import path from 'path';
import prisma from '../config/database.js';
import { KnowledgeBase, Prisma } from '@prisma/client';
import { uploadToS3 } from '../config/storage.js';
import openai from '../config/openai.js';
import axios from 'axios';

// Interfaces
interface CreateKnowledgeBaseParams {
    name: string;
    description: string;
    sourceLanguage: string;
    targetLanguage: string;
    userId: string;
    originalFileName?: string;
}

interface TextChunk {
    content: string;
    index: number;
    wordCount: number;
}

interface TranslationContext {
    previousChunk?: TextChunk;
    nextChunk?: TextChunk;
    knowledgeBase?: string;
    prompt?: string;
    sourceLanguage: string;
    targetLanguage: string;
}

// Funções principais
export const processKnowledgeBaseFile = async (filePath: string, params: CreateKnowledgeBaseParams): Promise<KnowledgeBase> => {
    console.log('🔄 [1/7] Iniciando processamento do arquivo:', filePath);

    try {
        // Validar arquivo
        if (!fs.existsSync(filePath)) {
            throw new Error('Arquivo temporário não encontrado');
        }

        // Ler o arquivo
        console.log('📖 [2/7] Lendo arquivo');
        const fileContent = await fs.promises.readFile(filePath);
        const uniqueFileName = `kb_${Date.now()}_${path.basename(filePath)}`;
        const displayFileName = params.originalFileName || path.basename(filePath);
        const fileSize = fileContent.length;
        const fileType = path.extname(filePath).slice(1);

        // Validar tipo de arquivo
        const allowedTypes = ['txt', 'csv', 'xlsx', 'xls'];
        if (!allowedTypes.includes(fileType.toLowerCase())) {
            throw new Error(`Tipo de arquivo não suportado. Tipos permitidos: ${allowedTypes.join(', ')}`);
        }

        // Fazer upload para o S3 com nome único
        console.log('☁️ [3/7] Enviando para o Spaces');
        const spacesUrl = await uploadToS3(fileContent, uniqueFileName, 'knowledge');
        console.log('✅ [4/7] Upload concluído:', spacesUrl);

        // Adicionar processamento do conteúdo
        console.log('📑 [5/7] Processando conteúdo e gerando embeddings');
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const chunks = splitIntoChunks(content);
        
        // Criar base de conhecimento com chunks
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                name: params.name,
                description: params.description,
                sourceLanguage: params.sourceLanguage,
                targetLanguage: params.targetLanguage,
                fileName: params.originalFileName || path.basename(filePath),
                filePath: spacesUrl,
                fileSize: fileContent.length,
                fileType: path.extname(filePath).slice(1),
                userId: params.userId,
                chunks: {
                    createMany: {
                        data: await Promise.all(chunks.map(async chunk => ({
                            content: chunk,
                            embedding: await getEmbedding(chunk)
                        })))
                    }
                }
            },
            include: {
                chunks: true
            }
        });

        // Limpar arquivo temporário
        await fs.promises.unlink(filePath);
        console.log('🧹 Arquivo temporário removido');

        return knowledgeBase;
    } catch (error) {
        console.error('❌ Erro ao processar arquivo da base de conhecimento:', error);
        
        // Limpar arquivo temporário em caso de erro
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                console.log('🧹 Arquivo temporário removido após erro');
            }
        } catch (cleanupError) {
            console.error('⚠️ Erro ao limpar arquivo temporário:', cleanupError);
        }
        
        throw error;
    }
};

// Função para processar conteúdo da base de conhecimento
export const getKnowledgeBaseContent = async (knowledgeBaseId: string): Promise<string> => {
    try {
        const knowledgeBase = await prisma.knowledgeBase.findUnique({
            where: { id: knowledgeBaseId }
        });

        if (!knowledgeBase) {
            throw new Error('Base de conhecimento não encontrada');
        }

        const response = await axios.get(knowledgeBase.filePath, {
            headers: {
                'Accept': 'text/plain',
                'Content-Type': 'text/plain'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Erro ao buscar conteúdo da base de conhecimento:', error);
        throw error;
    }
};

// Função para traduzir com contexto
export const translateWithContext = async (chunk: TextChunk, context: TranslationContext) => {
    try {
        let relevantContext = '';
        
        if (context.knowledgeBase) {
            try {
                // Buscar apenas o contexto relevante usando embeddings
                relevantContext = await getRelevantKnowledgeBaseContext(
                    chunk.content,
                    context.knowledgeBase,
                    3 // Número de trechos mais relevantes
                );
            } catch (error) {
                console.error('Erro ao buscar contexto relevante:', error);
            }
        }

        // Montar o prompt otimizado
        const prompt = `
            ${context.prompt || ''}
            
            Contexto Relevante da Base de Conhecimento:
            ${relevantContext}
            
            Texto para traduzir:
            ${chunk.content}
            
            Contexto anterior: ${context.previousChunk?.content || ''}
            Próximo contexto: ${context.nextChunk?.content || ''}
            
            Traduza o texto de ${context.sourceLanguage} para ${context.targetLanguage}.
        `.trim();

        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview", // Modelo mais eficiente
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 4000 // Limitar tokens de saída
        });

        return response;
    } catch (error) {
        console.error('Erro na tradução:', error);
        throw error;
    }
};

// Função para buscar contexto relevante usando embeddings
const getRelevantKnowledgeBaseContext = async (query: string, knowledgeBaseId: string, limit: number = 3): Promise<string> => {
    try {
        const queryEmbedding = await getEmbedding(query);
        
        type ChunkResult = {
            content: string;
            similarity: number;
        };

        const relevantChunks = await prisma.$queryRaw<ChunkResult[]>`
            SELECT 
                content,
                1 - (embedding <=> ${queryEmbedding}::vector) as similarity
            FROM "KnowledgeBaseChunk"
            WHERE knowledge_base_id = ${knowledgeBaseId}
            ORDER BY similarity DESC
            LIMIT ${limit}
        `;

        return relevantChunks
            .map(chunk => chunk.content)
            .join('\n\n');
    } catch (error) {
        console.error('Erro ao buscar contexto relevante:', error);
        return '';
    }
};

// Função auxiliar para gerar embeddings
const getEmbedding = async (text: string): Promise<number[]> => {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text
    });
    return response.data[0].embedding;
};

// Funções auxiliares existentes
const processKnowledgeBaseContent = async (content: string): Promise<string> => {
    const sections = content.split(/\n{2,}/);
    let processedContent = '';

    // Processar cada seção mantendo termos técnicos e estrutura
    for (const section of sections) {
        // Identificar e preservar termos técnicos
        const technicalTerms = extractTechnicalTerms(section);
        // Criar resumo mantendo contexto
        const sectionSummary = await summarizeSection(section, technicalTerms);
        processedContent += sectionSummary + '\n\n';
    }

    return processedContent.trim();
};

const extractTechnicalTerms = (text: string): string[] => {
    // Padrões para identificar termos técnicos (customizar conforme necessidade)
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

const summarizeSection = async (section: string, technicalTerms: string[]): Promise<string> => {
    // Preservar termos técnicos no resumo
    const termsList = technicalTerms.join(', ');
    const prompt = `
        Resumo da seção mantendo os seguintes termos técnicos: ${termsList}
        
        Seção original:
        ${section}
        
        Por favor, crie um resumo conciso que:
        1. Mantenha todos os termos técnicos mencionados
        2. Preserve o contexto principal
        3. Mantenha a estrutura essencial
    `;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3
        });

        return response.choices[0].message.content || section;
    } catch (error) {
        console.error('Erro ao resumir seção:', error);
        return section; // Em caso de erro, retorna a seção original
    }
};

// Função para dividir texto em chunks significativos
const splitIntoChunks = (text: string): string[] => {
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        if ((currentChunk + paragraph).length > 1000) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = paragraph;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
    }

    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
};