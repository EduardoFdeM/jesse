import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { KnowledgeBaseList } from './components/knowledge/KnowledgeBaseList';
import { KnowledgeBaseForm } from './components/knowledge/KnowledgeBaseForm';
import { TranslatedDocuments } from './components/translation/TranslatedDocuments';
import { PrivateRoute } from './components/auth/PrivateRoute';
import { ThemeProvider } from './contexts/ThemeContext';
import { Editor } from './pages/Editor';
import { AssistantList } from './components/assistant/AssistantList';
import { AssistantForm } from './components/assistant/AssistantForm';
import { OpenAIFilesPage } from './pages/OpenAIFiles';

// Componente para proteger rotas de admin
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const userRole = localStorage.getItem('userRole');
    
    if (userRole !== 'SUPERUSER') {
        return <Navigate to="/" replace />;
    }
    
    return <PrivateRoute>{children}</PrivateRoute>;
};

const TranslatorRoute = ({ children }: { children: React.ReactNode }) => {
    const userRole = localStorage.getItem('userRole');
    
    if (userRole === 'EDITOR') {
        return <Navigate to="/translations" replace />;
    }
    
    return <PrivateRoute>{children}</PrivateRoute>;
};

export default function App() {
    return (
        <ThemeProvider>
            <Router>
                <Toaster position="top-right" />
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>}>
                        <Route index element={<Navigate to="/translations" replace />} />
                        <Route path="translations" element={<TranslatedDocuments />} />
                        
                        <Route path="knowledge-bases">
                            <Route index element={
                                <TranslatorRoute>
                                    <KnowledgeBaseList />
                                </TranslatorRoute>
                            } />
                            <Route path="new" element={
                                <TranslatorRoute>
                                    <KnowledgeBaseForm />
                                </TranslatorRoute>
                            } />
                            <Route path=":id/edit" element={
                                <TranslatorRoute>
                                    <KnowledgeBaseForm />
                                </TranslatorRoute>
                            } />
                        </Route>
                        
                        <Route path="assistants">
                            <Route index element={
                                <TranslatorRoute>
                                    <AssistantList />
                                </TranslatorRoute>
                            } />
                            <Route path="new" element={
                                <TranslatorRoute>
                                    <AssistantForm />
                                </TranslatorRoute>
                            } />
                            <Route path=":id/edit" element={
                                <TranslatorRoute>
                                    <AssistantForm />
                                </TranslatorRoute>
                            } />
                        </Route>
                        
                        <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
                    </Route>
                    <Route path="/editor/:id" element={<Editor />} />
                </Routes>
            </Router>
        </ThemeProvider>
    );
}
