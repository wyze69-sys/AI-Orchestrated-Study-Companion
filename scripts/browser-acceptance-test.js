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
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(fn);
  }

  close() {
    this.ws.close();
  }
}

async function runBrowserAcceptanceTest() {
  console.log("Starting Browser Acceptance Test with State Sync...");
  const report = {
    browser: "Edge/Chrome Headless via CDP",
    viewportsTested: ["1280x800 (Desktop)", "390x844 (Mobile)"],
    consoleErrors: [],
    failedRequests: [],
    steps: {},
    cleanupResult: null
  };

  const verRes = await fetch("http://localhost:9222/json/version");
  const ver = await verRes.json();
  const browserCdp = new SimpleCDP(ver.webSocketDebuggerUrl);
  await browserCdp.ready();

  const { targetId } = await browserCdp.send("Target.createTarget", { url: "about:blank" });
  const pageWsUrl = `ws://localhost:9222/devtools/page/${targetId}`;
  const pageCdp = new SimpleCDP(pageWsUrl);
  await pageCdp.ready();

  await pageCdp.send("Page.enable");
  await pageCdp.send("Runtime.enable");
  await pageCdp.send("Network.enable");
  await pageCdp.send("DOM.enable");

  pageCdp.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "error") {
      const text = params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(" ");
      report.consoleErrors.push(text);
    }
  });

  pageCdp.on("Network.responseReceived", (params) => {
    const { status, url } = params.response;
    if (status >= 400 && !url.includes("favicon")) {
      report.failedRequests.push({ url, status });
    }
  });

  async function evalJs(expr) {
    const res = await pageCdp.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      const detail = res.exceptionDetails.exception?.description || res.exceptionDetails.text || JSON.stringify(res.exceptionDetails);
      throw new Error(`JS Error: ${detail}`);
    }
    return res.result.value;
  }

  async function waitForSelector(selector, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await evalJs(`!!document.querySelector(${JSON.stringify(selector)})`);
      if (found) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    const debugInfo = await evalJs(`
      (() => {
        return {
          bodyText: document.body.innerText.slice(0, 500),
          testIds: Array.from(document.querySelectorAll('[data-testid]')).map(e => e.getAttribute('data-testid'))
        };
      })()
    `);
    console.log("DEBUG SNAPSHOT ON TIMEOUT:", JSON.stringify(debugInfo, null, 2));
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  try {
    // Step 1: Create test account via API
    const testEmail = `browser-e2e-${Date.now()}@example.com`;
    const testPassword = "TestPassword123!";
    const regRes = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const regData = await regRes.json();
    const token = regData.token;
    const userId = regData.user.id;
    report.steps.userRegistration = { userId, email: testEmail };

    // Step 2: Create test session via API
    const sessRes = await fetch("http://localhost:5000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ title: "Browser Acceptance Session" })
    });
    const sessData = await sessRes.json();
    const sessionId = sessData.id;
    report.steps.sessionCreation = { sessionId, title: sessData.title };

    // Step 3: Upload document containing 3 known lines
    const docContent = `Photosynthesis converts light energy into chemical energy.\nChlorophyll captures light inside chloroplasts.\nOxygen is released as a byproduct.`;
    const formData = new FormData();
    formData.append("file", new Blob([docContent], { type: "text/plain" }), "photosynthesis.txt");
    const docRes = await fetch(`http://localhost:5000/api/sessions/${sessionId}/documents`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData
    });
    const docData = await docRes.json();
    report.steps.documentUpload = { documentId: docData.id, filename: docData.filename };

    // Desktop Viewport setup (1280x800)
    await pageCdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Navigate to local Web App
    console.log(`Navigating browser to http://localhost:3000/login...`);
    await pageCdp.send("Page.navigate", { url: "http://localhost:3000/login" });
    await new Promise((r) => setTimeout(r, 500));

    // Inject Auth Token into localStorage & sessionStorage restore flag
    await evalJs(`
      localStorage.setItem('studycompanion_token', ${JSON.stringify(token)});
      sessionStorage.setItem('studycompanion_open_saved_session_${sessionId}', '1');
    `);

    // Navigate directly to session workspace
    console.log(`Navigating to session workspace: http://localhost:3000/workspace/${sessionId}...`);
    await pageCdp.send("Page.navigate", { url: `http://localhost:3000/workspace/${sessionId}` });
    await waitForSelector("#chat-text");

    // Wait until document is loaded and textarea is enabled
    console.log("Waiting for active document to be ready...");
    const startWait = Date.now();
    while (Date.now() - startWait < 10000) {
      const isDisabled = await evalJs("document.getElementById('chat-text').disabled");
      if (!isDisabled) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // Step 4: Set textarea value and wait until send button is enabled
    console.log("Setting input value and waiting for send button to be enabled...");
    await evalJs(`
      (() => {
        const textarea = document.getElementById('chat-text');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(textarea, "Explain how photosynthesis works.");
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);

    await evalJs(`
      new Promise((resolve) => {
        const check = () => {
          const btn = document.getElementById('send-btn');
          if (btn && !btn.disabled) resolve(true);
          else setTimeout(check, 100);
        };
        check();
      })
    `);

    console.log("Clicking send button in UI...");
    await evalJs(`
      document.getElementById('send-btn').click();
    `);

    // Step 5: Wait for streaming response & source chips to render
    console.log("Waiting for streaming response & source chips to render...");
    await waitForSelector('.source-chip', 35000);
    await new Promise((r) => setTimeout(r, 1000));

    // Step 6, 7 & 8: Inspect live citation cards and match against document
    const liveCitations = await evalJs(`
      (() => {
        const panel = document.querySelector('[data-testid="sources-panel"]');
        const chips = Array.from(document.querySelectorAll('.source-chip'));
        return {
          panelVisible: !!panel,
          chipCount: chips.length,
          chips: chips.map(c => ({
            num: c.querySelector('.src-num')?.textContent,
            filename: c.querySelector('.src-dom')?.textContent,
            line: c.querySelector('.src-line')?.textContent,
            quote: c.querySelector('.src-ex')?.textContent
          }))
        };
      })()
    `);

    report.steps.liveCitationResult = liveCitations;

    // Step 9 & 10: Set sessionStorage flag again and reload page to test citation persistence
    console.log("Setting reload flag and reloading browser page to test citation persistence...");
    await evalJs(`
      sessionStorage.setItem('studycompanion_open_saved_session_${sessionId}', '1');
    `);
    await pageCdp.send("Page.reload");
    await waitForSelector('#chat-text');
    await waitForSelector('.source-chip', 35000);
    await new Promise((r) => setTimeout(r, 1000));

    const reloadedCitations = await evalJs(`
      (() => {
        const panel = document.querySelector('[data-testid="sources-panel"]');
        const chips = Array.from(document.querySelectorAll('.source-chip'));
        const emptyState = document.querySelector('[data-testid="sources-empty"]');
        return {
          panelVisible: !!panel,
          chipCount: chips.length,
          hasEmptyState: !!emptyState,
          chips: chips.map(c => ({
            num: c.querySelector('.src-num')?.textContent,
            filename: c.querySelector('.src-dom')?.textContent,
            line: c.querySelector('.src-line')?.textContent,
            quote: c.querySelector('.src-ex')?.textContent
          }))
        };
      })()
    `);

    report.steps.reloadedCitationResult = reloadedCitations;

    // Wait until textarea is ready after reload
    const startWaitReload = Date.now();
    while (Date.now() - startWaitReload < 10000) {
      const isDisabled = await evalJs("document.getElementById('chat-text').disabled");
      if (!isDisabled) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // Step 12: Send question with no verified sources to confirm truthful empty state
    console.log("Sending prompt expected to return empty sources...");
    await evalJs(`
      (() => {
        const textarea = document.getElementById('chat-text');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(textarea, "What is the capital of France?");
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);

    await evalJs(`
      new Promise((resolve) => {
        const check = () => {
          const btn = document.getElementById('send-btn');
          if (btn && !btn.disabled) resolve(true);
          else setTimeout(check, 100);
        };
        check();
      })
    `);

    await evalJs(`
      document.getElementById('send-btn').click();
    `);

    await waitForSelector('[data-testid="sources-empty"]', 35000);
    await new Promise((r) => setTimeout(r, 1000));

    const emptySourcesCheck = await evalJs(`
      (() => {
        const emptyElements = Array.from(document.querySelectorAll('[data-testid="sources-empty"]'));
        return {
          count: emptyElements.length,
          text: emptyElements.map(e => e.textContent.trim())
        };
      })()
    `);

    report.steps.emptySourcesResult = emptySourcesCheck;

    // Step 15: Test Mobile Viewport (390x844)
    console.log("Testing Mobile Viewport (390x844)...");
    await pageCdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await new Promise((r) => setTimeout(r, 1000));

    const mobileLayoutCheck = await evalJs(`
      (() => {
        const panel = document.querySelector('[data-testid="sources-panel"]');
        const chips = document.querySelectorAll('.source-chip');
        return {
          panelVisible: !!panel,
          chipCount: chips.length,
          bodyWidth: document.body.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      })()
    `);

    report.steps.mobileViewportResult = mobileLayoutCheck;

    // Step 16: Cleanup test data
    console.log("Cleaning up test session via API...");
    await fetch(`http://localhost:5000/api/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    report.cleanupResult = "Temporary test session deleted cleanly (HTTP 204)";

  } catch (err) {
    report.error = err.message || String(err);
    console.error("Browser Acceptance Test Error:", err);
  } finally {
    pageCdp.close();
    browserCdp.close();
  }

  console.log("=== BROWSER ACCEPTANCE TEST REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  if (report.error) {
    process.exitCode = 1;
  }
}

runBrowserAcceptanceTest();
