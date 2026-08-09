# AI-Orchestrated Study Companion — Remaining Features Implementation Plan

## Purpose

This document is the complete, staged implementation plan for OpenCode. Work through the phases in order, test each phase before starting the next one, and continue fixing failures until every acceptance criterion is backed by real test or browser evidence.

---

# CRITICAL EXECUTION RULES FOR OPENCODE

These rules override ambiguous instructions elsewhere in this document. The objective is not merely to follow this plan mechanically. The objective is to leave the repository in the most complete, correct, tested, maintainable, and usable state possible based on the actual product requirements and repository.

## 1. Decision Priority

When instructions, existing code, tests, or this plan disagree, use this priority:

1. Explicit product requirements and intended user behavior.
2. Security, data integrity, and user-data protection.
3. Verified existing behavior that users already depend on.
4. API/database compatibility and documented contracts.
5. Existing automated tests.
6. Existing implementation patterns and architecture.
7. This implementation plan.
8. Assumptions.

Do not preserve an existing implementation merely because it already exists if there is strong evidence that it is incorrect. Do not modify an existing behavior merely because this plan describes it differently. Investigate the conflict first. Document important conflicts and the chosen resolution.

## 2. Inspect Before Acting

Before implementing each phase, inspect the relevant implementation, related tests, database/schema definitions, API contracts, call sites, frontend consumers, mobile consumers when applicable, and current git changes. Determine what actually needs to change.

Never implement functionality simply because the plan says it is missing. First prove that it is missing, incomplete, incorrect, insecure, or untested.

## 3. Do Not Follow File Names Blindly

Paths, scripts, commands, components, endpoints, and architecture described in this document are based on the known project state when the plan was created. The repository may have changed.

If something referenced here no longer exists:

- search for its current equivalent;
- determine whether it was renamed, replaced, moved, or intentionally removed;
- adapt the task to the current architecture;
- preserve the original requirement;
- document the deviation.

Do not recreate an obsolete file just because this plan mentions it.

## 4. Work Until the Maximum Achievable Completion State

Do not stop the entire project because one verification method is unavailable. A blocker blocks only the work that actually depends on it.

For example, if an Android emulator is unavailable, finish mobile implementation, run unit tests, run static/type checks, verify API behavior, inspect platform-specific code, complete web/backend/database work, and document native-device verification as `BLOCKED`.

A phase may contain `COMPLETE`, `BLOCKED`, and `INCOMPLETE` items. Do not use one blocked check as an excuse to stop unrelated work.

## 5. Never Fake Completion

Never fabricate command output, claim a test ran when it did not, pretend browser behavior was observed from static inspection, pretend database persistence was verified without a database, call an implementation production-ready without evidence, replace a failed test with an assumption, mark an item complete because the code looks correct, suppress exceptions, disable tests, weaken assertions, return fake success responses, hardcode test-specific data, swallow API failures, or comment out broken features.

Use `COMPLETE` only when implemented and verified. Use `BLOCKED` when implementation is complete but external verification cannot currently be performed. Use `INCOMPLETE` when actual implementation work remains.

## 6. Small Vertical Slices

Work through small vertical slices:

```text
Requirement
→ inspect current implementation
→ identify minimum required change
→ implement
→ run focused test
→ debug
→ rerun test
→ run relevant regression tests
→ inspect runtime behavior
→ mark verified
→ continue
```

Prefer completing one working feature end-to-end over partially changing several unrelated features.

## 7. Root-Cause Debugging

Whenever something fails, reproduce the failure, collect the relevant error/output, identify the failing layer, trace the underlying cause, fix the root cause, add or improve a regression test when appropriate, rerun the original failing test, and rerun affected regression tests.

Tests must validate the implementation. The implementation must not be distorted merely to satisfy badly written tests. If a test is proven incorrect, fix the test and explain why.

## 8. Protect Existing Working Functionality

Before changing authentication, shared API clients, schemas, database models, middleware, routing, shared UI components, parsing utilities, or generated types, determine what depends on it. After modifying shared code, run relevant regression tests. Never assume an isolated-looking change has no downstream impact.

## 9. Preserve User Data

Database safety is mandatory. Never run destructive operations on real or unknown user data merely to simplify development. Before migrations, inspect the current schema, constraints, migration strategy, and compatibility. Prefer additive and migration-safe changes.

Do not use `DROP DATABASE`, unconditional `DROP TABLE`, destructive resets, or mass deletes unless operating against explicitly disposable test data and the command is required for the test.

## 10. API Contract Discipline

For every API change verify the entire path:

```text
Frontend/mobile request
→ generated client/schema
→ API route
→ validation
→ authorization
→ business logic
→ database
→ response
→ client state
→ visible UI
```

