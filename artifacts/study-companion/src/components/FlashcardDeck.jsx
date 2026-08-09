import { useState, useCallback, useEffect } from "react";
import { parseFlashcardResponse, getFlashcardNavState, calculateMasteryStats } from "@/lib/flashcards";
import { isKeyboardActivationKey } from "@/lib/sources";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Renders a single flashcard face (front or back).
 * Citation and mastery action buttons are shown on the back face.
 */
function FlashcardFace({ card, isFront, onSelectSource, currentStatus, onMarkMastery }) {
  const text = isFront ? card.front : card.back;

  return (
    <div className={cn("fc-face", isFront ? "fc-face-front" : "fc-face-back")}>
      <div className="fc-face-label">{isFront ? "QUESTION" : "ANSWER"}</div>
      <div className="fc-face-text">{text}</div>

      {!isFront && card.explanation && (
        <div className="fc-explanation">{card.explanation}</div>
      )}

      {!isFront && (
        <div className="fc-back-actions">
          {card.citation?.quote && (
            <button
              type="button"
              className="fc-citation-chip"
              title={`Go to source: "${card.citation.quote}"`}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onSelectSource === "function") {
                  onSelectSource({
                    quote: card.citation.quote,
                    startLine: card.citation.startLine ?? null,
                    endLine: card.citation.endLine ?? null
                  });
                }
              }}
              onKeyDown={(e) => {
                if (isKeyboardActivationKey(e.key)) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (typeof onSelectSource === "function") {
                    onSelectSource({
                      quote: card.citation.quote,
                      startLine: card.citation.startLine ?? null,
                      endLine: card.citation.endLine ?? null
                    });
                  }
                }
              }}
              data-testid="fc-citation-chip"
            >
              <Icon name="list" className="icon-sm" />
              <span>View source</span>
            </button>
          )}

          <div className="fc-mastery-buttons" role="group" aria-label="Mark card mastery">
            <button
              type="button"
              className={cn("fc-mastery-btn fc-btn-known", currentStatus === "known" && "active")}
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onMarkMastery === "function") {
                  onMarkMastery(card.id, "known");
                }
              }}
              onKeyDown={(e) => {
                if (isKeyboardActivationKey(e.key)) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (typeof onMarkMastery === "function") {
                    onMarkMastery(card.id, "known");
                  }
                }
              }}
              tabIndex={0}
              aria-pressed={currentStatus === "known"}
              data-testid="fc-btn-known"
            >
              ✔ Known
            </button>

            <button
              type="button"
              className={cn("fc-mastery-btn fc-btn-review", currentStatus === "review" && "active")}
              onClick={(e) => {
                e.stopPropagation();
                if (typeof onMarkMastery === "function") {
                  onMarkMastery(card.id, "review");
                }
              }}
              onKeyDown={(e) => {
                if (isKeyboardActivationKey(e.key)) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (typeof onMarkMastery === "function") {
                    onMarkMastery(card.id, "review");
                  }
                }
              }}
              tabIndex={0}
              aria-pressed={currentStatus === "review"}
              data-testid="fc-btn-review"
            >
              ✖ Review again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * FlashcardDeck renders an interactive flashcard deck from parsed AI content.
 *
 * Supports:
 *  - Initializing and persisting review statuses (Known / Review again) to the backend
 *  - Keeping unsaved local state responsive (optimistic UI)
 *  - Displaying non-blocking notifications when persistence fails
 *  - Resetting saved statuses on explicit user confirmation
 *  - Keyboard navigation and citation navigation preservation
 */
