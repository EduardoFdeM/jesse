import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { z } from 'zod';

export const validate = (schema: AnyZodObject) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🔍 Validando dados:', {
                body: req.body,
                path: req.path,
                method: req.method
            });

            // Para rotas de autenticação, validar apenas o body
            if (req.path === '/login' || req.path === '/register') {
                const validatedData = await schema.parseAsync(req.body);
                req.body = validatedData; // Atualiza o body com os dados validados
            } else {
                const validatedData = await schema.parseAsync({
                    body: req.body,
                    query: req.query,
                    params: req.params,
                });
                // Atualiza os dados com os valores validados
                req.body = validatedData.body;
                req.query = validatedData.query;
                req.params = validatedData.params;
            }

            console.log('✅ Dados validados com sucesso:', req.body);
            next();
        } catch (error) {
            console.error('❌ Erro na validação:', error);
            
            if (error instanceof ZodError) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Erro de validação',
                    errors: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            
            next(error);
        }
    };
};

// Schemas de validação
export const authSchemas = {
    login: z.object({
        email: z.string({
            required_error: "Email é obrigatório",
            invalid_type_error: "Email deve ser uma string"
        }).email("Email inválido"),
        password: z.string({
            required_error: "Senha é obrigatória",
            invalid_type_error: "Senha deve ser uma string"
        }).min(5, "A senha deve ter pelo menos 5 caracteres")
    }).strict(), // Não permite campos extras

    register: z.object({
        email: z.string({
            required_error: "Email é obrigatório",
            invalid_type_error: "Email deve ser uma string"
        }).email("Email inválido"),
        password: z.string({
            required_error: "Senha é obrigatória",
            invalid_type_error: "Senha deve ser uma string"
        }).min(5, "A senha deve ter pelo menos 5 caracteres"),
        name: z.string({
            required_error: "Nome é obrigatório",
            invalid_type_error: "Nome deve ser uma string"
        }).min(2, "O nome deve ter pelo menos 2 caracteres"),
        role: z.enum(['SUPERUSER', 'TRANSLATOR', 'EDITOR']).optional()
    }).strict() // Não permite campos extras
};

export const glossarySchemas = {
  create: z.object({
    body: z.object({
      name: z.string().min(1),
      sourceLanguage: z.string().min(2),
      targetLanguage: z.string().min(2),
      terms: z.array(z.object({
        source: z.string().min(1),
        target: z.string().min(1),
      })).optional(),
    }),
  }),
  update: z.object({
    params: z.object({
      id: z.string(),
    }),
    body: z.object({
      name: z.string().min(1).optional(),
      sourceLanguage: z.string().min(2).optional(),
      targetLanguage: z.string().min(2).optional(),
      terms: z.array(z.object({
        source: z.string().min(1),
        target: z.string().min(1),
      })).optional(),
    }),
  }),
};

export const translationSchemas = {
    create: z.object({
        body: z.object({
            sourceLanguage: z.string().min(2, 'Idioma de origem inválido'),
            targetLanguage: z.string().min(2, 'Idioma de destino inválido'),
            content: z.string().min(1, 'Conteúdo não pode estar vazio'),
            glossaryId: z.string().optional()
        })
    }),
    update: z.object({
        params: z.object({
            id: z.string()
        }),
        body: z.object({
            status: z.enum(['pending', 'processing', 'completed', 'error']).optional(),
            translatedContent: z.string().optional()
        })
    })
};
