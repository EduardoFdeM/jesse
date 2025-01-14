import express from 'express';
import prisma from '../config/database.js';

const router = express.Router();

router.get('/', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            environment: process.env.NODE_ENV
        });
    } catch (error) {
        console.error('Health check failed:', error);
        return res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router; 