export function FlashcardDeck({
  content,
  onSelectSource,
  sessionId,
  documentId,
  messageId,
  initialMastery = {}
}) {
  const parsed = parseFlashcardResponse(content);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteryState, setMasteryState] = useState(() => ({ ...initialMastery }));
  const [persistenceError, setPersistenceError] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Synchronize initialMastery prop when loaded asynchronously
  useEffect(() => {
    if (initialMastery && Object.keys(initialMastery).length > 0) {
      setMasteryState((prev) => ({ ...initialMastery, ...prev }));
    }
  }, [initialMastery]);

  const { cards } = parsed?.cards?.length ? parsed : { cards: [] };
  const nav = getFlashcardNavState(currentIndex, cards.length);
  const stats = calculateMasteryStats(cards, masteryState);
  const currentCard = cards[currentIndex];
  const currentStatus = masteryState[currentCard?.id] ?? null;

  const handleMarkMastery = useCallback(
    async (cardId, status) => {
      // 1. Optimistic local state update (UI stays responsive)
      setMasteryState((prev) => ({
        ...prev,
        [cardId]: status
      }));
      setPersistenceError(null);

      // 2. Persist to API if sessionId is provided
      if (sessionId) {
        try {
          const storedToken = localStorage.getItem("studycompanion_token");
          const response = await fetch(`/api/sessions/${sessionId}/flashcards/progress`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${storedToken}`
            },
            body: JSON.stringify({
              cardId: String(cardId),
              status,
              documentId: documentId || null,
              messageId: messageId || null
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            setPersistenceError(errData.error || "Failed to save progress to server.");
          }
        } catch {
          setPersistenceError("Network error while saving progress.");
        }
      }
    },
    [sessionId, documentId, messageId]
  );

  const handleResetMastery = useCallback(
    async () => {
      // 1. Require explicit confirmation before wiping review progress
      setConfirmReset(true);
    },
    []
  );

  const handleConfirmReset = useCallback(
    async () => {
      setConfirmReset(false);
      // 1. Optimistic reset
      setMasteryState({});
      setPersistenceError(null);

      // 2. Persist reset to API
      if (sessionId) {
        try {
          const storedToken = localStorage.getItem("studycompanion_token");
          const response = await fetch(`/api/sessions/${sessionId}/flashcards/progress`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${storedToken}`
            }
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            setPersistenceError(errData.error ?? "Failed to reset progress on server.");
          }
        } catch {
          setPersistenceError("Network error while resetting progress.");
        }
      }
    },
    [sessionId]
  );

  const handleFlip = useCallback(() => {
    setIsFlipped((f) => !f);
  }, []);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, cards.length]);

  const handleKeyDown = useCallback(
    (e) => {
      if (isKeyboardActivationKey(e.key)) {
        e.preventDefault();
        handleFlip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    },
    [handleFlip, handlePrev, handleNext]
  );

  if (!parsed || cards.length === 0) {
    if (
      parsed?.error &&
      typeof content === "string" &&
      (content.toLowerCase().includes("flashcard") || content.toLowerCase().includes("q:"))
    ) {
      return (
        <div className="fc-error-card" data-testid="fc-error">
          <div className="fc-error-title">
            <Icon name="help" className="icon-sm" />
            <span>Unable to parse structured flashcards</span>
          </div>
          <div>The response could not be formatted into interactive flashcards.</div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fc-deck" data-testid="fc-deck">
      {/* Header */}
      <div className="fc-header">
        <div className="fc-title">
          <Icon name="spark" className="icon-sm" />
          <span>Flashcards</span>
        </div>

        <div className="fc-header-right">
          <div className="fc-stats-bar" data-testid="fc-stats-bar">
            <span className="fc-stat fc-stat-known" data-testid="fc-stat-known">
              Known: {stats.knownCount}
            </span>
            <span className="fc-stat fc-stat-review" data-testid="fc-stat-review">
              Review: {stats.reviewCount}
            </span>
            <span className="fc-stat fc-stat-unreviewed" data-testid="fc-stat-unreviewed">
              Unreviewed: {stats.unreviewedCount}
            </span>
          </div>

          <div className="fc-position-badge" data-testid="fc-position">
            {nav.displayPosition}
          </div>
        </div>
      </div>

      {/* Non-blocking persistence error notification */}
      {persistenceError && (
        <div className="fc-persistence-error" data-testid="fc-persistence-error">
          <Icon name="help" className="icon-sm" />
          <span>{persistenceError}</span>
          <button
            type="button"
            className="fc-error-dismiss"
            onClick={() => setPersistenceError(null)}
            title="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Card */}
      <div
        className={cn("fc-card", isFlipped && "is-flipped")}
        role="button"
        tabIndex={0}
        aria-label={
          isFlipped
            ? `Card ${currentIndex + 1} back: ${currentCard.back}. Press Enter or Space to flip.`
            : `Card ${currentIndex + 1} front: ${currentCard.front}. Press Enter or Space to flip.`
        }
        aria-pressed={isFlipped}
        onClick={handleFlip}
        onKeyDown={handleKeyDown}
        data-testid="fc-card"
      >
        <div className="fc-card-inner">
          <div className="fc-card-front" aria-hidden={isFlipped}>
            <FlashcardFace card={currentCard} isFront={true} onSelectSource={onSelectSource} />
          </div>
          <div className="fc-card-back" aria-hidden={!isFlipped}>
            <FlashcardFace
              card={currentCard}
              isFront={false}
              onSelectSource={onSelectSource}
              currentStatus={currentStatus}
              onMarkMastery={handleMarkMastery}
            />
          </div>
        </div>
        <div className="fc-flip-hint" aria-hidden="true">
          {isFlipped ? "Click to see question" : "Click to reveal answer"}
        </div>
      </div>

      {/* Navigation */}
      <div className="fc-nav" role="group" aria-label="Flashcard navigation">
        <button
          type="button"
          className="btn btn-ghost fc-nav-btn"
          onClick={handlePrev}
          onKeyDown={(e) => {
            if (isKeyboardActivationKey(e.key)) {
              e.preventDefault();
              handlePrev();
            }
          }}
          disabled={!nav.canGoBack}
          aria-label="Previous card"
          data-testid="fc-btn-prev"
        >
          ← Previous
        </button>

        <span className="fc-nav-dots" aria-hidden="true">
          {cards.map((card, i) => {
            const cardStatus = masteryState[card.id];
            return (
              <span
                key={card.id || i}
                className={cn(
                  "fc-dot",
                  i === currentIndex && "active",
                  cardStatus === "known" && "status-known",
                  cardStatus === "review" && "status-review"
                )}
                title={`Card ${i + 1}${cardStatus ? `: ${cardStatus}` : ""}`}
              />
            );
          })}
        </span>

        <button
          type="button"
          className="btn btn-ghost fc-nav-btn"
          onClick={handleNext}
          onKeyDown={(e) => {
            if (isKeyboardActivationKey(e.key)) {
              e.preventDefault();
              handleNext();
            }
          }}
          disabled={!nav.canGoForward}
          aria-label="Next card"
          data-testid="fc-btn-next"
        >
          Next →
        </button>
      </div>

      {/* Completion Summary */}
      {stats.isCompleted && (
        <div className="fc-completion" data-testid="fc-completion">
          <div className="fc-completion-title" data-testid="fc-completion-title">
            🎉 Deck Completed!
          </div>
          <div className="fc-completion-stats" data-testid="fc-completion-stats">
            You marked <strong>{stats.knownCount}</strong> as Known and <strong>{stats.reviewCount}</strong> to Review again.
          </div>
          {confirmReset ? (
            <div className="fc-reset-confirm" data-testid="fc-reset-confirm">
              <span>Reset all review statuses?</span>
              <div className="fc-reset-confirm-actions">
                <button
                  type="button"
                  className="btn btn-secondary fc-reset-confirm-yes"
                  onClick={handleConfirmReset}
                  onKeyDown={(e) => {
                    if (isKeyboardActivationKey(e.key)) {
                      e.preventDefault();
                      handleConfirmReset();
                    }
                  }}
                  data-testid="fc-btn-reset-confirm"
                >
                  Yes, reset
                </button>
                <button
                  type="button"
                  className="btn btn-ghost fc-reset-confirm-no"
                  onClick={() => setConfirmReset(false)}
                  onKeyDown={(e) => {
                    if (isKeyboardActivationKey(e.key)) {
                      e.preventDefault();
                      setConfirmReset(false);
                    }
                  }}
                  data-testid="fc-btn-reset-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary fc-reset-btn"
              onClick={handleResetMastery}
              onKeyDown={(e) => {
                if (isKeyboardActivationKey(e.key)) {
                  e.preventDefault();
                  handleResetMastery();
                }
              }}
              data-testid="fc-btn-reset"
            >
              Reset review statuses
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default FlashcardDeck;
