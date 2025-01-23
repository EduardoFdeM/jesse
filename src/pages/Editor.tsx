import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DocumentEditor } from '../components/editor/DocumentEditor';
import { api } from '../services/api';
import { toast } from 'react-toastify';

export function Editor() {
  const { id } = useParams<{ id: string }>();
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDocument();
  }, [id]);

  const loadDocument = async () => {
    try {
      const response = await api.get(`/api/translations/${id}/content`);
      setContent(response.data.content);
    } catch (error) {
      console.error('Erro ao carregar documento:', error);
      toast.error('Erro ao carregar documento');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (newContent: string) => {
    try {
      await api.put(`/api/translations/${id}/content`, { content: newContent });
      toast.success('Documento salvo com sucesso');
    } catch (error) {
      console.error('Erro ao salvar documento:', error);
      toast.error('Erro ao salvar documento');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50">
      <DocumentEditor
        translationId={id!}
        initialContent={content}
        onSave={handleSave}
      />
    </div>
  );
} 