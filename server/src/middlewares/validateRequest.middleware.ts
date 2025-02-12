import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../utils/errors.js';

interface ValidationSchema {
    type: string;
    required?: boolean;
    items?: ValidationSchema;
}

interface ValidationConfig {
    body?: Record<string, ValidationSchema>;
    query?: Record<string, ValidationSchema>;
    params?: Record<string, ValidationSchema>;
}

export const validateRequest = (config: ValidationConfig) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (config.body) {
                validateObject(req.body, config.body, 'body');
            }
            if (config.query) {
                validateObject(req.query, config.query, 'query');
            }
            if (config.params) {
                validateObject(req.params, config.params, 'params');
            }
            next();
        } catch (error) {
            next(error);
        }
    };
};

function validateObject(data: any, schema: Record<string, ValidationSchema>, location: string) {
    for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];

        // Verificar se o campo é obrigatório
        if (rules.required && (value === undefined || value === null || value === '')) {
            throw new BadRequestError(`O campo '${field}' é obrigatório no ${location}`);
        }

        // Se o valor existe, validar o tipo
        if (value !== undefined && value !== null) {
            if (rules.type === 'array') {
                if (!Array.isArray(value)) {
                    throw new BadRequestError(`O campo '${field}' deve ser um array no ${location}`);
                }

                // Validar itens do array se houver schema
                if (rules.items) {
                    value.forEach((item, index) => {
                        validateValue(item, rules.items!, `${field}[${index}]`, location);
                    });
                }
            } else {
                validateValue(value, rules, field, location);
            }
        }
    }
}

function validateValue(value: any, rules: ValidationSchema, field: string, location: string) {
    switch (rules.type) {
        case 'string':
            if (typeof value !== 'string') {
                throw new BadRequestError(`O campo '${field}' deve ser uma string no ${location}`);
            }
            break;
        case 'number':
            if (typeof value !== 'number') {
                throw new BadRequestError(`O campo '${field}' deve ser um número no ${location}`);
            }
            break;
        case 'boolean':
            if (typeof value !== 'boolean') {
                throw new BadRequestError(`O campo '${field}' deve ser um booleano no ${location}`);
            }
            break;
        case 'object':
            if (typeof value !== 'object' || Array.isArray(value) || value === null) {
                throw new BadRequestError(`O campo '${field}' deve ser um objeto no ${location}`);
            }
            break;
        default:
            throw new BadRequestError(`Tipo de validação não suportado: ${rules.type}`);
    }
} 