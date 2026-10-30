import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, Vite serves the UI and forwards API and WebSocket traffic to the Fastify server,
// on the PORT from the repo's .env (the same file the server reads).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  const server = `127.0.0.1:${env.PORT || 3000}`;
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://${server}`,
        '/media': `http://${server}`,
        '/ws': { target: `ws://${server}`, ws: true },
      },
    },
  };
});
