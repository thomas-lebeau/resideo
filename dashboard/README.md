# Home Monitor Dashboard

A mobile-friendly web dashboard for the home monitor. It reads the `raspberry_home_monitor.*`
log-based metrics (defined in [`terraform/metrics.tf`](../terraform/metrics.tf)) from the Datadog API
and follows the OS light/dark setting.

It is a standalone Vite + React app, separate from the monitor itself.

## Run locally

```sh
cd dashboard
npm install
npm run dev            # http://localhost:5173
npm run dev -- --host  # also reachable from your phone on the LAN
```

Without Datadog keys, the API returns generated **mock data** (sections show a "Mock data" tag), so
the UI works with no setup. To read real metrics:

```sh
cp .env.example .env
# fill DD_API_KEY, DD_APP_KEY (needs the timeseries_query scope), DD_SITE, optionally DD_QUERY_SCOPE
```

## How it works

```
browser ──GET /api/query?section=climate&range=1h──▶ api/query.ts ──POST /api/v2/query/timeseries──▶ Datadog
```

- The Datadog API needs secret keys and doesn't allow browser (CORS) calls, so a small server-side
  handler, [`api/query.ts`](api/query.ts), proxies the requests. It uses only Web-standard
  `Request`/`Response`/`fetch`. In dev, a Vite plugin mounts it (see [`vite.config.ts`](vite.config.ts)).
- The browser asks for a **section id and a range**, never raw queries. The queries live in
  [`src/queries.ts`](src/queries.ts), so a deployed handler can't be used to run arbitrary queries
  against the org.
- Each section is one Datadog request, refreshed every 60 s while the tab is visible.

- The home screen loads every section's last hour for current values. Tapping a tile opens a
  detail sheet that loads that section's history at 1h/24h/7d.

### Adding a metric

1. Add a query to the section in `src/queries.ts` (including a `mock` spec).
2. Add or extend a tile in `src/tiles.ts`: the title, the status line, whether it's active
   (bright), a warning/critical tone, and the charts shown in its detail sheet. This file is plain
   functions, covered by `src/tiles.test.ts`.

## Scripts

| Script | |
|---|---|
| `npm run dev` | Dev server with the API handler |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run preview` | Serve `dist/` with the API handler |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Handler tests (vitest) |

## Deploying (not done yet)

`handleQuery(request, env)` is host-agnostic. It only needs a thin adapter:

- **Cloudflare Workers / Pages**: `export default { fetch: (req, env) => handleQuery(req, env) }`
  for `/api/query`, with `dist/` as static assets and the keys as secrets.
- **Vercel**: `api/query` function exporting `GET = (req) => handleQuery(req, process.env)`.

**Put authentication in front of it** (Cloudflare Access, Vercel password protection) before
deploying: the page exposes data about your home.
