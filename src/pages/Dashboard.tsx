import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { FileText, Book, MessageSquare, LogOut, Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function Dashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const { theme, toggleTheme } = useTheme();

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    const isActive = (path: string) => {
        return location.pathname.startsWith(path);
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <nav className="bg-white shadow dark:bg-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex-shrink-0 flex items-center">
                            <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                            <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">
                                PDF Translation
                            </span>
                        </div>

                        <div className="flex-1 flex justify-center">
                            <div className="hidden sm:flex sm:space-x-8">
                                <Link
                                    to="/translations"
                                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                                        isActive('/translations')
                                            ? 'border-blue-500 text-gray-900 dark:text-white'
                                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                                >
                                    <FileText className="h-4 w-4 mr-2" />
                                    Traduções
                                </Link>
                                <Link
                                    to="/knowledge-bases"
                                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                                        isActive('/knowledge-bases')
                                            ? 'border-blue-500 text-gray-900 dark:text-white'
                                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                                >
                                    <Book className="h-4 w-4 mr-2" />
                                    Bases de Conhecimento
                                </Link>
                                <Link
                                    to="/prompts"
                                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                                        isActive('/prompts')
                                            ? 'border-blue-500 text-gray-900 dark:text-white'
                                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                                >
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    Prompts
                                </Link>
                            </div>
                        </div>

                        <div className="hidden sm:flex sm:items-center space-x-4">
                            <button
                                onClick={toggleTheme}
                                className="p-2 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
                            >
                                {theme === 'light' ? (
                                    <Moon className="h-5 w-5" />
                                ) : (
                                    <Sun className="h-5 w-5" />
                                )}
                            </button>
                            <button
                                onClick={handleLogout}
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-gray-500 bg-white hover:text-gray-700 focus:outline-none transition dark:bg-gray-700 dark:text-gray-300 dark:hover:text-white"
                            >
                                <LogOut className="h-4 w-4 mr-2" />
                                Sair
                            </button>
                        </div>

                        <div className="flex items-center sm:hidden">
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                            >
                                <span className="sr-only">Abrir menu</span>
                                <svg
                                    className={`${isMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 6h16M4 12h16M4 18h16"
                                    />
                                </svg>
                                <svg
                                    className={`${isMenuOpen ? 'block' : 'hidden'} h-6 w-6`}
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div className={`${isMenuOpen ? 'block' : 'hidden'} sm:hidden`}>
                    <div className="pt-2 pb-3 space-y-1">
                        <Link
                            to="/translations"
                            className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                                isActive('/translations')
                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900 dark:border-blue-400 dark:text-blue-300'
                                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                            }`}
                        >
                            <FileText className="h-4 w-4 mr-2" />
                            Traduções
                        </Link>
                        <Link
                            to="/knowledge-bases"
                            className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                                isActive('/knowledge-bases')
                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900 dark:border-blue-400 dark:text-blue-300'
                                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                            }`}
                        >
                            <Book className="h-4 w-4 mr-2" />
                            Bases de Conhecimento
                        </Link>
                        <Link
                            to="/prompts"
                            className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                                isActive('/prompts')
                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900 dark:border-blue-400 dark:text-blue-300'
                                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                            }`}
                        >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Prompts
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="block w-full text-left pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                        >
                            Sair
                        </button>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <Outlet />
                </div>
            </main>
        </div>
    );
} 