import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  errorFormat: 'pretty',
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Função para gerenciar a conexão com o banco de dados
export const connectDatabase = async () => {
  try {
    console.log('🔄 Tentando conectar ao banco de dados...');
    const dbUrl = process.env.DATABASE_URL?.split('?')[0];
    console.log('📊 URL do banco:', dbUrl);

    let retries = 3;
    while (retries > 0) {
      try {
        await prisma.$connect();
        console.log('✅ Conectado ao banco de dados com sucesso!');
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        console.log(`⚠️ Tentativa falhou. Restam ${retries} tentativas...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Teste a conexão
    const result = await prisma.$queryRaw`SELECT current_database(), current_schema()`;
    console.log('✅ Informações do banco:', result);
    
    // Verificar tabelas
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('📋 Tabelas existentes:', tables);
    
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
