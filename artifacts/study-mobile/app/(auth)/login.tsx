import { Feather } from "@expo/vector-icons";
import { useLogin } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const passwordRef = useRef<TextInput>(null);
  const { mutate: loginMutation, isPending } = useLogin();
  const styles = makeStyles(colors);

  function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    setError("");
    loginMutation(
      { data: { email: email.trim(), password } },
      {
        onSuccess: async (data) => {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
          await login(data.token, data.user);
          router.replace("/(tabs)");
        },
        onError: () => {
          setError("Invalid email or password");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  }

  const topPad =
    Platform.OS === "web"
      ? 67
      : insets.top;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        style={[
          styles.container,
          { paddingTop: topPad + 48, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primary }]}>
            <Feather name="book-open" size={28} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Welcome back
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to your study account
          </Text>
        </View>

        <View style={styles.form}>
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="mail" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Email"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              testID="email-input"
            />
          </View>

          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="lock" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
            <TextInput
              ref={passwordRef}
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              testID="password-input"
            />
          </View>

          {error ? (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {error}
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleLogin}
            disabled={isPending}
            testID="login-button"
          >
            {isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Sign In
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            No account?{" "}
          </Text>
          <Pressable onPress={() => router.push("/(auth)/register")}>
            <Text style={[styles.linkText, { color: colors.primary }]}>
              Create one
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    container: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: "center",
    },
    header: { alignItems: "center", marginBottom: 40 },
    iconBadge: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    title: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    form: { gap: 12 },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 52,
    },
    inputIcon: { marginRight: 10 },
    input: {
      flex: 1,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
    },
    errorText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
    primaryBtn: {
      height: 52,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    primaryBtnText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 32,
    },
    footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
    linkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  });
}
