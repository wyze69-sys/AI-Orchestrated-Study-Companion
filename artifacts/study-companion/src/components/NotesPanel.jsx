import { useState, useEffect, useRef, useCallback } from "react";
import { useUpdateSessionNotes, getGetSessionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@/components/icons";
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

  return (
    <div className="notes-panel-root flex flex-col h-full">
      {/* Pane Header */}
      <div className="pane-head">
        <div className="p-title">
          <Icon name="note" />
          <span>My notes</span>
        </div>
        <div className="pane-actions">
          {saveState !== "idle" && (
            <span className={cn("save-state", saveState === "saved" && "saved")}>
              {saveState === "saving" ? "Saving…" : "Saved"}
            </span>
          )}
          <div className="mode-toggle">
            <button
              className={cn(!isPreview && "active")}
              onClick={() => setIsPreview(false)}
              data-testid="button-notes-edit"
            >
              Edit
            </button>
            <button
              className={cn(isPreview && "active")}
              onClick={() => setIsPreview(true)}
              data-testid="button-notes-preview"
            >
              Preview
            </button>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            title="Download notes as .md"
            onClick={handleExport}
            disabled={!notes.trim()}
            data-testid="button-export-notes"
          >
            <Icon name="download" />
          </button>
        </div>
      </div>

      {/* AI Context Toggle Bar */}
      <div className="notes-subbar">
        <label className="toggle-cluster">
          <span className="toggle-label">Include in AI chat</span>
          <div className={cn("switch", includeInChat && "on")}>
            <input
              type="checkbox"
              className="sr-only"
              checked={includeInChat}
              onChange={(e) => onIncludeInChatChange(e.target.checked)}
              data-testid="toggle-notes-in-chat"
            />
            <span className="knob" />
          </div>
        </label>
        <span className={cn("context-badge", includeInChat ? "active" : "inactive")}>
          {includeInChat ? "AI Active" : "Off"}
        </span>
      </div>

      {/* Notes Content Body */}
      {isPreview ? (
        <div className="scroll">
          <div className="notes-preview">
            {notes.trim() ? (
              <div className="md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
              </div>
            ) : (
              <div className="doc-empty">
                <Icon name="note" />
                <p>Nothing to preview yet</p>
                <div className="sub">Switch to Edit and start writing.</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="notes-body">
          <div className="notes-hint-box">
            <Icon name="spark" className="icon-sm" />
            <span>
              {includeInChat
                ? "Active: AI Tutor reads your notes alongside documents."
                : "Toggle switch above to let AI Tutor read these notes."}
            </span>
          </div>
          <textarea
            value={notes}
            onChange={handleChange}
            placeholder={
              "Write your notes here…\n\nMarkdown is supported:\n# Heading\n**bold**, *italic*\n- bullet list\n```code block```"
            }
            spellCheck="false"
            data-testid="textarea-notes"
          />
        </div>
      )}
    </div>
  );
}

export { NotesPanel as default };