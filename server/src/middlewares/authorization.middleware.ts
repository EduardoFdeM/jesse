import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors.js';

type Role = 'SUPERUSER' | 'TRANSLATOR' | 'EDITOR';

export const authorize = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Não autenticado' });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Não autorizado' });
        }
        
        next();
    };
}; 