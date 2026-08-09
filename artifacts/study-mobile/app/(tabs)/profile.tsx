import { Feather } from "@expo/vector-icons";
import { useGetProgressSummary } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest, MobileApiError } from "@/lib/api";
import { useState } from "react";

interface ProgressSummary {
  totalCompletedQuizzes?: number;
  averageQuizPercentage?: number;
  bestQuizPercentage?: number;
  totalFlashcardsReviewed?: number;
  knownFlashcardsCount?: number;
  reviewAgainFlashcardsCount?: number;
  currentStreak?: number;
  longestStreak?: number;
  activeStudyDays?: number;
  lastStudyDate?: string | null;
  weakTopics?: Array<{ topic: string; attempts: number; incorrectTotal: number; accuracy: number }>;
  recentActivity?: {
    latestQuiz?: { percentage?: number; completedAt?: string } | null;
    latestFlashcardActivity?: { status?: string; updatedAt?: string } | null;
  } | null;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, logout } = useAuth();
  const styles = makeStyles(colors);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: progress, isLoading: progressLoading } = useGetProgressSummary<ProgressSummary>();

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          );
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  function openDeleteAccount() {
    setDeleteConfirm("");
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function handleDeleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== "DELETE") {
      setDeleteError("Type DELETE to confirm");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest("/auth/me", { method: "DELETE", token });
      await logout();
      router.replace("/(auth)/login");
    } catch (err) {
      setDeleteError(err instanceof MobileApiError ? err.message : "Failed to delete account.");
      setDeleting(false);
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const stats = [
    { label: "Quizzes completed", value: progress?.totalCompletedQuizzes ?? 0, icon: "check-square" as const },
    { label: "Avg score", value: `${progress?.averageQuizPercentage ?? 0}%`, icon: "trending-up" as const },
    { label: "Best score", value: `${progress?.bestQuizPercentage ?? 0}%`, icon: "award" as const },
    { label: "Cards reviewed", value: progress?.totalFlashcardsReviewed ?? 0, icon: "layers" as const },
    { label: "Current streak", value: progress?.currentStreak ?? 0, icon: "zap" as const },
    { label: "Best streak", value: progress?.longestStreak ?? 0, icon: "star" as const },
  ];

  const weakTopics = progress?.weakTopics ?? [];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: insets.bottom + 34,
        paddingHorizontal: 20,
      }}
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>
        Profile
      </Text>

      <View style={[styles.avatarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={[styles.avatarInitial, { color: colors.primaryForeground }]}>
            {user?.email?.charAt(0).toUpperCase() ?? "U"}
          </Text>
        </View>
        <View style={styles.avatarInfo}>
          <Text style={[styles.avatarEmail, { color: colors.foreground }]}>
            {user?.email ?? ""}
          </Text>
          <Text style={[styles.avatarMeta, { color: colors.mutedForeground }]}>
            Joined{" "}
            {user?.createdAt
              ? new Date(user.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })
              : ""}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          PROGRESS
        </Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {progressLoading ? (
            <View style={styles.progressLoading}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={[styles.progressLoadingText, { color: colors.mutedForeground }]}>
                Loading study progress…
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.statsGrid}>
                {stats.map((stat) => (
                  <View key={stat.label} style={[styles.statCell, { borderColor: colors.border }]}>
                    <Feather name={stat.icon} size={14} color={colors.primary} />
                    <Text style={[styles.statValue, { color: colors.foreground }]}>{stat.value}</Text>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
                  </View>
                ))}
              </View>
              {weakTopics.length > 0 && (
                <View style={[styles.weakBox, { borderColor: colors.border }]}>
                  <Text style={[styles.weakTitle, { color: colors.foreground }]}>
                    Weak topics — focus on these
                  </Text>
                  {weakTopics.map((topic) => (
                    <View key={topic.topic} style={[styles.weakRow, { borderColor: colors.border }]}>
                      <View style={styles.weakLeft}>
                        <Text style={[styles.weakName, { color: colors.foreground }]}>{topic.topic}</Text>
                        <Text style={[styles.weakMeta, { color: colors.mutedForeground }]}>
                          {topic.attempts} attempt{topic.attempts === 1 ? "" : "s"} · {topic.incorrectTotal} incorrect
                        </Text>
                      </View>
                      <Text style={[styles.weakAccuracy, { color: colors.destructive }]}>
                        {topic.accuracy}%
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {progress?.recentActivity?.latestQuiz ? (
                <View style={[styles.recentRow, { borderColor: colors.border }]}>
                  <Feather name="check-square" size={14} color={colors.primary} />
                  <Text style={[styles.recentText, { color: colors.mutedForeground }]}>
                    Latest quiz: {progress.recentActivity.latestQuiz.percentage ?? 0}% on{" "}
                    {progress.recentActivity.latestQuiz.completedAt
                      ? new Date(progress.recentActivity.latestQuiz.completedAt).toLocaleDateString()
                      : "—"}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          ACCOUNT
        </Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={openDeleteAccount}
            testID="delete-account-button"
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: colors.destructive + "18" }]}>
                <Feather name="trash-2" size={18} color={colors.destructive} />
              </View>
              <Text style={[styles.menuItemText, { color: colors.destructive }]}>
                Delete Account
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleLogout}
            testID="logout-button"
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: colors.destructive + "18" }]}>
                <Feather name="log-out" size={18} color={colors.destructive} />
              </View>
              <Text style={[styles.menuItemText, { color: colors.destructive }]}>
                Sign Out
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          ABOUT
        </Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: colors.accent }]}>
                <Feather name="info" size={18} color={colors.accentForeground} />
              </View>
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>
                AI Study Companion
              </Text>
            </View>
            <Text style={[styles.menuItemValue, { color: colors.mutedForeground }]}>
              v1.0
            </Text>
          </View>
        </View>
      </View>

      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteOpen(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Delete account?
            </Text>
            <Text style={[styles.modalText, { color: colors.mutedForeground }]}>
              This permanently deletes your account and all of your sessions, documents,
              messages, quiz results and flashcard progress. This cannot be undone.
            </Text>
            <Text style={[styles.modalText, { color: colors.mutedForeground }]}>
              Type DELETE to confirm.
            </Text>
            {deleteError ? (
              <Text style={[styles.modalError, { color: colors.destructive }]}>{deleteError}</Text>
            ) : null}
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="DELETE"
              placeholderTextColor={colors.mutedForeground}
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              autoFocus
              testID="delete-account-confirm-input"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                onPress={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                <Text style={[styles.modalButtonText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonDanger,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={handleDeleteAccount}
                disabled={deleting || deleteConfirm.trim().toUpperCase() !== "DELETE"}
                testID="delete-account-confirm"
              >
                <Text style={[styles.modalButtonText, { color: "#ffffff" }]}>
                  {deleting ? "Deleting…" : "Delete account"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    heading: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      marginBottom: 20,
    },
    avatarCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 28,
      gap: 14,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
    },
    avatarInfo: { flex: 1 },
    avatarEmail: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      marginBottom: 2,
    },
    avatarMeta: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
    section: { marginBottom: 20 },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      marginBottom: 8,
      marginLeft: 4,
    },
    menuCard: {
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    menuItemLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    menuIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    menuItemText: {
      fontSize: 16,
      fontFamily: "Inter_500Medium",
    },
    menuItemValue: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
    progressLoading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 20,
    },
    progressLoadingText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      padding: 12,
    },
    statCell: {
      width: "30.5%",
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
      gap: 4,
      alignItems: "flex-start",
    },
    statValue: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
    },
    statLabel: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      lineHeight: 14,
    },
    weakBox: {
      borderWidth: 1,
      borderRadius: 12,
      marginHorizontal: 12,
      marginBottom: 12,
      padding: 12,
      gap: 8,
    },
    weakTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    weakRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 8,
    },
    weakLeft: { flex: 1, gap: 2 },
    weakName: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    weakMeta: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
    },
    weakAccuracy: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
    },
    recentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderTopWidth: 1,
      padding: 12,
    },
    recentText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      flex: 1,
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth,
    },
    modalBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      maxWidth: 400,
      borderRadius: 16,
      borderWidth: 1,
      padding: 20,
      gap: 10,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
    },
    modalText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      lineHeight: 19,
    },
    modalError: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
    },
    modalInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 4,
    },
    modalButton: {
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    modalButtonDanger: {
      backgroundColor: colors.destructive,
      borderColor: colors.destructive,
    },
    modalButtonText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
  });
}
