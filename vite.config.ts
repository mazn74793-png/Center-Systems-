import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Disable HMR unconditionally to prevent browser websocket connection errors in the proxy env
      hmr: false,
      // Disable file watching to save precious CPU/memory in sandboxed environments
      watch: null,
    },
  };
});
