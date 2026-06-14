import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Protocol = {
  id: string;
  title: string;
  transcription: string;
  protocol: string;
  duration: number;
  createdAt: string;
  status: "processing" | "ready" | "sent";
};

export default function ProtocolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTranscription, setShowTranscription] = useState(false);

  useEffect(() => {
    loadProtocol();
  }, [id]);

  const loadProtocol = async () => {
    try {
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );
      const found = protocols.find((p: Protocol) => p.id === id);
      setProtocol(found || null);
    } catch (error) {
      console.error("Error loading protocol:", error);
    } finally {
      setLoading(false);
    }
  };

  const shareViaWhatsApp = async () => {
    if (!protocol) return;

    const settings = JSON.parse(
      (await AsyncStorage.getItem("protokoll-settings")) || "{}"
    );
    const phoneNumber = settings.whatsappNumber || "";

    const message = encodeURIComponent(protocol.protocol);

    if (phoneNumber) {
      const url = `whatsapp://send?phone=${phoneNumber}&text=${message}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
    }

    // Fallback: use system share
    await Share.share({
      message: protocol.protocol,
      title: "Protokoll teilen",
    });
  };

  const shareViaEmail = async () => {
    if (!protocol) return;

    const settings = JSON.parse(
      (await AsyncStorage.getItem("protokoll-settings")) || "{}"
    );
    const emailTo = settings.defaultEmail || "";
    const subject = encodeURIComponent(
      `Protokoll vom ${new Date(protocol.createdAt).toLocaleDateString("de-DE")}`
    );
    const body = encodeURIComponent(protocol.protocol);

    const url = `mailto:${emailTo}?subject=${subject}&body=${body}`;
    await Linking.openURL(url);
  };

  const copyToClipboard = async () => {
    if (!protocol) return;
    await Clipboard.setStringAsync(protocol.protocol);
    alert("Protokoll in die Zwischenablage kopiert!");
  };

  const shareGeneric = async () => {
    if (!protocol) return;
    await Share.share({
      message: protocol.protocol,
      title: "Protokoll teilen",
    });
  };

  if (loading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!protocol) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <Text className="text-xl text-foreground">Protokoll nicht gefunden</Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.backButtonText}>Zurück</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  const formattedDate = new Date(protocol.createdAt).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")} Min.`;
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          Protokoll
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Metadata */}
        <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.metaRow}>
            <MaterialIcons name="event" size={18} color={colors.muted} />
            <Text style={[styles.metaText, { color: colors.muted }]}>{formattedDate}</Text>
          </View>
          <View style={styles.metaRow}>
            <MaterialIcons name="timer" size={18} color={colors.muted} />
            <Text style={[styles.metaText, { color: colors.muted }]}>
              {formatDuration(protocol.duration)}
            </Text>
          </View>
        </View>

        {/* Protocol content */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Protokoll</Text>
          <Text style={[styles.protocolText, { color: colors.foreground }]}>
            {protocol.protocol}
          </Text>
        </View>

        {/* Transcription toggle */}
        <Pressable
          onPress={() => setShowTranscription(!showTranscription)}
          style={({ pressed }) => [
            styles.toggleButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialIcons
            name={showTranscription ? "expand-less" : "expand-more"}
            size={20}
            color={colors.muted}
          />
          <Text style={[styles.toggleText, { color: colors.muted }]}>
            {showTranscription ? "Transkription ausblenden" : "Originaltranskription anzeigen"}
          </Text>
        </Pressable>

        {showTranscription && (
          <View style={[styles.transcriptionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.transcriptionText, { color: colors.muted }]}>
              {protocol.transcription}
            </Text>
          </View>
        )}

        {/* Spacer for action buttons */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action buttons */}
      <View style={[styles.actionsContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={shareViaWhatsApp}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: "#25D366", opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="chat" size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>WhatsApp</Text>
        </Pressable>

        <Pressable
          onPress={shareViaEmail}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="email" size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>E-Mail</Text>
        </Pressable>

        <Pressable
          onPress={copyToClipboard}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="content-copy" size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>Kopieren</Text>
        </Pressable>

        <Pressable
          onPress={shareGeneric}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.foreground, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="share" size={20} color={colors.background} />
          <Text style={[styles.actionButtonText, { color: colors.background }]}>Teilen</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  metaCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 0.5,
    marginBottom: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 14,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  protocolText: {
    fontSize: 15,
    lineHeight: 24,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 6,
    borderTopWidth: 0.5,
  },
  toggleText: {
    fontSize: 14,
  },
  transcriptionBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 0.5,
    marginTop: 8,
  },
  transcriptionText: {
    fontSize: 14,
    lineHeight: 22,
    fontStyle: "italic",
  },
  actionsContainer: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    borderTopWidth: 0.5,
  },
  actionButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 4,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  backButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
