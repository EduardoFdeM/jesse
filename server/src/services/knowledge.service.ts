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
    console.log('🔄 [1/6] Iniciando processamento do arquivo:', filePath);

    try {
        // Validar arquivo
        if (!fs.existsSync(filePath)) {
            throw new Error('Arquivo temporário não encontrado');
        }

        // Ler o arquivo
        console.log('📖 [2/6] Lendo arquivo');
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
        console.log('☁️ [3/6] Enviando para o Spaces');
        const spacesUrl = await uploadToS3(fileContent, uniqueFileName, 'knowledge');
        console.log('✅ [4/6] Upload concluído:', spacesUrl);

        // Adicionar processamento do conteúdo
        console.log('📑 [2/6] Processando conteúdo do arquivo');
        const content = await fs.promises.readFile(filePath, 'utf-8');
        
        // Criar/Atualizar a base de conhecimento no banco
        console.log('💾 [5/6] Salvando no banco de dados');
        const knowledgeBaseData: Prisma.KnowledgeBaseCreateInput = {
            name: params.name,
            description: params.description,
            sourceLanguage: params.sourceLanguage,
            targetLanguage: params.targetLanguage,
            user: {
                connect: {
                    id: params.userId
                }
            },
            fileName: displayFileName,
            filePath: spacesUrl,
            fileType,
            fileSize
        };

        const knowledgeBase = await prisma.knowledgeBase.create({
            data: knowledgeBaseData
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
        let knowledgeBaseContent = '';
        
        if (context.knowledgeBase) {
            try {
                knowledgeBaseContent = await getKnowledgeBaseContent(context.knowledgeBase);
            } catch (error) {
                console.error('Erro ao buscar base de conhecimento:', error);
                // Continua sem a base de conhecimento em caso de erro
            }
        }

        // Montar o prompt com o contexto
        const prompt = `
            ${context.prompt || ''}
            
            Base de Conhecimento:
            ${knowledgeBaseContent}
            
            Texto para traduzir:
            ${chunk.content}
            
            Contexto anterior: ${context.previousChunk?.content || 'Nenhum'}
            Próximo contexto: ${context.nextChunk?.content || 'Nenhum'}
            
            Por favor, traduza o texto acima de ${context.sourceLanguage} para ${context.targetLanguage}.
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3
        });

        return response;
    } catch (error) {
        console.error('Erro na tradução:', error);
        throw error;
    }
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