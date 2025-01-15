const corsOptions = {
  origin: [
    'https://ia.santafeagroinstituto.com.br',
    'https://pdf-tradutor-of.vercel.app',
    'http://localhost:5173',
    'https://pdf-tradutor-production.up.railway.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept', 
    'X-Requested-With'
  ],
  exposedHeaders: ['set-cookie'],
  optionsSuccessStatus: 204
};

export default corsOptions;