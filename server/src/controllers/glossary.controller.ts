import { Request, Response } from 'express';
import prisma from '../config/database.js';
import { processKnowledgeBaseFile } from '../services/knowledge.service.js';
import path from 'path';
import fs from 'fs';

// Criar uma interface para o erro
interface ProcessError extends Error {
    code?: string;
    details?: unknown;
}

// Listar todas as bases de conhecimento do usuário
export const listKnowledgeBases = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        const knowledgeBases = await prisma.knowledgeBase.findMany({
            where: { userId },
            include: {
                _count: {
                    select: { translations: true }
                }
            }
        });

        return res.json({
            status: 'success',
            data: knowledgeBases
        });
    } catch (error) {
        console.error('Erro ao listar bases de conhecimento:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

// Obter uma base de conhecimento específica
export const getKnowledgeBase = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        const knowledgeBase = await prisma.knowledgeBase.findFirst({
            where: {
                id,
                userId
            },
            include: {
                _count: {
                    select: { translations: true }
                }
            }
        });

        if (!knowledgeBase) {
            return res.status(404).json({ error: 'Base de conhecimento não encontrada' });
        }

        return res.json({
            status: 'success',
            data: knowledgeBase
        });
    } catch (error) {
        console.error('Erro ao obter base de conhecimento:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

// Criar uma nova base de conhecimento
export const createKnowledgeBase = async (req: Request, res: Response) => {
    try {
        console.log('📝 Recebendo requisição para criar base de conhecimento:', {
            body: req.body,
            file: req.file,
            userId: req.user?.id
        });

        const { name, description, sourceLanguage, targetLanguage } = req.body;
        const userId = req.user?.id;
        const file = req.file;

        if (!userId) {
            console.log('❌ Usuário não autenticado');
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        if (!file) {
            console.log('❌ Nenhum arquivo enviado');
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        if (!name || !description || !sourceLanguage || !targetLanguage) {
            console.log('❌ Campos obrigatórios faltando:', { name, description, sourceLanguage, targetLanguage });
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        // Criar diretório para bases de conhecimento se não existir
        const kbDir = path.join(process.cwd(), 'knowledge_bases');
        if (!fs.existsSync(kbDir)) {
            fs.mkdirSync(kbDir, { recursive: true });
        }

        // Gerar nome único para o arquivo
        const fileExtension = path.extname(file.originalname);
        const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExtension}`;
        const filePath = path.join(kbDir, uniqueFilename);

        // Mover arquivo para o diretório de bases de conhecimento
        fs.copyFileSync(file.path, filePath);
        fs.unlinkSync(file.path); // Remover arquivo temporário

        console.log('🔄 Processando arquivo e criando base de conhecimento...');
        const knowledgeBase = await processKnowledgeBaseFile(filePath, {
            name,
            description,
            sourceLanguage,
            targetLanguage,
            userId
        });

        console.log('✅ Base de conhecimento criada:', {
            id: knowledgeBase.id,
            name: knowledgeBase.name
        });

        return res.status(201).json({
            status: 'success',
            data: knowledgeBase
        });
    } catch (error: unknown) {
        const processError = error as ProcessError;
        console.error('Erro ao processar arquivo:', processError);
        return res.status(500).json({ 
            error: 'Erro ao processar arquivo',
            details: processError.message 
        });
    }
};

// Atualizar uma base de conhecimento
export const updateKnowledgeBase = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const userId = req.user?.id;
        const file = req.file;

        if (!userId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        const knowledgeBase = await prisma.knowledgeBase.findFirst({
            where: {
                id,
                userId
            }
        });

        if (!knowledgeBase) {
            return res.status(404).json({ error: 'Base de conhecimento não encontrada' });
        }

        let updateData: any = {
            name,
            description
        };

        // Se um novo arquivo foi enviado
        if (file) {
            // Criar diretório para bases de conhecimento se não existir
            const kbDir = path.join(process.cwd(), 'knowledge_bases');
            if (!fs.existsSync(kbDir)) {
                fs.mkdirSync(kbDir, { recursive: true });
            }

            // Gerar nome único para o arquivo
            const fileExtension = path.extname(file.originalname);
            const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExtension}`;
            const newFilePath = path.join(kbDir, uniqueFilename);

            // Mover novo arquivo
            fs.copyFileSync(file.path, newFilePath);
            fs.unlinkSync(file.path); // Remover arquivo temporário

            // Excluir arquivo antigo
            if (fs.existsSync(knowledgeBase.filePath)) {
                fs.unlinkSync(knowledgeBase.filePath);
            }

            // Atualizar informações do arquivo
            updateData = {
                ...updateData,
                fileName: file.originalname,
                filePath: newFilePath,
                fileSize: file.size,
                fileType: file.mimetype
            };
        }

        const updatedKnowledgeBase = await prisma.knowledgeBase.update({
            where: { id },
            data: updateData
        });

        return res.json({
            status: 'success',
            data: updatedKnowledgeBase
        });
    } catch (error) {
        console.error('Erro ao atualizar base de conhecimento:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

// Excluir uma base de conhecimento
export const deleteKnowledgeBase = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        const knowledgeBase = await prisma.knowledgeBase.findFirst({
            where: {
                id,
                userId
            }
        });

        if (!knowledgeBase) {
            return res.status(404).json({ error: 'Base de conhecimento não encontrada' });
        }

        // Excluir o arquivo se existir
        if (knowledgeBase.filePath && fs.existsSync(knowledgeBase.filePath)) {
            try {
                fs.unlinkSync(knowledgeBase.filePath);
                console.log('🗑️ Arquivo excluído:', knowledgeBase.filePath);
            } catch (error) {
                console.error('⚠️ Erro ao excluir arquivo:', error);
                // Continuar com a exclusão da base de conhecimento mesmo se houver erro ao excluir o arquivo
            }
        }

        // Excluir a base de conhecimento e suas entradas em cascata
        await prisma.knowledgeBase.delete({
            where: { id }
        });

        return res.status(204).send();
    } catch (error) {
        console.error('Erro ao excluir base de conhecimento:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

