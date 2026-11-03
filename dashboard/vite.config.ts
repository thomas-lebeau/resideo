import react from "@vitejs/plugin-react";
import type { ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import type { Env } from "./api/query.ts";
import { handleQuery } from "./api/query.ts";

/**
 * Serves the portable API handler at /api/query during `vite dev` and `vite preview`.
 * In production the same handler is mounted by the host (Cloudflare Worker / Vercel function).
 */
function apiHandler(env: Env): Plugin {
  const middleware = async (req: Connect.IncomingMessage, res: ServerResponse) => {
    // Connect strips the mount path from req.url; originalUrl keeps the full path and query.
    const url = new URL(req.originalUrl ?? req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const response = await handleQuery(new Request(url, { method: req.method }), env);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
  };
  return {
    name: "api-handler",
    configureServer: (server) => void server.middlewares.use("/api/query", middleware),
    configurePreviewServer: (server) => void server.middlewares.use("/api/query", middleware),
  };
}

export default defineConfig(({ mode }) => {
  // Empty prefix loads DD_* too. They're only passed to the server-side handler; Vite exposes
  // nothing to the client bundle unless it is prefixed with VITE_.
  const { DD_API_KEY, DD_APP_KEY, DD_SITE, DD_QUERY_SCOPE } = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), apiHandler({ DD_API_KEY, DD_APP_KEY, DD_SITE, DD_QUERY_SCOPE })],
  };
});
