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
  Dimensions,
  Modal,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { generateProtocolPdf } from "@/lib/pdf-generator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PHOTO_SIZE = (SCREEN_WIDTH - 48 - 8) / 3;

type Protocol = {
  id: string;
  title: string;
  transcription: string;
  protocol: string;
  templateName?: string;
  templateId?: string;
  photos?: string[];
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
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

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

  const exportPdf = async () => {
    if (!protocol) return;

    setIsExporting(true);
    try {
      const pdfUri = await generateProtocolPdf({
        title: protocol.title,
        protocol: protocol.protocol,
        templateName: protocol.templateName,
        photos: protocol.photos,
        duration: protocol.duration,
        createdAt: protocol.createdAt,
      });

      // Share the PDF
      if (Platform.OS === "web") {
        Alert.alert("PDF erstellt", "PDF-Export ist nur auf dem Handy verfügbar.");
      } else {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(pdfUri, {
            mimeType: "application/pdf",
            dialogTitle: `${protocol.templateName || "Protokoll"} als PDF teilen`,
            UTI: "com.adobe.pdf",
          });
        } else {
          Alert.alert("Fehler", "Teilen ist auf diesem Gerät nicht verfügbar.");
        }
      }
    } catch (error) {
      console.error("PDF export error:", error);
      Alert.alert("Fehler", "PDF konnte nicht erstellt werden. Bitte versuche es erneut.");
    } finally {
      setIsExporting(false);
    }
  };

  const shareViaWhatsApp = async () => {
    if (!protocol) return;

    setIsSendingWhatsApp(true);
    try {
      // Generate PDF first
      const pdfUri = await generateProtocolPdf({
        title: protocol.title,
        protocol: protocol.protocol,
        templateName: protocol.templateName,
        photos: protocol.photos,
        duration: protocol.duration,
        createdAt: protocol.createdAt,
      });

      // Use native share sheet with PDF - user can pick WhatsApp
      if (Platform.OS === "web") {
        Alert.alert("Hinweis", "PDF-Versand per WhatsApp ist nur auf dem Handy verfügbar.");
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: "application/pdf",
          dialogTitle: "Protokoll-PDF per WhatsApp senden",
          UTI: "com.adobe.pdf",
        });
      } else {
        // Fallback: share text via WhatsApp deep link
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
        await Share.share({
          message: protocol.protocol,
          title: "Protokoll teilen",
        });
      }
    } catch (error) {
      console.error("WhatsApp PDF share error:", error);
      Alert.alert("Fehler", "PDF konnte nicht erstellt werden. Bitte versuche es erneut.");
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const shareViaEmail = async () => {
    if (!protocol) return;

    const settings = JSON.parse(
      (await AsyncStorage.getItem("protokoll-settings")) || "{}"
    );
    const emailTo = settings.defaultEmail || "";
    const subject = encodeURIComponent(
      `${protocol.templateName || "Protokoll"} vom ${new Date(protocol.createdAt).toLocaleDateString("de-DE")}`
    );
    const body = encodeURIComponent(protocol.protocol);

    const url = `mailto:${emailTo}?subject=${subject}&body=${body}`;
    await Linking.openURL(url);
  };

  const copyToClipboard = async () => {
    if (!protocol) return;
    await Clipboard.setStringAsync(protocol.protocol);
    Alert.alert("Kopiert", "Protokoll in die Zwischenablage kopiert!");
  };

  const shareGeneric = async () => {
    if (!protocol) return;
    await Share.share({
      message: protocol.protocol,
      title: protocol.templateName || "Protokoll teilen",
    });
  };

  const sharePhoto = async (photoUri: string) => {
    if (Platform.OS === "web") return;
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(photoUri);
    }
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

  const photos = protocol.photos || [];

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
          {protocol.templateName || "Protokoll"}
        </Text>
        {/* PDF Export button in header */}
        <Pressable
          onPress={exportPdf}
          disabled={isExporting}
          style={({ pressed }) => [{ opacity: pressed || isExporting ? 0.5 : 1 }]}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialIcons name="picture-as-pdf" size={24} color={colors.primary} />
          )}
        </Pressable>
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
          {photos.length > 0 && (
            <View style={styles.metaRow}>
              <MaterialIcons name="photo-camera" size={18} color={colors.muted} />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {photos.length} Foto{photos.length !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
        </View>

        {/* PDF Export Banner */}
        <Pressable
          onPress={exportPdf}
          disabled={isExporting}
          style={({ pressed }) => [
            styles.pdfBanner,
            {
              backgroundColor: "#E5393520",
              borderColor: "#E53935",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#E53935" />
          ) : (
            <MaterialIcons name="picture-as-pdf" size={22} color="#E53935" />
          )}
          <View style={styles.pdfBannerText}>
            <Text style={[styles.pdfBannerTitle, { color: colors.foreground }]}>
              {isExporting ? "PDF wird erstellt..." : "Als PDF exportieren"}
            </Text>
            <Text style={[styles.pdfBannerSubtitle, { color: colors.muted }]}>
              Professionelles Dokument mit Logo & Fotos
            </Text>
          </View>
          {!isExporting && (
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          )}
        </Pressable>

        {/* Photos Gallery */}
        {photos.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Fotos
            </Text>
            <View style={styles.photoGrid}>
              {photos.map((photoUri, index) => (
                <Pressable
                  key={index}
                  onPress={() => setSelectedPhoto(photoUri)}
                  onLongPress={() => sharePhoto(photoUri)}
                  style={({ pressed }) => [
                    styles.photoThumbnail,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.photoImage}
                    contentFit="cover"
                    transition={200}
                  />
                  <View style={styles.photoIndex}>
                    <Text style={styles.photoIndexText}>{index + 1}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.photoHint, { color: colors.muted }]}>
              Tippe zum Vergrößern \u2022 Halte gedrückt zum Teilen
            </Text>
          </View>
        )}

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

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action buttons */}
      <View style={[styles.actionsContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={shareViaWhatsApp}
          disabled={isSendingWhatsApp}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: "#25D366", opacity: (pressed || isSendingWhatsApp) ? 0.6 : 1 },
          ]}
        >
          {isSendingWhatsApp ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name="chat" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.actionButtonText}>
            {isSendingWhatsApp ? "PDF..." : "WhatsApp"}
          </Text>
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

      {/* Full-screen photo viewer */}
      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedPhoto(null)}
        >
          <View style={styles.modalContent}>
            {selectedPhoto && (
              <Image
                source={{ uri: selectedPhoto }}
                style={styles.modalImage}
                contentFit="contain"
                transition={200}
              />
            )}
            <Pressable
              onPress={() => setSelectedPhoto(null)}
              style={styles.modalCloseButton}
            >
              <MaterialIcons name="close" size={28} color="#FFFFFF" />
            </Pressable>
            {selectedPhoto && (
              <Pressable
                onPress={() => {
                  if (selectedPhoto) sharePhoto(selectedPhoto);
                }}
                style={styles.modalShareButton}
              >
                <MaterialIcons name="share" size={24} color="#FFFFFF" />
                <Text style={styles.modalShareText}>Teilen</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
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
    flexWrap: "wrap",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 0.5,
    marginBottom: 12,
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 14,
  },
  pdfBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 20,
    gap: 12,
  },
  pdfBannerText: {
    flex: 1,
  },
  pdfBannerTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  pdfBannerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  photoThumbnail: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 8,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoIndex: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  photoIndexText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  photoHint: {
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_WIDTH - 32,
    borderRadius: 8,
  },
  modalCloseButton: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalShareButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  modalShareText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
});
