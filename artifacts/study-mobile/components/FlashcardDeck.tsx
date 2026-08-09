import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { MobileApiError, apiRequest } from "@/lib/api";
import {
  MasteryStatus,
  Flashcard,
  calculateMasteryStats,
  getFlashcardNavState,
  parseFlashcardResponse,
} from "@/lib/flashcards";

interface FlashcardDeckProps {
  content: string;
  sessionId: string;
  documentId: string | null;
  messageId: string | null;
  token: string | null;
  initialMastery?: Record<string, string>;
  onSelectSource?: (citation: { quote: string; startLine: number | null; endLine: number | null }) => void;
}

/**
 * Mobile interactive flashcard deck. Mirrors the web FlashcardDeck behavior:
 * flip, prev/next, known/review from the back face only, mastery counters,
 * optimistic persistence with non-blocking failure, hydration from initial
 * mastery, and an explicit confirm-gated reset.
 */
export function FlashcardDeck({
  content,
  sessionId,
  documentId,
  messageId,
  token,
  initialMastery = {},
  onSelectSource,
}: FlashcardDeckProps) {
  const parsed = useMemo(() => parseFlashcardResponse(content), [content]);
  const cards = parsed?.cards ?? [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteryState, setMasteryState] = useState<Record<string, MasteryStatus>>(
    () => toMasteryMap(initialMastery)
  );
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const colours = useColors();
  const styles = makeStyles(colours);

  // Hydrate saved statuses without overwriting newer local actions.
  useEffect(() => {
    if (initialMastery && Object.keys(initialMastery).length > 0) {
      setMasteryState((prev) => ({ ...toMasteryMap(initialMastery), ...prev }));
    }
  }, [initialMastery]);

  const nav = getFlashcardNavState(currentIndex, cards.length);
  const stats = calculateMasteryStats(cards, masteryState);
  const currentCard: Flashcard | undefined = cards[currentIndex];
  const currentStatus = currentCard ? masteryState[currentCard.id] ?? null : null;

  const persistItem = useCallback(
    async (payload: { cardId: string; status: MasteryStatus }) => {
      await apiRequest(`/sessions/${sessionId}/flashcards/progress`, {
        method: "POST",
        token,
        body: [payload],
      });
    },
    [sessionId, token]
  );

  const handleFlip = useCallback(() => {
    setIsFlipped((f) => !f);
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : i));
    setIsFlipped(false);
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => (i < cards.length - 1 ? i + 1 : i));
    setIsFlipped(false);
  }, [cards.length]);

  const handleSetMastery = useCallback(
    async (cardId: string, status: MasteryStatus) => {
      // Optimistic update keeps the UI responsive.
      setMasteryState((prev) => ({ ...prev, [cardId]: status }));
      setPersistenceError(null);

      try {
        await persistItem({ cardId: String(cardId), status });
      } catch (err) {
        setPersistenceError(
          err instanceof MobileApiError ? err.message : "Failed to save progress to server."
        );
      }
    },
    [persistItem]
  );

  const handleResetPress = useCallback(() => {
    // Explicit confirmation before wiping review progress.
    Alert.alert(
      "Reset review statuses",
      "This clears Known/Review progress for every card in this deck.",
      [
        { text: "Cancel", style: "cancel", onPress: () => setConfirmResetOpen(false) },
        {
          text: "Yes, reset",
          style: "destructive",
          onPress: () => handleConfirmReset(),
        },
      ]
    );
    setConfirmResetOpen(true);
  }, []);

  const handleConfirmReset = useCallback(async () => {
    setConfirmResetOpen(false);
    // Optimistic reset
    setMasteryState({});
    setPersistenceError(null);

    try {
      await apiRequest(`/sessions/${sessionId}/flashcards/progress`, {
        method: "DELETE",
        token,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setPersistenceError(
        err instanceof MobileApiError ? err.message : "Failed to reset progress on server."
      );
    }
  }, [sessionId, token]);

  const handleSourcePress = useCallback(() => {
    if (!currentCard?.citation || !onSelectSource) return;
    onSelectSource(currentCard.citation);
  }, [currentCard, onSelectSource]);

  if (!parsed || cards.length === 0) {
    if (
      parsed?.error &&
      typeof content === "string" &&
      (content.toLowerCase().includes("flashcard") || content.toLowerCase().includes("q:"))
    ) {
      return (
        <View style={[styles.errorCard, { borderColor: colours.destructive }]} testID="fc-error">
          <Text style={[styles.errorTitle, { color: colours.destructive }]}>Unable to parse flashcards</Text>
          <Text style={[styles.errorText, { color: colours.mutedForeground }]}>
            The response could not be formatted into interactive flashcards.
          </Text>
        </View>
      );
    }
    return null;
  }

  return (
    <View style={[styles.deck, { backgroundColor: colours.card, borderColor: colours.border }]} testID="fc-deck">
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="layers" size={14} color={colours.primary} />
          <Text style={[styles.title, { color: colours.foreground }]}>Flashcards</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={[styles.stat, { color: colours.primary }]} testID="fc-stat-known">
            Known: {stats.knownCount}
          </Text>
          <Text style={[styles.stat, { color: colours.destructive }]} testID="fc-stat-review">
            Review: {stats.reviewCount}
          </Text>
          <Text style={[styles.stat, { color: colours.mutedForeground }]} testID="fc-stat-unreviewed">
            Unread: {stats.unreviewedCount}
          </Text>
        </View>
        <Text style={[styles.position, { color: colours.mutedForeground }]} testID="fc-position">
          {nav.displayPosition}
        </Text>
      </View>

      {persistenceError && (
        <View style={[styles.persistenceError, { borderColor: colours.destructive }]} testID="fc-persistence-error">
          <Text style={[styles.persistenceErrorText, { color: colours.destructive }]}>
            {persistenceError}
          </Text>
          <Pressable hitSlop={8} onPress={() => setPersistenceError(null)}>
            <Feather name="x" size={14} color={colours.mutedForeground} />
          </Pressable>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colours.background, borderColor: colours.border, opacity: pressed ? 0.9 : 1 },
        ]}
        onPress={handleFlip}
        accessibilityRole="button"
        accessibilityLabel={
          isFlipped
            ? `Card ${currentIndex + 1} back: ${currentCard?.back}. Tap to flip to the question.`
            : `Card ${currentIndex + 1} front: ${currentCard?.front}. Tap to reveal the answer.`
        }
        testID="fc-card"
      >
        <Text style={[styles.faceLabel, { color: colours.mutedForeground }]}>
          {isFlipped ? "ANSWER" : "QUESTION"}
        </Text>
        <Text style={[styles.faceText, { color: colours.foreground }]}>
          {isFlipped ? currentCard?.back : currentCard?.front}
        </Text>

        {isFlipped && currentCard?.explanation ? (
          <Text style={[styles.explanation, { color: colours.mutedForeground }]}>{currentCard.explanation}</Text>
        ) : null}

        {isFlipped && (
          <View style={styles.backActions}>
            {currentCard?.citation?.quote && (
              <Pressable
                style={({ pressed }) => [
                  styles.citationChip,
                  { backgroundColor: colours.muted, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={handleSourcePress}
                hitSlop={4}
                testID="fc-citation-chip"
              >
                <Feather name="book-open" size={12} color={colours.primary} />
                <Text style={[styles.citationChipText, { color: colours.primary }]}>View source</Text>
              </Pressable>
            )}
            <View style={styles.masteryRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.masteryBtn,
                  { borderColor: colours.border, opacity: pressed ? 0.8 : 1 },
                  currentStatus === "known" && { borderColor: colours.primary, backgroundColor: colours.primary + "12" },
                ]}
                onPress={() => currentCard && handleSetMastery(currentCard.id, "known")}
                accessibilityRole="button"
                accessibilityState={{ selected: currentStatus === "known" }}
                testID="fc-btn-known"
              >
                <Text style={[styles.masteryBtnText, { color: colours.foreground }]}>
                  {currentStatus === "known" ? "✓ " : ""}Known
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.masteryBtn,
                  { borderColor: colours.border, opacity: pressed ? 0.8 : 1 },
                  currentStatus === "review" && { borderColor: colours.destructive, backgroundColor: colours.destructive + "12" },
                ]}
                onPress={() => currentCard && handleSetMastery(currentCard.id, "review")}
                accessibilityRole="button"
                accessibilityState={{ selected: currentStatus === "review" }}
                testID="fc-btn-review"
              >
                <Text style={[styles.masteryBtnText, { color: colours.foreground }]}>
                  {currentStatus === "review" ? "✖ " : ""}Review again
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={[styles.flipHint, { color: colours.mutedForeground }]} aria-hidden>
          {isFlipped ? "Tap to see question" : "Tap to reveal answer"}
        </Text>
      </Pressable>

      <View style={styles.navRow}>
        <Pressable
          style={({ pressed }) => [
            styles.navBtn,
            { borderColor: colours.border, opacity: nav.canGoBack ? (pressed ? 0.7 : 1) : 0.4 },
          ]}
          onPress={handlePrev}
          disabled={!nav.canGoBack}
          accessibilityLabel="Previous card"
          testID="fc-btn-prev"
        >
          <Feather name="chevron-left" size={16} color={colours.foreground} />
          <Text style={{ color: colours.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Prev</Text>
        </Pressable>

        <View style={styles.dots}>
          {cards.map((card, i) => (
            <View
              key={card.id || i}
              style={[
                styles.dot,
                { backgroundColor: i === currentIndex ? colours.primary : colours.muted },
                masteryState[card.id] === "known" && { backgroundColor: colours.primary },
                masteryState[card.id] === "review" && { backgroundColor: colours.destructive },
              ]}
            />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.navBtn,
            { borderColor: colours.border, opacity: nav.canGoForward ? (pressed ? 0.7 : 1) : 0.4 },
          ]}
          onPress={handleNext}
          disabled={!nav.canGoForward}
          accessibilityLabel="Next card"
          testID="fc-btn-next"
        >
          <Text style={{ color: colours.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Next</Text>
          <Feather name="chevron-right" size={16} color={colours.foreground} />
        </Pressable>
      </View>

      {stats.isCompleted && (
        <View style={[styles.completion, { borderTopColor: colours.border }]} testID="fc-completion">
          <Text style={[styles.completionTitle, { color: colours.foreground }]}>
            Deck completed
          </Text>
          <Text style={[styles.completionStats, { color: colours.mutedForeground }]}>
            You marked {stats.knownCount} as Known and {stats.reviewCount} to Review again.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.resetBtn,
              { borderColor: colours.border, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleResetPress}
            testID="fc-btn-reset"
          >
            <Text style={{ color: colours.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
              Reset review statuses
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function toMasteryMap(raw: Record<string, string>): Record<string, MasteryStatus> {
  const out: Record<string, MasteryStatus> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === "known" || value === "review") out[key] = value;
  }
  return out;
}

function makeStyles(colours: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    deck: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 12,
      marginTop: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      rowGap: 6,
      marginBottom: 10,
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
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    stat: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
    },
    position: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
    },
    persistenceError: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 8,
      padding: 8,
      marginBottom: 8,
    },
    persistenceErrorText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      flex: 1,
    },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 20,
      minHeight: 170,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
    },
    faceLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 1.2,
    },
    faceText: {
      fontSize: 16,
      fontFamily: "Inter_500Medium",
      textAlign: "center",
      lineHeight: 22,
    },
    explanation: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 17,
    },
    backActions: {
      marginTop: 8,
      gap: 10,
      alignItems: "center",
    },
    citationChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    citationChipText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
    },
    masteryRow: {
      flexDirection: "row",
      gap: 10,
    },
    masteryBtn: {
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 14,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    masteryBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    flipHint: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
    },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
    },
    navBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
      minHeight: 40,
    },
    dots: {
      flexDirection: "row",
      gap: 5,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    completion: {
      borderTopWidth: 1,
      marginTop: 12,
      paddingTop: 12,
      gap: 8,
      alignItems: "center",
    },
    completionTitle: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
    },
    completionStats: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
    resetBtn: {
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 14,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    errorCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 12,
      marginTop: 10,
      gap: 4,
    },
    errorTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    errorText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },
  });
}