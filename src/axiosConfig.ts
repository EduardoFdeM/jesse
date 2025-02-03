import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://pdf-tradutor-production.up.railway.app';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true
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
        console.log('📤 Enviando requisição:', {
            url: config.url,
            method: config.method,
            headers: config.headers
        });
        return config;
    },
    (error) => {
        console.error('❌ Erro na requisição:', error);
        return Promise.reject(error);
    }
);

// Função para obter ou criar um controller para uma rota específica
export const getController = (route: string) => {
    // Se já existe um controller para esta rota, cancela ele
    if (controllerMap.has(route)) {
        const existingController = controllerMap.get(route);
        if (existingController) {
            existingController.abort();
            controllerMap.delete(route);
        }
    }
    
    // Cria um novo controller
    const controller = new AbortController();
    controllerMap.set(route, controller);
    return controller;
};

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

// Interceptor para logs de resposta
api.interceptors.response.use(
    (response) => {
        console.log('✅ Resposta recebida:', {
            url: response.config.url,
            status: response.status,
            data: response.data
        });
        return response;
    },
    (error) => {
        console.error('❌ Erro na resposta:', {
            url: error.config?.url,
            status: error.response?.status,
            message: error.message,
            response: error.response?.data
        });
        return Promise.reject(error);
    }
);

// Interceptor para adicionar o signal do controller
api.interceptors.request.use(config => {
    if (config.url) {
        const controller = getController(config.url);
        config.signal = controller.signal;
    }
    return config;
});

export default api;
