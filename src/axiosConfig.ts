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
    timeout: 30000
});

// Mapa para armazenar os controllers por rota
const controllerMap = new Map<string, AbortController>();

// Interceptor para adicionar o token e logs
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('jwtToken');
        
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Criar um novo controller apenas se não existir um para a rota
        if (config.url && !controllerMap.has(config.url)) {
            const controller = new AbortController();
            controllerMap.set(config.url, controller);
            config.signal = controller.signal;
        }

        console.log('📤 Enviando requisição:', {
            url: config.url,
            method: config.method
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
            url: response.config.url
        });

        // Limpar o controller após a resposta
        if (response.config.url) {
            controllerMap.delete(response.config.url);
        }

        return response;
    },
    (error) => {
        // Não logar erros de cancelamento
        if (axios.isCancel(error)) {
            return Promise.reject(error);
        }

        console.error('❌ Erro na resposta:', {
            status: error.response?.status,
            message: error.message,
            url: error.config?.url
        });

        // Limpar o controller em caso de erro
        if (error.config?.url) {
            controllerMap.delete(error.config.url);
        }

        if (error.response?.status === 401) {
            localStorage.removeItem('jwtToken');
            window.location.href = '/login';
            return Promise.reject(new Error('Sessão expirada. Por favor, faça login novamente.'));
        }

        return Promise.reject(error);
    }
);

// Função para cancelar uma requisição específica
export const cancelRequest = (route: string) => {
    const controller = controllerMap.get(route);
    if (controller) {
        controller.abort();
        controllerMap.delete(route);
    }
};

// Função para limpar todos os controllers
export const clearControllers = () => {
    controllerMap.forEach(controller => controller.abort());
    controllerMap.clear();
};

export default api;
