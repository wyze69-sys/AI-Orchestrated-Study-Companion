import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListSessions,
  useCreateSession,
  useDeleteSession,
  useGetDashboard,
  getListSessionsQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Plus,
  Trash2,
  FileText,
  MessageSquare,
  Clock,
  LogOut,
  LayoutDashboard,
  Search,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const [newTitle, setNewTitle] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const sessions = useListSessions();
  const dashboard = useGetDashboard();

  const trimmedQuery = searchQuery.trim();
  const filteredSessions = sessions.data
    ? sessions.data.filter((s) =>
        s.title.toLowerCase().includes(trimmedQuery.toLowerCase())
      )
    : null;

  const createSession = useCreateSession({
    mutation: {
      onSuccess: () => {
        setNewTitle("");
        setDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
    },
  });

  const deleteSession = useDeleteSession({
    mutation: {
      onSuccess: () => {
        setDeleteId(null);
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createSession.mutate({ data: { title: newTitle.trim() } });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Study Companion</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { logout(); setLocation("/login"); }}
              data-testid="button-logout"
              className="gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Page title */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">My Sessions</h1>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-session" className="gap-2">
                <Plus className="w-4 h-4" />
                New session
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>New study session</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <Input
                  placeholder="e.g. Biology Chapter 5, History Final..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  autoFocus
                  data-testid="input-session-title"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createSession.isPending || !newTitle.trim()}
                    data-testid="button-confirm-create"
                  >
                    {createSession.isPending ? "Creating..." : "Create session"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats row */}
        {dashboard.data && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: "Sessions", value: dashboard.data.totalSessions, icon: BookOpen },
              { label: "Documents", value: dashboard.data.totalDocuments, icon: FileText },
              { label: "Messages", value: dashboard.data.totalMessages, icon: MessageSquare },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className="border-card-border">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground" data-testid={`stat-${label.toLowerCase()}`}>
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Search input */}
        {sessions.data && sessions.data.length > 0 && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-sessions"
            />
          </div>
        )}

        {/* Sessions list */}
        {sessions.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : sessions.data && sessions.data.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No sessions yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create your first study session to get started
            </p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-create-first">
              <Plus className="w-4 h-4 mr-2" />
              Create first session
            </Button>
          </motion.div>
        ) : filteredSessions !== null && filteredSessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
            data-testid="empty-search-results"
          >
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No sessions found</h3>
            <p className="text-muted-foreground text-sm">
              No sessions match &ldquo;{searchQuery}&rdquo;. Try a different search term.
            </p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-3" data-testid="list-sessions">
              {(filteredSessions ?? []).map((session, i) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card
                    className="border-card-border hover:shadow-md transition-shadow cursor-pointer group"
                    onClick={() => setLocation(`/workspace/${session.id}`)}
                    data-testid={`card-session-${session.id}`}
                  >
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <BookOpen className="w-4.5 h-4.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate" data-testid={`text-session-title-${session.id}`}>
                              {session.title}
                            </h3>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {session.documentCount} doc{session.documentCount !== 1 ? "s" : ""}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {session.messageCount} msg{session.messageCount !== 1 ? "s" : ""}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDistanceToNow(new Date(session.lastAccessed), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(session.id);
                          }}
                          data-testid={`button-delete-session-${session.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </main>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the session, all its documents, and chat history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteId && deleteSession.mutate({ id: deleteId })}
              data-testid="button-confirm-delete"
            >
              {deleteSession.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
