# AI-Orchestrated Study Companion

Unfinished full-stack study companion app with web, mobile, API, database, and AI chat pieces in a pnpm workspace.

## Current Status

This project is not finished. It has working structure and several implemented flows, but needs more hardening, verification, and polish before production use.

Important recent change: `@workspace/db` was converted from TypeScript source files to Node ESM JavaScript source files. Its package exports now point to `lib/db/src/*.js`, while declaration files remain available from `lib/db/dist`.

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

## Useful Commands

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm run build
```

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
