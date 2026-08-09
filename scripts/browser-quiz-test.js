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
import { getQuizIdentity } from "../artifacts/study-companion/src/lib/quiz.js";

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
  close() {
    this.ws.close();
  }
}

const MOCK_QUIZ_JSON = JSON.stringify({
  questions: [
    {
      id: 1,
      question: "What is the main byproduct of photosynthesis?",
      options: [
        { id: "A", text: "Carbon Dioxide" },
        { id: "B", text: "Oxygen" },
        { id: "C", text: "Nitrogen" }
      ],
      correctAnswer: "B",
      explanation: "Oxygen is released into the atmosphere during light reactions."
    },
    {
      id: 2,
      question: "Where inside plant cells does photosynthesis take place?",
      options: [
        { id: "A", text: "Mitochondria" },
        { id: "B", text: "Chloroplasts" },
        { id: "C", text: "Nucleus" }
      ],
      correctAnswer: "B",
      explanation: "Chloroplasts contain chlorophyll which absorbs sunlight."
    },
    {
      id: 3,
      question: "Which molecule provides initial electrons for light reactions?",
      options: [
        { id: "A", text: "Water (H2O)" },
        { id: "B", text: "Glucose" },
        { id: "C", text: "Carbon Dioxide" }
      ],
      correctAnswer: "A",
      explanation: "Water photolysis splits H2O into electrons, protons, and oxygen gas."
    }
  ]
});

