import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two pages: the overview (index.html) and the modeler playground (modeler/index.html).
// For GitHub Pages (project site) the app is served from /<repo>/, so assets
// must be requested from that sub-path. The Pages workflow sets BASE_PATH;
// locally (dev / preview) it defaults to "/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: {
        overview: resolve(import.meta.dirname, 'index.html'),
        modeler: resolve(import.meta.dirname, 'modeler/index.html')
      }
    }
  }
});
