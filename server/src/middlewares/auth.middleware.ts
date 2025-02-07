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
    user?: {
        id: string;
        email: string;
        name: string;
        role: string;
    };
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    console.log('🔍 Autenticação iniciada:', {
        path: req.path,
        headers: {
            authorization: req.headers.authorization,
            origin: req.headers.origin
        }
    });
    
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('❌ Token não fornecido ou formato inválido');
            throw new UnauthorizedError('Token não fornecido ou formato inválido');
        }

        const token = authHeader.split(' ')[1];
        
        console.log('🔑 Verificando token...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key') as { id: string };
        
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, email: true, name: true, role: true }
        });

        if (!user) {
            console.log('❌ Usuário não encontrado para o token');
            throw new UnauthorizedError('Usuário não encontrado');
        }

        console.log('✅ Usuário autenticado:', user.email);
        req.user = user;
        next();
    } catch (error) {
        console.error('❌ Erro na autenticação:', error);
        res.status(401).json({
            error: error instanceof Error ? error.message : 'Erro de autenticação'
        });
    }
};
