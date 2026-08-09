/**
 * Flashcard Component DOM Verification Test
 *
 * Instead of relying on the live AI stream, this test:
 * 1. Navigates to the workspace
 * 2. Injects a known-good JSON flashcard response into the React state via a custom event
 * 3. Verifies FlashcardDeck renders correctly
 * 4. Tests flip, next, prev, keyboard navigation
 *
 * This isolates the UI layer from the AI API.
 */

import "../artifacts/api-server/src/env.js";
import fs from "node:fs";
import path from "node:path";

try {
  const envText = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

import { db, pool, messagesTable } from "../lib/db/src/index.js";

class SimpleCDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.callbacks = new Map();
    this.eventListeners = new Map();
    this.ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      } else if (msg.method) {
        const listeners = this.eventListeners.get(msg.method) || [];
        listeners.forEach((fn) => fn(msg.params));
      }
    };
  }
  ready() {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.OPEN) resolve();
      else this.ws.onopen = () => resolve();
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(event, fn) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event).push(fn);
  }
  close() { this.ws.close(); }
}

// Minimal JSON flashcard response that the parser will handle correctly
const MOCK_FLASHCARD_JSON = JSON.stringify({
  flashcards: [
    {
      id: 1,
      front: "What is photosynthesis?",
      back: "A process where plants convert light energy into glucose.",
      explanation: "Occurs in chloroplasts using chlorophyll.",
      citation: { quote: "Plants convert light energy.", startLine: 1 }
    },
    {
      id: 2,
      front: "What pigment captures light?",
      back: "Chlorophyll — the green pigment in chloroplasts.",
      explanation: "",
      citation: null
    },
    {
      id: 3,
      front: "What gas is released as a byproduct?",
      back: "Oxygen, released during the light-dependent reactions.",
      explanation: "This is why plants produce oxygen.",
      citation: { quote: "Oxygen is released as a byproduct.", startLine: 3 }
    }
  ]
});

