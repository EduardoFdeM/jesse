import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não está definida nas variáveis de ambiente');
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 120000, // 120 segundos
    maxRetries: 3
});

// Função para validar a conexão
export const validateOpenAIConnection = async () => {
    try {
        await openai.models.list();
        return true;
    } catch (error) {
        console.error('Erro ao validar conexão com OpenAI:', error);
        return false;
    }
};

export default openai;
