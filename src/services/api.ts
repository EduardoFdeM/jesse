import axios from 'axios';

const api = axios.create({
    baseURL: 'https://pdf-tradutor-production.up.railway.app',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    },
    withCredentials: true,
    validateStatus: status => status < 500,
    timeout: 10000,
    maxRedirects: 5
});

// Interceptor para logs de requisição
api.interceptors.request.use(
    (config) => {
        // Headers básicos
        if (config.method === 'options') {
            config.headers['Access-Control-Request-Method'] = 'POST, GET, DELETE, PUT, PATCH';
            config.headers['Access-Control-Request-Headers'] = 'Content-Type, Authorization';
        }

        // Não sobrescrever o Content-Type se já estiver definido ou se for FormData
        if (config.method === 'post' && !config.headers['Content-Type'] && !(config.data instanceof FormData)) {
            config.headers['Content-Type'] = 'application/json';
        }

        // Se for FormData, remover o Content-Type
        if (config.data instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        // Token de autenticação
        const token = localStorage.getItem('jwtToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        console.log('Requisição sendo enviada:', {
            url: config.url,
            method: config.method,
            headers: config.headers,
            data: config.data instanceof FormData ? 'FormData' : config.data
        });

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