import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListSessions,
  useCreateSession,
  useDeleteSession,
  useGetDashboard,
  useDeleteMe,
  getListSessionsQueryKey,
  getGetDashboardQueryKey
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/icons";
import { formatDistanceToNow } from "date-fns";
import { getSessionMutationError } from "@/lib/session-errors";
const OPEN_SAVED_SESSION_PREFIX = "studycompanion_open_saved_session_";
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
function timeAgo(ts) {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return "";
  }
}
function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user, token, logout } = useAuth();
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [deleteAccOpen, setDeleteAccOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteAccError, setDeleteAccError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFilter, setCurrentFilter] = useState("all");
  const sessions = useListSessions();
  const dashboard = useGetDashboard();
  const progressSummary = useQuery({
    queryKey: ["/api/progress/summary"],
    enabled: !!token,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/progress/summary", {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal
      });
      if (!response.ok) {
        throw new Error("Progress summary request failed");
      }
      return response.json();
    }
  });
  const trimmedQuery = searchQuery.trim();
  const searchSessions = useQuery({
    queryKey: ["/api/sessions/search", trimmedQuery],
    enabled: !!token && trimmedQuery.length > 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/sessions/search?q=${encodeURIComponent(trimmedQuery)}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal
      });
      if (!response.ok) {
        throw new Error("Search request failed");
      }
      return response.json();
    }
  });
  const rawList = trimmedQuery ? searchSessions.data : sessions.data;
  const visibleSessions = (rawList ?? []).filter((s) => {
    if (currentFilter === "recent") {
      const last = new Date(s.lastAccessed ?? s.createdAt ?? 0);
      return Date.now() - last.getTime() < 86400e3 * 7;
    }
    if (currentFilter === "docs") return (s.documentCount ?? 0) > 0;
    return true;
  });
  const isLoadingSessions = trimmedQuery ? searchSessions.isLoading : sessions.isLoading;
  const createSession = useCreateSession({
    mutation: {
      onSuccess: (created) => {
        setNewTitle("");
        setNewOpen(false);
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setCreateError("");
        if (created?.id) openSession(created.id);
      },
      onError: (error) => {
        setCreateError(getSessionMutationError(error));
      }
    }
  });
  const deleteSession = useDeleteSession({
    mutation: {
      onSuccess: () => {
        setDeleteId(null);
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      }
    }
  });
  const handleCreate = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreateError("");
    createSession.mutate({ data: { title: newTitle.trim() } });
  };
  const openSession = (sessionId) => {
    sessionStorage.setItem(`${OPEN_SAVED_SESSION_PREFIX}${sessionId}`, "1");
    setLocation(`/workspace/${sessionId}`);
  };
  const signOut = () => {
    logout();
    setLocation("/login");
  };
  const deleteAccount = useDeleteMe({
    mutation: {
      onSuccess: () => {
        logout();
        setLocation("/login");
      },
      onError: (error) => {
        setDeleteAccError(getSessionMutationError(error));
      }
    }
  });
  const handleDeleteAccount = (e) => {
    e.preventDefault();
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setDeleteAccError("Type DELETE to confirm.");
      return;
    }
    setDeleteAccError("");
    deleteAccount.mutate();
  };
  const openDeleteAccount = () => {
    setDeleteConfirmText("");
    setDeleteAccError("");
    setDeleteAccOpen(true);
  };
  const displayName = user?.email ? user.email.split("@")[0].replace(/[._]/g, " ") : "student";
  const firstName = displayName.split(" ")[0].replace(/^./, (c) => c.toUpperCase());
  const sessionCount = sessions.data?.length ?? dashboard.data?.totalSessions ?? 0;
  const docsTotal = sessions.data?.reduce((a, s) => a + (s.documentCount ?? 0), 0) ?? 0;
  const subtitle = `${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}, ${docsTotal} ${docsTotal === 1 ? "document" : "documents"}. Continue where you left off.`;
  const msgsTotal = sessions.data?.reduce((a, s) => a + (s.messageCount ?? 0), 0) ?? 0;
  return <div>
      <header className="topbar" data-od-id="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">
              <Icon name="book" />
            </span>
            <span className="brand-name">Study Companion</span>
          </div>
          <div className="spacer"></div>
          <div className="user-cluster">
            <span className="user-email">{user?.email}</span>
            <button className="btn btn-ghost btn-icon" title="Delete account" onClick={openDeleteAccount} data-testid="button-delete-account">
              <Icon name="trash" />
            </button>
            <button className="btn btn-ghost btn-icon" title="Sign out" onClick={signOut} data-testid="button-logout">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <div className="page-head">
          <div>
            <h1>
              {greeting()}, {firstName}
            </h1>
            <p className="greet-sub">{subtitle}</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setCreateError(""); setNewOpen(true); }} data-testid="button-create-session">
            <Icon name="plus" />
            New session
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">
              <Icon name="book" />
              Sessions
            </div>
            <div className="stat-num num" data-testid="stat-sessions">
              {dashboard.data?.totalSessions ?? sessions?.data?.length ?? 0}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <Icon name="file" />
              Documents
            </div>
            <div className="stat-num num" data-testid="stat-documents">
              {dashboard.data?.totalDocuments ?? docsTotal}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <Icon name="msg" />
              Messages
            </div>
            <div className="stat-num num" data-testid="stat-messages">
              {dashboard.data?.totalMessages ?? msgsTotal}
            </div>
          </div>
        </div>

        <h2 className="section-label" style={{ marginTop: 24 }}>Study progress & mastery</h2>

        {progressSummary.isLoading ? (
          <div className="stats-grid" data-testid="progress-summary-loading">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="stat-card" style={{ opacity: 0.6 }}>
                <div style={{ height: 12, width: "60%", borderRadius: 4, background: "var(--surface-2)", marginBottom: 8 }} />
                <div style={{ height: 24, width: "40%", borderRadius: 4, background: "var(--surface-2)" }} />
              </div>
            ))}
          </div>
        ) : progressSummary.isError ? (
          <div className="fc-persistence-error" data-testid="progress-summary-error">
            <span>Failed to load study progress summary.</span>
          </div>
        ) : (
          <div className="stats-grid" data-testid="progress-summary-grid">
            <div className="stat-card" data-testid="card-progress-current-streak">
              <div className="stat-label">
                <Icon name="spark" />
                Current Streak
              </div>
              <div className="stat-num num" data-testid="stat-current-streak">
                {progressSummary.data?.currentStreak ?? 0} {progressSummary.data?.currentStreak === 1 ? "day" : "days"}
              </div>
              <div className="stat-sub" style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }} data-testid="text-streak-details">
                Best: {progressSummary.data?.longestStreak ?? 0}d | Active: {progressSummary.data?.activeStudyDays ?? 0}d
              </div>
            </div>

            <div className="stat-card" data-testid="card-progress-quizzes">
              <div className="stat-label">
                <Icon name="cap" />
                Quizzes Completed
              </div>
              <div className="stat-num num" data-testid="stat-completed-quizzes">
                {progressSummary.data?.totalCompletedQuizzes ?? 0}
              </div>
            </div>

            <div className="stat-card" data-testid="card-progress-avg">
              <div className="stat-label">
                <Icon name="spark" />
                Avg Quiz Mastery
              </div>
              <div className="stat-num num" data-testid="stat-avg-quiz-score">
                {progressSummary.data?.averageQuizPercentage ?? 0}%
              </div>
            </div>

            <div className="stat-card" data-testid="card-progress-flashcards">
              <div className="stat-label">
                <Icon name="list" />
                Cards Reviewed
              </div>
              <div className="stat-num num" data-testid="stat-flashcards-reviewed">
                {progressSummary.data?.totalFlashcardsReviewed ?? 0}
              </div>
            </div>

            <div className="stat-card" data-testid="card-progress-known">
              <div className="stat-label">
                <Icon name="book" />
                Known Cards
              </div>
              <div className="stat-num num" data-testid="stat-known-cards">
                {progressSummary.data?.knownFlashcardsCount ?? 0}
              </div>
            </div>
          </div>
        )}

        {!progressSummary.isLoading && !progressSummary.isError && (progressSummary.data?.weakTopics ?? []).length > 0 && (
          <div className="weak-topics" data-testid="weak-topics-section">
            <h3 className="section-label" style={{ marginTop: 24 }}>Weak topics — focus on these</h3>
            <div className="weak-topics-list" data-testid="weak-topics-list">
              {(progressSummary.data.weakTopics ?? []).map((topic) => (
                <div key={topic.topic} className="weak-topic-row" data-testid={`weak-topic-${topic.topic}`}>
                  <div className="weak-topic-name">{topic.topic}</div>
                  <div className="weak-topic-meta">
                    {topic.attempts} attempt{topic.attempts === 1 ? "" : "s"} · {topic.incorrectTotal} incorrect{topic.recentIncorrectCount > 0 ? ` · ${topic.recentIncorrectCount} in last 7 days` : ""} · avg {topic.accuracy}%
                    {topic.lastActivity ? ` · last ${new Date(topic.lastActivity).toLocaleDateString()}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="filter-row">
          <div className="tabs">
            {[
  { key: "all", label: "All" },
  { key: "recent", label: "Last 7 days" },
  { key: "docs", label: "With documents" }
].map((t) => <button
    key={t.key}
    className={"tab " + (currentFilter === t.key ? "active" : "")}
    onClick={() => setCurrentFilter(t.key)}
  >
                {t.label}
              </button>)}
          </div>
          <div className="search">
            <Icon name="search" />
            <input className="input" placeholder="Search sessions and messages…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} data-testid="input-search-sessions" />
          </div>
        </div>

        <h2 className="section-label">Recent sessions</h2>

        {isLoadingSessions ? <div className="session-list">
            {[1, 2, 3].map((i) => <div key={i} className="session-row" style={{ minHeight: 72, background: "transparent" }}>
                <div style={{ width: "100%", display: "flex" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--surface-2)" }} />
                  <div style={{ flex: 1, marginLeft: 16 }}>
                    <div style={{ height: 12, width: "45%", borderRadius: 4, background: "var(--surface-2)", marginBottom: 8 }} />
                    <div style={{ height: 10, width: "30%", borderRadius: 4, background: "var(--surface-2)" }} />
                  </div>
                </div>
              </div>)}
          </div> : (rawList ?? []).length === 0 && !trimmedQuery ? <div className="empty" data-testid="session-empty-state">
            <Icon name="book" />
            <p>No sessions yet</p>
            <div className="sub">Create your first study session to get started.</div>
            <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => { setCreateError(""); setNewOpen(true); }} data-testid="button-create-first">
              <Icon name="plus" />
              Create first session
            </button>
          </div> : visibleSessions.length === 0 ? <div className="empty" data-testid="empty-search-results">
              <Icon name="search" />
              <p>No sessions found</p>
              <div className="sub">Nothing matches your current filter or search.</div>
            </div> : <div className="session-list" data-testid="list-sessions">
              {visibleSessions.map((s) => <div
    key={s.id}
    className="session-row"
    onClick={() => openSession(s.id)}
    data-testid={"card-session-" + s.id}
  >
                  <div className="s-icon">
                    <Icon name="book" />
                  </div>
                  <div className="s-main">
                    <p className="s-title" data-testid={"text-session-title-" + s.id}>
                      {s.title}
                    </p>
                    <div className="s-meta">
                      <span>
                        <Icon name="file" />
                        {s.documentCount ?? 0} doc{(s.documentCount ?? 0) !== 1 ? "s" : ""}
                      </span>
                      <span>
                        <Icon name="msg" />
                        {s.messageCount ?? 0} msg{(s.messageCount ?? 0) !== 1 ? "s" : ""}
                      </span>
                      <span>
                        <Icon name="clock" />
                        {timeAgo(s.lastAccessed ?? s.createdAt)}
                      </span>
                    </div>
                  </div>
                  <button
    className="btn btn-icon btn-danger-ghost del"
    title="Delete session"
    onClick={(e) => {
      e.stopPropagation();
      setDeleteId(s.id);
    }}
    data-testid={"button-delete-session-" + s.id}
  >
                    <Icon name="trash" />
                  </button>
                </div>)}
            </div>}
      </main>

      {newOpen && <div className="overlay show" id="new-modal" onClick={(e) => {
            if (e.target === e.currentTarget) setNewOpen(false);
          }}>
          <div className="modal">
            <h3>New study session</h3>
            <p className="sub">Name the topic you're preparing for.</p>
            <form onSubmit={handleCreate}>
              {createError && <p className="err show" role="alert" data-testid="text-create-session-error">{createError}</p>}
              <input
    className="input"
    id="new-title"
    placeholder="e.g. Biology — Photosynthesis"
    value={newTitle}
    onChange={(e) => setNewTitle(e.target.value)}
    autoFocus
    required
    data-testid="input-session-title"
  />
              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setNewOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={createSession.isPending || !newTitle.trim()} data-testid="button-confirm-create">
                  <Icon name="plus" />
                  {createSession.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>}

      {deleteId && <div className="overlay show" id="del-modal" onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteId(null);
          }}>
          <div className="modal">
            <h3>Delete session?</h3>
            <p className="sub">This permanently removes the session, its documents and chat history.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => deleteSession.mutate({ id: deleteId })} disabled={deleteSession.isPending} data-testid="button-confirm-delete">
                {deleteSession.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>}

      {deleteAccOpen && <div className="overlay show" id="delete-account-modal" onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteAccOpen(false);
          }}>
          <div className="modal">
            <h3>Delete account?</h3>
            <p className="sub">This permanently deletes your account and all of your sessions, documents, messages, quiz results and flashcard progress. This cannot be undone.</p>
            <p className="sub">Type <strong>DELETE</strong> to confirm.</p>
            <form onSubmit={handleDeleteAccount}>
              {deleteAccError && <p className="err show" role="alert" data-testid="text-delete-account-error">{deleteAccError}</p>}
              <input
    className="input"
    id="delete-account-confirm"
    placeholder="DELETE"
    value={deleteConfirmText}
    onChange={(e) => setDeleteConfirmText(e.target.value)}
    autoFocus
    required
    data-testid="input-delete-account-confirm"
  />
              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setDeleteAccOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} disabled={deleteAccount.isPending || deleteConfirmText.trim().toUpperCase() !== "DELETE"} data-testid="button-confirm-delete-account">
                  {deleteAccount.isPending ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}
export {
  DashboardPage as default
};