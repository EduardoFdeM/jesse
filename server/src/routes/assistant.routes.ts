import { Router } from 'express';
import {
    createAssistant,
    getAssistants,
    getAssistant,
    updateAssistant,
    deleteAssistant
} from '../controllers/assistant.controller.js';
import { authorize } from '../middlewares/authorization.middleware.js';

const router = Router();

router.use(authorize(['TRANSLATOR', 'SUPERUSER']));

router.get('/', getAssistants);
router.post('/', createAssistant);
router.get('/:id', getAssistant);
router.put('/:id', updateAssistant);
router.delete('/:id', deleteAssistant);

export default router; 