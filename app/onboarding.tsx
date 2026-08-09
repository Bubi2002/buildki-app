import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, ScrollView } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "@/lib/language-provider";
import { LANGUAGE_OPTIONS } from "@/lib/i18n";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type OnboardingStep = {
  icon: string;
  title: string;
  description: string;
  color: string;
};

function getSteps(t: (key: any) => string): OnboardingStep[] { return [
  {
    icon: "mic",
    title: t('onboarding_title_1'),
    description: t('onboarding_desc_1'),
    color: "#5DADE2",
  },
  {
    icon: "auto-awesome",
    title: t('onboarding_title_2'),
    description: t('ki_beschreibung'),
    color: "#A78BFA",
  },
  {
    icon: "share",
    title: t('onboarding_title_3'),
    description: t('onboarding_desc_2'),
    color: "#4ADE80",
  },
  {
    icon: "folder",
    title: t('onboarding_title_4'),
    description: t('onboarding_desc_3'),
    color: "#5DADE2",
  },
  {
    icon: "translate",
    title: t('onboarding_title_5'),
    description: t('onboarding_desc_4'),
    color: "#FBBF24",
  },
]; }

export default function OnboardingScreen() {
  const { t, language, setLanguage } = useTranslation();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  const infoSteps = getSteps(t);
  const totalSteps = infoSteps.length + 1; // step 0 = language selection
  const isLanguageStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const step = isLanguageStep ? null : infoSteps[currentStep - 1];

  const completeOnboarding = async () => {
    await AsyncStorage.setItem("onboarding_complete", "true");
    router.replace("/(tabs)" as any);
  };

  const nextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
      <View style={styles.container}>
        {/* Skip button */}
        <View style={styles.topBar}>
          <Pressable onPress={completeOnboarding} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <Text style={styles.skipText}>{t('ueberspringen')}</Text>
          </Pressable>
        </View>

        {/* Content */}
        {isLanguageStep ? (
          <View style={styles.langContent}>
            <MaterialIcons name="translate" size={48} color="#FBBF24" style={{ marginBottom: 16 }} />
            <Text style={styles.title}>{t('appsprache_auswaehlen')}</Text>
            <ScrollView style={{ alignSelf: "stretch", marginTop: 20 }} contentContainerStyle={{ paddingBottom: 12 }}>
              {LANGUAGE_OPTIONS.map((opt) => {
                const selected = opt.id === language;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setLanguage(opt.id)}
                    style={({ pressed }) => [styles.langRow, selected && styles.langRowActive, { opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={styles.langFlag}>{opt.flag}</Text>
                    <Text style={[styles.langName, selected && styles.langNameActive]}>{opt.name}</Text>
                    {selected && <MaterialIcons name="check" size={20} color="#5DADE2" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={[styles.iconBox, { backgroundColor: step!.color + "18" }]}>
              <MaterialIcons name={step!.icon as any} size={64} color={step!.color} />
            </View>
            <Text style={styles.title}>{step!.title}</Text>
            <Text style={styles.description}>{step!.description}</Text>
          </View>
        )}

        {/* Progress dots */}
        <View style={styles.dotsContainer}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === currentStep ? "#5DADE2" : "#1E3A5F",
                  width: i === currentStep ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        {/* Button */}
        <View style={styles.buttonContainer}>
          <Pressable
            onPress={nextStep}
            style={({ pressed }) => [
              styles.nextButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={styles.nextButtonText}>
              {isLastStep ? t('los_gehts') : t('weiter')}
            </Text>
            <MaterialIcons
              name={isLastStep ? "rocket-launch" : "arrow-forward"}
              size={20}
              color="#FFF"
            />
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1622" },
  topBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 20, paddingTop: 10 },
  skipText: { fontSize: 15, fontWeight: "500", color: "#7F8C9B" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  langContent: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingHorizontal: 24, paddingTop: 24 },
  langRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F1E30", marginBottom: 8 },
  langRowActive: { borderColor: "#5DADE2", backgroundColor: "#12283F" },
  langFlag: { fontSize: 24 },
  langName: { flex: 1, fontSize: 16, fontWeight: "600", color: "#F0F4F8" },
  langNameActive: { color: "#5DADE2" },
  iconBox: { width: 140, height: 140, borderRadius: 0, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center", marginBottom: 16, color: "#F0F4F8", letterSpacing: -0.3 },
  description: { fontSize: 16, lineHeight: 26, textAlign: "center", color: "#8FA3B8" },
  dotsContainer: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 32 },
  dot: { height: 4, borderRadius: 2 },
  buttonContainer: { paddingHorizontal: 32, paddingBottom: 40 },
  nextButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 0, backgroundColor: "#5DADE2" },
  nextButtonText: { color: "#FFF", fontSize: 17, fontWeight: "600" },
});
