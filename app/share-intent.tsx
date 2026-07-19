/**
 * protoKI – Share Intent Handler (TEMPORARILY DISABLED)
 * 
 * Share Extension ist temporär deaktiviert für den TestFlight-Build.
 * Wird nach dem ersten erfolgreichen Build wieder aktiviert.
 */

import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

export default function ShareIntentScreen() {
  const colors = useColors();
  const router = useRouter();

  useEffect(() => {
    // Share extension temporarily disabled - redirect to home
    router.replace("/(tabs)/" as any);
  }, []);

  return (
    <ScreenContainer className="p-6">
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#5DADE2" />
        <Text style={[styles.text, { color: colors.foreground }]}>
          Datei wird empfangen...
        </Text>
        <Text style={[styles.subtext, { color: colors.muted }]}>
          Weiterleitung zum Video-Import
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  text: { fontSize: 18, fontWeight: "600" },
  subtext: { fontSize: 14 },
});
