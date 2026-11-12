# DMS – office web app (DMS_FE)

React 19 + TypeScript front end for the Document Management System: manuals, circulars and alerts,
other documents, vessel sync, pending acknowledgements and search. It talks to the DMS_API project.

Built with [Vite](https://vite.dev/) (replaces Create React App) and tested with [Vitest](https://vitest.dev/).

## Requirements

* Node.js 18.18 or later (20 LTS recommended)
* The DMS API running and allowing this app's address in `AllowedCorsOrigin` (default `http://localhost:3000`)

## First run

```bash
cp .env.example .env.local     # then set REACT_APP_API_URL, e.g. https://localhost:7151/api
npm install
npm start                      # http://localhost:3000
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` / `npm run dev` | Development server on port 3000, reloads on save |
| `npm run build` | Type check, then production build into `build/` (deploy that folder) |
| `npm run preview` | Serves the production build locally |
| `npm test` | Runs the tests once (`npm run test:watch` keeps watching) |
| `npm run typecheck` | TypeScript check only |
| `npm run lint` | ESLint (errors fail; warnings mark older code still to tidy) |

GitHub Actions (`.github/workflows/build.yml`) runs type check, lint, tests and build on every push and pull request.

## Settings

Set in `.env.local` (or the build server's environment) before building – see `.env.example`.
Vite reads variables starting with `REACT_APP_`, so the names did not change with the move from Create React App.

| Variable | Meaning |
| --- | --- |
| `REACT_APP_API_URL` | API base URL, e.g. `https://dms.example.com/api` (default `/api`) |
| `REACT_APP_ENV_LABEL` | Label next to the user name, e.g. `QA` (empty in production) |
| `REACT_APP_COMPANY` | Company name in the header and on the login page |
| `REACT_APP_MANUAL_LINK_VIEW` | `tree` or `grid`: how manual links from the dashboard open |

## Deploying

`npm run build` writes the site to `build/`. Serve it as a single-page app: every path that is not a file
(e.g. `/manuals`, `/pending`) must return `build/index.html`. On IIS use a URL Rewrite rule to `/index.html`.

## Layout

```
src/
  components/        screens (Dashboard, Manuals, Circulars, Search, PendingAck, Account, ...)
  config/            settings from .env, item links
  services/          API calls (DMSLifecycleService), login (authService), toasts (notify)
  store/             Redux store (the manual selected in the tree)
  types/api.ts       shapes of API responses used by the newer screens
public/              static files served as-is (logo, pdf.js worker, icons)
index.html           page shell (Vite entry)
```

`public/index.html` is the old Create React App page and is no longer used; it can be deleted.
