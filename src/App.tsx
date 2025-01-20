import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { KnowledgeBaseList } from './components/knowledge/KnowledgeBaseList';
import { KnowledgeBaseForm } from './components/knowledge/KnowledgeBaseForm';
import { GlossaryEditor } from './components/knowledge/GlossaryEditor';
import { TranslatedDocuments } from './components/translation/TranslatedDocuments';
import { PrivateRoute } from './components/auth/PrivateRoute';
import { ThemeProvider } from './contexts/ThemeContext';

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
                        <Route path="knowledge-bases" element={<KnowledgeBaseList />} />
                        <Route path="knowledge-bases/new" element={<KnowledgeBaseForm />} />
                        <Route path="knowledge-bases/:id/edit" element={<KnowledgeBaseForm />} />
                        <Route path="knowledge-bases/:id/glossary" element={<GlossaryEditor />} />
                    </Route>
                </Routes>
            </Router>
        </ThemeProvider>
    );
}
