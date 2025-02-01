// server/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { UnauthorizedError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Login
export const login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    console.log('📝 Tentativa de login:', { email });

    if (!email || !password) {
        throw new UnauthorizedError('Email e senha são obrigatórios');
    }

    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        console.log('❌ Usuário não encontrado:', email);
        throw new UnauthorizedError('Credenciais inválidas');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
        console.log('❌ Senha inválida para usuário:', email);
        throw new UnauthorizedError('Credenciais inválidas');
    }

    const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET || 'default_secret_key',
        { expiresIn: '24h' }
    );

    console.log('✅ Login bem-sucedido para:', email);

    res.json({
        status: 'success',
        data: {
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        }
    });
});

// Registro
export const register = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    // Validar campos obrigatórios
    if (!name || !email || !password) {
        throw new Error('Todos os campos são obrigatórios');
    }

    // Verificar se usuário já existe
    const existingUser = await prisma.user.findUnique({
        where: { email }
    });

    if (existingUser) {
        throw new Error('Email já cadastrado');
    }

    // Hash da senha
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Criar usuário
    const user = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword
        }
    });

    // Gerar token
    const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' }
    );

    res.status(201).json({
        status: 'success',
        data: {
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        }
    });
});

// Verificar token
export const verifyToken = asyncHandler(async (req: Request, res: Response) => {
    res.json({
        status: 'success',
        data: {
            user: {
                id: req.user!.id,
                email: req.user!.email,
                name: req.user!.name
            }
        }
    });
});
