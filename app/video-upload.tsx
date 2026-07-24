/**
 * protoKI – Video-Upload & Transkription (Enhanced)
 * 
 * Features:
 * 1. Videos aus Galerie/WhatsApp/externen Quellen/Kamera
 * 2. Video-Thumbnail-Vorschau vor Verarbeitung
 * 3. Batch-Import: mehrere Videos auf einmal
 * 4. Dokumenttyp-Wahl nach Transkription
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
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { trpc } from "@/lib/trpc";
import { getVideoUploadGate } from "@/lib/video-upload-gate";

type VideoFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  duration?: number;
  source: "gallery" | "camera" | "file";
  thumbnailUri?: string;
};

type DocType = "protokoll" | "zusammenfassung" | "bautagebuch";

type ProcessingStep = "idle" | "uploading" | "transcribing" | "choose_type" | "generating" | "done" | "error";

type QueueItem = {
  video: VideoFile;
  status: "pending" | "processing" | "done" | "error";
  transcription?: string;
  errorMessage?: string;
};

const DOC_TYPES: { key: DocType; label: string; icon: string; description: string }[] = [
  { key: "protokoll", label: "Besprechungsprotokoll", icon: "description", description: "Formelles Protokoll mit Teilnehmern, Themen, Beschlüssen" },
  { key: "zusammenfassung", label: "Zusammenfassung", icon: "summarize", description: "Kompakte Zusammenfassung der wichtigsten Punkte" },
  { key: "bautagebuch", label: "Bautagebuch-Eintrag", icon: "menu-book", description: "Tagesbericht mit Wetter, Gewerken, Fortschritt" },
];

export default function VideoUploadScreen() {
  const colors = useColors();
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { isConnected } = useNetworkStatus();
  const uploadGate = getVideoUploadGate({
    authLoading,
    isAuthenticated,
    isConnected,
  });
  const uploadGateColor =
    uploadGate.reason === "offline"
      ? colors.warning
      : uploadGate.reason === "auth-required"
        ? colors.error
        : colors.muted;
  const uploadGateIcon =
    uploadGate.reason === "offline"
      ? "cloud-off"
      : uploadGate.reason === "auth-required"
        ? "lock-outline"
        : "hourglass-top";

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [step, setStep] = useState<ProcessingStep>("idle");
  const [progress, setProgress] = useState(0);
  const [transcription, setTranscription] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<DocType>("protokoll");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [completedCount, setCompletedCount] = useState(0);

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

  const generateThumbnail = async (uri: string): Promise<string | undefined> => {
    try {
      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, { time: 1000 });
      return thumbUri;
    } catch {
      return undefined;
    }
  };

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
        allowsMultipleSelection: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newItems: QueueItem[] = [];
        for (const asset of result.assets) {
          const thumbnail = await generateThumbnail(asset.uri);
          newItems.push({
            video: {
              uri: asset.uri,
              name: asset.fileName || `video_${Date.now()}_${newItems.length}.mp4`,
              mimeType: asset.mimeType || "video/mp4",
              size: asset.fileSize,
              duration: asset.duration ? Math.round(asset.duration / 1000) : undefined,
              source: "gallery",
              thumbnailUri: thumbnail,
            },
            status: "pending",
          });
        }
        setQueue(prev => [...prev, ...newItems]);
      }
    } catch (err: any) {
      Alert.alert("Fehler", err.message || "Videos konnten nicht geladen werden.");
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
        const thumbnail = await generateThumbnail(asset.uri);
        setQueue(prev => [...prev, {
          video: {
            uri: asset.uri,
            name: asset.fileName || `recording_${Date.now()}.mp4`,
            mimeType: asset.mimeType || "video/mp4",
            size: asset.fileSize,
            duration: asset.duration ? Math.round(asset.duration / 1000) : undefined,
            source: "camera",
            thumbnailUri: thumbnail,
          },
          status: "pending",
        }]);
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
        multiple: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newItems: QueueItem[] = [];
        for (const asset of result.assets) {
          const isVideo = (asset.mimeType || "").startsWith("video/");
          const thumbnail = isVideo ? await generateThumbnail(asset.uri) : undefined;
          newItems.push({
            video: {
              uri: asset.uri,
              name: asset.name,
              mimeType: asset.mimeType || "video/mp4",
              size: asset.size || undefined,
              source: "file",
              thumbnailUri: thumbnail,
            },
            status: "pending",
          });
        }
        setQueue(prev => [...prev, ...newItems]);
      }
    } catch (err: any) {
      Alert.alert("Fehler", err.message || "Dateien konnten nicht geladen werden.");
    }
  };

  const removeFromQueue = (index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  };

  const openLogin = () => {
    router.push("/login" as any);
  };

  const showBlockedUploadMessage = () => {
    if (uploadGate.reason === "auth-required") {
      Alert.alert(
        uploadGate.title || "Anmeldung erforderlich",
        uploadGate.message || "Bitte melde dich an, um Videos zu verarbeiten.",
        [
          { text: "Abbrechen", style: "cancel" },
          { text: uploadGate.actionLabel || "Anmelden", onPress: openLogin },
        ],
      );
      return;
    }

    Alert.alert(
      uploadGate.title || "Video-Upload nicht verfügbar",
      uploadGate.message || "Bitte versuche es später erneut.",
    );
  };

  const processQueue = async () => {
    if (queue.length === 0) return;
    if (!uploadGate.allowed) {
      showBlockedUploadMessage();
      return;
    }
    if (!activeProject) {
      Alert.alert("Kein Projekt", "Bitte wähle zuerst ein Projekt im Tools-Tab aus.");
      return;
    }

    setCompletedCount(0);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === "done") continue;
      setCurrentIndex(i);
      setQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "processing" } : item));
      
      try {
        await processSingleVideo(queue[i].video, i);
        setQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "done" } : item));
        setCompletedCount(c => c + 1);
      } catch (err: any) {
        setQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "error", errorMessage: err.message } : item));
      }
    }
    setStep("choose_type");
  };

  const formatTimestamp = (seconds: number): string => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const formatTranscriptionWithTimestamps = (result: any): string => {
    if (result.segments && result.segments.length > 0) {
      return result.segments
        .map((seg: any) => `[${formatTimestamp(seg.start)}] ${seg.text.trim()}`)
        .join("\n");
    }
    return result.text;
  };

  const processSingleVideo = async (video: VideoFile, _index: number) => {
    setStep("uploading");
    setProgress(10);

    const base64 = await FileSystem.readAsStringAsync(video.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const sizeMB = (base64.length * 0.75) / (1024 * 1024);
    if (sizeMB > 50) {
      throw new Error(`Video zu groß: ${sizeMB.toFixed(1)}MB (max 50MB)`);
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
      language: "auto",
      prompt: "Transcribe the spoken audio accurately. Detect the language automatically.",
    });

    setProgress(80);
    const timestampedText = formatTranscriptionWithTimestamps(transcribeResult);
    const detectedLang = transcribeResult.language || "unbekannt";
    const header = `[${video.name}] (Sprache: ${detectedLang})`;
    setTranscription(prev => prev + (prev ? "\n\n---\n\n" : "") + `${header}\n${timestampedText}`);
    setQueue(prev => prev.map((item) => 
      item.video.uri === video.uri ? { ...item, transcription: timestampedText } : item
    ));
    setProgress(100);
  };

  const finalizeWithDocType = async (docType: DocType) => {
    setSelectedDocType(docType);
    setStep("generating");

    try {
      const allTranscriptions = queue
        .filter(item => item.transcription)
        .map(item => item.transcription)
        .join("\n\n");

      const docTypeLabels: Record<DocType, string> = {
        protokoll: "Besprechungsprotokoll",
        zusammenfassung: "Zusammenfassung",
        bautagebuch: "Bautagebuch-Eintrag",
      };

      const protocolId = `video_${Date.now()}`;
      const protocol = {
        id: protocolId,
        title: `${docTypeLabels[docType]}: ${queue[0]?.video.name.replace(/\.[^.]+$/, "") || "Video"}`,
        createdAt: new Date().toISOString(),
        status: "ready" as const,
        transcription: allTranscriptions,
        projectId: activeProject!.id,
        source: "video",
        documentType: docType,
        videoCount: queue.filter(i => i.status === "done").length,
        videoFilenames: queue.filter(i => i.status === "done").map(i => i.video.name),
      };

      const existingData = await AsyncStorage.getItem("protocols");
      const protocols = existingData ? JSON.parse(existingData) : [];
      protocols.unshift(protocol);
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));

      setStep("done");

      if (Platform.OS !== "web") {
        const Haptics = require("expo-haptics");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setStep("error");
      setErrorMessage(err.message || "Protokoll-Erstellung fehlgeschlagen");
    }
  };

  const reset = () => {
    setQueue([]);
    setCurrentIndex(-1);
    setStep("idle");
    setProgress(0);
    setTranscription("");
    setErrorMessage("");
    setCompletedCount(0);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "";
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Video-Import</Text>
        {queue.length > 0 && step === "idle" && (
          <Pressable onPress={reset} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: "#F87171", fontSize: 14, fontWeight: "600" }}>Leeren</Text>
          </Pressable>
        )}
        {queue.length === 0 && <View style={{ width: 24 }} />}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {activeProject && (
          <View style={styles.projectBadge}>
            <MaterialIcons name="folder" size={14} color="#5DADE2" />
            <Text style={styles.projectBadgeText}>{activeProject.name}</Text>
          </View>
        )}

        {step === "idle" && !uploadGate.allowed && (
          <View
            style={[
              styles.uploadGateBanner,
              {
                borderColor: uploadGateColor,
                backgroundColor: `${uploadGateColor}18`,
              },
            ]}
            accessibilityRole="alert"
          >
            <MaterialIcons
              name={uploadGateIcon as any}
              size={22}
              color={uploadGateColor}
            />
            <View style={styles.uploadGateContent}>
              <Text style={[styles.uploadGateTitle, { color: colors.foreground }]}>
                {uploadGate.title}
              </Text>
              <Text style={[styles.uploadGateMessage, { color: colors.muted }]}>
                {uploadGate.message}
              </Text>
              {uploadGate.reason === "auth-required" && (
                <Pressable
                  onPress={openLogin}
                  style={({ pressed }) => [
                    styles.uploadGateAction,
                    { borderColor: uploadGateColor, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.uploadGateActionText, { color: uploadGateColor }]}>
                    {uploadGate.actionLabel}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Empty State / Picker */}
        {queue.length === 0 && step === "idle" && (
          <>
            <View style={styles.introSection}>
              <MaterialIcons name="videocam" size={40} color="#5DADE2" />
              <Text style={[styles.introTitle, { color: colors.foreground }]}>Video importieren</Text>
              <Text style={[styles.introText, { color: colors.muted }]}>
                Importiere Videos aus WhatsApp, Galerie, E-Mail oder anderen Apps. Mehrfachauswahl möglich.
              </Text>
            </View>

            <View style={styles.pickSection}>
              <Pressable onPress={pickFromGallery} style={({ pressed }) => [styles.pickButton, { opacity: pressed ? 0.8 : 1 }]}>
                <MaterialIcons name="photo-library" size={28} color="#5DADE2" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickButtonTitle}>Galerie / WhatsApp</Text>
                  <Text style={styles.pickButtonHint}>Videos aus allen Apps (Mehrfachauswahl)</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
              </Pressable>

              <Pressable onPress={pickFromFiles} style={({ pressed }) => [styles.pickButton, { opacity: pressed ? 0.8 : 1 }]}>
                <MaterialIcons name="folder-open" size={28} color="#FF9800" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickButtonTitle}>Dateien / Downloads</Text>
                  <Text style={styles.pickButtonHint}>E-Mail-Anhänge, Dropbox, Downloads</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
              </Pressable>

              <Pressable onPress={recordWithCamera} style={({ pressed }) => [styles.pickButton, { opacity: pressed ? 0.8 : 1 }]}>
                <MaterialIcons name="videocam" size={28} color="#E53935" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickButtonTitle}>Kamera</Text>
                  <Text style={styles.pickButtonHint}>Neues Video aufnehmen</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
              </Pressable>
            </View>
          </>
        )}

        {/* Queue Preview */}
        {queue.length > 0 && step === "idle" && (
          <>
            <Text style={styles.sectionLabel}>{queue.length} {queue.length === 1 ? "VIDEO" : "VIDEOS"} AUSGEWÄHLT</Text>
            <View style={styles.queueList}>
              {queue.map((item, index) => (
                <View key={index} style={styles.queueItem}>
                  {item.video.thumbnailUri ? (
                    <Image source={{ uri: item.video.thumbnailUri }} style={styles.thumbnail} />
                  ) : (
                    <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                      <MaterialIcons name="movie" size={20} color="#5DADE2" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.queueItemName} numberOfLines={1}>{item.video.name}</Text>
                    <Text style={styles.queueItemMeta}>
                      {[formatFileSize(item.video.size), formatDuration(item.video.duration)].filter(Boolean).join(" • ")}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeFromQueue(index)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <MaterialIcons name="close" size={20} color="#F87171" />
                  </Pressable>
                </View>
              ))}
            </View>

            {/* Add more */}
            <View style={styles.addMoreRow}>
              <Pressable onPress={pickFromGallery} style={({ pressed }) => [styles.addMoreBtn, { opacity: pressed ? 0.7 : 1 }]}>
                <MaterialIcons name="add" size={16} color="#5DADE2" />
                <Text style={styles.addMoreText}>Weitere hinzufügen</Text>
              </Pressable>
            </View>

            {/* Process Button */}
            <Pressable
              onPress={processQueue}
              disabled={!uploadGate.allowed}
              accessibilityState={{ disabled: !uploadGate.allowed }}
              style={({ pressed }) => [
                styles.processButton,
                !uploadGate.allowed && styles.processButtonDisabled,
                { opacity: pressed && uploadGate.allowed ? 0.85 : 1 },
              ]}
            >
              <MaterialIcons name="auto-awesome" size={20} color="#fff" />
              <Text style={styles.processButtonText}>
                {queue.length === 1 ? "Video verarbeiten" : `${queue.length} Videos verarbeiten`}
              </Text>
            </Pressable>
          </>
        )}

        {/* Processing State */}
        {(step === "uploading" || step === "transcribing") && (
          <View style={styles.processingSection}>
            <ActivityIndicator size="large" color="#5DADE2" />
            <Text style={[styles.processingLabel, { color: colors.foreground }]}>
              {step === "uploading" ? "Video wird hochgeladen..." : "Audio wird transkribiert..."}
            </Text>
            {queue.length > 1 && (
              <Text style={[styles.processingSubLabel, { color: colors.muted }]}>
                Video {currentIndex + 1} von {queue.length}
              </Text>
            )}
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.muted }]}>{progress}%</Text>
          </View>
        )}

        {/* Document Type Selection */}
        {step === "choose_type" && (
          <View style={styles.docTypeSection}>
            <MaterialIcons name="check-circle" size={36} color="#4ADE80" />
            <Text style={[styles.docTypeTitle, { color: colors.foreground }]}>Transkription abgeschlossen!</Text>
            <Text style={[styles.docTypeSubtitle, { color: colors.muted }]}>
              Welches Dokument soll erstellt werden?
            </Text>

            <View style={styles.docTypeList}>
              {DOC_TYPES.map((dt) => (
                <Pressable
                  key={dt.key}
                  onPress={() => finalizeWithDocType(dt.key)}
                  style={({ pressed }) => [
                    styles.docTypeCard,
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <MaterialIcons name={dt.icon as any} size={24} color="#5DADE2" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docTypeCardTitle}>{dt.label}</Text>
                    <Text style={styles.docTypeCardDesc}>{dt.description}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Generating State */}
        {step === "generating" && (
          <View style={styles.processingSection}>
            <ActivityIndicator size="large" color="#5DADE2" />
            <Text style={[styles.processingLabel, { color: colors.foreground }]}>Protokoll wird erstellt...</Text>
          </View>
        )}

        {/* Error State */}
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

        {/* Success State */}
        {step === "done" && (
          <View style={styles.doneSection}>
            <MaterialIcons name="check-circle" size={48} color="#4ADE80" />
            <Text style={[styles.doneTitle, { color: colors.foreground }]}>Protokoll erstellt!</Text>
            <Text style={[styles.doneText, { color: colors.muted }]}>
              {queue.filter(i => i.status === "done").length} {queue.filter(i => i.status === "done").length === 1 ? "Video" : "Videos"} verarbeitet als {DOC_TYPES.find(d => d.key === selectedDocType)?.label}.
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
                <Text style={styles.doneSecondaryText}>Weitere Videos</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: 18, fontWeight: "700", letterSpacing: -0.3 },
  content: { padding: 20, paddingBottom: 40 },
  projectBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#1E3A5F", marginBottom: 20 },
  projectBadgeText: { fontSize: 13, fontWeight: "600", color: "#F0F4F8" },
  uploadGateBanner: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderWidth: 1, marginBottom: 20 },
  uploadGateContent: { flex: 1, gap: 4 },
  uploadGateTitle: { fontSize: 15, fontWeight: "700" },
  uploadGateMessage: { fontSize: 13, lineHeight: 19 },
  uploadGateAction: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, marginTop: 8 },
  uploadGateActionText: { fontSize: 13, fontWeight: "700" },
  introSection: { alignItems: "center", gap: 8, marginBottom: 28 },
  introTitle: { fontSize: 22, fontWeight: "700", marginTop: 8 },
  introText: { fontSize: 14, textAlign: "center", lineHeight: 20, maxWidth: 320 },
  pickSection: { gap: 12 },
  pickButton: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F1E30" },
  pickButtonTitle: { fontSize: 15, fontWeight: "700", color: "#F0F4F8" },
  pickButtonHint: { fontSize: 12, color: "#8FA3B8", marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#8FA3B8", letterSpacing: 1.2, marginBottom: 12 },
  queueList: { gap: 8, marginBottom: 16 },
  queueItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F1E30" },
  thumbnail: { width: 56, height: 42, backgroundColor: "#1E3A5F" },
  thumbnailPlaceholder: { alignItems: "center", justifyContent: "center" },
  queueItemName: { fontSize: 14, fontWeight: "600", color: "#F0F4F8" },
  queueItemMeta: { fontSize: 12, color: "#8FA3B8", marginTop: 2 },
  addMoreRow: { marginBottom: 16 },
  addMoreBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10 },
  addMoreText: { fontSize: 14, fontWeight: "600", color: "#5DADE2" },
  processButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#5DADE2", paddingVertical: 16 },
  processButtonDisabled: { backgroundColor: "#35506A", opacity: 0.65 },
  processButtonText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  processingSection: { alignItems: "center", gap: 16, paddingVertical: 40 },
  processingLabel: { fontSize: 16, fontWeight: "600" },
  processingSubLabel: { fontSize: 13 },
  progressBarBg: { width: "100%", height: 6, backgroundColor: "#1E3A5F", borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: "#5DADE2", borderRadius: 3 },
  progressText: { fontSize: 13, fontWeight: "600" },
  docTypeSection: { alignItems: "center", gap: 12, paddingVertical: 20 },
  docTypeTitle: { fontSize: 20, fontWeight: "700" },
  docTypeSubtitle: { fontSize: 14, textAlign: "center" },
  docTypeList: { width: "100%", gap: 10, marginTop: 16 },
  docTypeCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F1E30" },
  docTypeCardTitle: { fontSize: 15, fontWeight: "700", color: "#F0F4F8" },
  docTypeCardDesc: { fontSize: 12, color: "#8FA3B8", marginTop: 2 },
  errorSection: { alignItems: "center", gap: 12, paddingVertical: 40 },
  errorTitle: { fontSize: 18, fontWeight: "700" },
  errorMessage: { fontSize: 14, textAlign: "center", maxWidth: 300 },
  retryButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: "#1E3A5F", marginTop: 8 },
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
