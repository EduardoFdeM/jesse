import OpenAI from 'openai';

// Configuração do cliente OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Interfaces
export interface VectorStore {
    id: string;
    object: 'vector_store';
    created_at: number;
    name: string;
    bytes: number;
    file_counts: {
        in_progress: number;
        completed: number;
        failed: number;
        cancelled: number;
        total: number;
    };
}

export interface VectorStoreFile {
    id: string;
    object: 'vector_store.file';
    created_at: number;
    vector_store_id: string;
}

export interface VectorStoreFileList {
    object: 'list';
    data: VectorStoreFile[];
    first_id: string;
    last_id: string;
    has_more: boolean;
}

export interface OpenAIFile {
    id: string;
    bytes: number;
    created_at: number;
    filename: string;
    object: string;
    purpose: string;
    status: string;
    status_details: string | null;
}

export interface OpenAIAssistant {
    id: string;
    object: string;
    created_at: number;
    name: string;
    description: string | null;
    model: string;
    instructions: string | null;
    tools: Array<{ type: string }>;
    file_ids: string[];
}

export interface OpenAIAssistantList {
    object: string;
    data: OpenAIAssistant[];
    first_id: string;
    last_id: string;
    has_more: boolean;
}

// Configuração centralizada
const getHeaders = (beta: boolean = false) => ({
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
    ...(beta ? { 'OpenAI-Beta': 'assistants=v2' } : {})
});

// Interfaces de resposta
interface AssistantResponse extends OpenAIAssistant {
    status?: string;
}

interface ThreadResponse {
    id: string;
    object: string;
    created_at: number;
    metadata: Record<string, unknown>;
}

interface MessageAnnotation {
    type: string;
    text: string;
    startIndex: number;
    endIndex: number;
}

interface MessageResponse {
    id: string;
    object: string;
    created_at: number;
    thread_id: string;
    role: string;
    content: Array<{
        type: string;
        text: { 
            value: string; 
            annotations: MessageAnnotation[] 
        };
    }>;
}

interface RunResponse {
    id: string;
    object: string;
    created_at: number;
    thread_id: string;
    assistant_id: string;
    status: string;
    started_at: number | null;
    completed_at: number | null;
    model: string;
    instructions: string | null;
}

