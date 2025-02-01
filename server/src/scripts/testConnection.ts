import { connectDatabase } from '../config/database.js';

async function testConnection() {
    try {
        await connectDatabase();
        console.log('✅ Conexão bem sucedida!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na conexão:', error);
        process.exit(1);
    }
}

testConnection(); 