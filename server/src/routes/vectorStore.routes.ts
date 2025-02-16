import { Router } from 'express';
import multer from 'multer';
import * as vectorStoreController from '../controllers/vectorStore.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

router.post('/', upload.array('files', 20), vectorStoreController.create);
router.get('/', vectorStoreController.list);
router.delete('/:id', vectorStoreController.remove);

export default router; 