OpenAPI, server implementation, generated clients, validation schemas, and consumers must agree. Preserve backward compatibility when reasonably possible.

## 11. Security Changes Must Be Deliberate

Do not perform broad security redesigns without understanding deployment requirements. Prefer fixing concrete weaknesses over replacing the entire authentication system.

Do not migrate bearer-token authentication to cookies, introduce token rotation, change session architecture, or introduce new infrastructure simply because it might theoretically be better. Only make such architectural changes when required by the product or necessary to fix a confirmed security problem.

## 12. Avoid Overengineering

Do not introduce unnecessary abstractions, frameworks, state-management systems, databases, queues, caches, microservices, dependency injection frameworks, build systems, or packages unless the existing product requirement genuinely requires them.

Prefer the simplest implementation that is correct, secure, readable, testable, maintainable, and consistent with the existing project.

## 13. Product Behavior Matters More Than Internal Elegance

For every user feature verify that the feature is reachable, controls work, loading/empty/error states work, validation is understandable, errors are recoverable, successful changes appear in the UI, refresh/reload behaves correctly, persistence works, unauthorized behavior is handled, and mobile/responsive behavior is usable when applicable.

Test the application as a real user, not only as individual functions.

## 14. Do Not Redesign Working UI Without Requirement

Fix usability defects and broken responsive behavior, but do not perform broad visual redesigns unless required. Preserve the project's design system and established interaction patterns.

## 15. Test at the Correct Layer

Use the cheapest useful test first:

```text
utility/unit test
→ component test
→ backend integration test
→ API test
→ database/persistence test
→ browser end-to-end test
→ mobile/device verification
```

Do not repeatedly run the entire repository test suite after every tiny edit if a focused test can identify the problem faster. Run broader regressions at phase boundaries.

## 16. Tests Must Cover Failure Paths

Where relevant, test missing input, malformed input, incorrect types, empty data, duplicate requests, refresh/reload, concurrent/repeated actions, API failure, database failure, unauthorized users, expired authentication, cross-user access, deleted records, network interruption, mobile layout, and boundary values.

Prioritize realistic failure cases rather than generating hundreds of low-value tests.

## 17. Generated Code

Do not manually edit generated API clients or types when an official generation workflow exists. Modify the source specification and regenerate.

If generation is unavailable, do not fabricate generated output. Finish non-generated source work, report code generation as `BLOCKED`, and document the exact command required later.

## 18. Manage Working-Tree Changes Safely

Assume existing uncommitted changes may belong to another developer. Never run destructive git commands such as `git reset --hard`, `git clean -fd`, `git checkout .`, or `git restore .` unless explicitly instructed by the user.

Before significant changes inspect `git status` and `git diff`. Do not overwrite unrelated changes. Keep modifications focused.

## 19. Verification Evidence

For important tests record the command, exit code, relevant pass/fail summary, environment used, important output, and browser/device viewport where relevant. Do not dump unnecessary logs or expose secrets. Evidence must be sufficient for another developer to understand what was actually verified.

## 20. Re-evaluate After Every Phase

After each phase, compare implementation against requirements, run the phase gate, inspect the git diff, check for regression, check for newly discovered work, update remaining tasks, and continue.

The original plan is not immutable. If implementation reveals additional work necessary for correctness, add it to the checklist and complete it. If a planned task is proven unnecessary, mark it `NOT REQUIRED — <evidence/reason>`. Do not implement unnecessary code merely to satisfy a checkbox.

## 21. Quality Pass Before Final Verification

After all features are implemented, perform a focused cleanup pass. Inspect changed code for duplicated logic, dead code, unused imports, temporary logging, debug flags, newly introduced TODOs, commented-out code, accidental mocks, placeholder content, inconsistent naming, missing error handling, unsafe type coercion, and unnecessary complexity.

Do not perform unrelated refactoring during this pass.

## 22. Final User-Level Verification

Before declaring completion, test realistic workflows rather than isolated screens. At minimum verify applicable flows such as:

```text
Register/Login
→ create/open study session
→ upload/open material
→ interact with chat
→ generate/open quiz
→ answer quiz
→ persist result
→ reload
→ verify restored result
→ use flashcards
→ persist flashcard state
→ reload
→ verify state
→ inspect progress
→ logout
→ login again
→ verify persistence
```

Also test isolation using a second user wherever ownership matters. The product is not complete if these user-level flows fail even when unit tests pass.

## 23. Final Completion Classification

At the end classify every requirement as exactly one of:

- `COMPLETE` — implementation exists and required verification passed.
- `BLOCKED` — implementation is finished or as complete as possible, but verification requires an unavailable external dependency. Include the blocker, exact failure, affected verification, and smallest action required to unblock it.
- `NOT REQUIRED` — repository inspection proves the planned change is unnecessary. Include evidence.
- `INCOMPLETE` — implementation or required fix remains. Include the exact remaining work.

