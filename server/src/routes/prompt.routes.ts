import { Router } from 'express';
import {
    createPrompt,
    getPrompts,
    getPrompt,
    updatePrompt,
    deletePrompt
} from '../controllers/prompt.controller.js';

const router = Router();

// Remover o middleware de autenticação daqui pois já está no app.ts
router.get('/', getPrompts);
router.post('/', createPrompt);
router.get('/:id', getPrompt);
router.put('/:id', updatePrompt);
router.delete('/:id', deletePrompt);

export default router; 