import { Feather } from "@expo/vector-icons";
import {
  useDeleteDocument,
  useGetSession,
  useListMessages,
  useUpdateSessionNotes,
  getGetSessionQueryKey,
  getListDocumentsQueryKey,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import * as DocumentPicker from "expo-document-picker";
import { fetch as expoFetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { DocumentPreviewSheet } from "@/components/DocumentPreviewSheet";
import type { Document } from "@/types/document";

type Tab = "documents" | "chat" | "notes";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let msgCounter = 0;
function genId() {
  msgCounter++;
  return `msg-${Date.now()}-${msgCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

export default function SessionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const qc = useQueryClient();
  const styles = makeStyles(colors);

  const [activeTab, setActiveTab] = useState<Tab>("documents");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const chatInputRef = useRef<TextInput>(null);
  const initializedChat = useRef(false);
  const initializedNotes = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const { data: session, isLoading: sessionLoading } = useGetSession(id ?? "");
  const { data: historyMessages } = useListMessages(id ?? "");
  const { mutate: deleteDoc } = useDeleteDocument();
  const { mutate: saveNotes } = useUpdateSessionNotes();

  useEffect(() => {
    if (session?.notes && !initializedNotes.current) {
      setNotesText(session.notes ?? "");
      initializedNotes.current = true;
    }
  }, [session?.notes]);

  useEffect(() => {
    if (historyMessages && historyMessages.length > 0 && !initializedChat.current) {
      const msgs: ChatMessage[] = (historyMessages as Array<{id: string; role: string; content: string}>).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      setMessages(msgs);
      initializedChat.current = true;
    }
  }, [historyMessages]);

  // Abort the stream and mark unmounted so in-flight async callbacks know not
  // to update state after the screen is gone.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      chatAbortRef.current?.abort();
    };
  }, []);

  const handleUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/markdown", "text/x-markdown"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploading(true);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        type: asset.mimeType ?? "text/plain",
        name: asset.name,
      } as unknown as Blob);

      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
        : "";

      const response = await expoFetch(`${baseUrl}/api/sessions/${id}/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      await qc.invalidateQueries({ queryKey: getGetSessionQueryKey(id ?? "") });
      await qc.invalidateQueries({ queryKey: getListDocumentsQueryKey(id ?? "") });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Upload Failed", "Could not upload the file. Only .txt and .md files are supported.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploading(false);
    }
  }, [id, token, qc]);

  const handleDeleteDoc = useCallback((doc: Document) => {
    Alert.alert("Delete Document", `Delete "${doc.filename}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (selectedDoc?.id === doc.id) setSelectedDoc(null);
          deleteDoc(
            { id: doc.id },
            {
              onSuccess: () => {
                qc.invalidateQueries({ queryKey: getGetSessionQueryKey(id ?? "") });
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              },
            },
          );
        },
      },
    ]);
  }, [selectedDoc, deleteDoc, qc, id]);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || isStreaming || !selectedDoc) return;

    const text = chatInput.trim();
    const userMsg: ChatMessage = { id: genId(), role: "user", content: text };

    // Cancel any previous in-flight stream before starting a new one.
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    setChatInput("");
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setShowTyping(true);

    let fullContent = "";
    let assistantAdded = false;

    try {
      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
        : "";

      const response = await expoFetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: id,
          documentId: selectedDoc.id,
          message: text,
          includeNotes: notesText.trim().length > 0,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Chat request failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;

      while (true) {
        if (streamDone) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.done) { streamDone = true; break; }
            if (parsed.content) {
              fullContent += parsed.content;
              if (!assistantAdded) {
                setShowTyping(false);
                setMessages((prev) => [
                  ...prev,
                  { id: genId(), role: "assistant", content: fullContent },
                ]);
                assistantAdded = true;
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: fullContent,
                  };
                  return updated;
                });
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      // Silently ignore intentional aborts (screen unmount, new message sent).
      if (err instanceof Error && err.name === "AbortError") return;
      // Skip state updates if the screen unmounted during the async call.
      if (!isMountedRef.current) return;
      setShowTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      // finally always runs — guard against writing state to an unmounted tree.
      if (isMountedRef.current) {
        setIsStreaming(false);
        setShowTyping(false);
        qc.invalidateQueries({ queryKey: getListMessagesQueryKey(id ?? "") });
      }
    }

    setTimeout(() => chatInputRef.current?.focus(), 100);
  }, [chatInput, isStreaming, selectedDoc, id, token, notesText, qc]);

  function handleSaveNotes() {
    setNotesSaving(true);
    saveNotes(
      { id: id ?? "", data: { notes: notesText } },
      {
        onSuccess: () => {
          setNotesSaving(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: () => {
          setNotesSaving(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const docs = (session?.documents as Document[] | undefined) ?? [];

  if (sessionLoading) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.topBar,
          { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <Pressable style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]} numberOfLines={1}>
          {session?.title ?? "Session"}
        </Text>
        {activeTab === "documents" && (
          <Pressable
            style={({ pressed }) => [
              styles.uploadBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleUpload}
            disabled={uploading}
            testID="upload-button"
          >
            {uploading ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Feather name="upload" size={16} color={colors.primaryForeground} />
            )}
          </Pressable>
        )}
        {activeTab !== "documents" && <View style={styles.uploadBtn} />}
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        {(["documents", "chat", "notes"] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.tabItem,
              activeTab === tab && [styles.tabItemActive, { borderBottomColor: colors.primary }],
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Feather
              name={tab === "documents" ? "file-text" : tab === "chat" ? "message-circle" : "edit-3"}
              size={16}
              color={activeTab === tab ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab ? colors.primary : colors.mutedForeground },
                activeTab === tab && styles.tabLabelActive,
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "documents" && (
        <FlatList
          data={docs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listPad, { paddingBottom: insets.bottom + 34 }]}
          scrollEnabled={docs.length > 0}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.docCard,
                {
                  backgroundColor: selectedDoc?.id === item.id ? colors.accent : colors.card,
                  borderColor: selectedDoc?.id === item.id ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={() => {
                setPreviewDoc(item);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              testID={`doc-card-${item.id}`}
            >
              <View style={styles.docCardLeft}>
                <View style={[styles.docIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="file-text" size={18} color={colors.primary} />
                </View>
                <View style={styles.docInfo}>
                  <Text style={[styles.docName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.filename}
                  </Text>
                  <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>
                    {new Date(item.uploadedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
              </View>
              <View style={styles.docActions}>
                {selectedDoc?.id === item.id && (
                  <View style={[styles.selectedBadge, { backgroundColor: colors.primary }]}>
                    <Feather name="check" size={12} color={colors.primaryForeground} />
                  </View>
                )}
                <Pressable
                  onPress={() => handleDeleteDoc(item)}
                  hitSlop={8}
                >
                  <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="file-plus" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No documents
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Tap the upload icon to add a .txt or .md file
              </Text>
            </View>
          }
        />
      )}

      {activeTab === "chat" && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          {!selectedDoc ? (
            <View style={styles.center}>
              <Feather name="file-text" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Select a document first
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Tap a document, then tap "Use in chat" to get started
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.goDocsBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={() => setActiveTab("documents")}
              >
                <Text style={[styles.goDocsBtnText, { color: colors.primaryForeground }]}>
                  Go to Documents
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.docChip, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
                <Feather name="file-text" size={14} color={colors.primary} />
                <Text style={[styles.docChipText, { color: colors.accentForeground }]} numberOfLines={1}>
                  {selectedDoc.filename}
                </Text>
                <Pressable onPress={() => setSelectedDoc(null)}>
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <FlatList
                data={[...messages].reverse()}
                keyExtractor={(item) => item.id}
                inverted={messages.length > 0}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chatList}
                ListHeaderComponent={
                  showTyping ? (
                    <View style={[styles.typingBubble, { backgroundColor: colors.card }]}>
                      <ActivityIndicator color={colors.primary} size="small" />
                    </View>
                  ) : null
                }
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.msgBubble,
                      item.role === "user"
                        ? [styles.msgUser, { backgroundColor: colors.primary }]
                        : [styles.msgAssistant, { backgroundColor: colors.card, borderColor: colors.border }],
                    ]}
                  >
                    <Text
                      style={[
                        styles.msgText,
                        { color: item.role === "user" ? colors.primaryForeground : colors.foreground },
                      ]}
                    >
                      {item.content}
                    </Text>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.chatEmpty}>
                    <Feather name="message-circle" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.chatEmptyText, { color: colors.mutedForeground }]}>
                      Ask anything about this document
                    </Text>
                  </View>
                }
              />
              <View
                style={[
                  styles.chatInputBar,
                  {
                    backgroundColor: colors.background,
                    borderTopColor: colors.border,
                    paddingBottom: insets.bottom + 8,
                  },
                ]}
              >
                <TextInput
                  ref={chatInputRef}
                  style={[
                    styles.chatInput,
                    { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
                  ]}
                  placeholder="Ask about this document..."
                  placeholderTextColor={colors.mutedForeground}
                  value={chatInput}
                  onChangeText={setChatInput}
                  multiline
                  blurOnSubmit={false}
                  testID="chat-input"
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.sendBtn,
                    {
                      backgroundColor: chatInput.trim() && !isStreaming ? colors.primary : colors.muted,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  onPress={handleSendChat}
                  disabled={!chatInput.trim() || isStreaming}
                  testID="send-button"
                >
                  <Feather
                    name="send"
                    size={18}
                    color={chatInput.trim() && !isStreaming ? colors.primaryForeground : colors.mutedForeground}
                  />
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      )}

      {activeTab === "notes" && (
        <View style={{ flex: 1 }}>
          <TextInput
            style={[
              styles.notesInput,
              { color: colors.foreground, backgroundColor: colors.background },
            ]}
            placeholder="Write your notes here..."
            placeholderTextColor={colors.mutedForeground}
            value={notesText}
            onChangeText={setNotesText}
            multiline
            textAlignVertical="top"
            testID="notes-input"
          />
          <View
            style={[
              styles.notesSaveBar,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.background,
                paddingBottom: insets.bottom + 8,
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleSaveNotes}
              disabled={notesSaving}
              testID="save-notes-button"
            >
              {notesSaving ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <>
                  <Feather name="save" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
                    Save Notes
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <DocumentPreviewSheet
        document={previewDoc}
        isSelectedForChat={previewDoc !== null && selectedDoc?.id === previewDoc.id}
        onClose={() => setPreviewDoc(null)}
        onToggleChatSelection={(doc) => {
          setSelectedDoc((prev) => (prev?.id === doc.id ? null : doc));
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      gap: 12,
    },
    topTitle: {
      flex: 1,
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
    },
    uploadBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    tabBar: {
      flexDirection: "row",
      borderBottomWidth: 1,
    },
    tabItem: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      gap: 6,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabItemActive: { borderBottomWidth: 2 },
    tabLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
    tabLabelActive: { fontFamily: "Inter_600SemiBold" },
    listPad: { padding: 16, gap: 10 },
    docCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
    },
    docCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    docIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    docInfo: { flex: 1 },
    docName: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 2 },
    docMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
    docActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    selectedBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyState: { alignItems: "center", paddingVertical: 60, gap: 10 },
    emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
    goDocsBtn: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 8,
    },
    goDocsBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    docChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginHorizontal: 12,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
    },
    docChipText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
    chatList: { paddingHorizontal: 12, paddingVertical: 16, gap: 10 },
    typingBubble: {
      alignSelf: "flex-start",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
      marginBottom: 6,
    },
    msgBubble: {
      maxWidth: "80%",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
      marginBottom: 4,
    },
    msgUser: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
    msgAssistant: {
      alignSelf: "flex-start",
      borderBottomLeftRadius: 4,
      borderWidth: 1,
    },
    msgText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
    chatEmpty: { alignItems: "center", paddingVertical: 60, gap: 10 },
    chatEmptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
    chatInputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 10,
      borderTopWidth: 1,
    },
    chatInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 10,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      maxHeight: 120,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    notesInput: {
      flex: 1,
      padding: 16,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      lineHeight: 24,
    },
    notesSaveBar: {
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: 1,
    },
    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      height: 48,
      borderRadius: 12,
      gap: 8,
    },
    saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  });
}
