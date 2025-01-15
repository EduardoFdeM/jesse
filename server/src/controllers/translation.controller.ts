import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { translateFile } from '../services/translation.service.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import prisma from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { emitTranslationStarted, emitTranslationCompleted } from '../services/socket.service.js';

// Cache para controle de traduções em andamento
const activeTranslations = new Map<string, Promise<void>>();

// Adicionar função generateFilePath que estava faltando
const generateFilePath = (originalName: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    return `${baseName}_${timestamp}_${random}${ext}`;
};

// Criar tradução
export const createTranslation = asyncHandler(async (req: Request, res: Response) => {
    console.log('📝 Recebendo requisição de tradução:', {
        body: req.body,
        file: req.file,
        user: req.user
    });

    const { sourceLanguage, targetLanguage } = req.body;
    const file = req.file;
    
    // Corrigir tratamento do originalname
    const originalName = Array.isArray(req.body.originalname) 
        ? req.body.originalname[0] 
        : req.body.originalname || 'translated_document.pdf';

    if (!file) {
        throw new ValidationError('Nenhum arquivo enviado.');
    }

    if (!req.user?.id) {
        throw new ValidationError('Usuário não autenticado.');
    }

    const translationKey = `${req.user.id}-${originalName}`;

    // Verificar se já existe uma tradução em andamento
    if (activeTranslations.has(translationKey)) {
        // Se existe, deletar o arquivo recebido
        try {
            fs.unlinkSync(file.path);
        } catch (error) {
            console.error('Erro ao deletar arquivo duplicado:', error);
        }
        
        throw new ValidationError('Já existe uma tradução em andamento para este arquivo. Aguarde a conclusão ou tente novamente mais tarde.');
    }

    const uploadsDir = path.join(process.cwd(), 'server', 'uploads');
    const translatedDir = path.join(process.cwd(), 'server', 'translated_pdfs');

    // Criar diretórios se não existirem
    [uploadsDir, translatedDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // Criar o registro no banco com status 'pending'
    const translation = await prisma.translation.create({
        data: {
            fileName: path.basename(file.path),
            filePath: file.path,
            originalName: originalName,
            sourceLanguage,
            targetLanguage,
            userId: req.user.id,
            fileSize: file.size,
            fileType: file.mimetype,
            status: 'pending'
        }
    });

    // Emitir evento de início
    emitTranslationStarted(translation);

    // Responder imediatamente ao cliente
    res.status(202).json({
        message: 'Tradução iniciada',
        translationId: translation.id
    });

    // Criar uma promise para o processo de tradução
    const translationPromise = (async (): Promise<void> => {
        try {
            console.log('🔄 Iniciando processo de tradução no controller');
            
            // Atualizar status para processing
            await prisma.translation.update({
                where: { id: translation.id },
                data: { status: 'processing' }
            });

            if (!req.user || !req.user.id) {
                throw new Error('Usuário não autenticado.');
            }

            console.log('📝 Chamando serviço de tradução');
            const translatedFile = await translateFile({
                filePath: file.path,
                sourceLanguage,
                targetLanguage,
                userId: req.user.id,
                translationId: translation.id
            });

            console.log('✅ Tradução concluída, movendo arquivo para localização final');
            const finalFileName = generateFilePath(originalName);
            const finalFilePath = path.join(translatedDir, finalFileName);

            // Verificar se o arquivo traduzido existe
            if (!fs.existsSync(translatedFile.filePath)) {
                throw new Error(`Arquivo traduzido não encontrado: ${translatedFile.filePath}`);
            }

            // Garantir que o diretório de destino existe
            if (!fs.existsSync(translatedDir)) {
                fs.mkdirSync(translatedDir, { recursive: true });
            }

            // Mover arquivo traduzido para diretório final
            console.log('📁 Copiando arquivo para:', finalFilePath);
            await fs.promises.copyFile(translatedFile.filePath, finalFilePath);
            
            console.log('🧹 Limpando arquivos temporários');
            await fs.promises.unlink(translatedFile.filePath); // Limpar arquivo temporário
            await fs.promises.unlink(file.path); // Limpar arquivo original

            console.log('💾 Atualizando registro no banco de dados');
            // Atualizar registro com o caminho final e status
            const updatedTranslation = await prisma.translation.update({
                where: { id: translation.id },
                data: {
                    status: 'completed',
                    filePath: finalFilePath,
                    fileName: finalFileName
                }
            });

            // Emitir conclusão
            emitTranslationCompleted(updatedTranslation);

            console.log('✨ Processo de tradução finalizado com sucesso');
        } catch (error) {
            console.error('❌ Erro durante a tradução:', error);
            
            // Atualizar status para erro
            await prisma.translation.update({
                where: { id: translation.id },
                data: {
                    status: 'error',
                    errorMessage: error instanceof Error ? error.message : 'Erro desconhecido durante a tradução'
                }
            });

            throw error;
        } finally {
            console.log('🔄 Limpando cache de traduções ativas');
            activeTranslations.delete(translationKey);
        }
    })();

    // Armazenar a promise no cache
    activeTranslations.set(translationKey, translationPromise);

    // Aguardar a conclusão da tradução (sem bloquear a resposta)
    translationPromise.catch(error => {
        console.error('Erro na tradução em background:', error);
    });
});

// Rota de Download
export const downloadTranslation = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const translation = await prisma.translation.findUnique({ where: { id } });

    if (!translation) {
        throw new NotFoundError('Tradução não encontrada');
    }

    // Redirecionar para a URL do Spaces
    res.redirect(translation.filePath);
});

// Função para obter uma tradução específica
export const getTranslation = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Buscar a tradução no banco de dados
    const translation = await prisma.translation.findUnique({
        where: { id },
    });

    // Verificar se a tradução foi encontrada
    if (!translation) {
        throw new NotFoundError('Tradução não encontrada');
    }

    // Retornar a tradução encontrada
    res.status(200).json({
        message: 'Tradução encontrada',
        data: translation,
    });
});

// Função para obter todas as traduções
export const getTranslations = asyncHandler(async (req: Request, res: Response) => {
    const translations = await prisma.translation.findMany(); // Busca todas as traduções

    res.status(200).json({
        message: 'Traduções encontradas',
        data: translations,
    });
});

export const clearTranslationHistory = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        // Primeiro, pegar todos os arquivos do usuário
        const translations = await prisma.translation.findMany({
            where: { userId },
            select: { filePath: true }
        });

        // Deletar os arquivos físicos
        for (const translation of translations) {
            try {
                if (translation.filePath && fs.existsSync(translation.filePath)) {
                    fs.unlinkSync(translation.filePath);
                }
            } catch (error) {
                console.error('Erro ao deletar arquivo:', error);
            }
        }

        // Deletar registros do banco
        await prisma.translation.deleteMany({
            where: { userId }
        });

        res.json({ message: 'Histórico de traduções limpo com sucesso' });
    } catch (error) {
        console.error('Erro ao limpar histórico:', error);
        res.status(500).json({ error: 'Erro ao limpar histórico de traduções' });
    }
};
