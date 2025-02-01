import React, { useState } from 'react';
import api from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface LoginFormData {
  email: string;
  password: string;
}

export function LoginForm() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      console.log('Dados do formulário:', formData);
      
      if (!formData.email || !formData.password) {
        setError('Email e senha são obrigatórios');
        setIsLoading(false);
        return;
      }

      const loginData = {
        email: formData.email,
        password: formData.password
      };

      console.log('Enviando requisição para:', `${api.defaults.baseURL}/api/auth/login`);
      console.log('Dados sendo enviados:', loginData);
      
      const response = await api.post('/api/auth/login', loginData);
      console.log('Resposta do servidor:', response.data);

      if (response.data.status === 'success' && response.data.data) {
        const { token, user } = response.data.data;

        console.log('Login bem-sucedido, salvando dados do usuário');
        
        localStorage.setItem('jwtToken', token);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userId', user.id);
        localStorage.setItem('userName', user.name);

        toast.success('Login realizado com sucesso!');
        
        console.log('Redirecionando para a página inicial');
        navigate('/', { replace: true });
        window.location.reload();  // Forçar recarregamento para corrigir renderização
      } else {
        console.error('Resposta inesperada do servidor:', response.data);
        throw new Error('Formato de resposta inválido');
      }
    } catch (error: any) {
      console.error('Erro ao fazer login:', error);
      
      const message = error.response?.data?.message || 'Erro ao fazer login';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <div className="mt-1 relative">
            <Mail className="absolute inset-y-0 left-0 pl-3 flex items-center h-5 w-5 text-gray-400" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="seu@email.com"
              value={formData.email}
              onChange={handleChange}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Senha
          </label>
          <div className="mt-1 relative">
            <Lock className="absolute inset-y-0 left-0 pl-3 flex items-center h-5 w-5 text-gray-400" />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={formData.password}
              onChange={handleChange}
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <div className="text-sm text-center text-gray-600">
          {import.meta.env.VITE_BACKEND_URL ? 'Backend configurado' : 'Backend não configurado'}
        </div>
      </form>
    </div>
  );
}
