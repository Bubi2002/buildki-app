/**
 * BuildKI – Onboarding Profil-Vervollständigung
 * Pflichtfelder: Vorname, Nachname, Handynummer
 * Optional: Unternehmen
 * Muss ausgefüllt werden bevor Dashboard freigeschaltet wird.
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

const PROFILE_KEY = "@buildki_user_profile";
const ONBOARDING_PROFILE_COMPLETE_KEY = "@buildki_onboarding_profile_complete";

interface UserProfile {
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  completedAt: string;
}

export default function OnboardingProfileScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});

  const validatePhone = (phone: string) => {
    // Allow international formats: +49..., 0049..., 0170..., etc.
    const cleaned = phone.replace(/[\s\-()]/g, "");
    return cleaned.length >= 8 && /^[+0-9]/.test(cleaned);
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!firstName.trim()) {
      newErrors.firstName = "Vorname ist erforderlich";
    }

    if (!lastName.trim()) {
      newErrors.lastName = "Nachname ist erforderlich";
    }

    if (!phone.trim()) {
      newErrors.phone = "Handynummer ist erforderlich";
    } else if (!validatePhone(phone.trim())) {
      newErrors.phone = "Bitte gib eine gültige Telefonnummer ein";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleComplete = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const profile: UserProfile = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        company: company.trim(),
        completedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      await AsyncStorage.setItem(ONBOARDING_PROFILE_COMPLETE_KEY, "true");

      // Check if feature onboarding was already done
      const onboardingDone = await AsyncStorage.getItem("onboarding_complete");
      if (onboardingDone === "true") {
        // Go directly to app
        router.replace("/(tabs)" as any);
      } else {
        // Show feature tour onboarding
        router.replace("/onboarding" as any);
      }
    } catch  {
      Alert.alert("Fehler", "Profil konnte nicht gespeichert werden. Bitte versuche es erneut.");
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
          <View style={styles.headerSection}>
            <View style={styles.stepIndicator}>
              <View style={styles.stepDotActive} />
              <View style={styles.stepLine} />
              <View style={styles.stepDotInactive} />
            </View>
            <Text style={styles.headerTitle}>Profil vervollständigen</Text>
            <Text style={styles.headerSubtitle}>
              Noch ein kurzer Schritt, dann kann es losgehen.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formSection}>
            {/* First Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Vorname *</Text>
              <View style={[styles.inputContainer, errors.firstName ? styles.inputError : null]}>
                <MaterialIcons name="person" size={20} color="#5A6B7E" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Max"
                  placeholderTextColor="#4A5568"
                  value={firstName}
                  onChangeText={(text) => { setFirstName(text); setErrors((e) => ({ ...e, firstName: undefined })); }}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  returnKeyType="next"
                />
              </View>
              {errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}
            </View>

            {/* Last Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nachname *</Text>
              <View style={[styles.inputContainer, errors.lastName ? styles.inputError : null]}>
                <MaterialIcons name="person-outline" size={20} color="#5A6B7E" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Mustermann"
                  placeholderTextColor="#4A5568"
                  value={lastName}
                  onChangeText={(text) => { setLastName(text); setErrors((e) => ({ ...e, lastName: undefined })); }}
                  autoCapitalize="words"
                  autoComplete="family-name"
                  returnKeyType="next"
                />
              </View>
              {errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Handynummer *</Text>
              <View style={[styles.inputContainer, errors.phone ? styles.inputError : null]}>
                <MaterialIcons name="phone-iphone" size={20} color="#5A6B7E" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="+49 170 1234567"
                  placeholderTextColor="#4A5568"
                  value={phone}
                  onChangeText={(text) => { setPhone(text); setErrors((e) => ({ ...e, phone: undefined })); }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  returnKeyType="next"
                />
              </View>
              {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
              <Text style={styles.hintText}>
                Für Support und Fristerinnerungen
              </Text>
            </View>

            {/* Company (optional) */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Unternehmen <Text style={styles.optionalBadge}>(optional)</Text></Text>
              <View style={styles.inputContainer}>
                <MaterialIcons name="business" size={20} color="#5A6B7E" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Musterbau GmbH"
                  placeholderTextColor="#4A5568"
                  value={company}
                  onChangeText={setCompany}
                  autoCapitalize="words"
                  autoComplete="organization"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleComplete}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.submitBtnText}>Weiter</Text>
                  <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
                </>
              )}
            </TouchableOpacity>

            {/* Privacy Note */}
            <Text style={styles.privacyNote}>
              Deine Daten werden vertraulich behandelt und nicht an Dritte weitergegeben.
              Mehr dazu in unserer Datenschutzerklärung.
            </Text>
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
  headerSection: {
    alignItems: "center",
    marginTop: 32,
    marginBottom: 36,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 4,
  },
  stepDotActive: {
    width: 10,
    height: 10,
    backgroundColor: "#5DADE2",
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: "#1E3A5F",
  },
  stepDotInactive: {
    width: 10,
    height: 10,
    backgroundColor: "#1E3A5F",
    borderWidth: 1,
    borderColor: "#2E4A6F",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#F0F4F8",
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    color: "#7F8C9B",
    textAlign: "center",
  },
  formSection: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8FA3B8",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionalBadge: {
    fontSize: 11,
    color: "#5A6B7E",
    textTransform: "none",
    fontWeight: "400",
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
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 4,
  },
  hintText: {
    fontSize: 12,
    color: "#5A6B7E",
    marginTop: 4,
    fontStyle: "italic",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#5DADE2",
    paddingVertical: 16,
    marginTop: 12,
    marginBottom: 16,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "700",
  },
  privacyNote: {
    fontSize: 12,
    color: "#5A6B7E",
    textAlign: "center",
    lineHeight: 18,
  },
});
