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
browser ──GET /api/query?section=climate&range=1h──▶ server/handler.ts ──POST /api/v2/query/timeseries──▶ Datadog
```

- The Datadog API needs secret keys and doesn't allow browser (CORS) calls, so a small server-side
  handler, [`server/handler.ts`](server/handler.ts), proxies the requests. It uses only Web-standard
  `Request`/`Response`/`fetch`. In dev, a Vite plugin mounts it (see [`vite.config.ts`](vite.config.ts));
  on Vercel, [`api/query.ts`](api/query.ts) exposes it as a function.
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
| `npm test` | Handler and tile tests (vitest) |
| `npm run vercel -- <command>` | The pinned Vercel CLI (`link`, `env`, `build`, `deploy`) |

## Deploying (Vercel)

The [`Dashboard` workflow](../.github/workflows/dashboard.yml) runs on pull requests and pushes to
`main` that change `dashboard/` (the same triggers as the main CI): typecheck, tests, production
build, and a smoke test of the built Vercel function (`npm run smoke:function`, which imports it
and calls `GET` in mock mode).

When `dashboard/` changes on `main`, or when the workflow is run manually, it deploys to Vercel
production with the pinned Vercel CLI from `devDependencies`: `vercel pull` → `vercel build --prod`
→ smoke test → `vercel deploy --prebuilt --prod`. Pull requests are tested but not deployed. A run
whose dashboard revision is no longer the latest on `main` (for example a re-run of an old commit)
doesn't deploy. It is checked before joining the deploy queue and again just before deploying
(`.github/scripts/dashboard-is-latest.sh`), so it can't roll production back or displace a newer
pending deploy.

On Vercel, every file in `api/` becomes a function, so `api/query.ts` only adapts the handler in
`server/`. `tsconfig.json` sets `rewriteRelativeImportExtensions`, because the function is compiled
with it and Node can't resolve the `.ts` import extensions at runtime otherwise. Real Datadog
responses are cached by Vercel's CDN for 60 s (`s-maxage=60, stale-while-revalidate=60`), so the
public endpoint makes about one Datadog query per minute per section and range, whatever the
traffic. Only the exact `?section=…&range=…` form is answered; any other query string (extra,
duplicate or reordered parameters) is redirected to it, so junk parameters can't create new cache
keys and bypass that bound.

### One-time setup

1. **Create and link the project.** Run this from this folder, and keep the project's Root Directory
   as `.` (the CLI runs from `dashboard/`):

   ```sh
   npm run vercel -- login
   npm run vercel -- link
   ```

   If you created the project by importing the repository in the Vercel dashboard, also
   **disconnect it from Git** (Settings → Git → Disconnect). Otherwise Vercel builds every push
   from the repository root alongside this workflow, and those builds fail.

2. **Set the Datadog env vars** for Production: `DD_API_KEY`, `DD_APP_KEY` (ideally an app key
   scoped to `timeseries_query` only), `DD_SITE` and, optionally, `DD_QUERY_SCOPE`. Use the Vercel
   dashboard (Settings → Environment Variables) or `npm run vercel -- env add <NAME> production`.

3. **Add the GitHub secrets** the workflow uses. Create a token at
   https://vercel.com/account/tokens; the IDs are in `.vercel/project.json`, written by
   `vercel link`:

   ```sh
   gh secret set VERCEL_TOKEN
   gh secret set VERCEL_ORG_ID      # "orgId"
   gh secret set VERCEL_PROJECT_ID  # "projectId"
   ```

4. **Deploy:** push a change to `dashboard/` on `main`, or run `gh workflow run Dashboard`. The
   production URL is printed in the Deploy step's log.

> **Note:** the deployment has no access protection. Anyone with the URL can see the dashboard and
> its data about your home. To restrict it later, add Vercel password protection (Pro plan) or an
> auth check in front of the page and `/api/query`.
