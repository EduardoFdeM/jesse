import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/authorization.middleware.js';
import { getPrompts, getPrompt, createPrompt, updatePrompt, deletePrompt } from '../controllers/prompt.controller.js';

const router = Router();

router.use(authenticate);
router.use(authorize(['TRANSLATOR', 'SUPERUSER']));

router.get('/', getPrompts);
router.get('/:id', getPrompt);
router.post('/', createPrompt);
router.put('/:id', updatePrompt);
router.delete('/:id', deletePrompt);

export default router; 