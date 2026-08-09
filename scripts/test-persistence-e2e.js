async function runPersistenceE2ETest() {
  const port = process.env.API_PORT || 5000;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Testing persistence against server at ${baseUrl}...`);

  const report = {
    userCreated: null,
    sessionCreated: null,
    documentCreated: null,
    sseDoneSources: [],
    assistantMessagePersisted: null,
    apiReadAfterWrite: null,
    userMessageSourcesCheck: null,
    webReloadResult: null,
    cleanup: null
  };

  try {
    // 1. Register test user
    const userEmail = `persistence-e2e-${Date.now()}@example.com`;
    const userPassword = "TestPassword123!";
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, password: userPassword })
    });

    if (!regRes.ok) {
      throw new Error(`Registration failed: ${regRes.status} ${await regRes.text()}`);
    }

    const regData = await regRes.json();
    const token = regData.token;
    const userId = regData.user.id;
    report.userCreated = { userId, email: userEmail };

    // 2. Create study session
    const sessRes = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ title: "Citation Persistence Test Session" })
    });

    if (!sessRes.ok) {
      throw new Error(`Session creation failed: ${sessRes.status} ${await sessRes.text()}`);
    }

    const sessData = await sessRes.json();
    const sessionId = sessData.id;
    report.sessionCreated = { sessionId, title: sessData.title };

    // 3. Upload document with 3 lines
    const docContent = `Photosynthesis converts light energy into chemical energy.
Chlorophyll captures light inside chloroplasts.
Oxygen is released as a byproduct.`;

    const formData = new FormData();
    const blob = new Blob([docContent], { type: "text/plain" });
    formData.append("file", blob, "photosynthesis.txt");

    const docRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/documents`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      body: formData
    });

    if (!docRes.ok) {
      throw new Error(`Document upload failed: ${docRes.status} ${await docRes.text()}`);
    }

    const docData = await docRes.json();
    const documentId = docData.id;
    report.documentCreated = { documentId, filename: docData.filename, content: docContent };

    // 4. Send real chat request
    console.log("Sending chat request...");
    const chatRes = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sessionId,
        documentId,
        message: "Explain how photosynthesis works.",
        mode: "chat"
      })
    });

    if (!chatRes.ok) {
      throw new Error(`Chat request failed: ${chatRes.status} ${await chatRes.text()}`);
    }

    const reader = chatRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneFrame = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const rawPayload = line.slice(6).trim();
          try {
            const parsed = JSON.parse(rawPayload);
            if (parsed.done) {
              doneFrame = parsed;
            }
          } catch {}
        }
      }
    }

    if (!doneFrame || !Array.isArray(doneFrame.sources)) {
      throw new Error("No valid done frame with sources received!");
    }

    report.sseDoneSources = doneFrame.sources;

    // 5. Brief wait to allow DB write after res.end()
    await new Promise((r) => setTimeout(r, 1000));

    // 6. Fetch GET /api/sessions/:sessionId/messages
    console.log("Fetching messages from GET /api/sessions/:sessionId/messages...");
    const msgRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!msgRes.ok) {
      throw new Error(`Messages fetch failed: ${msgRes.status} ${await msgRes.text()}`);
    }

    const fetchedMessages = await msgRes.json();
    const userMsg = fetchedMessages.find((m) => m.role === "user");
    const assistantMsg = fetchedMessages.find((m) => m.role === "assistant");

    // 7. Verify user message sources
    report.userMessageSourcesCheck = {
      role: userMsg?.role,
      sourcesIsArray: Array.isArray(userMsg?.sources),
      sourcesLength: userMsg?.sources?.length,
      passed: Array.isArray(userMsg?.sources) && userMsg.sources.length === 0
    };

    // 8. Verify assistant message persisted sources
    const normalizedPersisted = (assistantMsg?.sources ?? []).map((s) => ({
      quote: s.quote,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      startLine: s.startLine,
      endLine: s.endLine
    }));
    const sourcesMatchExactly = JSON.stringify(doneFrame.sources) === JSON.stringify(normalizedPersisted);

    report.assistantMessagePersisted = {
      messageId: assistantMsg?.id,
      role: assistantMsg?.role,
      sourcesLength: assistantMsg?.sources?.length,
      sourcesMatchSseFrame: sourcesMatchExactly,
      sources: assistantMsg?.sources
    };

    report.apiReadAfterWrite = {
      statusCode: msgRes.status,
      totalMessages: fetchedMessages.length,
      sourcesReturnedOnAssistant: assistantMsg?.sources
    };

    // 9. Verify web reload mapping simulation
    const webStateMessages = fetchedMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources ?? []
    }));

    const restoredAssistantMsg = webStateMessages.find((m) => m.role === "assistant");
    report.webReloadResult = {
      hasSourcesAttached: Array.isArray(restoredAssistantMsg?.sources) && restoredAssistantMsg.sources.length > 0,
      restoredSources: restoredAssistantMsg?.sources,
      willRenderSourcesUI: Array.isArray(restoredAssistantMsg?.sources) && restoredAssistantMsg.sources.length > 0
    };

    // 10. Cleanup test data
    console.log("Cleaning up test session data...");
    const delSessRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    const checkSessRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    report.cleanup = {
      sessionDeleted: delSessRes.status === 204,
      session404Verified: checkSessRes.status === 404
    };

  } catch (err) {
    report.error = err.message ?? String(err);
    console.error("Test Error:", err);
  }

  console.log("=== PERSISTENCE E2E TEST REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

runPersistenceE2ETest();
