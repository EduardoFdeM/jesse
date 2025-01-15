import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';

export function Register() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        if (formData.password !== formData.confirmPassword) {
            toast.error('As senhas não coincidem');
            setIsSubmitting(false);
            return;
        }

        try {
            const response = await api.post('/api/auth/register', {
                name: formData.name,
                email: formData.email,
                password: formData.password
            });
            
            if (response.data?.data) {
                const { token, user } = response.data.data;
                localStorage.setItem('jwtToken', token);
                localStorage.setItem('userEmail', user.email);
                localStorage.setItem('userId', user.id);
                localStorage.setItem('userName', user.name);
                
                toast.success('Conta criada com sucesso!');
                navigate('/');
            }
        } catch (error: unknown) {
            console.error('Erro ao registrar:', error);
            
            if (error instanceof Error) {
                const axiosError = error as AxiosError<{ error?: string; message?: string }>;
                if (axiosError.response?.data?.error === 'EMAIL_EXISTS') {
                    toast.error('Este email já está cadastrado');
                } else if (axiosError.response?.data?.message) {
                    toast.error(axiosError.response.data.message);
                } else {
                    toast.error('Erro ao criar conta. Por favor, tente novamente.');
                }
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <FileText className="h-12 w-12 text-blue-600" />
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Criar nova conta
                </h2>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                                Nome
                            </label>
                            <input
                                id="name"
                                type="text"
                                required
                                autoComplete="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                autoComplete="username"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                Senha
                            </label>
                            <input
                                id="password"
                                type="password"
                                required
                                autoComplete="new-password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                                Confirmar Senha
                            </label>
                            <input
                                id="confirmPassword"
                                type="password"
                                required
                                autoComplete="new-password"
                                value={formData.confirmPassword}
                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                            >
                                {isSubmitting ? 'Criando conta...' : 'Criar conta'}
                            </button>
                        </div>

                        <div className="text-sm text-center">
                            <Link
                                to="/login"
                                className="font-medium text-blue-600 hover:text-blue-500"
                            >
                                Já tem uma conta? Entre aqui
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
} 