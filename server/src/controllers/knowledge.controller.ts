import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/errors.js';
import prisma from '../config/database.js';
import { KnowledgeService } from '../services/knowledge.service.js';

export class KnowledgeController {
  private service: KnowledgeService;

  constructor() {
    this.service = new KnowledgeService();
  }

  // Criar base de conhecimento
  createKnowledgeBase = asyncHandler(async (req: Request, res: Response) => {
    const { name, description } = req.body;
    const files = req.files as Express.Multer.File[];
    let existingFileIds: string[] = [];
    
    try {
        // Tratar tanto JSON direto quanto array do FormData
        if (req.body.existingFileIds) {
            // Se for um array do FormData
            if (Array.isArray(req.body.existingFileIds)) {
                existingFileIds = req.body.existingFileIds;
            }
            // Se for uma string JSON
            else if (typeof req.body.existingFileIds === 'string') {
                try {
                    const parsed = JSON.parse(req.body.existingFileIds);
                    if (Array.isArray(parsed)) {
                        existingFileIds = parsed;
                    } else {
                        throw new BadRequestError("O campo 'existingFileIds' deve ser um array de strings");
                    }
                } catch {
                    // Se não for um JSON válido, pode ser um único ID
                    existingFileIds = [req.body.existingFileIds];
                }
            }
            // Se não for nenhum dos casos acima
            else {
                throw new BadRequestError("O campo 'existingFileIds' deve ser um array de strings");
            }
        }
    } catch (error) {
        if (error instanceof BadRequestError) throw error;
        throw new BadRequestError("O campo 'existingFileIds' deve ser um array de strings");
    }

    const userId = req.user?.id;

    if (!userId) {
        throw new UnauthorizedError('Usuário não autenticado');
    }

    if (!name || !description) {
        throw new BadRequestError('Nome e descrição são obrigatórios');
    }

    if ((!files || files.length === 0) && (!existingFileIds || existingFileIds.length === 0)) {
        throw new BadRequestError('É necessário enviar pelo menos um arquivo ou selecionar arquivos existentes');
    }

    // Verificar limite de arquivos
    if ((files?.length || 0) + (existingFileIds?.length || 0) > 10) {
        throw new BadRequestError('Limite máximo de 10 arquivos por base de conhecimento');
    }

    try {
        const knowledgeBase = await this.service.createKnowledgeBase({
            name,
            description,
            userId,
            files: files || [],
            existingFileIds
        });

        res.status(201).json({
            status: 'success',
            data: knowledgeBase
        });
    } catch (error) {
        // Se o erro já foi tratado, apenas repasse
        if (error instanceof BadRequestError || error instanceof UnauthorizedError) {
            throw error;
        }

        // Caso contrário, trate como erro interno
        console.error('Erro ao criar base de conhecimento:', error);
        throw new Error(`Erro ao criar base de conhecimento. ${(error as Error).message}`);
    }
  });

  // Listar bases de conhecimento
  getKnowledgeBases = asyncHandler(async (req: Request, res: Response) => {
    const knowledgeBases = await prisma.knowledgeBase.findMany({
        where: { userId: req.user!.id }
    });

    res.json({
        status: 'success',
        data: knowledgeBases
    });
  });

