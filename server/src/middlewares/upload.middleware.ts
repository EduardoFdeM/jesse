import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

const uploadDir = path.join(process.cwd(), 'uploads');

// Garantir que o diretório de upload existe
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Sistema de lock para controlar uploads simultâneos
const uploadLocks = new Set<string>();

// Middleware para controlar uploads simultâneos
export const uploadLock = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const userId = req.user.id;
    const fileName = req.body.originalname || 'unknown';
    const lockKey = `${userId}-${fileName}`;

    if (uploadLocks.has(lockKey)) {
        return res.status(429).json({ 
            error: 'Upload em andamento',
            message: 'Aguarde o upload atual terminar antes de iniciar outro'
        });
    }

    uploadLocks.add(lockKey);
    next();
};

// Middleware para liberar o lock após o upload
export const uploadUnlock = async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.id) {
        const fileName = req.body.originalname || 'unknown';
        const lockKey = `${req.user.id}-${fileName}`;
        uploadLocks.delete(lockKey);
    }
    next();
};

// Tipos MIME permitidos para cada tipo de arquivo
const ALLOWED_MIMETYPES: Record<string, string[]> = {
    // Arquivos de texto
    'text/plain': ['.txt'],
    // PDFs
    'application/pdf': ['.pdf'],
    // Excel
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    // CSV
    'text/csv': ['.csv'],
    'application/csv': ['.csv'],
    // Word
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
};

// Lista de todas as extensões permitidas
const VALID_EXTENSIONS = ['.txt', '.pdf', '.xls', '.xlsx', '.csv', '.doc', '.docx'];

// Função para verificar se o arquivo é permitido
const isFileAllowed = (mimetype: string, originalname: string): boolean => {
    // Verificar se o mimetype é permitido
    const mimeTypeExtensions = ALLOWED_MIMETYPES[mimetype];
    if (mimeTypeExtensions) {
        const fileExtension = path.extname(originalname).toLowerCase();
        return mimeTypeExtensions.includes(fileExtension);
    }
    
    // Se o mimetype não está na lista, verificar a extensão
    const fileExtension = path.extname(originalname).toLowerCase();
    return VALID_EXTENSIONS.includes(fileExtension);
};

// Configurar o multer com single upload
export const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: async (req, file, cb) => {
            const uniqueSuffix = Date.now();
            const ext = path.extname(file.originalname);
            const fileName = `${uniqueSuffix}${ext}`;
            cb(null, fileName);
        }
    }),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 1 // Permitir apenas um arquivo por vez
    },
    fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        if (isFileAllowed(file.mimetype, file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de arquivo não suportado. Os formatos permitidos são: PDF, TXT, XLSX, CSV e DOCX.'));
        }
    }
});
