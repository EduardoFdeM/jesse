import { Router } from 'express';
import { 
    getUsers,
    getUserDetails,
    updateUserRole,
    getAssistantConfig,
    updateAssistantConfig,
    getUserStats,
    createUser,
    getAvailableUsers
} from '../controllers/admin.controller.js';
import { authorize } from '../middlewares/authorization.middleware.js';

const router = Router();

// Rotas de gerenciamento de usuários
router.get('/users', authorize(['SUPERUSER']), getUsers);
router.get('/users/available', authorize(['SUPERUSER', 'TRANSLATOR']), getAvailableUsers);
router.post('/users', authorize(['SUPERUSER']), createUser);
router.get('/users/:id', authorize(['SUPERUSER']), getUserDetails);
router.get('/users/:id/stats', authorize(['SUPERUSER']), getUserStats);
router.put('/users/:id/role', authorize(['SUPERUSER']), updateUserRole);

// Rotas de gerenciamento do Assistente
router.get('/assistant/config', getAssistantConfig);
router.put('/assistant/config', updateAssistantConfig);

export default router; 