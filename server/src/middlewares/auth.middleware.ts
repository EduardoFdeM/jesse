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

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Verificar se o token foi fornecido
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('Token não fornecido');
        }

        // Extrair o token
        const token = authHeader.split(' ')[1];

        // Verificar o token
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };

        // Buscar o usuário
        const user = await prisma.user.findUnique({
            where: { id: decoded.id }
        });

        if (!user) {
            throw new UnauthorizedError('Usuário não encontrado');
        }

        // Adicionar o usuário à requisição
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name
        };

        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            next(new UnauthorizedError('Token inválido'));
        } else {
            next(error);
        }
    }
};
