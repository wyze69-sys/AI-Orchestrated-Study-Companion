import { Feather } from "@expo/vector-icons";
import { useRegister } from "@workspace/api-client-react";
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

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const { mutate: registerMutation, isPending } = useRegister();
  const styles = makeStyles(colors);

  function handleRegister() {
    if (!email.trim() || !password.trim() || !confirm.trim()) {
      setError("Please fill in all fields");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setError("");
    registerMutation(
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
          setError("This email is already in use");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        style={[
          styles.container,
          { paddingTop: topPad + 32, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>

        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primary }]}>
            <Feather name="user-plus" size={28} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Create account
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Start studying smarter today
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
              placeholder="Password (min 8 chars)"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              testID="password-input"
            />
          </View>

          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="check-circle" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
            <TextInput
              ref={confirmRef}
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Confirm password"
              placeholderTextColor={colors.mutedForeground}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              testID="confirm-input"
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
            onPress={handleRegister}
            disabled={isPending}
            testID="register-button"
          >
            {isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Create Account
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Already have an account?{" "}
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.linkText, { color: colors.primary }]}>
              Sign in
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
    },
    backBtn: { marginBottom: 24 },
    header: { alignItems: "center", marginBottom: 32 },
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
      marginTop: 28,
    },
    footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
    linkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  });
}
