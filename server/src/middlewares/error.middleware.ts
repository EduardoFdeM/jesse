import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { CustomError } from '../utils/errors';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error with request details for debugging
  console.error('� Erro detectado:', {
    message: err.message,
    name: err.name,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    headers: req.headers,
    query: req.query,
    body: req.method === 'POST' ? req.body : undefined
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    console.log('📝 Erro de validação Zod');
    return res.status(400).json({
      status: 'error',
      message: 'Erro de validação',
      errors: err.errors,
      path: req.path
    });
  }

  // Handle custom application errors
  if (err instanceof CustomError) {
    console.log('🚫 Erro personalizado:', err.statusCode);
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      errors: err.errors,
      path: req.path
    });
  }

  // Handle JWT authentication errors
  if (err.name === 'JsonWebTokenError') {
    console.log('🔐 Erro de token JWT');
    return res.status(401).json({
      status: 'error',
      message: 'Token inválido',
      path: req.path
    });
  }

  if (err.name === 'TokenExpiredError') {
    console.log('⏰ Token expirado');
    return res.status(401).json({
      status: 'error',
      message: 'Token expirado',
      path: req.path
    });
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError' || err.name === 'PrismaClientValidationError') {
    console.log('💾 Erro do Prisma');
    return res.status(400).json({
      status: 'error',
      message: 'Erro no banco de dados',
      path: req.path
    });
  }

  // Handle all other errors
  console.error('❗ Erro não tratado:', err);
  return res.status(500).json({
    status: 'error',
    message: 'Erro interno do servidor',
    path: req.path
  });
};

// Enhanced 404 handler with detailed information
export const notFoundHandler = (req: Request, res: Response) => {
  console.log('🔍 Rota não encontrada:', req.path);
  res.status(404).json({
    status: 'error',
    message: 'Rota não encontrada',
    path: req.path
  });
};
