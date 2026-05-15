import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const styles = makeStyles(colors);

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

  const topPad = Platform.OS === "web" ? 67 : insets.top;

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
          ACCOUNT
        </Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
  });
}
