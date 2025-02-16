import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import prisma from '../config/database.js';

export const getPrompts = asyncHandler(async (req: Request, res: Response) => {
    const prompts = await prisma.prompt.findMany({
        where: { userId: req.user?.id }
    });
    res.json({ status: 'success', data: prompts });
});

export const getPrompt = asyncHandler(async (req: Request, res: Response) => {
    const prompt = await prisma.prompt.findFirst({
        where: { id: req.params.id, userId: req.user?.id }
    });
    res.json({ status: 'success', data: prompt });
});

export const createPrompt = asyncHandler(async (req: Request, res: Response) => {
    const prompt = await prisma.prompt.create({
        data: { ...req.body, userId: req.user?.id }
    });
    res.json({ status: 'success', data: prompt });
});

export const updatePrompt = asyncHandler(async (req: Request, res: Response) => {
    const prompt = await prisma.prompt.update({
        where: { id: req.params.id },
        data: req.body
    });
    res.json({ status: 'success', data: prompt });
});

export const deletePrompt = asyncHandler(async (req: Request, res: Response) => {
    await prisma.prompt.delete({
        where: { id: req.params.id }
    });
    res.json({ status: 'success' });
}); 