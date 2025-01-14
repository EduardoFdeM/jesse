import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

interface PrismaUser {
    id: string;
    email: string;
    name: string;
    password: string;
}

async function checkUsers() {
    try {
        // Verificar conexão com o banco
        console.log('🔌 Verificando conexão com o banco de dados...');
        await prisma.$connect();
        console.log('✅ Conexão estabelecida com sucesso!');

        // Listar todos os usuários
        console.log('\n📋 Listando todos os usuários:');
        const users = await prisma.user.findMany();
        
        if (users.length === 0) {
            console.log('❗ Nenhum usuário encontrado no banco de dados.');
        } else {
            users.forEach((user: PrismaUser) => {
                console.log('👤 Usuário:', {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    hasPassword: !!user.password,
                    passwordLength: user.password?.length
                });
            });
        }

        // Criar usuários de teste se não existirem
        const testUsers = [
            {
                email: 'adm.evergreenmkt@gmail.com',
                password: '123456789',
                name: 'Administrador'
            }
        ];

        for (const testUser of testUsers) {
            const existingUser = await prisma.user.findUnique({
                where: { email: testUser.email }
            });

            if (!existingUser) {
                console.log(`\n🆕 Criando usuário de teste (${testUser.email})...`);
                const hashedPassword = await bcrypt.hash(testUser.password, 10);
                
                const newUser = await prisma.user.create({
                    data: {
                        email: testUser.email,
                        password: hashedPassword,
                        name: testUser.name
                    }
                });

                console.log('✅ Usuário criado:', {
                    id: newUser.id,
                    email: newUser.email,
                    name: newUser.name,
                    passwordLength: newUser.password.length
                });
            } else {
                console.log(`\n✅ Usuário já existe (${testUser.email}):`, {
                    id: existingUser.id,
                    email: existingUser.email,
                    name: existingUser.name,
                    passwordLength: existingUser.password?.length
                });

                // Atualizar a senha do usuário existente
                console.log('🔄 Atualizando senha...');
                const hashedPassword = await bcrypt.hash(testUser.password, 10);
                const updatedUser = await prisma.user.update({
                    where: { email: testUser.email },
                    data: { password: hashedPassword }
                });

                console.log('✅ Senha atualizada para o usuário:', updatedUser.email);
            }
        }

    } catch (error) {
        console.error('❌ Erro ao verificar usuários:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Executa a verificação
console.log('🚀 Iniciando verificação de usuários...\n');
checkUsers()
    .then(() => console.log('\n✅ Verificação concluída!'))
    .catch(error => console.error('\n❌ Erro durante a verificação:', error)); 