# Harden File Upload

## Status: DONE

Completed in commits `48b0e6a` and `e4d158c` on branch `fix/replit-to-local-dev`.

## What Was Done

| Item | Status |
|------|--------|
| Multer limits: `fileSize: 5MB`, `files: 1`, `parts: 2` | ✅ |
| Content validation: null bytes rejected | ✅ |
| Content validation: binary magic bytes detected (PNG, JPEG, PDF, ZIP, ELF, EXE, RAR, GIF) | ✅ |
| Content validation: UTF-8 round-trip via `TextDecoder({ fatal: true })` | ✅ |
| Filename sanitization: strips path separators, control chars, unsafe chars | ✅ |
| Per-session document cap: 20 documents max | ✅ |
| Multer error handling in global Express error middleware (`app.ts`) | ✅ |
| Document list endpoint returns metadata only (no `content` field) | ✅ |
| Delete uses single ownership-checked JOIN query (no race condition) | ✅ |
| Structured JSON errors for all failure modes | ✅ |

## UI Still Gets Content From

`GET /sessions/:id` — the session detail endpoint returns full document content
in its `documents[]` array. No standalone `GET /documents/:id` endpoint was needed
because the workspace UI fetches the entire session on load.

## Files Changed

- `artifacts/api-server/src/routes/documents.ts` — all upload/list/delete hardening
- `artifacts/api-server/src/app.ts` — global Multer error middleware
