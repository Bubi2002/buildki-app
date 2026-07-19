/**
 * protoKI – Video-Upload & Transkription
 * 
 * Ermöglicht dem Bauleiter:
 * 1. Videos aus der Galerie/WhatsApp/externen Quellen auszuwählen
 * 2. Videos mit der Kamera aufzunehmen
 * 3. Audio-Spur extrahieren und per KI transkribieren
 * 4. Protokoll aus dem Video-Inhalt generieren
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type VideoFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  source: "gallery" | "camera" | "file";
};

type ProcessingStep = "idle" | "uploading" | "transcribing" | "generating" | "done" | "error";

export default function VideoUploadScreen() {
  const colors = useColors();
  const router = useRouter();

  const [video, setVideo] = useState<VideoFile | null>(null);
  const [step, setStep] = useState<ProcessingStep>("idle");
  const [progress, setProgress] = useState(0);
  const [transcription, setTranscription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);

  const uploadMutation = trpc.upload.audio.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation();

  useEffect(() => {
    (async () => {
      try {
        const projectsJson = await AsyncStorage.getItem("projects");
        const lastId = await AsyncStorage.getItem("last-selected-project-id");
        if (projectsJson && lastId) {
          const projects = JSON.parse(projectsJson);
          const project = projects.find((p: any) => p.id === lastId);
          if (project) setActiveProject({ id: project.id, name: project.name });
        }
      } catch {}
    })();
  }, []);

  const pickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Berechtigung", "Zugriff auf Medien wird benötigt.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        quality: 0.8,
        videoMaxDuration: 600,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setVideo({
          uri: asset.uri,
          name: asset.fileName || `video_${Date.now()}.mp4`,
          mimeType: asset.mimeType || "video/mp4",
          size: asset.fileSize,
          source: "gallery",
        });
      }
    } catch (err: any) {
      Alert.alert("Fehler", err.message || "Video konnte nicht geladen werden.");
    }
  };

  const recordWithCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Berechtigung", "Kamerazugriff wird benötigt.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["videos"],
        quality: 0.8,
        videoMaxDuration: 600,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setVideo({
          uri: asset.uri,
          name: asset.fileName || `recording_${Date.now()}.mp4`,
          mimeType: asset.mimeType || "video/mp4",
          size: asset.fileSize,
          source: "camera",
        });
      }
    } catch (err: any) {
      Alert.alert("Fehler", err.message || "Aufnahme fehlgeschlagen.");
    }
  };

  const pickFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["video/*", "audio/*"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setVideo({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || "video/mp4",
          size: asset.size || undefined,
          source: "file",
        });
      }
    } catch (err: any) {
      Alert.alert("Fehler", err.message || "Datei konnte nicht geladen werden.");
    }
  };

  const processVideo = async () => {
    if (!video) return;
    if (!activeProject) {
      Alert.alert("Kein Projekt", "Bitte wähle zuerst ein Projekt im Tools-Tab aus.");
      return;
    }

    setStep("uploading");
    setProgress(0);
    setErrorMessage("");
    setTranscription("");

    try {
      setProgress(10);
      const base64 = await FileSystem.readAsStringAsync(video.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const sizeMB = (base64.length * 0.75) / (1024 * 1024);
      if (sizeMB > 50) {
        throw new Error(`Video zu groß: ${sizeMB.toFixed(1)}MB (max 50MB). Bitte ein kürzeres Video verwenden.`);
      }

      setProgress(30);

      const uploadResult = await uploadMutation.mutateAsync({
        base64,
        mimeType: video.mimeType,
        filename: video.name,
      });

      setProgress(50);
      setStep("transcribing");

      const transcribeResult = await transcribeMutation.mutateAsync({
        audioUrl: uploadResult.url,
        language: "de",
        prompt: "Transkribiere das gesprochene Video auf Deutsch. Es handelt sich um eine Baustellenbegehung oder Besprechung.",
      });

      setProgress(80);
      setTranscription(transcribeResult.text);
      setStep("generating");

      const protocolId = `video_${Date.now()}`;
      const protocol = {
        id: protocolId,
        title: `Video-Protokoll: ${video.name.replace(/\.[^.]+$/, "")}`,
        createdAt: new Date().toISOString(),
        status: "ready" as const,
        transcription: transcribeResult.text,
        projectId: activeProject.id,
        source: "video",
        videoFilename: video.name,
        duration: transcribeResult.duration || null,
      };

      const existingData = await AsyncStorage.getItem("protocols");
      const protocols = existingData ? JSON.parse(existingData) : [];
      protocols.unshift(protocol);
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));

      setProgress(100);
      setStep("done");

      if (Platform.OS !== "web") {
        const Haptics = require("expo-haptics");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setStep("error");
      setErrorMessage(err.message || "Verarbeitung fehlgeschlagen");
    }
  };

  const reset = () => {
    setVideo(null);
    setStep("idle");
    setProgress(0);
    setTranscription("");
    setErrorMessage("");
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unbekannt";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "gallery": return "Galerie / WhatsApp / Extern";
      case "camera": return "Kamera-Aufnahme";
      case "file": return "Datei / Dokument";
      default: return source;
    }
  };

  const getStepLabel = (s: ProcessingStep) => {
    switch (s) {
      case "uploading": return "Video wird hochgeladen...";
      case "transcribing": return "Audio wird transkribiert...";
      case "generating": return "Protokoll wird erstellt...";
      case "done": return "Fertig!";
      case "error": return "Fehler";
      default: return "";
    }
  };

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Video-Import</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {activeProject && (
          <View style={[styles.projectBadge, { borderColor: "#1E3A5F" }]}>
            <MaterialIcons name="folder" size={14} color="#5DADE2" />
            <Text style={styles.projectBadgeText}>{activeProject.name}</Text>
          </View>
        )}

        <View style={styles.introSection}>
          <MaterialIcons name="videocam" size={40} color="#5DADE2" />
          <Text style={[styles.introTitle, { color: colors.foreground }]}>Video importieren</Text>
          <Text style={[styles.introText, { color: colors.muted }]}>
            Importiere Videos aus WhatsApp, Galerie, E-Mail oder anderen Apps. Die Sprache wird automatisch erkannt und als Protokoll gespeichert.
          </Text>
        </View>

        {!video && step === "idle" && (
          <View style={styles.pickSection}>
            <Pressable
              onPress={pickFromGallery}
              style={({ pressed }) => [styles.pickButton, { opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="photo-library" size={28} color="#5DADE2" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickButtonTitle}>Galerie / WhatsApp</Text>
                <Text style={styles.pickButtonHint}>Videos aus allen Apps auf dem Gerät</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
            </Pressable>

            <Pressable
              onPress={pickFromFiles}
              style={({ pressed }) => [styles.pickButton, { opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="folder-open" size={28} color="#FF9800" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickButtonTitle}>Dateien / Downloads</Text>
                <Text style={styles.pickButtonHint}>E-Mail-Anhänge, Dropbox, Downloads</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
            </Pressable>

            <Pressable
              onPress={recordWithCamera}
              style={({ pressed }) => [styles.pickButton, { opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="videocam" size={28} color="#E53935" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickButtonTitle}>Kamera</Text>
                <Text style={styles.pickButtonHint}>Neues Video aufnehmen</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
            </Pressable>
          </View>
        )}

        {video && step === "idle" && (
          <View style={styles.videoInfoSection}>
            <View style={styles.videoInfoCard}>
              <View style={styles.videoInfoHeader}>
                <MaterialIcons name="movie" size={24} color="#5DADE2" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.videoInfoName} numberOfLines={2}>{video.name}</Text>
                  <Text style={styles.videoInfoMeta}>
                    {formatFileSize(video.size)} • {getSourceLabel(video.source)}
                  </Text>
                </View>
                <Pressable onPress={reset} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                  <MaterialIcons name="close" size={22} color="#F87171" />
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={processVideo}
              style={({ pressed }) => [styles.processButton, { opacity: pressed ? 0.85 : 1 }]}
            >
              <MaterialIcons name="auto-awesome" size={20} color="#fff" />
              <Text style={styles.processButtonText}>Video verarbeiten & transkribieren</Text>
            </Pressable>
          </View>
        )}

        {step !== "idle" && step !== "done" && step !== "error" && (
          <View style={styles.processingSection}>
            <ActivityIndicator size="large" color="#5DADE2" />
            <Text style={[styles.processingLabel, { color: colors.foreground }]}>{getStepLabel(step)}</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.muted }]}>{progress}%</Text>
          </View>
        )}

        {step === "error" && (
          <View style={styles.errorSection}>
            <MaterialIcons name="error-outline" size={40} color="#F87171" />
            <Text style={[styles.errorTitle, { color: colors.foreground }]}>Verarbeitung fehlgeschlagen</Text>
            <Text style={[styles.errorMessage, { color: colors.muted }]}>{errorMessage}</Text>
            <Pressable onPress={reset} style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="refresh" size={18} color="#5DADE2" />
              <Text style={styles.retryButtonText}>Erneut versuchen</Text>
            </Pressable>
          </View>
        )}

        {step === "done" && (
          <View style={styles.doneSection}>
            <MaterialIcons name="check-circle" size={48} color="#4ADE80" />
            <Text style={[styles.doneTitle, { color: colors.foreground }]}>Protokoll erstellt!</Text>
            <Text style={[styles.doneText, { color: colors.muted }]}>
              Das Video wurde erfolgreich transkribiert und als Protokoll gespeichert.
            </Text>

            {transcription.length > 0 && (
              <View style={[styles.transcriptionPreview, { borderColor: colors.border }]}>
                <Text style={[styles.transcriptionLabel, { color: colors.muted }]}>TRANSKRIPTION (VORSCHAU)</Text>
                <Text style={[styles.transcriptionText, { color: colors.foreground }]} numberOfLines={8}>
                  {transcription}
                </Text>
              </View>
            )}

            <View style={styles.doneActions}>
              <Pressable
                onPress={() => router.push("/(tabs)/protocols" as any)}
                style={({ pressed }) => [styles.doneButton, styles.donePrimaryButton, { opacity: pressed ? 0.85 : 1 }]}
              >
                <MaterialIcons name="description" size={18} color="#fff" />
                <Text style={styles.donePrimaryText}>Protokoll anzeigen</Text>
              </Pressable>
              <Pressable
                onPress={reset}
                style={({ pressed }) => [styles.doneButton, styles.doneSecondaryButton, { opacity: pressed ? 0.85 : 1 }]}
              >
                <MaterialIcons name="add" size={18} color="#5DADE2" />
                <Text style={styles.doneSecondaryText}>Weiteres Video</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", letterSpacing: -0.3 },
  content: { padding: 20, paddingBottom: 40 },
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    marginBottom: 20,
  },
  projectBadgeText: { fontSize: 13, fontWeight: "600", color: "#F0F4F8" },
  introSection: { alignItems: "center", gap: 8, marginBottom: 28 },
  introTitle: { fontSize: 22, fontWeight: "700", marginTop: 8 },
  introText: { fontSize: 14, textAlign: "center", lineHeight: 20, maxWidth: 320 },
  pickSection: { gap: 12 },
  pickButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1E30",
  },
  pickButtonTitle: { fontSize: 15, fontWeight: "700", color: "#F0F4F8" },
  pickButtonHint: { fontSize: 12, color: "#8FA3B8", marginTop: 2 },
  videoInfoSection: { gap: 16 },
  videoInfoCard: { padding: 16, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F1E30" },
  videoInfoHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  videoInfoName: { fontSize: 15, fontWeight: "600", color: "#F0F4F8" },
  videoInfoMeta: { fontSize: 12, color: "#8FA3B8", marginTop: 2 },
  processButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#5DADE2",
    paddingVertical: 16,
  },
  processButtonText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  processingSection: { alignItems: "center", gap: 16, paddingVertical: 40 },
  processingLabel: { fontSize: 16, fontWeight: "600" },
  progressBarBg: { width: "100%", height: 6, backgroundColor: "#1E3A5F", borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: "#5DADE2", borderRadius: 3 },
  progressText: { fontSize: 13, fontWeight: "600" },
  errorSection: { alignItems: "center", gap: 12, paddingVertical: 40 },
  errorTitle: { fontSize: 18, fontWeight: "700" },
  errorMessage: { fontSize: 14, textAlign: "center", maxWidth: 300 },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    marginTop: 8,
  },
  retryButtonText: { fontSize: 14, fontWeight: "600", color: "#5DADE2" },
  doneSection: { alignItems: "center", gap: 12, paddingVertical: 24 },
  doneTitle: { fontSize: 20, fontWeight: "700" },
  doneText: { fontSize: 14, textAlign: "center", maxWidth: 300 },
  transcriptionPreview: { width: "100%", padding: 14, borderWidth: 1, marginTop: 12 },
  transcriptionLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginBottom: 6 },
  transcriptionText: { fontSize: 13, lineHeight: 19 },
  doneActions: { flexDirection: "row", gap: 10, marginTop: 16, width: "100%" },
  doneButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  donePrimaryButton: { backgroundColor: "#5DADE2" },
  donePrimaryText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  doneSecondaryButton: { backgroundColor: "#0F1E30", borderWidth: 1, borderColor: "#1E3A5F" },
  doneSecondaryText: { fontSize: 14, fontWeight: "700", color: "#5DADE2" },
});
