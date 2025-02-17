// src/constants/fileTypes.ts
export const VECTOR_STORE_EXTENSIONS = {
  // Documentos
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Código
  '.js': 'text/javascript',
  '.ts': 'application/typescript',
  '.py': ['text/x-python', 'text/x-script.python'],
  '.java': 'text/x-java',
  '.json': 'application/json',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.cs': 'text/x-csharp',
  '.css': 'text/css',
  '.go': 'text/x-golang',
  '.php': 'text/x-php',
  '.rb': 'text/x-ruby',
  '.sh': 'application/x-sh',
  // Markup
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.tex': 'text/x-tex'
};

export const VECTOR_STORE_MIME_TYPES = Object.values(VECTOR_STORE_EXTENSIONS).flat();
export const VECTOR_STORE_EXTENSIONS_LIST = Object.keys(VECTOR_STORE_EXTENSIONS);