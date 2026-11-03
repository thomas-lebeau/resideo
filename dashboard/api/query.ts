/**
 * Vercel Function entry for GET /api/query. Every file in api/ becomes a function, so this file
 * only adapts the portable handler in server/ (also used by the Vite dev server).
 */
import { handleQuery } from "../server/handler.ts";

export function GET(request: Request): Promise<Response> {
  return handleQuery(request, process.env);
}
