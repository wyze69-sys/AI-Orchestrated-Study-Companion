import { Feather } from "@expo/vector-icons";
import {
  useCreateSession,
  useDeleteSession,
  useListSessions,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Session {
  id: string;
  title: string;
  documentCount: number;
  messageCount: number;
  lastAccessed: string;
  createdAt: string;
}

export default function SessionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const styles = makeStyles(colors);
  const { data: sessions, isLoading, refetch } = useListSessions();
  const { mutate: createSession, isPending: creating } = useCreateSession();
  const { mutate: deleteSession } = useDeleteSession();

  function handleCreate() {
    if (!newTitle.trim()) return;
    createSession(
      { data: { title: newTitle.trim() } },
      {
        onSuccess: () => {
          setNewTitle("");
          setShowCreate(false);
          qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  }

  function handleDelete(session: Session) {
    Alert.alert(
      "Delete Session",
      `Delete "${session.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteSession(
              { id: session.id },
              {
                onSuccess: () => {
                  qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                },
              },
            );
          },
        },
      ],
    );
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const renderSession = ({ item }: { item: Session }) => (
    <Pressable
      style={({ pressed }) => [
        styles.sessionCard,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={() => router.push(`/session/${item.id}`)}
      onLongPress={() => handleDelete(item)}
      testID={`session-card-${item.id}`}
    >
      <View style={styles.sessionCardTop}>
        <View style={[styles.sessionIcon, { backgroundColor: colors.accent }]}>
          <Feather name="book-open" size={18} color={colors.primary} />
        </View>
        <View style={styles.sessionMeta}>
          <Text style={[styles.sessionDate, { color: colors.mutedForeground }]}>
            {formatDate(item.lastAccessed)}
          </Text>
          <Pressable
            onPress={() => handleDelete(item)}
            hitSlop={8}
          >
            <Feather name="trash-2" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
      <Text style={[styles.sessionTitle, { color: colors.foreground }]} numberOfLines={2}>
        {item.title}
      </Text>
      <View style={styles.sessionStats}>
        <View style={styles.statBadge}>
          <Feather name="file-text" size={12} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>
            {item.documentCount} doc{item.documentCount !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.statBadge}>
          <Feather name="message-circle" size={12} color={colors.mutedForeground} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>
            {item.messageCount} msg{item.messageCount !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            Hello{user?.email ? `, ${user.email.split("@")[0]}` : ""}
          </Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>
            Study Sessions
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => setShowCreate(true)}
          testID="new-session-button"
        >
          <Feather name="plus" size={22} color={colors.primaryForeground} />
        </Pressable>
      </View>

      {showCreate && (
        <View style={[styles.createBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.createInput, { color: colors.foreground }]}
            placeholder="Session title..."
            placeholderTextColor={colors.mutedForeground}
            value={newTitle}
            onChangeText={setNewTitle}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            testID="session-title-input"
          />
          <Pressable
            style={({ pressed }) => [
              styles.createConfirm,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleCreate}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Feather name="check" size={18} color={colors.primaryForeground} />
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.createCancel, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { setShowCreate(false); setNewTitle(""); }}
          >
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={(sessions as Session[] | undefined) ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderSession}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          scrollEnabled={!!sessions && sessions.length > 0}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="book" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No sessions yet
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Tap the + button to create your first study session
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    headerBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
    },
    greeting: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      marginBottom: 2,
    },
    heading: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
    },
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    createBar: {
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    createInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    createConfirm: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    createCancel: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    listContent: { padding: 16, gap: 12 },
    sessionCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
    },
    sessionCardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    sessionIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    sessionMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    sessionDate: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },
    sessionTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      marginBottom: 10,
      lineHeight: 22,
    },
    sessionStats: {
      flexDirection: "row",
      gap: 12,
    },
    statBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    statText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 80,
      gap: 12,
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      paddingHorizontal: 32,
      lineHeight: 20,
    },
  });
}
