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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import {
  BookOpen,
  ArrowLeft,
  Upload,
  Trash2,
  Send,
  FileText,
  Sparkles,
  List,
  HelpCircle,
  GraduationCap
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import NotesPanel from "@/components/NotesPanel";
const TOKEN_KEY = "studycompanion_token";
const OPEN_SAVED_SESSION_PREFIX = "studycompanion_open_saved_session_";
const QUICK_ACTIONS = [
  {
    id: "summarise",
    label: "Summarise",
    icon: List,
    prompt: "Summarise the key points from this document in bullet form."
  },
  {
    id: "flashcards",
    label: "Flashcards",
    icon: Sparkles,
    prompt: `Generate exactly 5 flashcards from this document.

Format each card in Markdown like this:

---

### Card 1

**Q:** [question here]

**A:** [answer here]

---

### Card 2

**Q:** [question here]

**A:** [answer here]

---

(Continue for all 5 cards. Use the horizontal rules and bold Q/A labels exactly as shown. Keep answers concise - 1-3 sentences max.)`
  },
  {
    id: "explain",
    label: "Explain Simply",
    icon: HelpCircle,
    prompt: "Explain the main concept in this document as if I'm a beginner."
  },
  {
    id: "quiz",
    label: "Quiz Me",
    icon: GraduationCap,
    prompt: `Create exactly 5 multiple-choice questions from this document.

Format in Markdown like this:

---

### Question 1

[question text]

- A) [option]
- B) [option]
- C) [option]
- D) [option]

---

### Question 2

[question text]

- A) [option]
- B) [option]
- C) [option]
- D) [option]

---

(Continue for all 5 questions.)

After all questions, add:

---

### Answer Key

1. [letter]
2. [letter]
3. [letter]
4. [letter]
5. [letter]`
  }
];
function WorkspacePage() {
  const { id: sessionId } = useParams();
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [activeDocId, setActiveDocId] = useState(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamMessages, setStreamMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [includeNotesInChat, setIncludeNotesInChat] = useState(false);
  const [shouldLoadSavedMessages, setShouldLoadSavedMessages] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
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
    setInput("");
    setIsStreaming(false);
    setStreamMessages([]);
    setStreamingContent("");
    setShouldLoadSavedMessages(false);
    abortControllerRef.current?.abort();
    if (!sessionId) return;
    const openSavedSessionKey = `${OPEN_SAVED_SESSION_PREFIX}${sessionId}`;
    const shouldRestoreHistory = sessionStorage.getItem(openSavedSessionKey) === "1";
    sessionStorage.removeItem(openSavedSessionKey);
    setShouldLoadSavedMessages(shouldRestoreHistory);
  }, [sessionId]);
  useEffect(() => {
    if (session.data?.documents && session.data.documents.length > 0 && !activeDocId) {
      setActiveDocId(session.data.documents[0].id);
    }
  }, [session.data, activeDocId]);
  useEffect(() => {
    if (shouldLoadSavedMessages && messages.data && streamMessages.length === 0) {
      setStreamMessages(
        messages.data.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content
        }))
      );
    }
  }, [shouldLoadSavedMessages, messages.data, streamMessages.length]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamMessages, streamingContent]);
  const activeDoc = session.data?.documents.find((d) => d.id === activeDocId);
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;
    uploadDoc.mutate({ id: sessionId, data: { file } });
    e.target.value = "";
  };
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);
  const sendMessage = useCallback(
    async (messageText) => {
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
          body: JSON.stringify({
            sessionId,
            documentId: activeDocId,
            message: messageText.trim(),
            includeNotes: includeNotesInChat
          }),
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
                streamDone = true;
                break;
              }
              if (data.error) {
                full += `

\u26A0\uFE0F ${data.error}`;
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
          content: full
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
  return <div className="flex flex-col h-screen bg-background">
      {
    /* Header */
  }
      <header className="border-b border-border bg-card/60 backdrop-blur-sm shrink-0 z-10">
        <div className="h-14 px-4 flex items-center gap-3">
          <Button
    variant="ghost"
    size="icon"
    onClick={() => setLocation("/dashboard")}
    data-testid="button-back"
    className="shrink-0"
  >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="font-semibold text-foreground truncate">
              {session.isLoading ? <Skeleton className="h-4 w-40" /> : session.data?.title}
            </h1>
          </div>

          {session.data && session.data.documents.length > 1 && <div className="ml-2 flex items-center gap-1.5 shrink-0">
              {session.data.documents.map((doc) => <button
    key={doc.id}
    onClick={() => setActiveDocId(doc.id)}
    className={cn(
      "text-xs px-2.5 py-1 rounded-full border transition-colors",
      activeDocId === doc.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/50"
    )}
    data-testid={`tab-doc-${doc.id}`}
  >
                  {doc.filename}
                </button>)}
            </div>}
        </div>
      </header>

      {
    /* Main split-screen */
  }
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {
    /* Left — Document viewer */
  }
          <ResizablePanel defaultSize={40} minSize={20}>
            <div className="flex flex-col h-full border-r border-border">
              {
    /* Doc header */
  }
              <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0 bg-card/40">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">
                    {activeDoc ? activeDoc.filename : "Document"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
    variant="outline"
    size="sm"
    onClick={() => fileInputRef.current?.click()}
    disabled={uploadDoc.isPending}
    data-testid="button-upload"
    className="h-7 px-2.5 text-xs gap-1.5"
  >
                          <Upload className="w-3 h-3" />
                          {uploadDoc.isPending ? "Uploading..." : "Upload"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Upload .txt or .md file</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {activeDoc && <Button
    variant="ghost"
    size="icon"
    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
    onClick={() => deleteDoc.mutate({ id: activeDocId })}
    data-testid="button-delete-doc"
  >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>}
                </div>
              </div>
              <input
    ref={fileInputRef}
    type="file"
    accept=".txt,.md"
    className="hidden"
    onChange={handleFileUpload}
    data-testid="input-file"
  />

              {
    /* Doc content */
  }
              <ScrollArea className="flex-1">
                <div className="p-5">
                  {session.isLoading ? <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
                    </div> : !activeDoc ? <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center h-48 text-center"
  >
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                        <Upload className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">No document uploaded</p>
                      <p className="text-xs text-muted-foreground">
                        Upload a .txt or .md file to start studying
                      </p>
                      <Button
    variant="outline"
    size="sm"
    className="mt-3 gap-1.5"
    onClick={() => fileInputRef.current?.click()}
  >
                        <Upload className="w-3.5 h-3.5" />
                        Upload document
                      </Button>
                    </motion.div> : <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-pre:bg-muted prose-pre:text-muted-foreground prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs" data-testid="doc-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {activeDoc.content}
                      </ReactMarkdown>
                    </div>}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {
    /* Middle — Chat */
  }
          <ResizablePanel defaultSize={35} minSize={25}>
            <div className="flex flex-col h-full">
              {
    /* Quick actions */
  }
              {activeDoc && <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 shrink-0 bg-card/40">
                  <span className="text-xs text-muted-foreground font-medium mr-1">Quick:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {QUICK_ACTIONS.map(({ id, label, icon: Icon, prompt }) => <button
    key={id}
    onClick={() => sendMessage(prompt)}
    disabled={isStreaming}
    data-testid={`button-quick-${id}`}
    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
                        <Icon className="w-3 h-3" />
                        {label}
                      </button>)}
                  </div>
                </div>}

              {
    /* Messages */
  }
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4" data-testid="chat-messages">
                  {streamMessages.length === 0 && !isStreaming ? <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center h-48 text-center pt-8"
  >
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                        <Sparkles className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">
                        {activeDoc ? "Ask anything about your document" : "Upload a document to start"}
                      </p>
                      <p className="text-xs text-muted-foreground max-w-56">
                        {activeDoc ? "The AI tutor will answer questions grounded only in your material." : "Upload a .txt or .md file on the left to begin."}
                      </p>
                    </motion.div> : <>
                      <AnimatePresence initial={false}>
                        {streamMessages.map((msg) => <motion.div
    key={msg.id}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
  >
                            <div
    className={cn(
      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
      msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border border-card-border text-foreground rounded-tl-sm"
    )}
    data-testid={`message-${msg.role}`}
  >
                              {msg.role === "assistant" ? <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0.5 prose-headings:my-1 prose-ul:my-1 prose-li:my-0 prose-pre:bg-muted prose-code:text-primary prose-code:bg-primary/10 prose-code:px-0.5 prose-code:rounded prose-code:text-xs">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                </div> : <p className="whitespace-pre-wrap">{msg.content}</p>}
                            </div>
                          </motion.div>)}
                      </AnimatePresence>

                      {
    /* Streaming message */
  }
                      {isStreaming && <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex justify-start"
  >
                          <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-card border border-card-border text-foreground">
                            {streamingContent ? <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0.5 prose-headings:my-1 prose-ul:my-1 prose-li:my-0 prose-pre:bg-muted prose-code:text-primary prose-code:bg-primary/10 prose-code:px-0.5 prose-code:rounded prose-code:text-xs">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {streamingContent}
                                </ReactMarkdown>
                                <span className="streaming-cursor" />
                              </div> : <div className="flex items-center gap-1.5 py-1">
                                {[0, 1, 2].map((i) => <motion.div
    key={i}
    className="w-1.5 h-1.5 rounded-full bg-primary/60"
    animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
  />)}
                              </div>}
                          </div>
                        </motion.div>}
                    </>}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {
    /* Input */
  }
              <div className="p-4 border-t border-border shrink-0 bg-card/40">
                {!activeDoc && <p className="text-xs text-muted-foreground text-center mb-2">
                    Upload a document on the left to enable chat
                  </p>}
                <div className="flex gap-2 items-end">
                  <Textarea
    ref={textareaRef}
    value={input}
    onChange={(e) => setInput(e.target.value)}
    onKeyDown={handleKeyDown}
    placeholder={activeDoc ? "Ask a question about your document... (Enter to send, Shift+Enter for new line)" : "Upload a document first..."}
    disabled={!activeDoc || isStreaming}
    rows={1}
    className="resize-none min-h-[40px] max-h-32 py-2.5 leading-relaxed"
    data-testid="input-message"
  />
                  <Button
    onClick={() => sendMessage(input)}
    disabled={!activeDoc || !input.trim() || isStreaming}
    size="icon"
    className="h-10 w-10 shrink-0"
    data-testid="button-send"
  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {
    /* Right — Notes */
  }
          <ResizablePanel defaultSize={25} minSize={18}>
            <div className="flex flex-col h-full border-l border-border">
              {session.isLoading ? <div className="p-5 space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-4 bg-muted rounded animate-pulse" />)}
                </div> : <NotesPanel
    sessionId={sessionId}
    sessionTitle={session.data?.title ?? "notes"}
    initialNotes={session.data?.notes ?? null}
    includeInChat={includeNotesInChat}
    onIncludeInChatChange={setIncludeNotesInChat}
  />}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>;
}
export {
  WorkspacePage as default
};
