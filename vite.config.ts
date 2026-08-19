import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Serve the Vercel edge functions in api/ during `vite dev` too, so /api/*,
// /sitemap.xml and /robots.txt behave like production without `vercel dev`.
// Each module exports a fetch-style default handler (Request → Response).
function vercelApiDev(): Plugin {
  const routes: Record<string, string> = {
    "/api/prefill": "./api/prefill.ts",
    "/api/icon": "./api/icon.ts",
    "/api/sitemap": "./api/sitemap.ts",
    "/sitemap.xml": "./api/sitemap.ts",
    "/api/robots": "./api/robots.ts",
    "/robots.txt": "./api/robots.ts",
    "/api/shapes-gallery": "./api/shapes-gallery.ts",
    "/shapes/gallery-shacl": "./api/shapes-gallery.ts",
  };
  return {
    name: "vercel-api-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        const file = routes[pathname];
        if (!file) return next();
        try {
          const mod = await server.ssrLoadModule(path.resolve(__dirname, file));
          const url = `http://${req.headers.host}${req.url}`;
          const out: Response = await mod.default(new Request(url, { method: req.method }));
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (err) {
          res.statusCode = 500;
          res.end(String((err as Error).stack || err));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), vercelApiDev()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5180,
  },
});
