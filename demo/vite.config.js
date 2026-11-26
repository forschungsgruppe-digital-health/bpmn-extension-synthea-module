import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// One page: the modeler playground (modeler/index.html). The overview and the guides are the
// Starlight site in ../docs-site; tools/build-site.mjs puts both together.
// For GitHub Pages (project site) the app is served from /<repo>/, so assets
// must be requested from that sub-path. The Pages workflow sets BASE_PATH;
// locally (dev / preview) it defaults to "/".
const base = process.env.BASE_PATH || '/';

// The dev server and `vite preview` (the dev server is also what `docker compose up` runs) serve
// only modeler/, so the bare address and /modeler without the slash would be a 404. Send both to
// the modeler. On GitHub Pages the overview sits at the root; this applies only to these servers.
const redirectToModeler = () => {
  const redirect = (req, res, next) => {
    const [path, query] = req.url.split('?');
    if (path !== base && path !== `${base}modeler`) return next();
    res.statusCode = 302;
    res.setHeader('Location', `${base}modeler/${query ? `?${query}` : ''}`);
    res.end();
  };
  return {
    name: 'redirect-to-modeler',
    configureServer: (server) => { server.middlewares.use(redirect); },
    configurePreviewServer: (server) => { server.middlewares.use(redirect); }
  };
};

export default defineConfig({
  base,
  plugins: [redirectToModeler()],
  build: {
    rollupOptions: {
      input: {
        modeler: resolve(import.meta.dirname, 'modeler/index.html')
      }
    }
  }
});
