import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    // Documentos
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    'application/pdf': ['.pdf'],
    // Texto
    'text/plain': ['.txt'],
    'text/markdown': ['.md'],
    'text/html': ['.html'],
    // Código
    'text/javascript': ['.js'],
    'application/typescript': ['.ts'],
    'text/x-python': ['.py'],
    'text/x-java': ['.java'],
    'application/json': ['.json'],
    'text/x-c': ['.c'],
    'text/x-c++': ['.cpp'],
    'text/x-csharp': ['.cs'],
    'text/css': ['.css'],
    'text/x-golang': ['.go'],
    'text/x-php': ['.php'],
    'text/x-ruby': ['.rb'],
    'application/x-sh': ['.sh'],
    'text/x-tex': ['.tex']
};

// Lista de todas as extensões permitidas
const VALID_EXTENSIONS = [
    '.txt', '.pdf', '.doc', '.docx', '.pptx',
    '.md', '.html', '.js', '.ts', '.py',
    '.java', '.json', '.c', '.cpp', '.cs',
    '.css', '.go', '.php', '.rb', '.sh',
    '.tex'
];

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

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../../uploads');
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (
    req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    if (isFileAllowed(file.mimetype, file.originalname)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de arquivo não suportado. Consulte a documentação para ver os tipos permitidos.'));
    }
};

export const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});