There must be no ambiguous unchecked tasks.

## 24. Completion Rule

Do not stop merely because the original numbered phases are exhausted. After Phase 9, perform one final requirement-to-implementation comparison. Search for remaining TODOs related to requested features, stubs, placeholder responses, broken links/actions, unhandled endpoints, missing tests, API/schema mismatches, browser console errors, build warnings worth fixing, incomplete mobile behavior, security regressions, and data-isolation problems.

Fix all issues within the repository that are reasonably solvable, then rerun the final verification suite.

The job ends only when all reasonably implementable requested functionality is finished, all available required tests pass, all discovered regressions caused by the work are resolved, no known critical or high-severity bug remains, every unverifiable requirement is explicitly classified as `BLOCKED`, and every remaining limitation is clearly documented.

The goal is not to produce a convincing completion report. The goal is to produce the most complete and reliable working product that can actually be achieved from the repository and available environment.

---

## Repository

```text
D:\PROJECT\AI-Orchestrated Study Companion\study-companion_demo
```

The repository is a pnpm workspace containing:

- `artifacts/api-server` — Express API server.
- `artifacts/study-companion` — React/Vite web application.
- `artifacts/study-mobile` — Expo/React Native mobile application.
- `lib/db` — Drizzle/Postgres schema and database client.
- `lib/api-spec/openapi.yaml` — OpenAPI source of truth.
- `lib/api-client-react` and `lib/api-zod` — generated API clients/types.
- `scripts` — live HTTP, persistence, and CDP browser verification scripts.

## Important starting-state rules

1. Before editing, run:

   ```sh
   cd /d "D:/PROJECT/AI-Orchestrated Study Companion/study-companion_demo"
   git status --short
   git branch --show-current
   git diff --check
   ```

2. The working tree may contain intentional feature work that is not committed. **Do not reset, clean, checkout, or overwrite existing changes.** Preserve unrelated edits.
3. Read `README.md`, `docs/KIRO_HANDOFF.md`, the relevant source files, and the current tests before changing implementation.
4. Treat the current code and database schema as the source of truth, not this plan's guessed implementation details.
5. Do not expose secrets in logs or final reports. Never commit `.env`, credentials, API keys, generated secrets, or local database dumps.
6. Use targeted edits. Do not migrate JavaScript back to TypeScript, replace the UI wholesale, or change unrelated chat/source/citation behavior.
7. Every phase has a stopping gate. If a gate fails, debug and rerun it before continuing.
8. Do not claim a feature is complete because a unit test passes. Verify persistence, ownership isolation, API contracts, browser-visible behavior, and mobile behavior where applicable.

## Mandatory OpenCode execution protocol

OpenCode must follow this protocol exactly. Do not treat this document as a suggestion or stop after implementing only the first visible feature.

1. Create a checklist from every phase and every checkbox in this document.
2. Work in order from Phase 0 through Phase 9 unless a dependency requires a documented change in order.
3. At the beginning of every phase, inspect the current implementation and `git status --short` again. Preserve unrelated working-tree changes.
4. Implement one small vertical slice at a time: source change, focused test, run focused test, debug failures, then continue.
5. Do not mark a phase complete until its phase gate has been run successfully.
6. If a test, build, API check, browser check, mobile check, or database check fails, stay in that phase and fix it. Do not skip the failed check and move forward.
7. After fixing a failure, rerun the failed command and the relevant regression suite. Do not rely on an earlier passing result.
8. After each phase, update the checklist with changed files, commands, results, and any limitation.
9. Do not claim that a feature is complete from static inspection, a successful build, or a unit test alone. Verify the real API and visible user workflow where this plan requires it.
10. Do not invent missing infrastructure. If the database, credentials, browser, emulator, or deployment configuration is unavailable, report the exact blocker and continue with only the non-blocked work.
11. Before final reporting, reread this entire plan and verify every requirement line by line. Any unchecked requirement must be reported as incomplete.
12. OpenCode must not stop with a proposal, TODO list, stub, mock-only implementation, or partial feature while claiming completion.

The final report must include a phase-by-phase checklist. Use `COMPLETE` only when the corresponding gate has fresh evidence, `BLOCKED` when an external dependency prevented verification, and `INCOMPLETE` when implementation or verification remains.

## Current baseline to preserve

The project already contains implementation for:

- Structured quiz parsing, answer selection, scoring, explanations, restart, and retry-incorrect UI.
- Flashcard parsing, flip/navigation, known/review status, citation navigation, and persistence.
- Quiz result persistence and flashcard progress persistence.
- Progress summary aggregation.
- UTC study streak calculation with current streak, longest streak, active days, last date, and streak dates.
- Existing unit tests, live HTTP verification scripts, and CDP browser scripts.
- Chat streaming, file uploads, source citations, notes, sessions, login, and registration.

