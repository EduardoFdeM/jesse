import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/errors.js';
import prisma from '../config/database.js';

// Estender o tipo Request para incluir o usuário
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                name: string;
                role: string;
            };
        }
    }
}

export interface AuthenticatedRequest extends Request {
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
    };
}

// Lista de rotas públicas que não requerem autenticação
const PUBLIC_ROUTES = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/health'
];

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
    try {
        // Verificar se é uma rota pública
        if (PUBLIC_ROUTES.includes(req.path)) {
            return next();
        }

        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('Token não fornecido ou formato inválido');
        }

        const token = authHeader.split(' ')[1];
        
        let decoded: { id: string };
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key') as { id: string };
        } catch (_jwtError) {
            throw new UnauthorizedError('Token inválido ou expirado');
        }
        
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, email: true, name: true, role: true }
        });

        if (!user) {
            throw new UnauthorizedError('Usuário não encontrado');
        }

        req.user = user;
        next();
    } catch (error) {
        // Garantir que sempre passamos um UnauthorizedError para o próximo middleware
        if (error instanceof UnauthorizedError) {
            next(error);
        } else {
            next(new UnauthorizedError('Erro de autenticação'));
        }
    }
};
