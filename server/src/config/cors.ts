const corsOptions = {
  origin: [
    'https://ia.santafeagroinstituto.com.br',
    'https://pdf-tradutor-of.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'https://pdf-tradutor-production.up.railway.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept', 
    'X-Requested-With',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'Content-Disposition'
  ],
  exposedHeaders: ['Content-Disposition', 'set-cookie'],
  optionsSuccessStatus: 204,
  preflightContinue: false,
  maxAge: 86400 // 24 horas
};

export default corsOptions;