However, the feature work must be audited and completed rather than trusted blindly. The current source already shows areas that must be checked immediately, including:

- `artifacts/study-companion/src/components/QuizCard.jsx` uses `useEffect`; verify that it is imported and that hooks are never called conditionally.
- `artifacts/study-companion/src/components/FlashcardDeck.jsx` contains an obviously suspicious class name on the explanation element; verify and correct it without changing intended visual behavior.
- Generated clients and OpenAPI definitions may not yet include every quiz, flashcard, progress, account, or hardening endpoint.
- The current progress summary intentionally does not yet provide weak-topic analytics; this plan adds it.
- Mobile currently has core session/chat/document behavior but requires interactive quiz/flashcard/progress parity or an explicitly documented supported fallback.

## Definition of done

The project is complete only when all of the following are true:

- Interactive quizzes work from valid AI output and persisted messages.
- Quiz answers, scores, explanations, retry-incorrect, restart, reload restoration, and duplicate-save behavior work.
- Interactive flashcards work with flip, keyboard/touch navigation, known/review status, progress, reload restoration, reset, and duplicate-save behavior.
- Progress includes quiz scores, flashcard reviews, UTC streaks, and weak-topic tracking with correct ownership and deleted-session filtering.
- Users can permanently delete their account and all owned data safely, with a clearly defined admin cleanup path if an admin role exists.
- Authentication/session behavior is hardened, including validation, token handling, expiry, logout/revocation strategy, and consistent unauthorized responses.
- Rate limiting is deliberate per route category and does not break legitimate quiz/flashcard use.
- Web bundles are split sensibly and the production build is verified.
- Native mobile flows are tested on realistic small and large viewports/devices, including offline/error states where possible.
- OpenAPI, generated clients, tests, documentation, and implementation agree.
- Full verification passes with real output: focused tests, backend tests, frontend tests, typecheck, build, diff check, live HTTP checks, browser checks, and mobile checks.

---

# Execution order

## Phase 0 — Repository audit and baseline lock

### Goal
Establish exactly what already works, identify defects, and create an evidence-backed checklist before adding new behavior.

### Read and inspect

- `README.md`
- `docs/KIRO_HANDOFF.md`
- `artifacts/study-companion/src/components/QuizCard.jsx`
- `artifacts/study-companion/src/components/FlashcardDeck.jsx`
- `artifacts/study-companion/src/lib/quiz.js` and tests
- `artifacts/study-companion/src/lib/flashcards.js` and tests
- `artifacts/study-companion/src/pages/WorkspacePage.jsx`
- `artifacts/study-companion/src/pages/DashboardPage.jsx`
- `artifacts/api-server/src/routes/sessions.js`
- `artifacts/api-server/src/routes/dashboard.js`
- `artifacts/api-server/src/routes/auth.js`
- `artifacts/api-server/src/middlewares/auth.js`
- `artifacts/api-server/src/app.js`
- `artifacts/api-server/src/lib/progress-summary.js`
- `artifacts/api-server/src/lib/streak-utils.js`
- `lib/db/drizzle.schema.ts`
- `lib/db/src/schema/*.js`
- `lib/api-spec/openapi.yaml`
- all existing feature and browser scripts in `scripts/`

### Run baseline

```sh
pnpm install
pnpm --filter @workspace/study-companion test
pnpm --filter @workspace/api-server test
pnpm run typecheck
pnpm run build
git diff --check
```

If the baseline fails, fix only pre-existing blockers that prevent feature work, add a regression test, and record the original failure and fix. Do not silently ignore a failure.

### Audit output required

Create or update a visible implementation checklist in this file's progress section or in `docs/` only if needed. Record:

- Which existing quiz/flashcard/progress behavior is real and verified.
- Which endpoints are implemented but undocumented/generated incorrectly.
- Which UI paths are unreachable or broken.
- Which current defects must be fixed before feature work.
- Which mobile features are absent.

### Gate
Do not start Phase 1 until the baseline command results and the audit findings are written in the OpenCode report.

---

## Phase 1 — Stabilize the existing quiz implementation

### Goal
Make the current quiz feature reliable before expanding it.

### Required behavior

