# Kiro Handoff

This project is finished. All baseline checks pass on a fresh clone: `pnpm install`, `pnpm run typecheck`, and `pnpm run build`. Do not expect `.local` or `.env` to be available from the repo.

## Secrets

Never commit `.env` or real API keys. Use `.env.example` for variable names only.

Required values:

- `DATABASE_URL`
- `JWT_SECRET` - at least 64 characters
- `AI_INTEGRATIONS_GEMINI_API_KEY`
- `AI_INTEGRATIONS_GEMINI_BASE_URL`
- `PORT`

## Architecture

- pnpm workspace.
- Node API server: `artifacts/api-server`.
- Web app: `artifacts/study-companion`.
- Mobile app: `artifacts/study-mobile`.
- DB package: `lib/db`.
- OpenAPI source: `lib/api-spec/openapi.yaml`.
- Generated client packages: `lib/api-client-react` and `lib/api-zod`.
- Mockup sandbox: `artifacts/mockup-sandbox` (Replit-era design preview tool, kept building).

## Current State

- `lib/db` source is Node ESM JavaScript; `lib/db/package.json` exports JS runtime files and `.d.ts` types.
- `dist` is ignored, so generated declaration files appear after `tsc --build` (run via `pnpm run typecheck`).
- `.env` is ignored; `.env.example` is committed.
- `.env` is loaded automatically: `artifacts/api-server/src/env.js` (before app boot) and `lib/db/drizzle.config.js` (for `pnpm push`).
- SSE streaming reliability and file upload hardening are complete (see `docs/tasks`).
- `pnpm run build` passes: api-server, study-companion, mockup-sandbox build; study-mobile's build script skips gracefully outside Replit (it produces the Replit static Expo deploy).
- `mockup-sandbox/vite.config.ts` uses local defaults (PORT default 3001, BASE_PATH "/"), no longer requires Replit env vars.

## Verified

- `pnpm install` / `pnpm run typecheck` / `pnpm run build` all green.
- API server boots with the workspace `.env` loaded; `GET /api/healthz` returns 200 `{"status":"ok"}`; protected routes return 401 without a token.
- drizzle-kit resolves config and loads `DATABASE_URL` from `.env`.

## Notes

- The committed `DATABASE_URL` in local `.env` files may point to a deprovisioned database; provision a fresh Postgres before running `pnpm --filter @workspace/db run push`.
- The project mixes TypeScript frontend packages with the DB package using JavaScript source. Do not blindly rename `.ts`/`.tsx` files; React/Vite/Expo still depend on TypeScript.