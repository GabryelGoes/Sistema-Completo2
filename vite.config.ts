import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      /** Raiz absoluta: obrigatório para rotas SPA (/acompanhamento/:token) na Vercel. */
      base: '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: {
          port: 24679,
          clientPort: 24679,
        },
      },
      // SPA: rota pública de acompanhamento (mesmo comportamento que vercel.json em produção)
      historyApiFallback: {
        rewrites: [{ from: /^\/acompanhamento\/[^/]+$/, to: '/index.html' }],
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
              if (id.includes('@supabase')) return 'supabase';
              if (id.includes('date-fns')) return 'date-fns';
              if (id.includes('lucide-react')) return 'lucide';
              if (id.includes('react-markdown')) return 'markdown';
            },
          },
        },
      },
    };
});
