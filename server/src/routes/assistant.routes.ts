import { Router } from 'express';
import {
    createAssistant,
    getAssistants,
    getAssistant,
    updateAssistant,
    deleteAssistant
} from '../controllers/assistant.controller.js';
import { validateRequest } from '../middlewares/validateRequest.middleware.js';

const router = Router();

// Validação para criação/atualização de assistente
const assistantValidation = {
    body: {
        name: { type: 'string', required: true },
        instructions: { type: 'string', required: true },
        model: { type: 'string', required: true }
    }
};

// Rotas de assistentes
router.get('/', getAssistants);
router.post('/', validateRequest(assistantValidation), createAssistant);
router.get('/:id', getAssistant);
router.put('/:id', validateRequest(assistantValidation), updateAssistant);
router.delete('/:id', deleteAssistant);

export default router; 