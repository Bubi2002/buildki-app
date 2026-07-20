/**
 * BuildKI – E-Mail-Bestätigung (Double-Opt-In)
 * Wird nach der Registrierung angezeigt
 * Nutzer gibt den 6-stelligen Code ein, der per E-Mail gesendet wurde
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { apiCall } from "@/lib/_core/api";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; name?: string }>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const email = params.email || "";
  const name = params.name || "";

  useEffect(() => {
    // Bestätigungs-Code beim Laden anfordern
    if (email) {
      requestConfirmation();
    }
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const requestConfirmation = async () => {
    try {
      await apiCall<{ success: boolean }>("/api/auth/request-confirmation", {
        method: "POST",
        body: JSON.stringify({ email: email.toLowerCase(), name }),
      });
      setResendCooldown(60);
    } catch (e) {
      // Server nicht erreichbar
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert("Fehler", "Bitte gib den 6-stelligen Code ein.");
      return;
    }

    setLoading(true);
    try {
      await apiCall<{ success: boolean }>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email: email.toLowerCase(), code }),
      });
      Alert.alert(
        "E-Mail bestätigt!",
        "Dein Konto ist jetzt aktiv. Dein 14-tägiger Testzeitraum beginnt jetzt.",
        [{ text: "Weiter", onPress: () => router.replace("/onboarding-profile" as any) }],
      );
    } catch (e: any) {
      Alert.alert("Fehler", e?.message || "Ungültiger Code.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    // Skip verification for now, navigate to profile setup
    router.replace("/onboarding-profile" as any);
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.container}>
        {/* Icon */}
        <View style={styles.iconSection}>
          <View style={styles.iconBox}>
            <MaterialIcons name="mark-email-read" size={48} color="#5DADE2" />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>E-Mail bestätigen</Text>
        <Text style={styles.subtitle}>
          Wir haben einen 6-stelligen Code an{"\n"}
          <Text style={styles.emailHighlight}>{email}</Text>
          {"\n"}gesendet.
        </Text>

        {/* Code Input */}
        <View style={styles.codeSection}>
          <View style={styles.codeInputContainer}>
            <TextInput
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor="#4A5568"
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={handleVerify}
              autoFocus
            />
          </View>
        </View>

        {/* Verify Button */}
        <TouchableOpacity
          style={[styles.verifyBtn, loading && { opacity: 0.6 }]}
          onPress={handleVerify}
          disabled={loading || code.length !== 6}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.verifyBtnText}>Bestätigen</Text>
          )}
        </TouchableOpacity>

        {/* Resend */}
        <View style={styles.resendSection}>
          {resendCooldown > 0 ? (
            <Text style={styles.cooldownText}>
              Erneut senden in {resendCooldown}s
            </Text>
          ) : (
            <TouchableOpacity onPress={requestConfirmation}>
              <Text style={styles.resendLink}>Code erneut senden</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Skip (MVP) */}
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Später bestätigen</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  iconSection: {
    marginBottom: 24,
  },
  iconBox: {
    width: 96,
    height: 96,
    backgroundColor: "#132238",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E3A5F",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#F0F4F8",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: "#8FA3B8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  emailHighlight: {
    color: "#5DADE2",
    fontWeight: "700",
  },
  codeSection: {
    width: "100%",
    marginBottom: 24,
  },
  codeInputContainer: {
    backgroundColor: "#132238",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    height: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  codeInput: {
    color: "#F0F4F8",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 12,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 20,
  },
  verifyBtn: {
    backgroundColor: "#5DADE2",
    width: "100%",
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  resendSection: {
    marginTop: 20,
    alignItems: "center",
  },
  cooldownText: {
    color: "#5A6B7E",
    fontSize: 14,
  },
  resendLink: {
    color: "#5DADE2",
    fontSize: 14,
    fontWeight: "600",
  },
  skipBtn: {
    marginTop: 24,
    paddingVertical: 8,
  },
  skipText: {
    color: "#5A6B7E",
    fontSize: 13,
  },
});
