import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { MobileApiError, apiRequest } from "@/lib/api";
import {
  QuizQuestion,
  calculateScore,
  getAnswerFeedback,
  getIncorrectQuestions,
  getQuizIdentity,
  parseQuizResponse,
} from "@/lib/quiz";

interface QuizResult {
  quizId: string;
  messageId: string | null;
  documentId: string | null;
  totalQuestions: number;
  score: number;
  percentage: number;
  answerState: Record<string, string>;
}

interface SavedQuizResult {
  quizId?: string;
  answerState?: Record<string, string> | null;
  totalQuestions?: number;
  score?: number;
  percentage?: number;
}

interface QuizCardProps {
  content: string;
  messageId: string;
  documentId: string | null;
  sessionId: string;
  token: string | null;
  savedResult?: SavedQuizResult | null;
}

/**
 * Mobile interactive quiz card. Mirrors the web QuizCard behavior:
 * per-question feedback, live score, completion gate, retry-incorrect,
 * restart, saved-result hydration, and exactly-once persistence.
 */
export function QuizCard({
  content,
  messageId,
  documentId,
  sessionId,
  token,
  savedResult,
}: QuizCardProps) {
  const parsed = useMemo(() => parseQuizResponse(content), [content]);
  const questions = parsed?.questions ?? [];

  const [originalQuestions] = useState<QuizQuestion[]>(() => questions);
  const [activeQuestions, setActiveQuestions] = useState<QuizQuestion[]>(() => questions);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>(() =>
    toAnswerMap(savedResult?.answerState)
  );
  const [isRetryMode, setIsRetryMode] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedKey, setLastSavedKey] = useState<string | null>(() =>
    JSON.stringify(toAnswerMap(savedResult?.answerState))
  );

  const colours = useColors();
  const styles = makeStyles(colours);

  // Hydrate a saved result only when nothing has been answered yet
  // (mirrors the web behavior of not overwriting newer local actions).
  useEffect(() => {
    const ansState = savedResult?.answerState;
    if (!ansState || typeof ansState !== "object") return;
    setUserAnswers((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return toAnswerMap(ansState);
    });
  }, [savedResult]);

  const score = calculateScore(userAnswers, activeQuestions);

  // Exactly-once persistence when all active questions are answered.
  useEffect(() => {
    if (!score.isCompleted) return;
    const answerKey = JSON.stringify(userAnswers);
    if (lastSavedKey === answerKey) return;

    let cancelled = false;
    const payload = {
      quizId: getQuizIdentity({ content, messageId, documentId }),
      messageId: messageId || null,
      documentId: documentId || null,
      totalQuestions: score.totalCount,
      score: score.correctCount,
      percentage: score.percentage,
      answerState: userAnswers,
    };

    (async () => {
      try {
        await apiRequest(`/sessions/${sessionId}/quizzes/results`, {
          method: "POST",
          token,
          body: payload,
        });
        if (!cancelled) {
          setLastSavedKey(answerKey);
          setSaveError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSaveError(
            err instanceof MobileApiError ? err.message : "Failed to save quiz result."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    score.isCompleted,
    score.totalCount,
    score.correctCount,
    score.percentage,
    userAnswers,
    content,
    messageId,
    documentId,
    sessionId,
    token,
    lastSavedKey,
  ]);

  const handleSelectOption = useCallback((questionId: number | string, optionId: string) => {
    setUserAnswers((prev) => ({ ...prev, [String(questionId)]: optionId }));
  }, []);

  const handleRetryIncorrect = useCallback(() => {
    const incorrect = getIncorrectQuestions(originalQuestions, userAnswers);
    if (incorrect.length === 0) return;
    setUserAnswers((prev) => {
      const next = { ...prev };
      for (const q of incorrect) delete next[String(q.id)];
      return next;
    });
    setActiveQuestions(incorrect);
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
        <View style={[styles.errorCard, { borderColor: colours.destructive }]} testID="mquiz-error">
          <Feather name="alert-circle" size={16} color={colours.destructive} />
          <Text style={[styles.errorTitle, { color: colours.destructive }]}>
            Unable to parse structured quiz
          </Text>
        </View>
      );
    }
    return null;
  }

  const incorrectQuestions = getIncorrectQuestions(activeQuestions, userAnswers);
  const isPerfect = score.correctCount === score.totalCount && score.totalCount > 0;

  return (
    <View
      style={[styles.card, { backgroundColor: colours.card, borderColor: colours.border }]}
      testID="mquiz-card"
    >
      {saveError && (
        <View style={[styles.saveError, { borderColor: colours.destructive }]} testID="quiz-persistence-error">
          <Text style={[styles.saveErrorText, { color: colours.destructive }]}>{saveError}</Text>
          <Pressable hitSlop={8} onPress={() => setSaveError(null)}>
            <Feather name="x" size={14} color={colours.mutedForeground} />
          </Pressable>
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="check-square" size={14} color={colours.primary} />
          <Text style={[styles.title, { color: colours.foreground }]}>
            {isRetryMode ? "Retry — Incorrect Questions" : "Interactive Quiz"}
          </Text>
        </View>
        <Text style={[styles.scoreBadge, { color: colours.primary }]} testID="mquiz-score">
          Score: {score.correctCount} / {score.totalCount} ({score.percentage}%)
        </Text>
      </View>

      <ScrollView style={styles.body} nestedScrollEnabled>
        {activeQuestions.map((q, idx) => (
          <QuestionBlock
            key={String(q.id)}
            question={q}
            displayIndex={idx + 1}
            selectedOptionId={userAnswers[String(q.id)] ?? null}
            onSelectOption={(optionId) => handleSelectOption(q.id, optionId)}
            colours={colours}
            styles={styles}
          />
        ))}
      </ScrollView>

      {score.isCompleted && (
        <View style={[styles.results, { borderTopColor: colours.border }]} testID="quiz-results">
          {isPerfect ? (
            <Text style={[styles.resultsPerfect, { color: colours.foreground }]} testID="quiz-results-perfect">
              Perfect Score! {score.correctCount} / {score.totalCount} ({score.percentage}%)
            </Text>
          ) : (
            <Text style={[styles.resultsScore, { color: colours.foreground }]}>
              Final Score:{" "}
              <Text style={styles.resultsScoreStrong}>
                {score.correctCount} / {score.totalCount}
              </Text>{" "}
              ({score.percentage}%)
            </Text>
          )}
          <View style={styles.resultsActions}>
            {!isPerfect && incorrectQuestions.length > 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: colours.primary, opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={handleRetryIncorrect}
                testID="btn-retry-incorrect"
              >
                <Text style={{ color: colours.primaryForeground, fontFamily: "Inter_600SemiBold" }}>
                  Retry incorrect
                </Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { borderColor: colours.border, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handleRestart}
              testID="btn-restart-quiz"
            >
              <Text style={{ color: colours.foreground, fontFamily: "Inter_600SemiBold" }}>
                Restart quiz
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function QuestionBlock({
  question,
  displayIndex,
  selectedOptionId,
  onSelectOption,
  colours,
  styles,
}: {
  question: QuizQuestion;
  displayIndex: number;
  selectedOptionId: string | null;
  onSelectOption: (optionId: string) => void;
  colours: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const feedback = getAnswerFeedback(question, selectedOptionId);

  return (
    <View style={styles.questionBlock} testID={`mquiz-question-${displayIndex}`}>
      <Text style={[styles.questionText, { color: colours.foreground }]}>
        <Text style={{ fontWeight: "700" }}>{displayIndex}.</Text> {question.question}
      </Text>

      <View style={styles.optionsList}>
        {question.options.map((opt) => {
          const isSelected = selectedOptionId === opt.id;
          const isCorrectAnswer = opt.id === feedback.correctAnswer;
          let borderColor = colours.border;
          let bg = colours.card;
          if (feedback.isAnswered && isSelected && feedback.isCorrect) {
            borderColor = colours.primary;
            bg = colours.primary + "18";
          } else if (feedback.isAnswered && isSelected && !feedback.isCorrect) {
            borderColor = colours.destructive;
            bg = colours.destructive + "18";
          } else if (feedback.isAnswered && !isSelected && isCorrectAnswer) {
            borderColor = colours.primary;
            bg = colours.primary + "10";
          }

          return (
            <Pressable
              key={opt.id}
              style={({ pressed }) => [
                styles.option,
                { borderColor, backgroundColor: bg, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => onSelectOption(opt.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              testID={`mquiz-option-${displayIndex}-${opt.id}`}
            >
              <View style={[styles.optionKey, { borderColor, backgroundColor: colours.muted }]}>
                <Text style={{ color: colours.foreground, fontFamily: "Inter_600SemiBold" }}>
                  {opt.id}
                </Text>
              </View>
              <Text style={[styles.optionText, { color: colours.foreground }]}>{opt.text}</Text>
            </Pressable>
          );
        })}
      </View>

      {feedback.isAnswered && (
        <View
          style={[
            styles.feedback,
            feedback.isCorrect
              ? { borderColor: colours.primary }
              : { borderColor: colours.destructive },
          ]}
          testID={`mquiz-feedback-${displayIndex}`}
        >
          <Text
            style={[
              styles.feedbackTitle,
              { color: feedback.isCorrect ? colours.primary : colours.destructive },
            ]}
          >
            {feedback.isCorrect
              ? "Correct!"
              : `Incorrect — Correct answer: ${feedback.correctAnswer}`}
          </Text>
          {feedback.explanation ? (
            <Text style={[styles.feedbackText, { color: colours.mutedForeground }]}>
              {feedback.explanation}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function toAnswerMap(raw: Record<string, string> | null | undefined): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const state: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) state[String(k)] = String(v);
  return state;
}

function makeStyles(colours: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    card: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 12,
      marginTop: 10,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
      gap: 8,
      flexWrap: "wrap",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    title: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    scoreBadge: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    body: {
      maxHeight: 340,
    },
    questionBlock: {
      marginBottom: 16,
    },
    questionText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      lineHeight: 21,
      marginBottom: 10,
    },
    optionsList: {
      gap: 8,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
      minHeight: 44,
    },
    optionKey: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    optionText: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
    feedback: {
      borderRadius: 10,
      borderWidth: 1,
      padding: 10,
      marginTop: 8,
      gap: 4,
    },
    feedbackTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    feedbackText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      lineHeight: 19,
    },
    results: {
      borderTopWidth: 1,
      paddingTop: 12,
      marginTop: 12,
      gap: 10,
    },
    resultsScore: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
    },
    resultsScoreStrong: {
      fontFamily: "Inter_700Bold",
    },
    resultsPerfect: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    resultsActions: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
    },
    actionBtn: {
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      minHeight: 40,
    },
    errorCard: {
      backgroundColor: "transparent",
      borderRadius: 14,
      borderWidth: 1,
      padding: 12,
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    saveError: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 8,
      padding: 8,
      marginBottom: 8,
    },
    saveErrorText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      flex: 1,
    },
  });
}