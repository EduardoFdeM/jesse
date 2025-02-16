import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Tipos MIME permitidos
const ALLOWED_MIMETYPES = {
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt']
};

const isFileAllowed = (mimetype: string, originalname: string): boolean => {
    const mimeTypeExtensions = ALLOWED_MIMETYPES[mimetype as keyof typeof ALLOWED_MIMETYPES];
    if (mimeTypeExtensions) {
        const fileExtension = path.extname(originalname).toLowerCase();
        return mimeTypeExtensions.includes(fileExtension);
    }
    return false;
};

const storage = multer.memoryStorage();

const fileFilter = (
    req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    if (isFileAllowed(file.mimetype, file.originalname)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de arquivo não suportado'));
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
}); 