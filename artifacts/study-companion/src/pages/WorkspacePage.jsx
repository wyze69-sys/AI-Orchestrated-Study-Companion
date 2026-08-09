import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetSession,
  useListMessages,
  useUploadDocument,
  useDeleteDocument,
  getGetSessionQueryKey,
  getListMessagesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { buildChatPayload } from "@/lib/chat-modes";
import {
  formatLineRange,
  extractSourcesFromFrame,
  normalizeSources,
  findMatchingDocument,
  isLineInCitationRange,
  isKeyboardActivationKey
} from "@/lib/sources";
import { getQuizIdentity } from "@/lib/quiz";
import { parseFlashcardResponse } from "@/lib/flashcards";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import NotesPanel from "@/components/NotesPanel";
import QuizCard from "@/components/QuizCard";
import FlashcardDeck from "@/components/FlashcardDeck";
const TOKEN_KEY = "studycompanion_token";
const OPEN_SAVED_SESSION_PREFIX = "studycompanion_open_saved_session_";
const QUICK_ACTIONS = [
  {
    id: "summarise",
    label: "Summarise",
    icon: "list",
    mode: "summary",
    prompt: "Summarise the key points from this document in bullet form."
  },
  {
    id: "flashcards",
    label: "Flashcards",
    icon: "spark",
    mode: "flashcards",
    prompt: "Generate 5 flashcards based on this document with clear Questions (Q:) and Answers (A:)."
  },
  {
    id: "explain",
    label: "Explain simply",
    icon: "help",
    mode: "explain",
    prompt: "Explain the main concept in this document as if I'm a beginner."
  },
  {
    id: "quiz",
    label: "Quiz me",
    icon: "cap",
    mode: "quiz",
    prompt: "Create a 5-question multiple-choice quiz based on this document, with 4 choices (A-D) per question and an Answer Key at the end."
  }
];
function Md({ children }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}

function processChildLines(children, startLine, targetCitation) {
  const isTargetedLine = (lineNum) => {
    if (!targetCitation) return false;
    return isLineInCitationRange(lineNum, targetCitation.startLine, targetCitation.endLine);
  };

  if (typeof children === "string") {
    const lines = children.split("\n");
    return lines.map((lineText, i) => {
      const lineNum = startLine + i;
      const targeted = isTargetedLine(lineNum);
      return (
        <span
          key={lineNum}
          data-line={lineNum}
          id={`line-${lineNum}`}
          data-testid={`doc-line-${lineNum}`}
          className={cn("doc-line-span", targeted && "doc-line-highlight")}
        >
          {lineText}
          {i < lines.length - 1 ? <br /> : null}
        </span>
      );
    });
  }

  if (Array.isArray(children)) {
    return children.map((child) => (typeof child === "string" ? processChildLines(child, startLine, targetCitation) : child));
  }

  return children;
}

