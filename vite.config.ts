import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const VERSIONE = (readFileSync('public/sw.js', 'utf8').match(/VERSION = '([^']+)'/) || [])[1] || 'dev';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __VERSIONE__: JSON.stringify(VERSIONE) },
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
  test: { environment: 'node' },
});
