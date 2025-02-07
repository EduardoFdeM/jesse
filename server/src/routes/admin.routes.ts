import { Router } from 'express';
import { 
    getUsers,
    getUserDetails,
    updateUserRole,
    getAssistantConfig,
    updateAssistantConfig,
    getUserStats
} from '../controllers/admin.controller.js';

const router = Router();

// Rotas de gerenciamento de usuários
router.get('/users', getUsers);
router.get('/users/:id', getUserDetails);
router.get('/users/:id/stats', getUserStats);
router.put('/users/:id/role', updateUserRole);

// Rotas de gerenciamento do Assistente
router.get('/assistant/config', getAssistantConfig);
router.put('/assistant/config', updateAssistantConfig);

export default router; 