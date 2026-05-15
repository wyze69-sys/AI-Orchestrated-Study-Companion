# AI-Orchestrated Study Companion

Unfinished full-stack study companion app with web, mobile, API, database, and AI chat pieces.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `JWT_SECRET`, `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL`, `PORT`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild for the API server

## Where things live

- `artifacts/api-server` - Express API server
- `artifacts/study-companion` - Vite React web app
- `artifacts/study-mobile` - Expo/React Native mobile app
- `lib/db` - Drizzle/Postgres schema and database client
- `lib/api-spec/openapi.yaml` - API contract
- `docs/KIRO_HANDOFF.md` - next-agent handoff notes
- `docs/tasks` - tracked task notes for unfinished work

## Architecture decisions

- `.env` is ignored. Use `.env.example` for variable names only.
- `lib/db` runtime source is JavaScript ESM, while other packages may still use TypeScript/TSX.
- API client and Zod schemas are generated from OpenAPI with Orval.

## Product

Users can create study sessions, upload text/markdown documents, ask AI questions grounded in the uploaded material, and keep personal notes.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do not commit `.env`.
- Run OpenAPI codegen after changing API response shapes.
- `dist` is ignored, so generated outputs are not source-of-truth.

## Pointers

- Start with `README.md` and `docs/KIRO_HANDOFF.md` before continuing implementation.
