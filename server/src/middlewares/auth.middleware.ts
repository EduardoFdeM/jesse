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
            };
        }
    }
}

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        name: string;
    };
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('🔒 Headers recebidos:', req.headers);
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            console.log('❌ Header de autorização ausente');
            throw new UnauthorizedError('Token não fornecido');
        }

        if (!authHeader.startsWith('Bearer ')) {
            console.log('❌ Formato do token inválido');
            throw new UnauthorizedError('Formato do token inválido');
        }

        const token = authHeader.split(' ')[1];
        console.log('🔑 Token extraído:', token.substring(0, 10) + '...');
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
            console.log('✅ Token verificado para usuário:', decoded.id);
            
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: { id: true, email: true, name: true }
            });

            if (!user) {
                console.log('❌ Usuário não encontrado:', decoded.id);
                throw new UnauthorizedError('Usuário não encontrado');
            }

            req.user = user;
            next();
        } catch (jwtError) {
            console.error('❌ Erro na verificação do token:', jwtError);
            throw new UnauthorizedError('Token inválido ou expirado');
        }
    } catch (error) {
        console.error('❌ Erro de autenticação:', error);
        next(error);
    }
};
