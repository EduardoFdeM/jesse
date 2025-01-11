import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true
});

// Mapa para armazenar os controllers por rota
const controllerMap = new Map<string, AbortController>();

// Interceptor para adicionar o token de autenticação
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('jwtToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
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

// Interceptor para tratar erros
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        // Se for erro 429, não vamos rejeitar a promise
        if (error.response?.status === 429) {
            console.log('⚠️ Rate limit atingido, mas o upload continua em processamento');
            // Retorna um objeto especial indicando que o upload continua
            return {
                status: 429,
                data: {
                    message: 'Upload em andamento',
                    isRateLimit: true
                }
            };
        }
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