1. Parse structured JSON quizzes safely.
2. Accept the documented Markdown fallback only when it can identify valid questions, options, and answer keys.
3. Reject malformed questions instead of silently assigning a fake first option as the correct answer.
4. Normalize question IDs and option IDs consistently so persisted answers restore correctly after reload.
5. Allow selecting an answer and show immediate correct/incorrect feedback plus explanation.
6. Show score and percentage without divide-by-zero or stale-state errors.
7. Complete only when every active question has an answer.
8. Retry only incorrect questions, resetting those answers while preserving the original full quiz for restart.
9. Restart the complete quiz cleanly.
10. Save the completed result exactly once for a given session/quiz identity, while allowing a deliberate new attempt if that is the intended product behavior. Do not accidentally create duplicate rows from React effects or re-renders.
11. Restore saved answers/result after page reload without making the user re-answer a completed quiz.
12. Keep feedback and correct answers inaccessible to screen readers before the user answers if the current product design intends immediate feedback only after selection.
13. Preserve keyboard access, focus visibility, semantic button/radio behavior, and mobile tap targets.

### Implementation checks

- Fix hook import/order errors in `QuizCard.jsx`.
- Verify no React hook is called after an early return or conditionally.
- Verify `QuizCard` export/import style matches `WorkspacePage.jsx`.
- Validate all API inputs server-side; never trust client-provided score or percentage without checking bounds and consistency.
- Decide and document whether `quizId` is message-based, document-based, or another stable identity. Use one stable convention everywhere.
- Ensure retry attempts cannot overwrite an unrelated quiz.
- Ensure a user cannot save a result into another user's session.

### Tests to add or strengthen

Frontend unit tests:

- JSON and code-fenced JSON parsing.
- Markdown parsing with answer key.
- malformed JSON, missing options, duplicate option IDs, missing answer, invalid answer ID.
- case-insensitive answer scoring.
- zero questions and incomplete answers.
- retry incorrect and restart state transitions.
- saved result hydration and no duplicate save.
- keyboard activation and accessible state.

Backend tests:

- valid result creation.
- invalid totals, negative scores, percentage outside 0–100, non-integer values, empty IDs, oversized answer state.
- upsert behavior for the same session and quiz identity.
- cross-user session access returns 404 or the existing consistent ownership response.
- deleted sessions cannot read or write results.

Browser verification:

Extend `scripts/browser-quiz-test.js` to assert:

- quiz renders visibly;
- selection changes feedback and score;
- completion result is visible;
- retry incorrect works;
- restart works;
- reload restores persisted state;
- no console errors or failed API requests;
- desktop and 375px mobile layout remain usable.

### Gate
Run:

```sh
pnpm --filter @workspace/study-companion test
pnpm --filter @workspace/api-server test
pnpm run typecheck
pnpm run build
```

Run the live API and browser script against a real configured database. Do not proceed if any result is unverified.

---

## Phase 2 — Stabilize and complete interactive flashcards

### Goal
Make the current flashcard feature reliable and complete for web, persistence, and accessibility.

### Required behavior

1. Parse valid structured flashcard JSON and documented fallback format.
2. Reject malformed cards safely.
3. Flip front/back by click/tap and Enter/Space.
4. Navigate previous/next with buttons and ArrowLeft/ArrowRight.
5. Reset the flip state when changing cards.
6. Disable previous/next at boundaries and expose disabled state accessibly.
7. Mark the current card `known` or `review` only from the answer/back face.
8. Show known, review, unreviewed, and total progress.
9. Persist status optimistically, then reconcile server success/failure.
10. Never lose the previous status if a persistence request fails; show a retryable non-blocking error.
11. Hydrate saved statuses after reload without overwriting newer local user actions.
12. Reset progress only after explicit confirmation and verify the reset persists.
13. Preserve citation/source navigation from the back face.
14. Prevent nested card click handlers from firing when pressing citation or mastery controls.
15. Work with keyboard, touch, small screens, and reduced-motion preferences.

### Implementation checks

- Correct the suspicious explanation element class in `FlashcardDeck.jsx` and verify the intended CSS class exists.
- Verify `useEffect` and all hooks are imported and used safely.
- Use one canonical card ID normalization function across parser, UI, API, and database.
- Validate status values server-side using a single shared constant/schema.
- Ensure the unique key is correct for the intended scope. If cards can repeat across different messages/documents in one session, include the correct source identity rather than collapsing unrelated cards by `cardId` alone.
- Ensure reset and upsert operations enforce both authenticated user and active session ownership.
- Ensure deleted sessions cannot read, write, or reset progress.
- Avoid sending an `Authorization: Bearer <token>` header when no token exists; omit the header or fail clearly.

### Tests to add or strengthen

Frontend:

- parser normalization and malformed-card rejection;
- initial state, flip, next, previous, boundary disabled states;
- keyboard controls;
- known/review counters;
- optimistic success and rollback/error behavior;
- saved progress hydration;
- reset confirmation and reset failure;
- citation click does not flip the card or trigger an unintended action.

Backend:

- single and batch progress writes;
- invalid item/status/card ID;
- upsert idempotency;
- reset behavior;
- deleted-session and cross-user isolation;
- duplicate-card/source identity behavior.

Browser verification:

