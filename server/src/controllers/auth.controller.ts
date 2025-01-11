// server/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { UnauthorizedError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';

// Login
export const login = asyncHandler(async (req: Request, res: Response) => {
    console.log('📝 Tentativa de login:', {
        email: req.body.email,
        hasPassword: !!req.body.password
    });

    const { email, password } = req.body;

    // Validar campos obrigatórios
    if (!email || !password) {
        console.log('❌ Email ou senha não fornecidos');
        throw new UnauthorizedError('Email e senha são obrigatórios');
    }

    // Buscar usuário
    const user = await prisma.user.findUnique({
        where: { email }
    });

    console.log('🔍 Usuário encontrado:', {
        found: !!user,
        userId: user?.id,
        userEmail: user?.email
    });

    if (!user) {
        console.log('❌ Usuário não encontrado');
        throw new UnauthorizedError('Credenciais inválidas');
    }

    // Verificar senha
    const validPassword = await bcrypt.compare(password, user.password);
    console.log('🔐 Verificação de senha:', {
        valid: validPassword,
        passwordLength: password.length,
        hashedPasswordLength: user.password.length
    });

    if (!validPassword) {
        console.log('❌ Senha inválida');
        throw new UnauthorizedError('Credenciais inválidas');
    }

    // Gerar token
    const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' }
    );

    console.log('✅ Login bem-sucedido:', {
        userId: user.id,
        userEmail: user.email
    });

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
