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

        // Log apenas se não for uma requisição de polling do socket ou knowledge-bases
        if (!config.url?.includes('socket.io') && 
            !(config.method === 'get' && config.url === '/api/knowledge-bases')) {
            console.log('Requisição sendo enviada:', {
                url: config.url,
                method: config.method,
                headers: config.headers,
                data: config.data instanceof FormData ? 'FormData' : config.data
            });
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
        console.error('Erro na resposta:', error);

        // Lista de erros que devem causar redirecionamento
        const redirectErrors = [
            'timeout of 10000ms exceeded',
            'Network Error',
            'Request failed with status code 401'
        ];

        if (
            redirectErrors.includes(error.message) || 
            error.response?.status === 401
        ) {
            console.log('Erro de autenticação ou conexão, redirecionando para login...');
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userId');
            localStorage.removeItem('userName');
            
            // Redirecionar apenas se não estiver já na página de login
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export { api }; 