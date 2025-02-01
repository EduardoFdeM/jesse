import { useState, useEffect } from 'react';
import { FileUpload } from './FileUpload';
import { LanguageSelector } from '../translation/LanguageSelector';
import api from '../../axiosConfig';
import { toast } from 'react-hot-toast';
import { KnowledgeBase, Prompt } from '../../types';

export function DocumentUploader() {
    const [sourceLanguage, setSourceLanguage] = useState('');
    const [targetLanguage, setTargetLanguage] = useState('');
    const [outputFormat, setOutputFormat] = useState('pdf');
    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
    const [prompts, setPrompts] = useState<Prompt[]>([]);

    useEffect(() => {
        loadKnowledgeBases();
        loadPrompts();
    }, []);

    const loadKnowledgeBases = async () => {
        try {
            const response = await api.get('/api/knowledge-bases');
            setKnowledgeBases(response.data.data);
        } catch (error) {
            console.error('Erro ao carregar bases de conhecimento:', error);
        }
    };

    const loadPrompts = async () => {
        try {
            const response = await api.get('/api/prompts');
            setPrompts(response.data.data);
        } catch (error) {
            console.error('Erro ao carregar prompts:', error);
        }
    };

    const handleFileSelect = async (files: File[]) => {
        if (files.length === 0) {
            toast.error('Por favor, selecione um arquivo.');
            return;
        }

        const formData = new FormData();
        formData.append('file', files[0]);
        formData.append('sourceLanguage', sourceLanguage);
        formData.append('targetLanguage', targetLanguage);
        formData.append('outputFormat', outputFormat);
        formData.append('originalname', files[0].name);

        try {
            const response = await api.post('/api/translations', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (response.data.error) {
                throw new Error(response.data.error);
            }

            toast.success('Arquivo enviado com sucesso!');
        } catch (error) {
            console.error('Erro no upload:', error);
            toast.error(error instanceof Error ? error.message : 'Erro ao enviar arquivo');
        }
    };

    return (
        <div className="p-4 border rounded shadow">
            <h2 className="text-lg font-bold mb-4">Upload de Documentos</h2>
            <div className="flex space-x-4 mb-4">
                <LanguageSelector
                    value={sourceLanguage}
                    onChange={setSourceLanguage}
                    label="Idioma de Origem"
                />
                <LanguageSelector
                    value={targetLanguage}
                    onChange={setTargetLanguage}
                    label="Idioma de Destino"
                />
            </div>
            
            <FileUpload 
                onFileSelect={handleFileSelect}
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
                knowledgeBases={knowledgeBases}
                prompts={prompts}
            />
        </div>
    );
}