async function runFlashcardDomTest() {
  console.log("Starting Flashcard DOM Verification Test...");
  const report = {
    browser: "Edge/Chrome Headless via CDP",
    mode: "DOM injection (AI-independent)",
    steps: {},
    consoleErrors: [],
    passed: false
  };

  const verRes = await fetch("http://localhost:9222/json/version");
  const ver = await verRes.json();
  const browserCdp = new SimpleCDP(ver.webSocketDebuggerUrl);
  await browserCdp.ready();

  const { targetId } = await browserCdp.send("Target.createTarget", { url: "about:blank" });
  const pageCdp = new SimpleCDP(`ws://localhost:9222/devtools/page/${targetId}`);
  await pageCdp.ready();

  await pageCdp.send("Page.enable");
  await pageCdp.send("Runtime.enable");
  await pageCdp.send("Network.enable");

  pageCdp.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "error") {
      const text = params.args.map((a) => a.value || a.description || "").join(" ");
      report.consoleErrors.push(text);
    }
  });
  pageCdp.on("Runtime.exceptionThrown", (params) => {
    const text = params.exceptionDetails?.text || params.exceptionDetails?.exception?.description || "uncaught exception";
    report.consoleErrors.push(`exceptionThrown: ${text}`);
  });

  const evalJs = async (expr) => {
    const res = await pageCdp.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  };

  const waitFor = async (selector, timeoutMs = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await evalJs(`!!document.querySelector(${JSON.stringify(selector)})`);
      if (found) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Timeout waiting for: ${selector}`);
  };

  try {
    // Auth + Session + Document
    const email = `fc-dom-${Date.now()}@example.com`;
    const regRes = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" })
    });
    const { token, user } = await regRes.json();

    const sessRes = await fetch("http://localhost:5000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "Flashcard DOM Test" })
    });
    const { id: sessionId } = await sessRes.json();

    const form = new FormData();
    form.append("file", new Blob(["Photosynthesis uses light to make glucose.\nChlorophyll absorbs light.\nOxygen is released.\n"], { type: "text/plain" }), "photo.txt");
    const docRes = await fetch(`http://localhost:5000/api/sessions/${sessionId}/documents`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    const docData = await docRes.json();

    // Insert assistant message containing flashcards into DB so it persists on Page.reload
    const testMsgId = `msg-fc-${Date.now()}`;
    await db.insert(messagesTable).values({
      id: testMsgId,
      sessionId,
      documentId: docData.id,
      role: "assistant",
      content: MOCK_FLASHCARD_JSON,
      sources: [],
      createdAt: new Date()
    });

    report.steps.setup = { sessionId, email, messageId: testMsgId };

    // Navigate
    await pageCdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await pageCdp.send("Page.navigate", { url: "http://localhost:3000/login" });
    await new Promise((r) => setTimeout(r, 600));
    await evalJs(`localStorage.setItem('studycompanion_token', ${JSON.stringify(token)})`);
    await pageCdp.send("Page.navigate", { url: `http://localhost:3000/workspace/${sessionId}` });
    await waitFor('[data-testid="chat-messages"]', 15000);
    await new Promise((r) => setTimeout(r, 800));

    // Wait for fc-deck (loaded directly from DB)
    await waitFor('[data-testid="fc-deck"]', 15000);
    await new Promise((r) => setTimeout(r, 400));

    // ── Test 1: Initial deck state ─────────────────────────────────────────
    const initial = await evalJs(`
      (() => {
        const deck = document.querySelector('[data-testid="fc-deck"]');
        const position = deck?.querySelector('[data-testid="fc-position"]')?.textContent?.trim();
        const isFlipped = !!deck?.querySelector('[data-testid="fc-card"]')?.classList.contains('is-flipped');
        const prevDisabled = !!deck?.querySelector('[data-testid="fc-btn-prev"]')?.disabled;
        const nextDisabled = !!deck?.querySelector('[data-testid="fc-btn-next"]')?.disabled;
        const flipHint = deck?.querySelector('.fc-flip-hint')?.textContent?.trim();
        return { position, isFlipped, prevDisabled, nextDisabled, flipHint };
      })()
    `);
    report.steps.initial = initial;
    console.log("✓ Initial state:", JSON.stringify(initial));

    if (!initial.position) throw new Error("Position badge missing");
    if (initial.isFlipped) throw new Error("Card must start unflipped");
    if (!initial.prevDisabled) throw new Error("Previous must be disabled at card 1");

    // ── Test 2: Flip card ─────────────────────────────────────────────────
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    const flipped = await evalJs(`!!document.querySelector('[data-testid="fc-card"]')?.classList.contains('is-flipped')`);
    report.steps.flip = { isFlipped: flipped };
    console.log("✓ After flip:", { isFlipped: flipped });
    if (!flipped) throw new Error("Card did not flip");

    // ── Test 3: Flip back ─────────────────────────────────────────────────
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    const unflipped = await evalJs(`!!document.querySelector('[data-testid="fc-card"]')?.classList.contains('is-flipped')`);
    report.steps.unflip = { isFlipped: unflipped };
    console.log("✓ After unflip:", { isFlipped: unflipped });
    if (unflipped) throw new Error("Card did not flip back");

    // ── Test 4: Next card (resets flip) ───────────────────────────────────
    // First flip, then navigate
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 250));
    await evalJs(`document.querySelector('[data-testid="fc-btn-next"]').click()`);
    await new Promise((r) => setTimeout(r, 400));

    const afterNext = await evalJs(`
      (() => {
        const deck = document.querySelector('[data-testid="fc-deck"]');
        return {
          position: deck?.querySelector('[data-testid="fc-position"]')?.textContent?.trim(),
          isFlipped: !!deck?.querySelector('[data-testid="fc-card"]')?.classList.contains('is-flipped')
        };
      })()
    `);
    report.steps.afterNext = afterNext;
    console.log("✓ After Next:", JSON.stringify(afterNext));
    if (afterNext.position === initial.position) throw new Error("Position did not advance");
    if (afterNext.isFlipped) throw new Error("Flip must reset on Next");

    // ── Test 5: Next to last card, Next boundary ──────────────────────────
    await evalJs(`document.querySelector('[data-testid="fc-btn-next"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    const atLast = await evalJs(`!!document.querySelector('[data-testid="fc-btn-next"]')?.disabled`);
    report.steps.lastCard = { nextDisabled: atLast };
    console.log("✓ At last card, Next disabled:", atLast);
    if (!atLast) throw new Error("Next must be disabled at last card");

    // ── Test 6: Previous back to card 1 ──────────────────────────────────
    await evalJs(`document.querySelector('[data-testid="fc-btn-prev"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`document.querySelector('[data-testid="fc-btn-prev"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    const backToStart = await evalJs(`
      (() => {
        const deck = document.querySelector('[data-testid="fc-deck"]');
        return {
          position: deck?.querySelector('[data-testid="fc-position"]')?.textContent?.trim(),
          prevDisabled: !!deck?.querySelector('[data-testid="fc-btn-prev"]')?.disabled
        };
      })()
    `);
    report.steps.backToStart = backToStart;
    console.log("✓ Back to card 1:", JSON.stringify(backToStart));
    if (backToStart.position !== initial.position) throw new Error("Did not navigate back to card 1");
    if (!backToStart.prevDisabled) throw new Error("Previous must be disabled at card 1");

    // ── Test 7: Keyboard flip (Enter) ─────────────────────────────────────
    await evalJs(`
      document.querySelector('[data-testid="fc-card"]').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      )
    `);
    await new Promise((r) => setTimeout(r, 450));
    const kbFlipped = await evalJs(`!!document.querySelector('[data-testid="fc-card"]')?.classList.contains('is-flipped')`);
    report.steps.keyboardFlip = { isFlipped: kbFlipped };
    console.log("✓ Keyboard flip (Enter):", { isFlipped: kbFlipped });
    if (!kbFlipped) throw new Error("Keyboard Enter did not flip card");

    // ── Test 8: Keyboard ArrowRight ───────────────────────────────────────
    const posBeforeArrow = await evalJs(`document.querySelector('[data-testid="fc-position"]')?.textContent?.trim()`);
    await evalJs(`
      document.querySelector('[data-testid="fc-card"]').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      )
    `);
    await new Promise((r) => setTimeout(r, 350));
    const posAfterArrow = await evalJs(`document.querySelector('[data-testid="fc-position"]')?.textContent?.trim()`);
    report.steps.arrowRight = { before: posBeforeArrow, after: posAfterArrow };
    console.log("✓ ArrowRight navigation:", { before: posBeforeArrow, after: posAfterArrow });
    if (posAfterArrow === posBeforeArrow) throw new Error("ArrowRight did not advance card");

    // ── Test 9: Citation chip on back face ────────────────────────────────
    // Flip to back to check citation chip
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    // Go back to card 1 (which has a citation)
    await evalJs(`document.querySelector('[data-testid="fc-btn-prev"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    const citationChip = await evalJs(`!!document.querySelector('[data-testid="fc-citation-chip"]')`);
    report.steps.citationChip = { visible: citationChip };
    console.log("✓ Citation chip on back:", citationChip);

    // ── Test 10: Mark card 1 as Known ──────────────────────────────────────
    // Card 1 is already flipped to back face
    await evalJs(`document.querySelector('[data-testid="fc-btn-known"]').click()`);
    await new Promise((r) => setTimeout(r, 200));

    const statsKnown1 = await evalJs(`
      (() => {
        const bar = document.querySelector('[data-testid="fc-stats-bar"]');
        return {
          known: bar?.querySelector('[data-testid="fc-stat-known"]')?.textContent?.trim(),
          review: bar?.querySelector('[data-testid="fc-stat-review"]')?.textContent?.trim(),
          unreviewed: bar?.querySelector('[data-testid="fc-stat-unreviewed"]')?.textContent?.trim()
        };
      })()
    `);
    report.steps.markCard1Known = statsKnown1;
    console.log("✓ Mark card 1 Known stats:", JSON.stringify(statsKnown1));
    if (!statsKnown1.known.includes("1")) throw new Error("Known count should be 1");

    // ── Test 11: Navigate to card 2, mark as Review again ───────────────
    await evalJs(`document.querySelector('[data-testid="fc-btn-next"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    await evalJs(`document.querySelector('[data-testid="fc-btn-review"]').click()`);
    await new Promise((r) => setTimeout(r, 200));

    const statsCard2Review = await evalJs(`
      (() => {
        const bar = document.querySelector('[data-testid="fc-stats-bar"]');
        return {
          known: bar?.querySelector('[data-testid="fc-stat-known"]')?.textContent?.trim(),
          review: bar?.querySelector('[data-testid="fc-stat-review"]')?.textContent?.trim(),
          unreviewed: bar?.querySelector('[data-testid="fc-stat-unreviewed"]')?.textContent?.trim()
        };
      })()
    `);
    report.steps.markCard2Review = statsCard2Review;
    console.log("✓ Mark card 2 Review stats:", JSON.stringify(statsCard2Review));
    if (!statsCard2Review.review.includes("1")) throw new Error("Review count should be 1");

    // ── Test 12: Change card 2 status from Review to Known ───────────────
    await evalJs(`document.querySelector('[data-testid="fc-btn-known"]').click()`);
    await new Promise((r) => setTimeout(r, 200));

    const statsCard2Changed = await evalJs(`
      (() => {
        const bar = document.querySelector('[data-testid="fc-stats-bar"]');
        return {
          known: bar?.querySelector('[data-testid="fc-stat-known"]')?.textContent?.trim(),
          review: bar?.querySelector('[data-testid="fc-stat-review"]')?.textContent?.trim(),
          unreviewed: bar?.querySelector('[data-testid="fc-stat-unreviewed"]')?.textContent?.trim()
        };
      })()
    `);
    report.steps.changeCard2Known = statsCard2Changed;
    console.log("✓ Change card 2 status stats:", JSON.stringify(statsCard2Changed));
    if (!statsCard2Changed.known.includes("2")) throw new Error("Known count should now be 2");

    // ── Test 13: Mark card 3 -> Completion summary banner ─────────────────
    await evalJs(`document.querySelector('[data-testid="fc-btn-next"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    await evalJs(`document.querySelector('[data-testid="fc-btn-review"]').click()`);
    await new Promise((r) => setTimeout(r, 350));

    const completionState = await evalJs(`
      (() => {
        const comp = document.querySelector('[data-testid="fc-completion"]');
        const title = comp?.querySelector('[data-testid="fc-completion-title"]')?.textContent?.trim();
        const resetBtn = !!comp?.querySelector('[data-testid="fc-btn-reset"]');
        return { visible: !!comp, title, resetBtn };
      })()
    `);
    report.steps.completionState = completionState;
    console.log("✓ Completion state:", JSON.stringify(completionState));
    if (!completionState.visible) throw new Error("Completion summary banner should be visible");

    // ── Test 14: Reset requires explicit two-step confirmation ────────────
    await evalJs(`document.querySelector('[data-testid="fc-btn-reset"]').click()`);
    await new Promise((r) => setTimeout(r, 300));

    const confirmPromptShown = await evalJs(`!!document.querySelector('[data-testid="fc-reset-confirm"]')`);
    report.steps.confirmPrompt = { visible: confirmPromptShown };
    console.log("✓ Reset requires confirmation:", confirmPromptShown);
    if (!confirmPromptShown) throw new Error("Reset must ask for explicit confirmation first");

    // Cancel keeps statuses intact
    await evalJs(`document.querySelector('[data-testid="fc-btn-reset-cancel"]').click()`);
    await new Promise((r) => setTimeout(r, 250));
    const completionAfterCancel = await evalJs(`!!document.querySelector('[data-testid="fc-completion"]')`);
    if (!completionAfterCancel) throw new Error("Cancelling reset must keep review statuses intact");

    // Confirm the reset
    await evalJs(`document.querySelector('[data-testid="fc-btn-reset"]').click()`);
    await new Promise((r) => setTimeout(r, 250));
    await evalJs(`document.querySelector('[data-testid="fc-btn-reset-confirm"]').click()`);
    await new Promise((r) => setTimeout(r, 300));

    const afterReset = await evalJs(`
      (() => {
        const bar = document.querySelector('[data-testid="fc-stats-bar"]');
        const comp = document.querySelector('[data-testid="fc-completion"]');
        return {
          unreviewed: bar?.querySelector('[data-testid="fc-stat-unreviewed"]')?.textContent?.trim(),
          completionVisible: !!comp
        };
      })()
    `);
    report.steps.afterReset = afterReset;
    console.log("✓ After Reset:", JSON.stringify(afterReset));
    if (afterReset.completionVisible) throw new Error("Completion summary banner should disappear after reset");
    if (!afterReset.unreviewed.includes("3")) throw new Error("Unreviewed count should be back to 3");

    // ── Test 15: Persistence across Page Reload ─────────────────────────────
    // 1. Mark card 1 Known and card 2 Review
    await evalJs(`document.querySelector('[data-testid="fc-btn-prev"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`document.querySelector('[data-testid="fc-btn-prev"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    await evalJs(`document.querySelector('[data-testid="fc-btn-known"]').click()`); // Card 1 Known
    await new Promise((r) => setTimeout(r, 300));

    await evalJs(`document.querySelector('[data-testid="fc-btn-next"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    await evalJs(`document.querySelector('[data-testid="fc-btn-review"]').click()`); // Card 2 Review
    await new Promise((r) => setTimeout(r, 300));

    // 2. Reload workspace page
    console.log("Reloading workspace page to test persistence...");
    await pageCdp.send("Page.reload");
    await waitFor('[data-testid="fc-deck"]', 15000);
    await new Promise((r) => setTimeout(r, 600));

    const statsAfterReload = await evalJs(`
      (() => {
        const bar = document.querySelector('[data-testid="fc-stats-bar"]');
        return {
          known: bar?.querySelector('[data-testid="fc-stat-known"]')?.textContent?.trim(),
          review: bar?.querySelector('[data-testid="fc-stat-review"]')?.textContent?.trim(),
          unreviewed: bar?.querySelector('[data-testid="fc-stat-unreviewed"]')?.textContent?.trim()
        };
      })()
    `);
    report.steps.reloadPersistence1 = statsAfterReload;
    console.log("✓ Stats after reload:", JSON.stringify(statsAfterReload));
    if (!statsAfterReload.known.includes("1") || !statsAfterReload.review.includes("1")) {
      throw new Error("Persisted statuses did not reload correctly after page refresh");
    }

    // 3. Change status and reload again
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    await evalJs(`document.querySelector('[data-testid="fc-btn-known"]').click()`); // Change Card 1 (or 2) to Known
    await new Promise((r) => setTimeout(r, 300));

    console.log("Reloading workspace after changing status...");
    await pageCdp.send("Page.reload");
    await waitFor('[data-testid="fc-deck"]', 15000);
    await new Promise((r) => setTimeout(r, 600));

    const statsAfterReload2 = await evalJs(`
      (() => {
        const bar = document.querySelector('[data-testid="fc-stats-bar"]');
        return {
          known: bar?.querySelector('[data-testid="fc-stat-known"]')?.textContent?.trim(),
          review: bar?.querySelector('[data-testid="fc-stat-review"]')?.textContent?.trim()
        };
      })()
    `);
    report.steps.reloadPersistence2 = statsAfterReload2;
    console.log("✓ Stats after second reload:", JSON.stringify(statsAfterReload2));

    // ── Test 16: Progress uses the deck's card identities (no cross-deck collapse) ──
    const progressRows = (await pool.query(
      "SELECT card_id, status FROM flashcard_progress WHERE session_id = $1 ORDER BY card_id",
      [sessionId]
    )).rows;
    const uniqueCards = [...new Set(progressRows.map((r) => String(r.card_id)))];
    report.steps.progressIdentity = { uniqueCards, statuses: progressRows.map((r) => r.status) };
    console.log("✓ Flashcard progress identity:", JSON.stringify(report.steps.progressIdentity));
    if (uniqueCards.length === 0 || !uniqueCards.every((c) => ["1", "2", "3"].includes(c))) {
      throw new Error(`Recorded progress ids must belong to this deck's card ids {1,2,3}, found ${JSON.stringify(uniqueCards)}`);
    }

    // 4. Reset statuses and reload to confirm reset persists
    await evalJs(`document.querySelector('[data-testid="fc-btn-next"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`document.querySelector('[data-testid="fc-btn-next"]').click()`);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`document.querySelector('[data-testid="fc-card"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    await evalJs(`document.querySelector('[data-testid="fc-btn-review"]').click()`); // Complete deck
    await new Promise((r) => setTimeout(r, 350));

    const compVisible = await evalJs(`!!document.querySelector('[data-testid="fc-btn-reset"]')`);
    if (compVisible) {
      await evalJs(`document.querySelector('[data-testid="fc-btn-reset"]').click()`);
      await new Promise((r) => setTimeout(r, 250));
      const confirmShownAgain = await evalJs(`!!document.querySelector('[data-testid="fc-reset-confirm"]')`);
      if (!confirmShownAgain) throw new Error("Reset must ask for confirmation");
      await evalJs(`document.querySelector('[data-testid="fc-btn-reset-confirm"]').click()`);
      await new Promise((r) => setTimeout(r, 300));

      console.log("Reloading workspace after reset...");
      await pageCdp.send("Page.reload");
      await waitFor('[data-testid="fc-deck"]', 15000);
      await new Promise((r) => setTimeout(r, 600));

      const statsAfterResetReload = await evalJs(`
        (() => {
          const bar = document.querySelector('[data-testid="fc-stats-bar"]');
          return {
            unreviewed: bar?.querySelector('[data-testid="fc-stat-unreviewed"]')?.textContent?.trim()
          };
        })()
      `);
      report.steps.resetPersistenceReload = statsAfterResetReload;
      console.log("✓ Stats after reset & reload:", JSON.stringify(statsAfterResetReload));
      if (!statsAfterResetReload.unreviewed.includes("3")) {
        throw new Error("Reset did not persist after page reload");
      }
    }



    // Console errors
    report.consoleErrors = report.consoleErrors;

    // Cleanup
    await fetch(`http://localhost:5000/api/sessions/${sessionId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }
    });
    report.cleanupResult = "Session deleted";
    report.passed = true;

  } catch (err) {
    report.error = err.message || String(err);
    console.error("Flashcard DOM Test Error:", err.message);
    report.passed = false;
  } finally {
    pageCdp.close();
    browserCdp.close();
  }

  console.log("=== FLASHCARD DOM VERIFICATION REPORT ===");
  console.log(JSON.stringify(report, null, 2));

  if (!report.passed) process.exit(1);
}

runFlashcardDomTest();
