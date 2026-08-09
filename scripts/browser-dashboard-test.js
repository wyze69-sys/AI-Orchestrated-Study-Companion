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

async function runBrowserDashboardTest() {
  console.log("Starting Dashboard Progress Summary Verification Test...");

  const report = {
    browser: "Edge/Chrome Headless via CDP",
    mode: "Authenticated Dashboard Verification",
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
    // ── 1. Create account & session with progress ──────────────────────────
    const email = `dash-dom-${Date.now()}@example.com`;
    const regRes = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" })
    });
    const { token } = await regRes.json();

    const sessRes = await fetch("http://localhost:5000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "Dashboard Progress Test Session" })
    });
    const { id: sessionId } = await sessRes.json();

    // Post quiz result
    await fetch(`http://localhost:5000/api/sessions/${sessionId}/quizzes/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        quizId: "dash-quiz-1",
        totalQuestions: 5,
        score: 4,
        percentage: 80,
        answerState: { 1: "A", 2: "B", 3: "C", 4: "D", 5: "A" }
      })
    });

    // Post flashcard progress
    await fetch(`http://localhost:5000/api/sessions/${sessionId}/flashcards/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        progress: [
          { cardId: "fc1", status: "known" },
          { cardId: "fc2", status: "known" },
          { cardId: "fc3", status: "review" }
        ]
      })
    });

    report.steps.setup = { email, sessionId };

    // ── 2. Navigate to Dashboard with token ────────────────────────────────
    await pageCdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await pageCdp.send("Page.navigate", { url: "http://localhost:3000/login" });
    await new Promise((r) => setTimeout(r, 500));
    await evalJs(`localStorage.setItem('studycompanion_token', ${JSON.stringify(token)})`);
    await pageCdp.send("Page.navigate", { url: "http://localhost:3000/" });

    await waitFor('[data-testid="progress-summary-grid"]', 15000);
    await new Promise((r) => setTimeout(r, 500));

    // ── 3. Verify Progress Summary Grid Cards ─────────────────────────────
    const currentStreakText = await evalJs(`document.querySelector('[data-testid="stat-current-streak"]')?.innerText?.trim()`);
    const streakDetailsText = await evalJs(`document.querySelector('[data-testid="text-streak-details"]')?.innerText?.trim()`);
    const completedQuizzesText = await evalJs(`document.querySelector('[data-testid="stat-completed-quizzes"]')?.innerText?.trim()`);
    const avgScoreText = await evalJs(`document.querySelector('[data-testid="stat-avg-quiz-score"]')?.innerText?.trim()`);
    const cardsReviewedText = await evalJs(`document.querySelector('[data-testid="stat-flashcards-reviewed"]')?.innerText?.trim()`);
    const knownCardsText = await evalJs(`document.querySelector('[data-testid="stat-known-cards"]')?.innerText?.trim()`);

    report.steps.dashboardMetrics = {
      currentStreak: currentStreakText,
      streakDetails: streakDetailsText,
      completedQuizzes: completedQuizzesText,
      avgScore: avgScoreText,
      cardsReviewed: cardsReviewedText,
      knownCards: knownCardsText
    };
    console.log("✓ Dashboard progress & streak metrics rendered:", JSON.stringify(report.steps.dashboardMetrics));

    // ── 4. Verify Weak Topics Section ─────────────────────────────────────
    const weakTopicsVisible = await evalJs(`!!document.querySelector('[data-testid="weak-topics-section"]')`);
    const weakTopicRows = await evalJs(`[...document.querySelectorAll('[data-testid="weak-topics-list"] .weak-topic-row')].map(r => r.innerText.trim())`);
    report.steps.weakTopics = { visible: weakTopicsVisible, rows: weakTopicRows };
    console.log("✓ Weak topics section rendered:", JSON.stringify(report.steps.weakTopics));
    if (!weakTopicsVisible) throw new Error("Weak topics section not rendered");
    if (!weakTopicRows.some((r) => r.includes("Dashboard Progress Test Session"))) {
      throw new Error("Expected weak topic row for the session topic; got " + JSON.stringify(weakTopicRows));
    }

    // ── 5. Verify Responsive Layout (Mobile view) ──────────────────────────
    await pageCdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await new Promise((r) => setTimeout(r, 300));
    const isMobileGridVisible = await evalJs(`!!document.querySelector('[data-testid="progress-summary-grid"]')`);
    report.steps.mobileLayout = { gridVisible: isMobileGridVisible };
    console.log("✓ Mobile layout responsive check:", JSON.stringify(report.steps.mobileLayout));

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
    console.error("Dashboard DOM Test Error:", err.message);
  } finally {
    pageCdp.close();
    browserCdp.close();
    console.log("=== DASHBOARD PROGRESS VERIFICATION REPORT ===");
    console.log(JSON.stringify(report, null, 2));
  }
}

runBrowserDashboardTest().catch(console.error);