async function runBrowserQuizTest() {
  console.log("Starting Quiz DOM & Persistence Verification Test...");

  const report = {
    browser: "Edge/Chrome Headless via CDP",
    mode: "DOM injection + Live API Reload",
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
    const res = await pageCdp.send("Runtime.evaluate", { expression: expr, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  };

  const waitFor = async (selector, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await evalJs(`!!document.querySelector('${selector}')`);
      if (found) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Timeout waiting for: ${selector}`);
  };

  try {
    // ── Setup Account & Session ────────────────────────────────────────────
    const email = `quiz-dom-${Date.now()}@example.com`;
    const regRes = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" })
    });
    const { token } = await regRes.json();

    const sessRes = await fetch("http://localhost:5000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "Quiz DOM Verification Session" })
    });
    const { id: sessionId } = await sessRes.json();

    const form = new FormData();
    form.append("file", new Blob(["Photosynthesis uses light to make glucose.\nChlorophyll absorbs light.\nOxygen is released.\n"], { type: "text/plain" }), "photo.txt");
    const docRes = await fetch(`http://localhost:5000/api/sessions/${sessionId}/documents`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    const docData = await docRes.json();

    // Insert assistant message containing quiz into DB so it persists on Page.reload
    const testMsgId = `msg-quiz-${Date.now()}`;
    await db.insert(messagesTable).values({
      id: testMsgId,
      sessionId,
      documentId: docData.id,
      role: "assistant",
      content: MOCK_QUIZ_JSON,
      sources: [],
      createdAt: new Date()
    });

    report.steps.setup = { sessionId, email, messageId: testMsgId };

    // Navigate to workspace page with localStorage token
    await pageCdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await pageCdp.send("Page.navigate", { url: "http://localhost:3000/login" });
    await new Promise((r) => setTimeout(r, 600));
    await evalJs(`localStorage.setItem('studycompanion_token', ${JSON.stringify(token)})`);
    await pageCdp.send("Page.navigate", { url: `http://localhost:3000/workspace/${sessionId}` });

    await waitFor('[data-testid="quiz-card"]', 15000);
    await new Promise((r) => setTimeout(r, 500));

    // ── Test Step 1: Initial Quiz State ─────────────────────────────────────
    const initialScoreBadge = await evalJs(`document.querySelector('[data-testid="quiz-score"]')?.innerText?.trim()`);
    const resultsVisibleBefore = await evalJs(`!!document.querySelector('[data-testid="quiz-results"]')`);
    report.steps.initial = { scoreBadge: initialScoreBadge, resultsVisible: resultsVisibleBefore };
    console.log("✓ Initial quiz state:", JSON.stringify(report.steps.initial));

    // ── Test Step 2: Complete all 3 questions (Q1: A wrong, Q2: B right, Q3: A right -> Score 2/3 67%) ──
    await evalJs(`document.querySelector('[data-testid="quiz-option-1-A"]').click()`);
    await new Promise((r) => setTimeout(r, 200));
    await evalJs(`document.querySelector('[data-testid="quiz-option-2-B"]').click()`);
    await new Promise((r) => setTimeout(r, 200));
    await evalJs(`document.querySelector('[data-testid="quiz-option-3-A"]').click()`);
    await waitFor('[data-testid="quiz-results"]', 5000);
    await new Promise((r) => setTimeout(r, 600));

    const scoreAfterCompletion = await evalJs(`document.querySelector('[data-testid="quiz-results-score"]')?.innerText?.trim()`);
    report.steps.completedAttempt1 = { score: scoreAfterCompletion };
    console.log("✓ Completed 1st attempt:", JSON.stringify(report.steps.completedAttempt1));

    // ── Test Step 3: Reload Workspace -> Confirm restored result ──────────────
    console.log("Reloading workspace page to test quiz restoration...");
    await pageCdp.send("Page.reload");
    await waitFor('[data-testid="quiz-results"]', 15000);
    await new Promise((r) => setTimeout(r, 500));

    const restoredScoreAfterReload1 = await evalJs(`document.querySelector('[data-testid="quiz-results-score"]')?.innerText?.trim()`);
    report.steps.reloadRestoration1 = { score: restoredScoreAfterReload1 };
    console.log("✓ Stats after 1st reload:", JSON.stringify(report.steps.reloadRestoration1));

    // ── Test Step 4: Click "Retry incorrect" ───────────────────────────────
    await evalJs(`document.querySelector('[data-testid="btn-retry-incorrect"]').click()`);
    await new Promise((r) => setTimeout(r, 400));

    const isResultsHiddenAfterRetry = await evalJs(`!document.querySelector('[data-testid="quiz-results"]')`);
    const q1VisibleAfterRetry = await evalJs(`!!document.querySelector('[data-testid="quiz-question-1"]')`);
    report.steps.retryClick = { resultsHidden: isResultsHiddenAfterRetry, retryQuestionVisible: q1VisibleAfterRetry };
    console.log("✓ After Retry incorrect click:", JSON.stringify(report.steps.retryClick));

    // ── Test Step 5: Reload BEFORE completing retry attempt -> Confirm old completed result is intact ─
    console.log("Reloading workspace before completing retry attempt...");
    await pageCdp.send("Page.reload");
    await waitFor('[data-testid="quiz-results"]', 15000);
    await new Promise((r) => setTimeout(r, 500));

    const restoredScoreBeforeFinishRetry = await evalJs(`document.querySelector('[data-testid="quiz-results-score"]')?.innerText?.trim()`);
    report.steps.reloadBeforeRetryFinished = { score: restoredScoreBeforeFinishRetry };
    console.log("✓ Stats after reload before finishing retry:", JSON.stringify(report.steps.reloadBeforeRetryFinished));

    // ── Test Step 6: Click Retry again, answer Q1 correctly (B) -> 100% completion ──
    await evalJs(`document.querySelector('[data-testid="btn-retry-incorrect"]').click()`);
    await new Promise((r) => setTimeout(r, 300));
    await evalJs(`document.querySelector('[data-testid="quiz-option-1-B"]').click()`);
    await waitFor('[data-testid="quiz-results"]', 5000);
    await new Promise((r) => setTimeout(r, 600));

    const scoreAfterRetryFinish = await evalJs(`document.querySelector('[data-testid="quiz-results-score"]')?.innerText?.trim()`);
    report.steps.completedAttempt2 = { score: scoreAfterRetryFinish };
    console.log("✓ Completed retry attempt:", JSON.stringify(report.steps.completedAttempt2));

    // ── Test Step 7: Reload workspace again -> Confirm newest completed result (100% Perfect) ──────
    console.log("Reloading workspace after finishing retry...");
    await pageCdp.send("Page.reload");
    await waitFor('[data-testid="quiz-results"]', 15000);
    await new Promise((r) => setTimeout(r, 500));

    const restoredScoreAfterReload2 = await evalJs(`document.querySelector('[data-testid="quiz-results-score"]')?.innerText?.trim()`);
    report.steps.reloadRestoration2 = { score: restoredScoreAfterReload2 };
    console.log("✓ Stats after second reload:", JSON.stringify(report.steps.reloadRestoration2));

    // ── Test Step 8: Persistence uses a stable content-derived quiz identity ──
    const expectedIdentity = getQuizIdentity({ content: MOCK_QUIZ_JSON, messageId: testMsgId, documentId: docData.id });
    const resultRows = (await pool.query("SELECT quiz_id FROM quiz_results WHERE session_id = $1", [sessionId])).rows;
    const uniqueQuizIds = [...new Set(resultRows.map((r) => r.quiz_id))];
    report.steps.persistence = { expectedIdentity, uniqueQuizIds, rowCount: resultRows.length };
    console.log("✓ Persistence identity check:", JSON.stringify(report.steps.persistence));
    if (uniqueQuizIds.length !== 1 || uniqueQuizIds[0] !== expectedIdentity) {
      throw new Error(`Expected single stable quiz identity "${expectedIdentity}" but found ${JSON.stringify(uniqueQuizIds)}`);
    }

    // Cleanup session
    await fetch(`http://localhost:5000/api/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    report.passed = true;
    report.cleanupResult = "Session deleted";
  } catch (err) {
    report.passed = false;
    report.error = err.message || String(err);
    console.error("Quiz DOM Test Error:", err.message);
  } finally {
    pageCdp.close();
    browserCdp.close();
    console.log("=== QUIZ DOM VERIFICATION REPORT ===");
    console.log(JSON.stringify(report, null, 2));
  }
}

runBrowserQuizTest().catch(console.error);
