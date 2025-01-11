import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:4000',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    withCredentials: false
});

// Interceptor para logs de requisição
api.interceptors.request.use(
    (config) => {
        // Não sobrescrever o Content-Type se já estiver definido ou se for FormData
        if (config.method === 'post' && !config.headers['Content-Type'] && !(config.data instanceof FormData)) {
            config.headers['Content-Type'] = 'application/json';
        }

        // Se for FormData, remover o Content-Type para que o axios defina o correto com o boundary
        if (config.data instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        console.log('Requisição sendo enviada:', {
            url: config.url,
            method: config.method,
            headers: config.headers,
            data: config.data instanceof FormData ? 'FormData' : config.data
        });

        const token = localStorage.getItem('jwtToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        console.error('Erro na requisição:', error);
        return Promise.reject(error);
    }
);

// Interceptor para logs de resposta
api.interceptors.response.use(
    (response) => {
        console.log('Resposta recebida:', {
            status: response.status,
            data: response.data,
            headers: response.headers
        });
        return response;
    },
    (error) => {
        console.error('Erro na resposta:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            config: error.config
        });

        if (error.response?.status === 401) {
            console.log('Erro de autenticação, limpando dados do usuário');
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userId');
            localStorage.removeItem('userName');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export { api }; 