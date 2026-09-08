import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(rootDir, 'src') } },
  server: { host: '0.0.0.0', port: Number(process.env.PORT ?? 5173) },
  preview: { host: '0.0.0.0', port: Number(process.env.PORT ?? 4173) },
  build: { outDir: 'dist' },
});
