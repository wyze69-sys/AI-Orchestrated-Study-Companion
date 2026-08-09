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
    this.ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
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
  close() {
    this.ws.close();
  }
}

async function runBrowserDeleteAccountTest() {
  console.log("Starting Account Deletion UI Verification Test...");

  const report = { steps: {}, passed: false };

  const verRes = await fetch("http://localhost:9222/json/version");
  const ver = await verRes.json();
  const browserCdp = new SimpleCDP(ver.webSocketDebuggerUrl);
  await browserCdp.ready();
  const { targetId } = await browserCdp.send("Target.createTarget", { url: "about:blank" });
  const pageCdp = new SimpleCDP(`ws://localhost:9222/devtools/page/${targetId}`);
  await pageCdp.ready();
  await pageCdp.send("Page.enable");
  await pageCdp.send("Runtime.enable");

  const evalJs = async (expr) => {
    const res = await pageCdp.send("Runtime.evaluate", { expression: expr, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
    return res.result?.value;
  };
  const waitFor = async (expr, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await evalJs(expr)) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Timeout waiting for: ${expr}`);
  };

  try {
    const email = `delete-dom-${Date.now()}@example.com`;
    const regRes = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    });
    const { token } = await regRes.json();
    await fetch("http://localhost:5000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "Account Deletion Dom Test" }),
    });
    report.steps.setup = { email };

    await pageCdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await pageCdp.send("Page.navigate", { url: "http://localhost:3000/login" });
    await new Promise((r) => setTimeout(r, 500));
    await evalJs(`localStorage.setItem('studycompanion_token', ${JSON.stringify(token)})`);
    await pageCdp.send("Page.navigate", { url: "http://localhost:3000/" });

    await waitFor(`!!document.querySelector('[data-testid="button-delete-account"]')`, 15000);

    // 1. Open delete-account modal.
    await evalJs(`document.querySelector('[data-testid="button-delete-account"]').click()`);
    await waitFor(`!!document.querySelector('[data-testid="input-delete-account-confirm"]')`);
    report.steps.modalOpened = true;

    // 2. Empty confirm: button disabled.
    const disabledWithoutText = await evalJs(`document.querySelector('[data-testid="button-confirm-delete-account"]').disabled`);
    report.steps.disabledWithoutText = disabledWithoutText;
    if (!disabledWithoutText) throw new Error("Confirm button should be disabled until DELETE is typed");

    // 3. Mistyped confirm phrase keeps it disabled (confirmation phrase gate).
    const setValue = `(v) => {
      const el = document.querySelector('[data-testid="input-delete-account-confirm"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }`;
    await evalJs(`(${setValue})('DELETE_MISTYPED')`);
    await new Promise((r) => setTimeout(r, 400));
    const disabledMistyped = await evalJs(`document.querySelector('[data-testid="button-confirm-delete-account"]').disabled`);
    report.steps.disabledMistyped = disabledMistyped;
    if (!disabledMistyped) throw new Error("Confirm button should stay disabled for a mistyped phrase");

    // 4. Correct phrase enables the confirm button.
    await evalJs(`(${setValue})('DELETE')`);
    await waitFor(`!document.querySelector('[data-testid="button-confirm-delete-account"]').disabled`, 5000);
    await evalJs(`document.querySelector('[data-testid="button-confirm-delete-account"]').click()`);

    // 5. Redirected to login + client token cleared.
    await waitFor(`location.pathname === '/login'`, 15000);
    const tokenAfter = await evalJs(`localStorage.getItem('studycompanion_token')`);
    report.steps.redirected = await evalJs(`location.pathname`);
    report.steps.tokenCleared = tokenAfter === null;
    if (tokenAfter !== null) throw new Error("Client token not cleared after account deletion");

    // 6. Server-side: old token invalid, login rejected.
    const oldTokenRes = await fetch("http://localhost:5000/api/sessions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    report.steps.oldTokenStatus = oldTokenRes.status;
    if (oldTokenRes.status !== 401) throw new Error("Old token still valid after deletion");

    const loginRes = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    });
    report.steps.loginAfterDeleteStatus = loginRes.status;
    if (loginRes.status !== 401) throw new Error("Login succeeded after account deletion");

    report.passed = true;
  } catch (err) {
    report.passed = false;
    report.error = err.message || String(err);
    console.error("Delete Account DOM Test Error:", err.message);
  } finally {
    pageCdp.close();
    browserCdp.close();
    report.passed = report.passed && !report.error;
    console.log("=== ACCOUNT DELETION UI VERIFICATION REPORT ===");
    console.log(JSON.stringify(report, null, 2));
  }
}

runBrowserDeleteAccountTest().catch(console.error);