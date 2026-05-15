# Fix SSE Streaming Reliability

## Why

The chat endpoint streams Gemini output over SSE. Reliability matters because users can navigate away mid-stream, proxies can buffer chunks, and partial responses can be lost if disconnects are not handled well.

## Current Status

Some SSE reliability work appears already implemented:

- API route has an `AbortController`.
- API route listens for request close.
- API route sets `X-Accel-Buffering: no`.
- Web chat uses `AbortController`.
- Mobile chat uses `AbortController`.
- Web and mobile parse `{ done: true }`.

Do not assume it is complete. Verify end-to-end behavior.

## Done Looks Like

- Closing or navigating away cancels the Gemini stream server-side.
- Chunks appear in real time in web and mobile.
- `{ done: true }` stops the client read loop.
- Partial assistant output is saved when the client disconnects.
- DB write failures do not hang the client.
- No React state update on unmounted component warnings appear.

## Relevant Files

- `artifacts/api-server/src/routes/chat.ts`
- `artifacts/study-companion/src/pages/WorkspacePage.tsx`
- `artifacts/study-mobile/app/session/[id].tsx`

## Verification Steps

1. Run the API and web app.
2. Start a long chat response.
3. Navigate away before completion.
4. Confirm the server aborts the Gemini request.
5. Confirm the UI does not update after unmount.
6. Confirm partial assistant content is persisted if any content streamed before disconnect.
7. Confirm normal completion sends `{ done: true }` and the client exits the read loop.
8. Test mobile web/native behavior separately if possible.

## Possible Follow-Up Fixes

- Ensure the server saves partial response content even when `req.close` fires.
- Ensure `done` is written before slow DB operations on successful completion.
- Make client abort handling consistent between web and mobile.
- Add integration tests or focused manual test scripts for streaming.
