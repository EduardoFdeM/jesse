import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { KnowledgeBaseList } from './components/knowledge/KnowledgeBaseList';
import { KnowledgeBaseForm } from './components/knowledge/KnowledgeBaseForm';
import { TranslatedDocuments } from './components/translation/TranslatedDocuments';
import { PrivateRoute } from './components/auth/PrivateRoute';
import { ThemeProvider } from './contexts/ThemeContext';
import { Editor } from './pages/Editor';
import { PromptList } from './components/prompt/PromptList';
import { PromptForm } from './components/prompt/PromptForm';

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
                            <Route index element={<KnowledgeBaseList />} />
                            <Route path="new" element={<KnowledgeBaseForm />} />
                            <Route path=":id/edit" element={<KnowledgeBaseForm />} />
                        </Route>
                        <Route path="prompts">
                            <Route index element={<PromptList />} />
                            <Route path="new" element={<PromptForm />} />
                            <Route path=":id/edit" element={<PromptForm />} />
                        </Route>
                    </Route>
                    <Route path="/editor/:id" element={<Editor />} />
                </Routes>
            </Router>
        </ThemeProvider>
    );
}
