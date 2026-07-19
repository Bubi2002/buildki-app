/**
 * protoKI – Share Intent Handler
 * 
 * Empfängt Videos/Audio-Dateien die über "Teilen" aus anderen Apps
 * (WhatsApp, E-Mail, Telegram etc.) an protoKI gesendet werden.
 * Leitet automatisch zum Video-Upload-Screen weiter.
 */

import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

export default function ShareIntentScreen() {
  const colors = useColors();
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (hasShareIntent && shareIntent) {
      // Share intent received - redirect to video-upload with the shared file info
      // Store the shared file info temporarily so video-upload can pick it up
      if (shareIntent.files && shareIntent.files.length > 0) {
        // Navigate to video-upload - the shared files will be handled there
        router.replace("/video-upload" as any);
      } else {
        // No files in share intent, go to home
        resetShareIntent();
        router.replace("/(tabs)/" as any);
      }
    }
  }, [hasShareIntent, shareIntent]);

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