// Funções para Vector Store
const vectorStoreApi = {
    create: async (name: string): Promise<VectorStore> => {
        console.log('📤 Enviando requisição para criar Vector Store:', {
            url: 'https://api.openai.com/v1/vector_stores',
            headers: {
                'Authorization': 'Bearer $OPENAI_API_KEY',
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            },
            body: { name }
        });

        const response = await fetch('https://api.openai.com/v1/vector_stores', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({ name })
        });
        
        if (!response.ok) {
            const error = await response.text();
            console.error('❌ Erro ao criar Vector Store:', error);
            throw new Error(`Erro ao criar Vector Store: ${error}`);
        }
        
        const data = await response.json();
        console.log('✅ Response da criação da Vector Store:', data);
        return data as VectorStore;
    },
    delete: async (id: string): Promise<void> => {
        const response = await fetch(`https://api.openai.com/v1/vector_stores/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao deletar Vector Store');
        }
    },
    files: {
        add: async (vectorStoreId: string, fileId: string): Promise<VectorStoreFile> => {
            console.log('📤 Enviando requisição para adicionar arquivo:', {
                url: `https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`,
                headers: {
                    'Authorization': 'Bearer $OPENAI_API_KEY',
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                },
                body: { file_id: fileId }
            });

            const response = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                },
                body: JSON.stringify({ file_id: fileId })
            });
            
            if (!response.ok) {
                const error = await response.text();
                console.error('❌ Erro ao adicionar arquivo à Vector Store:', error);
                throw new Error(`Erro ao adicionar arquivo à Vector Store: ${error}`);
            }
            
            const data = await response.json();
            console.log('✅ Response da adição do arquivo:', data);
            return data as VectorStoreFile;
        },
        list: async (vectorStoreId: string): Promise<VectorStoreFileList> => {
            console.log('📤 Enviando requisição para listar arquivos:', {
                url: `https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`,
                headers: {
                    'Authorization': 'Bearer $OPENAI_API_KEY',
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                }
            });

            const response = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                }
            });
            
            if (!response.ok) {
                const error = await response.text();
                console.error('❌ Erro ao listar arquivos da Vector Store:', error);
                throw new Error(`Erro ao listar arquivos da Vector Store: ${error}`);
            }
            
            const data = await response.json();
            console.log('✅ Response da listagem de arquivos:', data);
            return data as VectorStoreFileList;
        }
    }
};

// Funções para Files
const filesApi = {
    upload: async (buffer: Buffer, filename: string): Promise<OpenAIFile> => {
        const formData = new FormData();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const file = new File([blob], filename, { type: 'application/octet-stream' });
        formData.append('file', file);
        formData.append('purpose', 'assistants');
        
        const response = await fetch('https://api.openai.com/v1/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Erro ao fazer upload do arquivo');
        }
        
        const data = await response.json();
        return data as OpenAIFile;
    },

    list: async (): Promise<{ data: OpenAIFile[] }> => {
        const response = await fetch('https://api.openai.com/v1/files', {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao listar arquivos');
        }
        
        return await response.json();
    },

    get: async (fileId: string): Promise<OpenAIFile> => {
        const response = await fetch(`https://api.openai.com/v1/files/${fileId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao buscar informações do arquivo');
        }
        
        const data = await response.json();
        return data as OpenAIFile;
    },

    delete: async (fileId: string): Promise<void> => {
        const response = await fetch(`https://api.openai.com/v1/files/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao deletar arquivo');
        }
    }
};

// Funções para Assistants
const assistantApi = {
    list: async (): Promise<OpenAIAssistantList> => {
        const response = await fetch('https://api.openai.com/v1/assistants?order=desc&limit=20', {
            headers: getHeaders(true)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Erro ao listar Assistants: ${error}`);
        }

        return await response.json();
    },

    create: async (params: {
        name: string;
        instructions: string;
        model: string;
        temperature?: number;
    }): Promise<AssistantResponse> => {
        const response = await fetch('https://api.openai.com/v1/assistants', {
            method: 'POST',
            headers: getHeaders(true),
            body: JSON.stringify({
                name: params.name,
                instructions: params.instructions,
                model: params.model,
                tools: [{ type: "file_search" }]
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Erro ao criar Assistant: ${error}`);
        }

        return await response.json();
    },

    modify: async (assistantId: string, params: {
        name?: string;
        instructions?: string;
        model?: string;
    }): Promise<AssistantResponse> => {
        const response = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
            method: 'POST',
            headers: getHeaders(true),
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            throw new Error('Erro ao modificar Assistant');
        }

        return await response.json();
    },

    delete: async (assistantId: string): Promise<void> => {
        const response = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
            method: 'DELETE',
            headers: getHeaders(true)
        });

        if (!response.ok) {
            throw new Error('Erro ao deletar Assistant');
        }
    }
};

// Funções para Threads e Runs
const threadsApi = {
    create: async (): Promise<ThreadResponse> => {
        const response = await fetch('https://api.openai.com/v1/threads', {
            method: 'POST',
            headers: getHeaders(true)
        });

        if (!response.ok) {
            throw new Error('Erro ao criar thread');
        }

        return await response.json();
    },

    messages: {
        create: async (threadId: string, params: {
            role: string;
            content: string;
        }): Promise<MessageResponse> => {
            const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                throw new Error('Erro ao criar mensagem');
            }

            return await response.json();
        },

        list: async (threadId: string): Promise<{ data: MessageResponse[] }> => {
            const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                headers: getHeaders(true)
            });

            if (!response.ok) {
                throw new Error('Erro ao listar mensagens');
            }

            return await response.json();
        }
    },

    runs: {
        create: async (threadId: string, params: {
            assistant_id: string;
            model: string;
        }): Promise<RunResponse> => {
            const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                throw new Error('Erro ao criar run');
            }

            return await response.json();
        },

        retrieve: async (threadId: string, runId: string): Promise<RunResponse> => {
            const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
                headers: getHeaders(true)
            });

            if (!response.ok) {
                throw new Error('Erro ao buscar status do run');
            }

            return await response.json();
        }
    }
};

// Criar um tipo que combina OpenAI com nossas extensões
type CustomOpenAI = {
    vectorStore: typeof vectorStoreApi;
    files: typeof filesApi;
    assistant: typeof assistantApi;
    beta: {
        threads: typeof threadsApi;
    };
};

// Criar e exportar o cliente customizado
const openaiClient: CustomOpenAI = {
    vectorStore: vectorStoreApi,
    files: filesApi,
    assistant: assistantApi,
    beta: {
        threads: threadsApi
    }
};

// Exportar as funções individuais e o cliente
export { vectorStoreApi as vectorStore, filesApi as files, assistantApi as assistant };
export default openaiClient;