Extend `scripts/browser-flashcard-test.js` to assert actual visible behavior, including flip, status action, counter update, reload restoration, reset, keyboard action, mobile viewport, and zero console/network errors.

### Gate

```sh
pnpm --filter @workspace/study-companion test
pnpm --filter @workspace/api-server test
pnpm run typecheck
pnpm run build
```

Then run live HTTP and CDP browser verification with a real database and authenticated user.

---

## Phase 3 — Complete progress dashboard and weak-topic tracking

### Goal
Turn persisted quiz and flashcard activity into accurate, useful study analytics.

### Progress contract

Keep existing response fields backward-compatible and add explicit fields only when documented. The summary should include at minimum:

```json
{
  "totalSessions": 0,
  "totalCompletedQuizzes": 0,
  "averageQuizPercentage": 0,
  "bestQuizPercentage": 0,
  "totalFlashcardsReviewed": 0,
  "knownFlashcardsCount": 0,
  "reviewAgainFlashcardsCount": 0,
  "currentStreak": 0,
  "longestStreak": 0,
  "activeStudyDays": 0,
  "lastStudyDate": null,
  "streakDates": [],
  "weakTopics": [],
  "recentActivity": {
    "latestQuiz": null,
    "latestFlashcardActivity": null
  }
}
```

### Weak-topic definition

Implement and document a deterministic first version. Recommended definition:

- A quiz question is a weak-topic signal when it is answered incorrectly.
- The topic key should come from trusted persisted metadata. Prefer document/session topic metadata; if unavailable, use a normalized document title or a stable `topic` field generated with the quiz payload.
- Do not infer arbitrary topics from untrusted UI text at render time.
- Aggregate per topic: attempts, incorrect answers, accuracy percentage, recent incorrect count, and last activity date.
- Rank weak topics by incorrect count first, then lower accuracy, then recency.
- Do not expose another user's topic data.
- Exclude soft-deleted sessions and invalid/future timestamps.
- Empty activity returns `weakTopics: []` and zero metrics.

If the existing schema cannot support topic identity, add the smallest migration-safe field needed to quiz results or a normalized topic table. Update Drizzle schema, database push/migration process, OpenAPI, generated types, fixtures, and tests together. Do not store raw AI output as a topic without length and content validation.

### Dashboard UI

Add a readable progress area that shows:

- quiz count, average score, best score;
- flashcards reviewed, known, review-again, and unreviewed where available;
- current streak, best streak, active days, and last active date;
- weak topics with a clear explanation of why they are weak;
- recent quiz and flashcard activity;
- loading, empty, error, and stale-data states;
- responsive desktop and 375px mobile layouts;
- accessible labels and no misleading percentage formatting.

Avoid adding charts unless the data and labels are accurate. A clear list is better than a decorative chart.

### API and test work

- Add/update OpenAPI schemas for progress summary and weak topics.
- Regenerate clients/types using the repository's existing codegen command.
- Add backend unit tests for all zero, one, multiple, deleted-session, cross-user, repeated-attempt, same-day, malformed, and future-date cases.
- Add a live API verification script or extend `verify-progress-api-http.js` to create controlled quiz/flashcard data and compare the endpoint response with expected aggregates.
- Add browser assertions that dashboard values are visible and match the live response.

### Gate

```sh
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/study-companion test
pnpm run typecheck
pnpm run build
```

Run live progress API verification and authenticated browser verification. Record exact outputs.

---

## Phase 4 — Add web/mobile feature parity for quizzes, flashcards, and progress

### Goal
Make the primary study actions usable on native mobile, not only present in web code.

### Mobile requirements

Inspect the current Expo architecture before editing. Reuse parsing and scoring rules where possible without importing browser-only modules.

Implement or complete:

1. Quiz card view with question, choices, selection, feedback, explanation, score, retry incorrect, restart, and save/restore.
2. Flashcard deck with front/back flip, swipe or buttons, known/review, progress, reset, and persistence.
3. Progress screen or progress section with quiz, flashcard, streak, and weak-topic metrics.
4. Loading, offline, expired-session, rate-limit, and failed-save states.
5. Touch target minimums appropriate for native UI, readable text, safe-area handling, and keyboard/accessibility labels.
6. Correct API base URL handling for development and production; never silently call an empty URL on a physical device.
7. Query invalidation after quiz save, flashcard save, reset, account deletion, and logout.

### Mobile tests

- Unit test shared parser/scoring/aggregation logic.
- Add component tests if the current mobile test setup supports them.
- At minimum perform a real Expo smoke run on an emulator/device or the repository's supported mobile test harness.
- Test narrow phone portrait, larger phone, and orientation/layout changes.
- Verify no network request uses a missing/incorrect host.
- Verify a token expiry returns to login rather than leaving a broken screen.

### Gate

