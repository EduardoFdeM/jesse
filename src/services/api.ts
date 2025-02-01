import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://pdf-tradutor-production.up.railway.app';

console.log('🌐 API URL configurada:', API_URL);

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    withCredentials: true,
    timeout: 30000, // Aumentar timeout
});

// Adicionar log do token para debug
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('jwtToken');
        console.log('🔑 Token encontrado:', token ? 'Sim' : 'Não');
        
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Log mais detalhado
        console.log('📤 Enviando requisição:', {
            url: config.url,
            method: config.method,
            headers: config.headers,
            data: config.data
        });

        return config;
    },
    (error) => {
        console.error('❌ Erro na requisição:', error);
        return Promise.reject(error);
    }
);

// Melhorar o interceptor de resposta
api.interceptors.response.use(
    (response) => {
        console.log('📥 Resposta recebida:', {
            status: response.status,
            data: response.data
        });
        return response;
    },
    (error) => {
        console.error('❌ Erro na resposta:', {
            status: error.response?.status,
            message: error.message,
            data: error.response?.data
        });

        // Melhorar mensagem de erro
        if (error.response?.status === 404) {
            throw new Error('Recurso não encontrado. Verifique a URL da requisição.');
        }

        return Promise.reject(error);
    }
);

export { api }; 