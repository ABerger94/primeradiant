import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// In dev, serve /api/* from the same handler files Vercel deploys, so local == production.
function devApi() {
  return {
    name: 'prime-radiant-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url.match(/^\/api\/([a-z-]+)(?:\?|$)/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          await mod.default(req, res);
        } catch (e) {
          if (String(e.message).includes('Failed to load')) return next();
          res.statusCode = 500;
          res.end(String(e.stack || e));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react(), tailwindcss(), devApi()],
  };
});
