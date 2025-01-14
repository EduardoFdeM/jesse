import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega o arquivo .env da pasta server
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Log para debug
console.log('📝 Variáveis de ambiente carregadas:', {
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasOpenAiKey: !!process.env.OPENAI_API_KEY,
    envPath: path.resolve(__dirname, '../../.env')
});

const envSchema = z.object({
    PORT: z.string().default('4000'),
    JWT_SECRET: z.string({
        required_error: "JWT_SECRET é obrigatório para a segurança da aplicação"
    }),
    DATABASE_URL: z.string({
        required_error: "DATABASE_URL é obrigatório para conexão com o banco de dados"
    }),
    OPENAI_API_KEY: z.string().optional(),
    FRONTEND_URL: z.string().default('https://pdf-tradutor-of.vercel.app/'),
    UPLOAD_DIR: z.string().default('./uploads')
});

const env = envSchema.parse(process.env);
export default env;