Run the existing mobile build command and Expo start/test command documented by the repository. Capture actual output. Do not claim native testing from TypeScript compilation alone.

---

## Phase 5 — Account deletion and administrative cleanup

### Goal
Provide safe, real user deletion and a controlled cleanup mechanism.

### User deletion

Add an authenticated account deletion endpoint, preferably `DELETE /api/auth/me` or another clearly documented route.

Requirements:

- Require the current authenticated user.
- Require explicit confirmation in the UI; if practical require password re-entry or a confirmation phrase.
- Delete all user-owned sessions, documents, messages, quiz results, flashcard progress, and related records using database foreign keys or an explicit transaction.
- Ensure child rows are deleted according to the intended retention policy; do not rely on soft-deleted sessions for account deletion.
- Invalidate the current token/session after deletion.
- Return a stable success envelope and safe errors.
- Make the operation idempotent from the client's perspective.
- Prevent deleting another user by path manipulation.
- Do not log passwords, tokens, or full personal data.

### Admin cleanup

Only add admin cleanup if the application has a real admin concept. If it does not, do not invent a public admin endpoint. Instead implement a protected maintenance command/service with:

- explicit admin authorization or a server-only maintenance secret;
- dry-run mode;
- scope and count output before deletion;
- transaction/batch behavior;
- audit logs without secrets;
- protection against deleting active users accidentally;
- tests proving normal users cannot invoke it.

Define whether cleanup means permanently deleting old soft-deleted sessions, abandoned accounts, or orphaned records. Never delete based only on a client-supplied user ID.

### Tests

- account deletion removes all related rows;
- account deletion cannot cross user boundaries;
- token is unusable after deletion;
- repeated deletion is safe;
- transaction rollback preserves data if a child delete fails;
- normal user cannot use admin cleanup;
- dry-run performs no mutation.

Update OpenAPI, generated clients, web UI, mobile UI if applicable, and live HTTP verification.

### Gate

Run backend tests, typecheck, build, and a real database deletion verification using disposable test data. Verify no protected endpoint works with the deleted token.

---

## Phase 6 — Authentication and session security hardening

### Goal
Improve security without breaking existing login/register behavior.

### Required audit and implementation

1. Normalize and validate emails consistently; reject malformed or excessively long inputs.
2. Validate request bodies with the repository's existing Zod/API validation approach or a small shared validator.
3. Keep generic login failure messages to avoid account enumeration.
4. Enforce password policy and safe bcrypt cost; never store plaintext passwords.
5. Verify JWT algorithm, issuer/audience if introduced, subject/user ID, expiration, and expected payload shape.
6. Decide whether the current localStorage bearer token is retained or replaced with secure, HttpOnly, SameSite cookies. If migrating, do it consistently across web, mobile, API, and generated clients; do not create a half-migration.
7. Implement logout/session invalidation appropriate to the chosen strategy. Stateless JWT logout must have a documented revocation/rotation strategy if immediate invalidation is required.
8. Do not put tokens in URLs, logs, error messages, or browser-visible debug output.
9. Return consistent 401/403 responses and handle them in web/mobile clients by clearing stale auth state and redirecting to login.
10. Add CORS allowlisting for configured origins. Do not use unrestricted reflected origins in production.
11. Add secure production headers where compatible with the existing deployment.
12. Configure body limits and upload limits deliberately.
13. Review timing and error behavior for auth endpoints.
14. Add tests for expired, malformed, wrong-signature, wrong-algorithm, missing, and cross-user tokens.

### Gate

Run auth unit/integration tests and live requests for valid and invalid tokens. Verify login/register, logout, account deletion, protected routes, and browser redirect behavior.

---

## Phase 7 — Rate limiting and abuse protection

### Goal
Make rate limits useful, observable, and safe for production.

### Requirements

- Keep a conservative global limit for general API traffic.
- Use stricter limits for register, login, password/account operations, document upload, and AI chat.
- Do not apply an excessively low limit to harmless GET progress or quiz/flashcard reads.
- Decide whether limits are keyed by IP, user ID, or both. Document proxy trust configuration so client headers cannot spoof identity.
- Return 429 with a stable JSON error and `Retry-After` when appropriate.
- Avoid leaking whether an account exists.
- Make the store appropriate for deployment. An in-memory limiter is acceptable only for a single-process local/dev deployment and must be documented; use a shared store for multiple instances.
- Add configuration through environment variables with safe defaults and validation.
- Log aggregate rate-limit events without tokens or sensitive payloads.

### Tests

- repeated login/register returns 429;
- successful legitimate requests remain allowed;
- limits reset after the window;
- user/IP keying behaves as documented;
- 429 response shape is stable;
- proxy configuration does not allow trivial bypass;
- browser displays a helpful retry message.

### Gate

