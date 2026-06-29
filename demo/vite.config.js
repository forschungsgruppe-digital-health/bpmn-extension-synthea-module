import { defineConfig } from 'vite';

// For GitHub Pages (project site) the app is served from /<repo>/, so assets
// must be requested from that sub-path. The Pages workflow sets BASE_PATH;
// locally (dev / preview) it defaults to "/".
export default defineConfig({
  base: process.env.BASE_PATH || '/'
});
