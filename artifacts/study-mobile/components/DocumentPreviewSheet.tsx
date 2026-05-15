import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useColors } from "@/hooks/useColors";
import type { Document } from "@/types/document";

interface DocumentPreviewSheetProps {
  document: Document | null;
  isSelectedForChat: boolean;
  onClose: () => void;
  onToggleChatSelection: (doc: Document) => void;
}

const SHEET_HEIGHT = Dimensions.get("window").height * 0.85;

function isPdf(doc: Document) {
  return (
    doc.mimeType === "application/pdf" ||
    doc.filename.toLowerCase().endsWith(".pdf")
  );
}

function buildPdfHtml(content: string, isDark: boolean) {
  const bg = isDark ? "#1a1a1a" : "#ffffff";
  const text = isDark ? "#e5e5e5" : "#1a1a1a";
  const muted = isDark ? "#888" : "#666";
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${bg};
    color: ${text};
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.7;
    padding: 16px;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: ${muted}22;
    border: 1px solid ${muted}44;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 16px;
    font-size: 12px;
    color: ${muted};
  }
  .label {
    font-size: 11px;
    font-weight: 600;
    color: ${muted};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }
  pre {
    white-space: pre-wrap;
    word-break: break-word;
    color: ${text};
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.7;
  }
</style>
</head>
<body>
  <div class="banner">&#128196; Extracted text preview — original PDF formatting may differ</div>
  ${escaped ? `<p class="label">Content</p><pre>${escaped}</pre>` : `<p class="label" style="text-align:center;margin-top:48px;">No content extracted from this PDF</p>`}
</body>
</html>`;
}

export function DocumentPreviewSheet({
  document,
  isSelectedForChat,
  onClose,
  onToggleChatSelection,
}: DocumentPreviewSheetProps) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const visible = document !== null;

  const isDark = colorScheme === "dark";

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
          mass: 0.8,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const formattedDate = document
    ? new Date(document.uploadedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  const docIsPdf = document ? isPdf(document) : false;

  function renderContent() {
    if (!document) return null;

    if (docIsPdf) {
      const html = buildPdfHtml(document.content ?? "", isDark);
      return (
        <WebView
          source={{ html }}
          style={[styles.webView, { backgroundColor: colors.background }]}
          scrollEnabled
          showsVerticalScrollIndicator
          originWhitelist={["*"]}
          testID="preview-webview"
        />
      );
    }

    if (document.content) {
      return (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          testID="preview-scroll"
        >
          <Text style={[styles.contentText, { color: colors.foreground }]}>
            {document.content}
          </Text>
        </ScrollView>
      );
    }

    return (
      <View style={[styles.scroll, styles.emptyContent]}>
        <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No content available
        </Text>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={[styles.headerIcon, { backgroundColor: colors.muted }]}>
              <Feather
                name={docIsPdf ? "file" : "file-text"}
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={styles.headerText}>
              <Text
                style={[styles.headerTitle, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {document?.filename ?? ""}
              </Text>
              <Text style={[styles.headerMeta, { color: colors.mutedForeground }]}>
                {formattedDate}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: colors.muted, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handleClose}
              testID="preview-close-button"
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.contentArea}>{renderContent()}</View>

          <View
            style={[
              styles.footer,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.background,
                paddingBottom: insets.bottom + (Platform.OS === "web" ? 16 : 8),
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.chatBtn,
                {
                  backgroundColor: isSelectedForChat ? colors.accent : colors.primary,
                  borderColor: isSelectedForChat ? colors.primary : "transparent",
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={() => document && onToggleChatSelection(document)}
              testID="preview-use-in-chat-button"
            >
              <Feather
                name={isSelectedForChat ? "check-circle" : "message-circle"}
                size={16}
                color={isSelectedForChat ? colors.primary : colors.primaryForeground}
              />
              <Text
                style={[
                  styles.chatBtnText,
                  { color: isSelectedForChat ? colors.primary : colors.primaryForeground },
                ]}
              >
                {isSelectedForChat ? "Selected for chat" : "Use in chat"}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  sheet: {
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  headerMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  contentArea: { flex: 1 },
  webView: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  contentText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  emptyContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1.5,
  },
  chatBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
