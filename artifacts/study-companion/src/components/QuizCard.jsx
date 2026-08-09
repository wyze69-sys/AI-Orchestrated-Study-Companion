import { useState, useCallback, useEffect } from "react";
import { parseQuizResponse, calculateScore, getAnswerFeedback, getIncorrectQuestions, getQuizIdentity } from "@/lib/quiz";
import { isKeyboardActivationKey } from "@/lib/sources";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Renders a single interactive quiz question with option buttons.
 */
function QuizQuestion({ question, displayIndex, selectedOptionId, onSelectOption }) {
  const feedback = getAnswerFeedback(question, selectedOptionId);

  return (
    <div className="quiz-item" data-testid={`quiz-question-${displayIndex}`}>
      <div className="quiz-question-text">
        <strong>{displayIndex}.</strong> {question.question}
      </div>

      <div className="quiz-options" role="radiogroup" aria-label={`Question ${displayIndex}`}>
        {question.options.map((opt) => {
          const isSelected = selectedOptionId === opt.id;
          const isCorrectAnswer = opt.id === feedback.correctAnswer;

          const optionClass = cn(
            "quiz-option",
            feedback.isAnswered && isSelected && feedback.isCorrect && "correct",
            feedback.isAnswered && isSelected && !feedback.isCorrect && "incorrect",
            feedback.isAnswered && !isSelected && isCorrectAnswer && "show-correct"
          );

          return (
            <button
              key={opt.id}
              type="button"
              className={optionClass}
              onClick={() => onSelectOption(question.id, opt.id)}
              onKeyDown={(e) => {
                if (isKeyboardActivationKey(e.key)) {
                  e.preventDefault();
                  onSelectOption(question.id, opt.id);
                }
              }}
              tabIndex={0}
              role="radio"
              aria-checked={isSelected}
              data-testid={`quiz-option-${displayIndex}-${opt.id}`}
            >
              <span className="quiz-option-key">{opt.id}</span>
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>

      {feedback.isAnswered && (
        <div
          className={cn("quiz-feedback", feedback.isCorrect ? "correct" : "incorrect")}
          data-testid={`quiz-feedback-${displayIndex}`}
        >
          <div className="quiz-feedback-title">
            <span>
              {feedback.isCorrect
                ? "✔ Correct!"
                : `✖ Incorrect — Correct answer: ${feedback.correctAnswer}`}
            </span>
          </div>
          {feedback.explanation && (
            <div style={{ marginTop: 4 }}>{feedback.explanation}</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Final results panel shown when all questions are answered.
 * Shows score, all-correct state, retry incorrect button, and restart button.
 */
function QuizResults({ score, onRetryIncorrect, onRestart, hasIncorrect }) {
  const isPerfect = score.correctCount === score.totalCount && score.totalCount > 0;

  return (
    <div className="quiz-results" data-testid="quiz-results">
      <div className="quiz-results-score" data-testid="quiz-results-score">
        {isPerfect ? (
          <span className="quiz-results-perfect" data-testid="quiz-results-perfect">
            🎉 Perfect Score! {score.correctCount} / {score.totalCount} ({score.percentage}%)
          </span>
        ) : (
          <span>
            Final Score: <strong>{score.correctCount} / {score.totalCount}</strong> ({score.percentage}%)
          </span>
        )}
      </div>

      <div className="quiz-results-actions">
        {!isPerfect && hasIncorrect && (
          <button
            type="button"
            className="btn btn-secondary quiz-action-btn"
            onClick={onRetryIncorrect}
            onKeyDown={(e) => {
              if (isKeyboardActivationKey(e.key)) {
                e.preventDefault();
                onRetryIncorrect();
              }
            }}
            data-testid="btn-retry-incorrect"
          >
            <Icon name="spark" className="icon-sm" />
            Retry incorrect
          </button>
        )}

        <button
          type="button"
          className="btn btn-ghost quiz-action-btn"
          onClick={onRestart}
          onKeyDown={(e) => {
            if (isKeyboardActivationKey(e.key)) {
              e.preventDefault();
              onRestart();
            }
          }}
          data-testid="btn-restart-quiz"
        >
          Restart quiz
        </button>
      </div>
    </div>
  );
}

/**
 * QuizCard renders an interactive quiz from parsed AI content.
 * Supports:
 *  - Per-question answer selection with immediate feedback
 *  - Live score display
 *  - Final result panel on quiz completion
 *  - "Retry incorrect" (only incorrect questions, reset their answers)
 *  - "Restart quiz" (full reset)
 *  - Keyboard-accessible buttons throughout
 */
export function QuizCard({ content, messageId, documentId, sessionId, savedResult, onSaveResult }) {
  const parsed = parseQuizResponse(content);

  // activeQuestions is either the full parsed list or a retry subset.
  // originalQuestions is always the full set (used for restart).
  const [originalQuestions] = useState(() => (parsed?.questions ?? []));
  const [activeQuestions, setActiveQuestions] = useState(() => (parsed?.questions ?? []));
  const [userAnswers, setUserAnswers] = useState(() => {
    if (savedResult?.answerState && typeof savedResult.answerState === "object") {
      return savedResult.answerState;
    }
    return {};
  });
  const [isRetryMode, setIsRetryMode] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSavedState, setLastSavedState] = useState(null);

  // Sync savedResult when available
  useEffect(() => {
    if (savedResult?.answerState && typeof savedResult.answerState === "object") {
      setUserAnswers((prev) => (Object.keys(prev).length === 0 ? savedResult.answerState : prev));
    }
  }, [savedResult]);

  const score = calculateScore(userAnswers, activeQuestions);

  // Trigger persistence when score.isCompleted is true
  useEffect(() => {
    if (!score.isCompleted || !onSaveResult || !sessionId) return;

    const answerKey = JSON.stringify(userAnswers);
    if (lastSavedState === answerKey) return;

    const quizId = getQuizIdentity({ content, messageId, documentId });
    const payload = {
      quizId,
      messageId: messageId || null,
      documentId: documentId || null,
      totalQuestions: score.totalCount,
      score: score.correctCount,
      percentage: score.percentage,
      answerState: userAnswers
    };

    Promise.resolve(onSaveResult(payload))
      .then(() => {
        setLastSavedState(answerKey);
        setSaveError(null);
      })
      .catch((err) => {
        setSaveError(err.message || "Failed to save quiz result");
      });
  }, [
    score.isCompleted,
    score.totalCount,
    score.correctCount,
    score.percentage,
    userAnswers,
    onSaveResult,
    sessionId,
    messageId,
    documentId,
    lastSavedState
  ]);

  const handleSelectOption = useCallback((questionId, optionId) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: optionId
    }));
  }, []);

  const handleRetryIncorrect = useCallback(() => {
    // Get incorrect questions from the *original* full set, using current answers.
    const incorrectOnes = getIncorrectQuestions(originalQuestions, userAnswers);
    if (incorrectOnes.length === 0) return;

    // Reset only the answers for the incorrect questions
    setUserAnswers((prev) => {
      const next = { ...prev };
      for (const q of incorrectOnes) {
        delete next[q.id];
      }
      return next;
    });
    setActiveQuestions(incorrectOnes);
    setIsRetryMode(true);
    setSaveError(null);
  }, [originalQuestions, userAnswers]);

  const handleRestart = useCallback(() => {
    setActiveQuestions(originalQuestions);
    setUserAnswers({});
    setIsRetryMode(false);
    setSaveError(null);
  }, [originalQuestions]);

  if (!parsed || originalQuestions.length === 0) {
    if (parsed?.error && typeof content === "string" && content.toLowerCase().includes("quiz")) {
      return (
        <div className="quiz-error-card" data-testid="quiz-error">
          <div className="quiz-feedback-title" style={{ color: "var(--danger)" }}>
            <Icon name="help" className="icon-sm" />
            <span>Unable to parse structured quiz</span>
          </div>
          <div>The response could not be formatted into an interactive quiz.</div>
        </div>
      );
    }
    return null;
  }

  const incorrectQuestions = getIncorrectQuestions(activeQuestions, userAnswers);

  return (
    <div className="quiz-card" data-testid="quiz-card">
      {saveError && (
        <div className="quiz-persistence-error" data-testid="quiz-persistence-error">
          <span>{saveError}</span>
          <button type="button" className="quiz-error-dismiss" onClick={() => setSaveError(null)}>
            ✕
          </button>
        </div>
      )}

      <div className="quiz-header">
        <div className="quiz-title">
          <Icon name="cap" className="icon-sm" />
          <span>{isRetryMode ? "Retry — Incorrect Questions" : "Interactive Quiz"}</span>
        </div>
        <div className="quiz-score-badge" data-testid="quiz-score">
          Score: {score.correctCount} / {score.totalCount} ({score.percentage}%)
        </div>
      </div>

      <div className="quiz-items">
        {activeQuestions.map((q, idx) => (
          <QuizQuestion
            key={q.id}
            question={q}
            displayIndex={idx + 1}
            selectedOptionId={userAnswers[q.id] ?? null}
            onSelectOption={handleSelectOption}
          />
        ))}
      </div>

      {score.isCompleted && (
        <QuizResults
          score={score}
          hasIncorrect={incorrectQuestions.length > 0}
          onRetryIncorrect={handleRetryIncorrect}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}

export default QuizCard;
