import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors.js';

type Role = 'SUPERUSER' | 'TRANSLATOR' | 'EDITOR';

export const authorize = (allowedRoles: Role[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new UnauthorizedError('Usuário não autenticado');
            }

            if (!allowedRoles.includes(req.user.role as Role)) {
                throw new UnauthorizedError('Acesso não autorizado para este recurso');
            }

            next();
        } catch (error) {
            console.error('❌ Erro na autorização:', error);
            res.status(403).json({
                error: error instanceof Error ? error.message : 'Erro de autorização'
            });
        }
    };
}; 