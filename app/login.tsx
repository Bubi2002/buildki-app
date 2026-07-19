/**
 * ProtoKI – Login-Screen
 * Für bestehende Nutzer: E-Mail + Passwort Login
 * Verlinkt zur Registrierung für neue Nutzer
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";

const REGISTRATION_KEY = "@protoki_registered";
const ONBOARDING_PROFILE_COMPLETE_KEY = "@protoki_onboarding_profile_complete";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Fehler", "Bitte E-Mail und Passwort eingeben.");
      return;
    }

    setLoading(true);
    try {
      // Check if user is registered locally
      const regData = await AsyncStorage.getItem(REGISTRATION_KEY);
      if (regData) {
        const parsed = JSON.parse(regData);
        if (parsed.email === email.trim().toLowerCase()) {
          // Check if profile onboarding is complete
          const profileComplete = await AsyncStorage.getItem(ONBOARDING_PROFILE_COMPLETE_KEY);
          if (profileComplete !== "true") {
            router.replace("/onboarding-profile" as any);
          } else {
            router.replace("/(tabs)" as any);
          }
          return;
        }
      }

      // Fallback: Try OAuth login for server-authenticated users
      const { startOAuthLogin } = require("@/constants/oauth");
      const result = await startOAuthLogin();
      if (result) {
        router.replace("/(tabs)" as any);
      }
    } catch (e) {
      Alert.alert("Fehler", "Anmeldung fehlgeschlagen. Bitte pr\u00FCfe deine Zugangsdaten.");
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
          {/* Brand */}
          <View style={styles.brandSection}>
            <View style={styles.logoBox}>
              <MaterialIcons name="architecture" size={40} color="#5DADE2" />
            </View>
            <Text style={styles.brandTitle}>ProtoKI</Text>
            <Text style={styles.brandSubtitle}>Willkommen zur\u00FCck</Text>
          </View>

          {/* Form */}
          <View style={styles.formSection}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-Mail-Adresse</Text>
              <View style={styles.inputContainer}>
                <MaterialIcons name="email" size={20} color="#5A6B7E" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="name@firma.de"
                  placeholderTextColor="#4A5568"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Passwort</Text>
              <View style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color="#5A6B7E" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Passwort eingeben"
                  placeholderTextColor="#4A5568"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <MaterialIcons name={showPassword ? "visibility-off" : "visibility"} size={20} color="#5A6B7E" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.loginBtnText}>Anmelden</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/forgot-password" as any)}
              style={{ alignItems: "center", marginTop: 12 }}
            >
              <Text style={styles.registerLink}>Passwort vergessen?</Text>
            </TouchableOpacity>

            <View style={styles.registerRow}>
              <Text style={styles.registerText}>Noch kein Konto? </Text>
              <TouchableOpacity onPress={() => router.push("/register" as any)}>
                <Text style={styles.registerLink}>Jetzt registrieren</Text>
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
    marginBottom: 40,
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
    fontSize: 15,
    color: "#7F8C9B",
    marginTop: 6,
  },
  formSection: { width: "100%" },
  inputGroup: { marginBottom: 16 },
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
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#F0F4F8",
    height: "100%",
  },
  eyeBtn: { padding: 8 },
  loginBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5DADE2",
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 20,
  },
  loginBtnText: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  registerText: { fontSize: 14, color: "#7F8C9B" },
  registerLink: { fontSize: 14, color: "#5DADE2", fontWeight: "600" },
});
