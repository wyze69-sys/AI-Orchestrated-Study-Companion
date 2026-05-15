# Fix SSE Streaming Reliability

## Status: DONE

Completed in commits `48b0e6a` and `232d42e` on branch `fix/replit-to-local-dev`.

## What Was Done

| Item | Status |
|------|--------|
| Server cancels Gemini stream on client disconnect (AbortController + `req.on("close")`) | ✅ |
| `X-Accel-Buffering: no` header set (prevents Nginx proxy buffering) | ✅ |
| `{ done: true }` sent to client before slow DB writes | ✅ |
| Partial assistant content persisted on disconnect (abort or stream error) | ✅ |
| DB write failures do not hang the client (separate try/catch after `res.end()`) | ✅ |
| Non-abort stream errors logged + sent as `{ error }` SSE event | ✅ |
| Client still receives `{ done: true }` after error so read loop exits cleanly | ✅ |
| Web: `isMountedRef` guard prevents unmounted state updates | ✅ |
| Web: AbortError silently ignored (navigation away) | ✅ |
| Web: renders inline `{ error }` events from SSE stream | ✅ |
| Mobile: `isMountedRef` guard prevents unmounted state updates | ✅ |
| Mobile: AbortError silently ignored | ✅ |
| Mobile: renders inline `{ error }` events from SSE stream | ✅ |

## Architecture

```
Client sends POST /api/chat
→ Server validates session/doc ownership
→ Inserts user message to DB
→ Opens Gemini streaming connection
→ For each chunk: writes `data: { content: "..." }\n\n`
→ On normal completion: writes `data: { done: true }\n\n`, then res.end()
→ On Gemini error: writes `data: { error: "..." }\n\n` + `{ done: true }`, then res.end()
→ On client disconnect: AbortController cancels Gemini, no more writes
→ After res.end(): persists assistant message to DB (full or partial)
```

## Files Changed

- `artifacts/api-server/src/routes/chat.ts` — server streaming logic
- `artifacts/study-companion/src/pages/WorkspacePage.tsx` — web SSE client
- `artifacts/study-mobile/app/session/[id].tsx` — mobile SSE client
