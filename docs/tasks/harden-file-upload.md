# Harden File Upload

## Why

The document upload endpoint still has security and reliability gaps. It accepts `.txt` and `.md` files, stores uploaded content in the database, and serves document content back to clients. This needs stricter validation and safer response shapes.

## Done Looks Like

- Faked MIME type uploads are rejected.
- Binary files renamed to `.txt` or `.md` are rejected.
- File upload errors return structured JSON.
- Upload requests are bounded by file count and multipart part count.
- Each session has a document count cap.
- Stored filenames are sanitized.
- Document list responses do not return full document content.
- Document delete uses a single ownership-checked query.

## Relevant Files

- `artifacts/api-server/src/routes/documents.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/middlewares/auth.ts`
- `lib/api-spec/openapi.yaml`
- `lib/api-client-react/src/generated`
- `lib/api-zod/src/generated`

## Suggested Steps

1. Add Multer limits:

   - `fileSize`
   - `files: 1`
   - `parts: 2`

2. Add real content validation after `req.file.buffer` is available:

   - reject null bytes
   - reject known binary signatures
   - reject invalid UTF-8 if practical

3. Sanitize filenames before storing:

   - strip path separators
   - strip control characters
   - keep a simple allow-list such as letters, numbers, spaces, `_`, `-`, and `.`

4. Add a per-session document count cap, for example 20 documents.

5. Move Multer error handling into a dedicated Express error middleware. The current route-level `try/catch` does not reliably catch errors raised before the handler body runs.

6. Change document list responses to metadata only:

   - `id`
   - `sessionId`
   - `filename`
   - `mimeType`
   - `uploadedAt`

7. Add or confirm a single-document fetch endpoint for content, if the UI still needs document content outside the session detail endpoint.

8. Replace delete fetch-then-delete logic with one ownership-checked delete query to avoid races.

9. Update OpenAPI and regenerate clients if API shapes change:

   ```sh
   pnpm --filter @workspace/api-spec run codegen
   ```

## Manual Test Ideas

- Upload a normal `.txt`.
- Upload a normal `.md`.
- Upload a binary file renamed to `.txt`.
- Upload more than the max document count.
- Upload a filename with path traversal like `../../secret.txt`.
- Delete a document owned by the user.
- Attempt to delete a document owned by another user.