function DocContent({ content, targetCitation }) {
  const createMarkdownComponent = (Tag) => {
    return ({ node, children, ...props }) => {
      const startLine = node?.position?.start?.line;
      const endLine = node?.position?.end?.line;
      const isTargeted =
        targetCitation?.startLine &&
        startLine &&
        startLine <= (targetCitation.endLine || targetCitation.startLine) &&
        (endLine || startLine) >= targetCitation.startLine;

      return (
        <Tag
          {...props}
          data-line-start={startLine}
          data-line-end={endLine}
          data-line={startLine}
          id={startLine ? `line-${startLine}` : undefined}
          className={cn(props.className, isTargeted && "doc-line-highlight")}
        >
          {startLine ? processChildLines(children, startLine, targetCitation) : children}
        </Tag>
      );
    };
  };

  const components = {
    h1: createMarkdownComponent("h1"),
    h2: createMarkdownComponent("h2"),
    h3: createMarkdownComponent("h3"),
    h4: createMarkdownComponent("h4"),
    h5: createMarkdownComponent("h5"),
    h6: createMarkdownComponent("h6"),
    p: createMarkdownComponent("p"),
    li: createMarkdownComponent("li"),
    blockquote: createMarkdownComponent("blockquote")
  };

  return (
    <div className="doc-content" data-testid="doc-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function WorkspacePage() {
  const { id: sessionId } = useParams();
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [activeDocId, setActiveDocId] = useState(null);
  const [targetCitation, setTargetCitation] = useState(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamMessages, setStreamMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [includeNotesInChat, setIncludeNotesInChat] = useState(false);
  const [shouldLoadSavedMessages, setShouldLoadSavedMessages] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const docPaneRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);
  const session = useGetSession(sessionId, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetSessionQueryKey(sessionId)
    }
  });
  const messages = useListMessages(sessionId, {
    query: {
      enabled: !!sessionId && shouldLoadSavedMessages,
      queryKey: getListMessagesQueryKey(sessionId)
    }
  });
  const uploadDoc = useUploadDocument({
    mutation: {
      onSuccess: (doc) => {
        setActiveDocId(doc.id);
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      }
    }
  });
  const deleteDoc = useDeleteDocument({
    mutation: {
      onSuccess: () => {
        setActiveDocId(null);
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      }
    }
  });
  useEffect(() => {
    setActiveDocId(null);
    setTargetCitation(null);
    setInput("");
    setIsStreaming(false);
    setStreamMessages([]);
    setStreamingContent("");
    setShouldLoadSavedMessages(false);
    abortControllerRef.current?.abort();
  }, [sessionId]);
  useEffect(() => {
    if (!sessionId) return;
    setShouldLoadSavedMessages(true);
  }, [sessionId]);
  useEffect(() => {
    if (session.data?.documents && session.data.documents.length > 0 && !activeDocId) {
      setActiveDocId(session.data.documents[0].id);
    }
  }, [session.data, activeDocId]);

  const handleSelectSource = useCallback(
    (src) => {
      if (!session.data?.documents || !src) return;
      const targetDoc = findMatchingDocument(session.data.documents, src, activeDocId);
      if (!targetDoc) return;

      setActiveDocId(targetDoc.id);
      setTargetCitation({
        docId: targetDoc.id,
        startLine: src.startLine ?? null,
        endLine: src.endLine ?? null,
        quote: src.quote ?? null,
        timestamp: Date.now()
      });
    },
    [session.data?.documents, activeDocId]
  );

  useEffect(() => {
    if (!targetCitation || !targetCitation.startLine) return;
    if (targetCitation.docId !== activeDocId) return;

    const timer = setTimeout(() => {
      const lineEl = docPaneRef.current?.querySelector(
        `[data-line="${targetCitation.startLine}"], #line-${targetCitation.startLine}, [data-line-start="${targetCitation.startLine}"]`
      );
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [targetCitation, activeDocId]);

  const [savedFlashcardMastery, setSavedFlashcardMastery] = useState({});
  const [savedQuizResults, setSavedQuizResults] = useState([]);

  useEffect(() => {
    if (sessionId) {
      const storedToken = localStorage.getItem("studycompanion_token");
      if (storedToken) {
        fetch(`/api/sessions/${sessionId}/flashcards/progress`, {
          headers: { Authorization: `Bearer ${storedToken}` }
        })
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            if (Array.isArray(data)) {
              const map = {};
              for (const item of data) {
                if (item.cardId && item.status) {
                  map[item.cardId] = item.status;
                }
              }
              setSavedFlashcardMastery(map);
            }
          })
          .catch(() => {});

        fetch(`/api/sessions/${sessionId}/quizzes/results`, {
          headers: { Authorization: `Bearer ${storedToken}` }
        })
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            if (Array.isArray(data)) {
              setSavedQuizResults(data);
            }
          })
          .catch(() => {});
      }
    }
  }, [sessionId]);

  const handleSaveQuizResult = useCallback(
    async (payload) => {
      if (!sessionId) return;
      const storedToken = localStorage.getItem("studycompanion_token");
      if (!storedToken) return;

      const res = await fetch(`/api/sessions/${sessionId}/quizzes/results`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedToken}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save quiz result");
      }
      const data = await res.json();
      if (data.result) {
        setSavedQuizResults((prev) => {
          const next = prev.filter((r) => r.quizId !== data.result.quizId);
          return [...next, data.result];
        });
      }
    },
    [sessionId]
  );

  useEffect(() => {
    if (shouldLoadSavedMessages && messages.data && streamMessages.length === 0) {
      setStreamMessages(
        messages.data.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources ?? [],
          mode: m.mode ?? "chat"
        }))
      );
    }
  }, [shouldLoadSavedMessages, messages.data, streamMessages.length]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamMessages, streamingContent]);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);
  const activeDoc = session.data?.documents.find((d) => d.id === activeDocId);
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;
    uploadDoc.mutate({ id: sessionId, data: { file } });
    e.target.value = "";
  };
  // Track the active chatMode so the async stream completion handler can stamp it
  const activeChatModeRef = useRef("chat");
  const sendMessage = useCallback(
    async (messageText, chatMode = "chat") => {
      activeChatModeRef.current = chatMode;
      if (!messageText.trim() || !activeDocId || !sessionId || isStreaming) return;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const userMsg = {
        id: `tmp-user-${Date.now()}`,
        role: "user",
        content: messageText.trim()
      };
      setStreamMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsStreaming(true);
      setStreamingContent("");
      try {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${storedToken}`
          },
          body: JSON.stringify(
            buildChatPayload({
              sessionId,
              documentId: activeDocId,
              message: messageText.trim(),
              includeNotes: includeNotesInChat,
              mode: chatMode
            })
          ),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error("Chat request failed");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";
        let streamDone = false;
        let latestSources = [];
        while (true) {
          if (streamDone) break;
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) {
                latestSources = extractSourcesFromFrame(data);
                streamDone = true;
                break;
              }
              if (data.error) {
                full += `\n\n⚠️ ${data.error}`;
                setStreamingContent(full);
                continue;
              }
              if (data.content) {
                full += data.content;
                setStreamingContent(full);
              }
            } catch {
            }
          }
        }
        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: full,
          sources: latestSources,
          mode: activeChatModeRef.current
        };
        setStreamMessages((prev) => [...prev, assistantMsg]);
        setStreamingContent("");
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(sessionId) });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!isMountedRef.current) return;
        const errorMsg = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, something went wrong. Please try again."
        };
        setStreamMessages((prev) => [...prev, errorMsg]);
        setStreamingContent("");
      } finally {
        if (isMountedRef.current) setIsStreaming(false);
      }
    },
    [activeDocId, sessionId, isStreaming, includeNotesInChat, queryClient]
  );
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };
  return <div>
      <header className="topbar ws-topbar">
        <div className="topbar-inner">
          <button className="btn btn-ghost btn-icon" title="Back to dashboard" onClick={() => setLocation("/dashboard")} data-testid="button-back">
            <Icon name="arrow" />
          </button>
          <span className="title">{session.isLoading ? "Loading…" : session.data?.title}</span>
          {session.data && session.data.documents.length > 0 && <div className="doc-tabs">
              {session.data.documents.map((doc) => <button
    key={doc.id}
    className={cn("doc-tab", activeDocId === doc.id && "active")}
    onClick={() => setActiveDocId(doc.id)}
    data-testid={`tab-doc-${doc.id}`}
  >
                  <span className="dot"></span>
                  {doc.filename}
                </button>)}
            </div>}
          <div className="spacer"></div>
          <div className="user-cluster">
            <span style={{ color: "var(--meta)", fontSize: 12 }}>.txt · .md</span>
            <button className="btn btn-ghost btn-icon" title="Sign out" onClick={logout}>
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      <div className="ws-grid">
        {/*
    Left — Source document
  */}
        <div className="pane">
          <div className="pane-head">
            <div className="p-title">
              <Icon name="file" />
              <span>{activeDoc?.filename ?? "No document"}</span>
            </div>
            <div className="pane-actions">
              <button className="btn btn-ghost btn-icon" title="Upload document" onClick={() => fileInputRef.current?.click()} disabled={uploadDoc.isPending} data-testid="button-upload">
                <Icon name="upload" />
              </button>
              {activeDoc && <button className="btn btn-ghost btn-icon" title="Delete document" onClick={() => deleteDoc.mutate({ id: activeDocId })} data-testid="button-delete-doc">
                  <Icon name="trash" />
                </button>}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".txt,.md" className="hidden" onChange={handleFileUpload} data-testid="input-file" />
          <div ref={docPaneRef} className="scroll">
            {session.isLoading ? <div className="doc-content">
                <div style={{ height: 12, width: "75%", borderRadius: 4, background: "var(--surface-2)", margin: "0 0 24px" }} />
                {[1, 2, 3, 4, 5].map((i) => <div key={i} style={{ height: 10, width: "100%", borderRadius: 4, background: "var(--surface-2)", margin: "0 0 12px" }} />)}
              </div> : activeDoc ? <DocContent content={activeDoc.content} targetCitation={targetCitation?.docId === activeDoc.id ? targetCitation : null} /> : <div className="doc-empty">
                <Icon name="upload" />
                <p>No document uploaded</p>
                <div className="sub">Upload a .txt or .md file to start studying.</div>
                <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => fileInputRef.current?.click()} disabled={uploadDoc.isPending}>
                  <Icon name="upload" />
                  {uploadDoc.isPending ? "Uploading…" : "Upload document"}
                </button>
              </div>}
          </div>
        </div>

        {/*
        Middle — Chat
      */}
        <div className="pane">
          {activeDoc && <div className="quick-row">
              <span className="quick-label">Quick</span>
              {QUICK_ACTIONS.map(({ id, label, icon, mode, prompt }) => <button key={id} className="quick-chip" onClick={() => sendMessage(prompt, mode)} disabled={isStreaming} data-testid={`button-quick-${id}`}>
                  <Icon name={icon} className="icon-sm" />
                  {label}
                </button>)}
            </div>}
          <div className="scroll chat-scroll" data-testid="chat-messages">
            {streamMessages.length === 0 && !isStreaming ? <div className="doc-empty">
                <Icon name="spark" />
                <p>{activeDoc ? "Ask anything about your document" : "Upload a document to start"}</p>
                <div className="sub">
                  {activeDoc ? "Every answer is grounded only in your own material — with citations back to your sources." : "Upload a .txt or .md file on the left to begin."}
                </div>
              </div> : <>
                {streamMessages.map((msg) => msg.role === "user" ? <div key={msg.id} className="msg user">
                  <div className="bubble" data-testid="message-user">
                    <p>{msg.content}</p>
                  </div>
                </div> : <div key={msg.id} className="msg assistant">
                  <div className="bubble" data-testid="message-assistant">
                    <div className="answer-card">
                      {msg.mode === "flashcards" || (msg.role === "assistant" && parseFlashcardResponse(msg.content).cards.length > 0) ? (
                        <FlashcardDeck
                          content={msg.content}
                          onSelectSource={handleSelectSource}
                          sessionId={sessionId}
                          documentId={activeDocId}
                          messageId={msg.id}
                          initialMastery={savedFlashcardMastery}
                        />
                      ) : (
                        <div className="md">
                          <Md>{msg.content}</Md>
                        </div>
                      )}
                      {msg.mode !== "flashcards" && (
                        <QuizCard
                          content={msg.content}
                          messageId={msg.id}
                          documentId={activeDocId}
                          sessionId={sessionId}
                          savedResult={savedQuizResults.find((r) => r.quizId === getQuizIdentity({ content: msg.content, messageId: msg.id, documentId: activeDocId }) || r.quizId === msg.id || r.messageId === msg.id || r.quizId === activeDocId || r.quizId === "default-quiz")}
                          onSaveResult={handleSaveQuizResult}
                        />
                      )}
                      <SourcesPanel sources={msg.sources} docName={activeDoc?.filename} onSelectSource={handleSelectSource} />
                    </div>
                  </div>
                </div>)}
                {isStreaming && <div className="msg assistant">
                  <div className="bubble">
                    <div className="answer-card">
                      {streamingContent ? <div className="md">
                          <Md>{streamingContent}</Md>
                          <span className="streaming-cursor" />
                        </div> : <div className="typing">
                          <span className="t-dot" />
                          <span className="t-dot" />
                          <span className="t-dot" />
                        </div>}
                    </div>
                  </div>
                </div>}
              </>}
            <div ref={messagesEndRef} style={{ height: 1 }} />
          </div>
          <div className="chat-input">
            <div className="composer">
              <textarea
    id="chat-text"
    rows={1}
    placeholder={activeDoc ? "Ask about this document… (Enter to send, Shift+Enter for a new line)" : "Upload a .txt or .md document to enable the tutor."}
    value={input}
    onChange={(e) => setInput(e.target.value)}
    onKeyDown={handleKeyDown}
    disabled={!activeDoc || isStreaming}
    data-testid="input-message"
  />
              <button
    className={cn("send-btn", isStreaming && "stop")}
    id="send-btn"
    onClick={() => {
      if (isStreaming) {
        abortControllerRef.current?.abort();
      } else {
        sendMessage(input);
      }
    }}
    disabled={!activeDoc || (!input.trim() && !isStreaming)}
    title={isStreaming ? "Stop" : "Send"}
    data-testid="button-send"
  >
                <Icon name={isStreaming ? "stop" : "send"} />
              </button>
            </div>
            <div className="composer-hint">
              {activeDoc ? `Ask about ${activeDoc.filename} — grounded only in your material.` : "Upload a .txt or .md document on the left to enable the tutor."}
            </div>
          </div>
        </div>

        {/*
        Right — Notes
      */}
        <div className="pane">
          {session.isLoading ? <div className="pane-head">
              <div className="p-title">
                <Icon name="note" />
                <span>My notes</span>
              </div>
            </div> : <NotesPanel
    sessionId={sessionId}
    sessionTitle={session.data?.title ?? "notes"}
    initialNotes={session.data?.notes ?? null}
    includeInChat={includeNotesInChat}
    onIncludeInChatChange={setIncludeNotesInChat}
  />}
        </div>
      </div>
    </div>;
}
function SourcesPanel({ sources, docName, onSelectSource }) {
  const normalized = normalizeSources(sources);
  const hasSources = normalized.length > 0;

  return (
    <div className="sources" data-testid="sources-panel">
      <div className="sources-head">
        <Icon name="book" className="icon-sm" />
        Sources
      </div>
      {!hasSources ? (
        <div className="sources-empty" data-testid="sources-empty" style={{ fontSize: "12px", color: "var(--muted)" }}>
          No verified sources returned
        </div>
      ) : (
        normalized.map((src, index) => {
          const filename = src.filename || docName || "Document";
          const lineRange = formatLineRange(src.startLine, src.endLine);

          return (
            <div
              key={index}
              className="source-chip"
              data-testid={`source-chip-${index}`}
              onClick={() => onSelectSource?.(src)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (isKeyboardActivationKey(e.key)) {
                  e.preventDefault();
                  onSelectSource?.(src);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <span className="src-num">{index + 1}</span>
              <span className="src-dom" title={filename}>{filename}</span>
              {lineRange && (
                <span className="src-line" style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--muted)", flex: "none" }}>
                  {lineRange}
                </span>
              )}
              <span className="src-ex" title={src.quote}>"{src.quote}"</span>
            </div>
          );
        })
      )}
    </div>
  );
}
export {
  WorkspacePage as default
};