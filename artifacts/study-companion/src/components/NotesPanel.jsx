import { useState, useEffect, useRef, useCallback } from "react";
import { useUpdateSessionNotes, getGetSessionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { NotebookPen, Eye, Pencil, Sparkles, CheckCircle2, Loader2, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
function NotesPanel({
  sessionId,
  sessionTitle,
  initialNotes,
  includeInChat,
  onIncludeInChatChange
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isPreview, setIsPreview] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const handleExport = () => {
    const blob = new Blob([notes], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = sessionTitle.replace(/[^a-z0-9\-_ ]/gi, "").trim() || "notes";
    a.href = url;
    a.download = `${safeName}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const saveTimerRef = useRef(null);
  const updateNotes = useUpdateSessionNotes({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
        setSaveState("saved");
      },
      onError: () => {
        setSaveState("idle");
      }
    }
  });
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);
  const scheduleSave = useCallback(
    (value) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState("saving");
      saveTimerRef.current = setTimeout(() => {
        updateNotes.mutate({ id: sessionId, data: { notes: value } });
      }, 800);
    },
    [sessionId, updateNotes]
  );
  const handleChange = (e) => {
    const val = e.target.value;
    setNotes(val);
    scheduleSave(val);
  };
  return <div className="flex flex-col h-full">
      {
    /* Notes header */
  }
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0 bg-card/40">
        <div className="flex items-center gap-2 min-w-0">
          <NotebookPen className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground">My Notes</span>
          {saveState === "saving" && <span className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving…
            </span>}
          {saveState === "saved" && <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 ml-1">
              <CheckCircle2 className="w-3 h-3" />
              Saved
            </span>}
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
    onClick={handleExport}
    disabled={!notes.trim()}
    data-testid="button-export-notes"
    className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  >
                  <Download className="w-3 h-3" />
                  Export
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Download notes as .md file</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                  <Switch
    checked={includeInChat}
    onCheckedChange={onIncludeInChatChange}
    data-testid="toggle-notes-in-chat"
    className="scale-90"
  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {includeInChat ? "Notes included in AI chat" : "Include notes in AI chat"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
    onClick={() => setIsPreview(false)}
    className={cn(
      "flex items-center gap-1 text-xs px-2 py-1 transition-colors",
      !isPreview ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
    )}
    data-testid="button-notes-edit"
  >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
            <button
    onClick={() => setIsPreview(true)}
    className={cn(
      "flex items-center gap-1 text-xs px-2 py-1 transition-colors",
      isPreview ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
    )}
    data-testid="button-notes-preview"
  >
              <Eye className="w-3 h-3" />
              Preview
            </button>
          </div>
        </div>
      </div>

      {
    /* Notes body */
  }
      {isPreview ? <ScrollArea className="flex-1">
          <div className="p-5">
            {notes.trim() ? <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-pre:bg-muted prose-pre:text-muted-foreground prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
              </div> : <p className="text-sm text-muted-foreground italic text-center mt-12">
                Nothing to preview yet. Switch to Edit and start writing.
              </p>}
          </div>
        </ScrollArea> : <div className="flex-1 flex flex-col min-h-0 p-3">
          <textarea
    value={notes}
    onChange={handleChange}
    placeholder={"Write your notes here\u2026\n\nMarkdown is supported:\n# Heading\n**bold**, *italic*\n- bullet list\n```code block```"}
    className="flex-1 w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none font-mono leading-relaxed min-h-0"
    data-testid="textarea-notes"
  />
        </div>}
    </div>;
}
export {
  NotesPanel as default
};
