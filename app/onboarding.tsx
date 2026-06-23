import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type OnboardingStep = {
  icon: string;
  title: string;
  description: string;
  color: string;
};

const STEPS: OnboardingStep[] = [
  {
    icon: "mic",
    title: "Aufnehmen & Fotografieren",
    description: "Sprich dein Protokoll einfach ein und fotografiere gleichzeitig Schäden, Mängel oder Details. Audio + Foto – alles in einer Aufnahme.",
    color: "#5DADE2",
  },
  {
    icon: "auto-awesome",
    title: "KI erstellt dein Protokoll",
    description: "Die KI transkribiert deine Sprache, erstellt ein strukturiertes Protokoll und extrahiert automatisch Aufgaben mit Fristen und Verantwortlichen.",
    color: "#A78BFA",
  },
  {
    icon: "share",
    title: "Teilen per WhatsApp & PDF",
    description: "Versende das fertige Protokoll als professionelles PDF direkt per WhatsApp, E-Mail oder über den Teilen-Dialog – mit Logo und Fotos.",
    color: "#4ADE80",
  },
  {
    icon: "folder",
    title: "Projekte & Vorlagen",
    description: "Organisiere Protokolle in Projekten, wähle aus 6+ Vorlagen (Baustellenbericht, Mängelliste...) oder erstelle eigene. Alles offline verfügbar.",
    color: "#5DADE2",
  },
  {
    icon: "translate",
    title: "Mehrsprachig & Smart",
    description: "Automatische Standort-Erkennung, Kalender-Verknüpfung, Übersetzung in 8 Sprachen, Push-Erinnerungen für Aufgaben und Cloud-Sync.",
    color: "#FBBF24",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  const completeOnboarding = async () => {
    await AsyncStorage.setItem("onboarding_complete", "true");
    router.replace("/(tabs)" as any);
  };

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const step = STEPS[currentStep];

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
      <View style={styles.container}>
        {/* Skip button */}
        <View style={styles.topBar}>
          <Pressable onPress={completeOnboarding} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <Text style={styles.skipText}>Überspringen</Text>
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={[styles.iconBox, { backgroundColor: step.color + "18" }]}>
            <MaterialIcons name={step.icon as any} size={64} color={step.color} />
          </View>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>
        </View>

        {/* Progress dots */}
        <View style={styles.dotsContainer}>
          {STEPS.map((_, i) => (
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
              {currentStep === STEPS.length - 1 ? "Los geht's!" : "Weiter"}
            </Text>
            <MaterialIcons
              name={currentStep === STEPS.length - 1 ? "rocket-launch" : "arrow-forward"}
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
  iconBox: { width: 140, height: 140, borderRadius: 0, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center", marginBottom: 16, color: "#F0F4F8", letterSpacing: -0.3 },
  description: { fontSize: 16, lineHeight: 26, textAlign: "center", color: "#8FA3B8" },
  dotsContainer: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 32 },
  dot: { height: 4, borderRadius: 2 },
  buttonContainer: { paddingHorizontal: 32, paddingBottom: 40 },
  nextButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 0, backgroundColor: "#5DADE2" },
  nextButtonText: { color: "#FFF", fontSize: 17, fontWeight: "600" },
});
