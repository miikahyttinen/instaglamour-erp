/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveDevServerSettings } from './devServer.ts';

export default defineConfig(({ mode }) => {
  // VITE_PORT / VITE_API_PROXY_TARGET from the shell or `.env*` files (see `.env.example`).
  const { port, apiProxyTarget } = resolveDevServerSettings(
    loadEnv(mode, process.cwd(), 'VITE_'),
  );

  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        '/api': {
          target: apiProxyTarget,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
      unstubEnvs: true,
    },
  };
});
