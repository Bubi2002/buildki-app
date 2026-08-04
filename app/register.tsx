/**
 * BuildKI – Registrierungs-Screen
 * Minimales Formular: E-Mail + Passwort + Nutzungsbedingungen-Prüfentwurf.
 * Der Compliance-Zweig enthält bewusst kein Testphasen- oder Kaufversprechen.
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
import * as Auth from "@/lib/_core/auth";
import { apiCall } from "@/lib/_core/api";
import { useTranslation } from "@/lib/language-provider";

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string; agb?: string }>({});

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!email.trim()) {
      newErrors.email = t('register_err_email_required' as any);
    } else if (!validateEmail(email.trim())) {
      newErrors.email = t('register_err_email_invalid' as any);
    }

    if (!password) {
      newErrors.password = t('register_err_password_required' as any);
    } else if (password.length < 12) {
      newErrors.password = t('register_err_min_length' as any);
    }

    if (password !== confirmPassword) {
      newErrors.confirm = t('register_err_mismatch' as any);
    }

    if (!agbAccepted) {
      newErrors.agb = t('register_err_accept_terms' as any);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await apiCall<{
        success: boolean;
        sessionToken: string;
        user: {
          id: number;
          openId: string;
          name: string | null;
          email: string | null;
          loginMethod: string | null;
          role: string;
          emailVerified: boolean;
          lastSignedIn: string;
        };
      }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: email.trim().toLowerCase().split("@")[0],
        }),
      });

      if (result.success && result.sessionToken) {
        // Store session token (native) / cookie set by server (web)
        await Auth.setSessionToken(result.sessionToken);
        await Auth.setUserInfo({
          id: result.user.id,
          openId: result.user.openId,
          name: result.user.name,
          email: result.user.email,
          loginMethod: result.user.loginMethod,
          lastSignedIn: new Date(result.user.lastSignedIn),
        });

        // Navigate to email verification (Double-Opt-In)
        router.replace({
          pathname: "/verify-email",
          params: { email: email.trim().toLowerCase(), codeSent: "1" },
        } as any);
      }
    } catch (e: any) {
      const msg = e?.message || t('register_failed' as any);
      Alert.alert(t('error'), msg);
    } finally {
      setLoading(false);
    }
  };

  const navigateToLogin = () => {
    router.push("/login" as any);
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
          {/* Logo / Brand */}
          <View style={styles.brandSection}>
            <View style={styles.logoBox}>
              <MaterialIcons name="architecture" size={40} color="#5DADE2" />
            </View>
            <Text style={styles.brandTitle}>BuildKI</Text>
            <Text style={styles.brandSubtitle}>
              {t('register_brand_subtitle' as any)}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formSection}>
            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('register_email_label' as any)}</Text>
              <View style={[styles.inputContainer, errors.email ? styles.inputError : null]}>
                <MaterialIcons name="email" size={20} color="#5A6B7E" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('register_email_placeholder' as any)}
                  placeholderTextColor="#4A5568"
                  value={email}
                  onChangeText={(text) => { setEmail(text); setErrors((e) => ({ ...e, email: undefined })); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="next"
                />
              </View>
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('register_password_label' as any)}</Text>
              <View style={[styles.inputContainer, errors.password ? styles.inputError : null]}>
                <MaterialIcons name="lock" size={20} color="#5A6B7E" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('register_min_chars' as any)}
                  placeholderTextColor="#4A5568"
                  value={password}
                  onChangeText={(text) => { setPassword(text); setErrors((e) => ({ ...e, password: undefined })); }}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  returnKeyType="next"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <MaterialIcons name={showPassword ? "visibility-off" : "visibility"} size={20} color="#5A6B7E" />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('register_confirm_label' as any)}</Text>
              <View style={[styles.inputContainer, errors.confirm ? styles.inputError : null]}>
                <MaterialIcons name="lock-outline" size={20} color="#5A6B7E" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('register_repeat' as any)}
                  placeholderTextColor="#4A5568"
                  value={confirmPassword}
                  onChangeText={(text) => { setConfirmPassword(text); setErrors((e) => ({ ...e, confirm: undefined })); }}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                />
              </View>
              {errors.confirm && <Text style={styles.errorText}>{errors.confirm}</Text>}
            </View>

            {/* AGB Checkbox */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => { setAgbAccepted(!agbAccepted); setErrors((e) => ({ ...e, agb: undefined })); }}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, agbAccepted && styles.checkboxChecked]}>
                {agbAccepted && <MaterialIcons name="check" size={16} color="#FFF" />}
              </View>
              <Text style={styles.checkboxText}>
                {t('register_accept_prefix' as any)}
                <Text style={styles.linkText} onPress={() => router.push("/legal" as any)}>
                  {t('register_terms_link' as any)}
                </Text>
                .
              </Text>
            </TouchableOpacity>
            {errors.agb && <Text style={[styles.errorText, { marginTop: -4, marginBottom: 8 }]}>{errors.agb}</Text>}

            {/* Register Button */}
            <TouchableOpacity
              style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <MaterialIcons name="rocket-launch" size={20} color="#FFF" />
                  <Text style={styles.registerBtnText}>{t('register_create_account' as any)}</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Trust Signals */}
            <Text style={styles.trustText}>
              {t('register_trust_text' as any)}
            </Text>

            {/* Login Link */}
            <View style={styles.loginRow}>
              <Text style={styles.loginText}>{t('register_already_registered' as any)}</Text>
              <TouchableOpacity onPress={navigateToLogin}>
                <Text style={styles.loginLink}>{t('anmelden')}</Text>
              </TouchableOpacity>
            </View>
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
    justifyContent: "center",
  },
  brandSection: {
    alignItems: "center",
    marginBottom: 36,
    marginTop: 20,
  },
  logoBox: {
    width: 72,
    height: 72,
    backgroundColor: "#132238",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1E3A5F",
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F0F4F8",
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    color: "#7F8C9B",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  formSection: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8FA3B8",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#132238",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    paddingHorizontal: 12,
    height: 50,
  },
  inputError: {
    borderColor: "#EF4444",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#F0F4F8",
    height: "100%",
  },
  eyeBtn: {
    padding: 8,
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 4,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
    marginTop: 4,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: "#1E3A5F",
    backgroundColor: "#132238",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: "#5DADE2",
    borderColor: "#5DADE2",
  },
  checkboxText: {
    flex: 1,
    fontSize: 13,
    color: "#8FA3B8",
    lineHeight: 20,
  },
  linkText: {
    color: "#5DADE2",
    textDecorationLine: "underline",
  },
  registerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#5DADE2",
    paddingVertical: 16,
    marginBottom: 12,
  },
  registerBtnDisabled: {
    opacity: 0.6,
  },
  registerBtnText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "700",
  },
  trustText: {
    fontSize: 13,
    color: "#7F8C9B",
    textAlign: "center",
    marginBottom: 24,
  },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  loginText: {
    fontSize: 14,
    color: "#7F8C9B",
  },
  loginLink: {
    fontSize: 14,
    color: "#5DADE2",
    fontWeight: "600",
  },
});