Run backend tests and a live request burst against a local server. Confirm no existing browser acceptance script fails because of shared test traffic.

---

## Phase 8 — Production build and bundle splitting

### Goal
Reduce initial web load without causing runtime route failures.

### Requirements

1. Inspect the Vite build output before changing configuration.
2. Use route-level or feature-level lazy loading for large screens/components, especially charts, editor-heavy UI, and quiz/flashcard/progress features if appropriate.
3. Keep the login/register critical path small.
4. Add loading and error boundaries for lazy chunks.
5. Ensure chunk URLs work under the deployed base path.
6. Avoid splitting tiny shared modules into excessive chunks.
7. Verify React Query cache behavior is not broken by lazy components.
8. Verify browser refresh on workspace/dashboard routes still works in deployment configuration.
9. Do not hide build warnings by disabling checks.
10. Record before/after bundle sizes from real build output.

### Gate

```sh
pnpm run build
```

Serve the production build and run browser checks against it, not only the Vite development server. Test login, dashboard, workspace, quiz, flashcard, account deletion UI, and error/expired-session flows.

---

## Phase 9 — Full integration, regression, and release verification

### Required test sequence

Run from the repository root:

```sh
pnpm install
pnpm --filter @workspace/study-companion test
pnpm --filter @workspace/api-server test
pnpm run typecheck
pnpm run build
git diff --check
```

Then, with a real local `.env`, running API/web services, and a disposable test database:

```sh
node scripts/test-persistence-e2e.js
node artifacts/api-server/src/lib/verify-api-http.js
node artifacts/api-server/src/lib/verify-quiz-api-http.js
node artifacts/api-server/src/lib/verify-progress-api-http.js
node artifacts/api-server/src/lib/verify-streak-api-http.js
node scripts/browser-acceptance-test.js
node scripts/browser-quiz-test.js
node scripts/browser-flashcard-test.js
node scripts/browser-dashboard-test.js
```

Use the exact scripts that exist after auditing; if a script is obsolete, update it rather than silently skipping its coverage.

### End-to-end scenarios

Test with at least two users and multiple sessions:

1. User A creates a session and document.
2. User A generates or loads a quiz, answers it, retries incorrect questions, reloads, and sees the saved result.
3. User A reviews flashcards, marks known/review, reloads, resets, and verifies the reset.
4. User A sees correct progress, streak, and weak-topic metrics.
5. User B cannot read, modify, or delete User A's sessions, results, progress, or account.
6. A soft-deleted session is excluded from all progress and streak calculations.
7. Future and malformed activity timestamps do not corrupt progress.
8. Expired/invalid auth redirects correctly and returns safe API errors.
9. Rate-limited requests return stable 429 responses.
10. Account deletion removes User A's data and invalidates User A's token.
11. Mobile can perform the same core study actions or clearly shows a supported limitation without pretending success.

### Final audit checklist

- [ ] No known TODO or stub remains for the requested features.
- [ ] No hook/import/runtime error remains.
- [ ] No API route is implemented without OpenAPI documentation or an explicit internal-only designation.
- [ ] Generated clients/types match the OpenAPI source.
- [ ] All writes enforce authenticated ownership.
- [ ] Deleted sessions/users are excluded or permanently removed as intended.
- [ ] Client-provided score/percentage is validated server-side.
- [ ] Quiz and flashcard writes are idempotent where intended.
- [ ] Empty/loading/error states exist.
- [ ] Accessibility and keyboard/touch behavior is tested.
- [ ] Mobile behavior is tested on a real or supported emulator/device path.
- [ ] Production build is served and browser-tested.
- [ ] Secrets and personal data are absent from the diff and reports.
- [ ] `git diff --check` passes.

## Required OpenCode final report

At the end, report only evidence-backed results:

1. Summary of implemented phases.
2. Exact files changed, grouped by backend, database, API contract, web, mobile, tests, and docs.
3. Exact commands run.
4. Exact pass/fail counts and exit statuses.
5. Live API results, including ownership and deletion checks.
6. Browser results, including viewport sizes, visible assertions, console errors, and failed network requests.
7. Mobile device/emulator or smoke-test results.
8. Bundle-size before/after evidence.
9. Any remaining limitation or unverified claim.
10. Do not say “complete,” “production-ready,” or “all tests pass” unless the corresponding fresh command output proves it.

## Stop conditions

Stop and report a blocker instead of inventing a result when:

- the database is unavailable or schema changes cannot be applied;
- generated client code cannot be regenerated;
- a browser/emulator is unavailable for a required verification;
- the existing working tree contains conflicting edits that cannot be safely preserved;
- a security decision requires product/deployment information not present in the repository.

When blocked, include the exact command, error output, likely cause, and the smallest next action needed. Do not replace a required live test with a guessed or fabricated result.
