/**
 * BuildKI – Passwort zurücksetzen
 * 3-Schritt-Flow: E-Mail eingeben → Code eingeben → Neues Passwort setzen
 */
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { apiCall } from "@/lib/_core/api";
import { useTranslation } from "@/lib/language-provider";

type Step = "email" | "code" | "newPassword";

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRequestReset = async () => {
    if (!email.trim()) {
      Alert.alert(t('error'), t('forgot_password_enter_email' as any));
      return;
    }

    setLoading(true);
    try {
      await apiCall<{ success: boolean; message: string }>("/api/auth/request-reset", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      Alert.alert(t('forgot_password_code_sent_title' as any), t('forgot_password_code_sent_msg' as any));
      setStep("code");
    } catch (e: any) {
      Alert.alert(t('error'), e?.message || t('forgot_password_something_wrong' as any));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      Alert.alert(t('error'), t('forgot_password_enter_6digit' as any));
      return;
    }

    setLoading(true);
    try {
      await apiCall<{ success: boolean }>("/api/auth/verify-reset-code", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
      });
      setStep("newPassword");
    } catch (e: any) {
      Alert.alert(t('error'), e?.message || t('forgot_password_invalid_code' as any));
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async () => {
    if (newPassword.length < 12) {
      Alert.alert(t('error'), t('forgot_password_min_length' as any));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('error'), t('forgot_password_mismatch' as any));
      return;
    }

    setLoading(true);
    try {
      await apiCall<{ success: boolean }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
          newPassword,
        }),
      });

      Alert.alert(
        t('forgot_password_changed_title' as any),
        t('forgot_password_changed_msg' as any),
        [{ text: t('forgot_password_to_login' as any), onPress: () => router.replace("/login" as any) }],
      );
    } catch (e: any) {
      Alert.alert(t('error'), e?.message || t('forgot_password_change_failed' as any));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={24} color="#F0F4F8" />
            </TouchableOpacity>
          </View>

          {/* Brand */}
          <View style={styles.brandSection}>
            <View style={styles.iconBox}>
              <MaterialIcons
                name={step === "newPassword" ? "lock-reset" : step === "code" ? "pin" : "email"}
                size={36}
                color="#5DADE2"
              />
            </View>
            <Text style={styles.title}>
              {step === "email" && t('forgot_password_title_email' as any)}
              {step === "code" && t('forgot_password_title_code' as any)}
              {step === "newPassword" && t('forgot_password_title_new' as any)}
            </Text>
            <Text style={styles.subtitle}>
              {step === "email" && t('forgot_password_sub_email' as any)}
              {step === "code" && t('forgot_password_sub_code' as any)}
              {step === "newPassword" && t('forgot_password_sub_new' as any)}
            </Text>
          </View>

          {/* Step: Email */}
          {step === "email" && (
            <View style={styles.formSection}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('forgot_password_email_label' as any)}</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="email" size={20} color="#5A6B7E" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('forgot_password_email_placeholder' as any)}
                    placeholderTextColor="#4A5568"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    returnKeyType="done"
                    onSubmitEditing={handleRequestReset}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
                onPress={handleRequestReset}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('forgot_password_send_code' as any)}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Step: Code */}
          {step === "code" && (
            <View style={styles.formSection}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('forgot_password_code_label' as any)}</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="pin" size={20} color="#5A6B7E" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { letterSpacing: 8, fontSize: 24, fontWeight: "700" }]}
                    placeholder="000000"
                    placeholderTextColor="#4A5568"
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyCode}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
                onPress={handleVerifyCode}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('forgot_password_confirm_code' as any)}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleRequestReset} style={styles.resendBtn}>
                <Text style={styles.resendText}>{t('forgot_password_resend_code' as any)}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step: New Password */}
          {step === "newPassword" && (
            <View style={styles.formSection}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('forgot_password_new_label' as any)}</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="lock" size={20} color="#5A6B7E" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('forgot_password_min_chars' as any)}
                    placeholderTextColor="#4A5568"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="next"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <MaterialIcons name={showPassword ? "visibility-off" : "visibility"} size={20} color="#5A6B7E" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('forgot_password_confirm_label' as any)}</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="lock-outline" size={20} color="#5A6B7E" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('forgot_password_repeat' as any)}
                    placeholderTextColor="#4A5568"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleSetNewPassword}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
                onPress={handleSetNewPassword}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('forgot_password_save' as any)}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Back to Login */}
          <View style={styles.bottomRow}>
            <TouchableOpacity onPress={() => router.replace("/login" as any)}>
              <Text style={styles.linkText}>{t('forgot_password_back_login' as any)}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
  },
  brandSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconBox: {
    width: 72,
    height: 72,
    backgroundColor: "#132238",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1E3A5F",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#F0F4F8",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#8FA3B8",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  formSection: {
    gap: 20,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8FA3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#132238",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    height: 52,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: "#F0F4F8",
    fontSize: 16,
  },
  eyeBtn: {
    padding: 4,
  },
  primaryBtn: {
    backgroundColor: "#5DADE2",
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  resendBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  resendText: {
    color: "#5DADE2",
    fontSize: 14,
    fontWeight: "600",
  },
  bottomRow: {
    alignItems: "center",
    marginTop: 32,
  },
  linkText: {
    color: "#5DADE2",
    fontSize: 14,
    fontWeight: "600",
  },
});
