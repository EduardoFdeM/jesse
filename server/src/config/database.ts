import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  errorFormat: 'pretty',
});

// Função para gerenciar a conexão com o banco de dados
export const connectDatabase = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Conectado ao banco de dados com sucesso!');
    console.log('📝 URL do banco:', process.env.DATABASE_URL?.split('@')[1]); // Log seguro da URL
  } catch (error) {
    console.error('❌ Erro ao conectar ao banco de dados:', error);
    throw error; // Lança o erro para que ele possa ser tratado no arquivo `index.ts`
  }
};

// Exporta o cliente Prisma como padrão para uso em outras partes do app
export default prisma;
