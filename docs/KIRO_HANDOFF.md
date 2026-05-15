# Kiro Handoff

This project is unfinished. Please continue from the GitHub-visible files only. Do not expect `.local` or `.env` to be available from the repo.

## Secrets

Never commit `.env` or real API keys. Use `.env.example` for variable names only.

Required values:

- `DATABASE_URL`
- `JWT_SECRET` - at least 64 characters
- `AI_INTEGRATIONS_GEMINI_API_KEY`
- `AI_INTEGRATIONS_GEMINI_BASE_URL`
- `PORT`

## Current Architecture

- pnpm workspace.
- Node API server: `artifacts/api-server`.
- Web app: `artifacts/study-companion`.
- Mobile app: `artifacts/study-mobile`.
- DB package: `lib/db`.
- OpenAPI source: `lib/api-spec/openapi.yaml`.
- Generated client packages: `lib/api-client-react` and `lib/api-zod`.

## Important Current State

- `lib/db` source was converted from `.ts` to `.js` for Node ESM use.
- `lib/db/package.json` exports JS runtime files and `.d.ts` types.
- `dist` is ignored, so generated declaration files may not be available after a fresh clone until build/type generation runs.
- `.env` is ignored. `.env.example` is committed.
- SSE streaming reliability appears partly implemented in API, web, and mobile. Verify behavior end-to-end before marking done.
- File upload hardening is still the clearest backend security task.

## Recommended Next Work

1. Install dependencies and run baseline checks:

   ```sh
   pnpm install
   pnpm run typecheck
   pnpm run build
   ```

2. Verify the DB package conversion works with the API server build.

3. Finish `docs/tasks/harden-file-upload.md`.

4. Verify or finish `docs/tasks/fix-sse-streaming-reliability.md`.

5. If API response shapes change, update `lib/api-spec/openapi.yaml`, run codegen, and update web/mobile consumers.

## Caution

The project mixes TypeScript frontend packages with the DB package now using JavaScript source. Do not blindly rename all `.ts` and `.tsx` files to `.js`; React/Vite/Expo still depend on TypeScript/TSX.
