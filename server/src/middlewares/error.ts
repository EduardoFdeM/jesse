import { Request, Response, NextFunction } from 'express';
import { BaseError } from '../utils/errors.js';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof BaseError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code
      }
    });
  }

  console.error(err);
  
  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }
  });
};