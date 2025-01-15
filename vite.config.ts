import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://pdf-tradutor-production.up.railway.app',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
});
