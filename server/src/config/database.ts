import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error'],
  errorFormat: 'pretty',
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?sslmode=no-verify&connection_limit=5&pool_timeout=0'
    }
  }
});

// Função para gerenciar a conexão com o banco de dados
export const connectDatabase = async () => {
  try {
    console.log('🔄 Tentando conectar ao banco de dados...');
    console.log('URL:', process.env.DATABASE_URL);
    
    let retries = 5;
    let lastError;
    
    while (retries > 0) {
      try {
        await prisma.$connect();
        console.log('✅ Conectado ao banco de dados com sucesso!');
        
        // Teste a conexão
        const result = await prisma.$queryRaw`SELECT current_database(), current_schema()`;
        console.log('✅ Informações do banco:', result);
        
        return;
      } catch (error) {
        lastError = error;
        retries--;
        if (retries === 0) break;
        
        console.log(`⚠️ Tentativa falhou. Restam ${retries} tentativas...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    throw lastError;
  } catch (error) {
    console.error('❌ Erro ao conectar ao banco de dados:', error);
    throw error;
  }
};

// Handlers de cleanup
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  console.log('🔌 Desconectado do banco de dados');
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  console.log('🔌 Desconectado do banco de dados (SIGINT)');
  process.exit(0);
});

// Exporta o cliente Prisma como padrão para uso em outras partes do app
export default prisma;
