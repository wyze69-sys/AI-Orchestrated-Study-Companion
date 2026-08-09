# AI-Orchestrated Study Companion

Full-stack study companion app with web, mobile, API, database, and AI chat pieces in a pnpm workspace.

## Current Status

Project is feature-complete and verified locally: `pnpm install`, `pnpm run typecheck`, and
`pnpm run build` all pass from a fresh clone. `@workspace/db` uses Node ESM JavaScript source
files, and its package exports point to `lib/db/src/*.js` with declaration files in `lib/db/dist`.

## Setup

Use pnpm from the repo root:

```sh
pnpm install
```

Create a local `.env` from the example:

```sh
cp .env.example .env
```

Do not commit `.env`. It is intentionally ignored.

Required environment variables:

```env
DATABASE_URL=
JWT_SECRET=
AI_INTEGRATIONS_GEMINI_API_KEY=
AI_INTEGRATIONS_GEMINI_BASE_URL=https://generativelanguage.googleapis.com
PORT=5000
```

`JWT_SECRET` must be at least 64 characters.

`.env` is loaded automatically at runtime:

- `artifacts/api-server/src/env.js` loads the workspace-root `.env` before the app starts.
- `lib/db/drizzle.config.js` loads it too, so `pnpm --filter @workspace/db run push` works locally.

## Useful Commands

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm run build
```

Note: `study-mobile`'s `build` script produces the Replit static Expo Go deployment. Outside
Replit it prints a message and exits 0, so the root build stays green. Use
`pnpm --filter @workspace/study-mobile exec expo start` for local mobile development.

## Repo Map

- `artifacts/api-server` - Express API server.
- `artifacts/study-companion` - Vite React web app.
- `artifacts/study-mobile` - Expo/React Native mobile app.
- `lib/db` - Drizzle/Postgres schema and database client.
- `lib/api-spec` - OpenAPI contract and Orval config.
- `lib/api-client-react` - generated API client and React Query hooks.
- `lib/api-zod` - generated Zod schemas.
- `lib/integrations-gemini-ai` - Gemini integration.
- `docs/KIRO_HANDOFF.md` - next-agent handoff notes.
- `docs/tasks` - visible task notes copied from hidden local planning files.

## Notes For Next Agent

Read `docs/KIRO_HANDOFF.md` first. The hidden `.local` folder is ignored and should not be treated as source-of-truth for GitHub work.
