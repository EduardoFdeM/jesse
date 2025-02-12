import { Router } from 'express';
import {
    createAssistant,
    getAssistants,
    getAssistant,
    updateAssistant,
    deleteAssistant
} from '../controllers/assistant.controller.js';

const router = Router();

// Remover o middleware de autenticação daqui pois já está no app.ts
router.get('/', getAssistants);
router.post('/', createAssistant);
router.get('/:id', getAssistant);
router.put('/:id', updateAssistant);
router.delete('/:id', deleteAssistant);

export default router; 