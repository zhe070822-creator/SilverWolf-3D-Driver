import { defineConfig } from 'vite';

import fs from 'node:fs';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: '.',
    rollupOptions: {
      input: 'index.html',
    }
  },
  server: {
    port: 3000,
  },
  plugins: [{
    name: 'copy-silverwolf',
    closeBundle() {
      fs.cpSync('SilverWolf', 'dist/SilverWolf', { recursive: true });
      console.log('[Vite] Copied SilverWolf/ to dist/');
    }
  }]
});
