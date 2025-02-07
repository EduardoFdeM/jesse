import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?sslmode=no-verify&connection_limit=5&pool_timeout=0'
    }
  }
});

async function testConnection() {
  try {
    console.log('🔄 Testando conexão com o banco de dados...');
    console.log('URL:', process.env.DATABASE_URL);
    
    await prisma.$connect();
    console.log('✅ Conexão estabelecida com sucesso!');
    
    const result = await prisma.$queryRaw`SELECT current_database(), current_schema()`;
    console.log('📊 Informações do banco:', result);
    
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('📋 Tabelas existentes:', tables);
    
  } catch (error) {
    console.error('❌ Erro ao conectar:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection(); 