  // Obter uma base de conhecimento específica
  getKnowledgeBase = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
        where: {
            id,
            userId: req.user!.id
        }
    });

    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }

    res.json({
        status: 'success',
        data: knowledgeBase
    });
  });

  // Atualizar base de conhecimento
  updateKnowledgeBase = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const files = req.files as Express.Multer.File[];
    let existingFileIds: string[] = [];
    
    try {
        // Tratar tanto JSON direto quanto string JSON do FormData
        if (req.body.existingFileIds) {
            const parsed = typeof req.body.existingFileIds === 'string' 
                ? JSON.parse(req.body.existingFileIds)
                : req.body.existingFileIds;

            if (!Array.isArray(parsed)) {
                throw new BadRequestError("O campo 'existingFileIds' deve ser um array");
            }
            existingFileIds = parsed;
        }

        const updatedBase = await this.service.updateKnowledgeBase({
            id,
            name,
            description,
            userId: req.user!.id,
            files,
            existingFileIds
        });

        res.json({
            status: 'success',
            data: updatedBase
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar base de conhecimento:', error);
        throw new Error(`Erro ao atualizar base de conhecimento: ${(error as Error).message}`);
    }
  });

  // Excluir base de conhecimento
  deleteKnowledgeBaseHandler = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
        where: {
            id,
            userId: req.user!.id
        }
    });

    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }

    await this.service.deleteKnowledgeBase(id);

    res.json({
        status: 'success',
        data: null
    });
  });

  // Listar arquivos de uma base de conhecimento
  getKnowledgeBaseFiles = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
        where: {
            id,
            userId: req.user!.id
        }
    });

    if (!knowledgeBase) {
        throw new NotFoundError('Base de conhecimento não encontrada');
    }

    const files = await this.service.listKnowledgeBaseFiles(id);

    res.json({
        status: 'success',
        data: files
    });
  });

  // Atualizar metadados
  updateMetadata = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { metadata } = req.body;
    
    const updated = await this.service.updateMetadata(id, metadata);
    res.json(updated);
  });

  // Listar arquivos com metadados
  listFiles = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const files = await this.service.listKnowledgeBaseFiles(id);
    res.json(files);
  });

  // Criar Vector Store
  createVectorStore = asyncHandler(async (req: Request, res: Response) => {
    const { name, description } = req.body;
    const files = req.files as Express.Multer.File[];
    const existingFileIds = JSON.parse(req.body.existingFileIds || '[]');

    // Validações
    if (!name) throw new BadRequestError('Nome é obrigatório');
    if ((files?.length || 0) + existingFileIds.length > 10) {
        throw new BadRequestError('Limite máximo de 10 arquivos por Vector Store');
    }

    const knowledgeBase = await this.service.createKnowledgeBase({
        name,
        description,
        userId: req.user!.id,
        files: files || [],
        existingFileIds
    });

    res.status(201).json({ status: 'success', data: knowledgeBase });
  });

  // Novo endpoint para adicionar arquivo à Vector Store existente
  addFileToVectorStore = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const file = req.file as Express.Multer.File;
    
    if (!file) {
        throw new BadRequestError('Arquivo não fornecido');
    }

    const vectorStore = await prisma.knowledgeBase.findFirst({
        where: {
            id,
            userId: req.user!.id,
            vectorStoreId: { not: null }
        }
    });

    if (!vectorStore) {
        throw new NotFoundError('Vector Store não encontrada');
    }

    // Verificar limite de arquivos
    if (vectorStore.fileIds.length >= 10) {
        throw new BadRequestError('Limite máximo de 10 arquivos por Vector Store');
    }

    const fileData = await this.service.addFileToVectorStore(vectorStore.vectorStoreId!, file);

    // Atualizar fileIds no banco
    await prisma.knowledgeBase.update({
        where: { id },
        data: {
            fileIds: [...vectorStore.fileIds, fileData.id]
        }
    });

    res.status(201).json({ status: 'success', data: fileData });
  });

  listOpenAIFiles = asyncHandler(async (req: Request, res: Response) => {
    const files = await this.service.listOpenAIFiles();
    res.json({ status: 'success', data: files });
  });

  createOpenAIFile = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file as Express.Multer.File;
    if (!file) throw new BadRequestError('Arquivo não fornecido');
    
    const fileData = await this.service.createOpenAIFile(file);
    res.status(201).json({ status: 'success', data: fileData });
  });

  deleteOpenAIFile = asyncHandler(async (req: Request, res: Response) => {
    const { fileId } = req.params;
    await this.service.deleteOpenAIFile(fileId);
    res.json({ status: 'success', data: null });
  });

  // Listar Vector Stores
  listVectorStores = asyncHandler(async (req: Request, res: Response) => {
    try {
      const vectorStores = await prisma.knowledgeBase.findMany({
        where: { 
          userId: req.user!.id,
          vectorStoreId: { not: null }
        },
        select: {
          id: true,
          name: true,
          description: true,
          vectorStoreId: true,
          fileIds: true,
          fileMetadata: true,
          createdAt: true,
          updatedAt: true
        }
      });

      res.json({
        status: 'success',
        data: vectorStores
      });
    } catch (error) {
      console.error('❌ Erro ao listar vector stores:', error);
      throw new Error('Erro ao listar vector stores');
    }
  });

  // Deletar Vector Store
  deleteVectorStore = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const vectorStore = await prisma.knowledgeBase.findFirst({
        where: {
          id,
          userId: req.user!.id,
          vectorStoreId: { not: null }
        }
      });

      if (!vectorStore) {
        throw new NotFoundError('Vector Store não encontrada');
      }

      // Deletar Vector Store na OpenAI
      if (vectorStore.vectorStoreId) {
        await this.service.deleteVectorStore(vectorStore.vectorStoreId);
      }

      // Deletar do banco
      await prisma.knowledgeBase.delete({
        where: { id }
      });

      res.json({
        status: 'success',
        data: null
      });
    } catch (error) {
      console.error('❌ Erro ao deletar vector store:', error);
      throw new Error('Erro ao deletar vector store');
    }
  });

  // Remover arquivo de Vector Store
  removeFileFromVectorStore = asyncHandler(async (req: Request, res: Response) => {
    const { id, fileId } = req.params;

    try {
      const vectorStore = await prisma.knowledgeBase.findFirst({
        where: {
          id,
          userId: req.user!.id,
          vectorStoreId: { not: null }
        }
      });

      if (!vectorStore) {
        throw new NotFoundError('Vector Store não encontrada');
      }

      // Remover arquivo da Vector Store na OpenAI
      await this.service.removeFileFromVectorStore(vectorStore.vectorStoreId!, fileId);

      // Atualizar fileIds no banco
      const updatedFileIds = vectorStore.fileIds.filter((fid: string) => fid !== fileId);
      
      await prisma.knowledgeBase.update({
        where: { id },
        data: {
          fileIds: updatedFileIds
        }
      });

      res.json({
        status: 'success',
        data: null
      });
    } catch (error) {
      console.error('❌ Erro ao remover arquivo da vector store:', error);
      throw new Error('Erro ao remover arquivo da vector store');
    }
  });

  // Método para obter contexto da Vector Store para tradução
  getVectorStoreContext = asyncHandler(async (req: Request, res: Response) => {
    const { vectorStoreId } = req.params;

    const vectorStore = await prisma.knowledgeBase.findFirst({
      where: {
        vectorStoreId,
        userId: req.user!.id
      }
    });

    if (!vectorStore) {
      throw new NotFoundError('Vector Store não encontrada');
    }

    res.json({
      status: 'success',
      data: {
        vectorStoreId: vectorStore.vectorStoreId,
        name: vectorStore.name,
        description: vectorStore.description
      }
    });
  });
}