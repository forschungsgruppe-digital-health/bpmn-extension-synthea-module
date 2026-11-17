import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// One page: the modeler playground (modeler/index.html). The overview and the guides are the
// Starlight site in ../docs-site; tools/build-site.mjs puts both together.
// For GitHub Pages (project site) the app is served from /<repo>/, so assets
// must be requested from that sub-path. The Pages workflow sets BASE_PATH;
// locally (dev / preview) it defaults to "/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: {
        modeler: resolve(import.meta.dirname, 'modeler/index.html')
      }
    }
  }
});
