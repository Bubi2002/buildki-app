/**
 * protoKI – Video-Upload & Transkription (Enhanced)
 * 
 * Features:
 * 1. Videos aus Galerie/WhatsApp/externen Quellen/Kamera
 * 2. Video-Thumbnail-Vorschau vor Verarbeitung
 * 3. Batch-Import: mehrere Videos auf einmal
 * 4. Dokumenttyp-Wahl nach Transkription
 */

import { useState, useEffect, useRef } from "react";
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
import { useTranslation } from "@/lib/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { trpc } from "@/lib/trpc";
import { getVideoUploadGate } from "@/lib/video-upload-gate";
import {
  estimateDecodedBase64Bytes,
  validateVideoSizeBytes,
} from "@/lib/video-upload-validation";
import { createAsyncInvocationGuard } from "@/lib/async-invocation-guard";
import { getPrivacyChoices } from "@/lib/privacy-consent";
import {
  extractCandidateFramesFromSegments,
  type TranscriptSegment,
} from "@/lib/video-evidence";
import {
  createVideoImportProtocolId,
  getVideoImportCompletionDecision,
  summarizeVideoImportResults,
} from "@/lib/video-import-results";

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
  transcriptionSegments?: TranscriptSegment[];
  detectedLanguage?: string;
  errorMessage?: string;
};

// label/description hold translation KEYs, resolved with t() at render.
const DOC_TYPES: { key: DocType; label: string; icon: string; description: string }[] = [
  { key: "protokoll", label: "video_upload_doctype_protokoll_label", icon: "description", description: "video_upload_doctype_protokoll_desc" },
  { key: "zusammenfassung", label: "zusammenfassung", icon: "summarize", description: "video_upload_doctype_zusammenfassung_desc" },
  { key: "bautagebuch", label: "video_upload_doctype_bautagebuch_label", icon: "menu-book", description: "video_upload_doctype_bautagebuch_desc" },
];

export default function VideoUploadScreen() {
  const { t } = useTranslation();
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
  const [createdProtocolId, setCreatedProtocolId] = useState<string | null>(null);
  const [createdVideoCount, setCreatedVideoCount] = useState(0);
  const [createdFailedCount, setCreatedFailedCount] = useState(0);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const filePickerGuard = useRef(createAsyncInvocationGuard());
  const queueSummary = summarizeVideoImportResults(queue);

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
        Alert.alert(t('alert_berechtigung'), t('video_upload_zugriff_medien' as any));
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
      Alert.alert(t('error'), err.message || t('video_upload_videos_load_failed' as any));
    }
  };

  const recordWithCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t('alert_berechtigung'), t('video_upload_kamerazugriff' as any));
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
      Alert.alert(t('error'), err.message || t('video_upload_aufnahme_failed' as any));
    }
  };

  const pickFromFiles = async () => {
    try {
      const invocation = await filePickerGuard.current.run(async () => {
        setIsFilePickerOpen(true);
        try {
          return await DocumentPicker.getDocumentAsync({
            type: ["video/*", "audio/*"],
            copyToCacheDirectory: true,
            multiple: true,
          });
        } finally {
          setIsFilePickerOpen(false);
        }
      });

      if (!invocation.started) return;
      const result = invocation.value;
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
      Alert.alert(t('error'), err.message || t('video_upload_dateien_load_failed' as any));
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
        uploadGate.title || t('video_upload_anmeldung_erforderlich' as any),
        uploadGate.message || t('video_upload_bitte_anmelden_videos' as any),
        [
          { text: t('cancel'), style: "cancel" },
          { text: uploadGate.actionLabel || t('anmelden'), onPress: openLogin },
        ],
      );
      return;
    }

    Alert.alert(
      uploadGate.title || t('video_upload_upload_nicht_verfuegbar' as any),
      uploadGate.message || t('video_upload_bitte_spaeter' as any),
    );
  };

  const processQueue = async (itemsToProcess: QueueItem[] = queue) => {
    if (itemsToProcess.length === 0) return;
    const privacyChoices = await getPrivacyChoices();
    if (!privacyChoices.cloudSync || !privacyChoices.aiProcessing) {
      Alert.alert(
        t('video_upload_cloud_ki_deaktiviert' as any),
        t('video_upload_cloud_ki_deaktiviert_msg' as any),
      );
      return;
    }
    if (!uploadGate.allowed) {
      showBlockedUploadMessage();
      return;
    }
    if (!activeProject) {
      Alert.alert(t('kein_projekt'), t('video_upload_bitte_projekt_tools' as any));
      return;
    }

    setCreatedProtocolId(null);
    setCreatedVideoCount(0);
    setCreatedFailedCount(0);
    setErrorMessage("");
    setTranscription("");

    let results = itemsToProcess.map((item) => ({ ...item }));
    setQueue(results);

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "done" && results[i].transcription?.trim()) continue;
      setCurrentIndex(i);
      results = results.map((item, index) =>
        index === i ? { ...item, status: "processing", errorMessage: undefined } : item,
      );
      setQueue([...results]);
      
      try {
        const processed = await processSingleVideo(results[i].video, i);
        results = results.map((item, index) =>
          index === i
            ? {
                ...item,
                ...processed,
                status: "done",
                errorMessage: undefined,
              }
            : item,
        );
      } catch (err: any) {
        results = results.map((item, index) =>
          index === i
            ? {
                ...item,
                status: "error",
                transcription: undefined,
                transcriptionSegments: undefined,
                detectedLanguage: undefined,
                errorMessage: err?.message || t('video_upload_video_process_failed' as any),
              }
            : item,
        );
      }
      setQueue([...results]);
    }

    const completion = getVideoImportCompletionDecision(results);
    const combinedTranscription = completion.successfulItems
      .map(
        (item) =>
          `[${item.video.name}] (${t('video_upload_sprache_label' as any)}: ${item.detectedLanguage || t('video_upload_unbekannt' as any)})\n${item.transcription!.trim()}`,
      )
      .join("\n\n---\n\n");

    setQueue([...results]);
    setTranscription(combinedTranscription);
    setCurrentIndex(-1);

    if (!completion.canFinalize) {
      setErrorMessage(completion.errorMessage);
      setStep("error");
      return;
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

    let sizeValidation = validateVideoSizeBytes(video.size);
    if (sizeValidation.sizeBytes === null) {
      const fileInfo = await FileSystem.getInfoAsync(video.uri);
      const fileSize = fileInfo.exists && "size" in fileInfo ? fileInfo.size : null;
      sizeValidation = validateVideoSizeBytes(fileSize);
    }
    if (!sizeValidation.allowed) {
      throw new Error(sizeValidation.error);
    }

    const base64 = await FileSystem.readAsStringAsync(video.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Fallback for providers that do not expose a file size before reading.
    const decodedValidation = validateVideoSizeBytes(
      estimateDecodedBase64Bytes(base64),
    );
    if (!decodedValidation.allowed) {
      throw new Error(decodedValidation.error);
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
    const detectedLang = transcribeResult.language || t('video_upload_unbekannt' as any);
    const segments: TranscriptSegment[] = Array.isArray(transcribeResult.segments)
      ? transcribeResult.segments
          .filter(
            (segment: any) =>
              Number.isFinite(segment?.start) &&
              Number.isFinite(segment?.end) &&
              typeof segment?.text === "string",
          )
          .map((segment: any) => ({
            start: Math.max(0, Number(segment.start)),
            end: Math.max(Number(segment.start), Number(segment.end)),
            text: segment.text.trim(),
          }))
      : [];
    setProgress(100);
    return {
      transcription: timestampedText,
      transcriptionSegments: segments,
      detectedLanguage: detectedLang,
    };
  };

  const finalizeWithDocType = async (docType: DocType) => {
    setSelectedDocType(docType);
    const completion = getVideoImportCompletionDecision(queue);
    if (!completion.canFinalize || !activeProject) {
      setErrorMessage(
        completion.errorMessage || t('video_upload_projekt_nicht_verfuegbar' as any),
      );
      setStep("error");
      return;
    }
    setStep("generating");

    try {
      const completedVideos = completion.successfulItems;
      const allTranscriptions = completedVideos
        .map((item) => item.transcription!.trim())
        .join("\n\n");

      const docTypeLabels: Record<DocType, string> = {
        protokoll: t('video_upload_doctype_protokoll_label' as any),
        zusammenfassung: t('zusammenfassung'),
        bautagebuch: t('video_upload_doctype_bautagebuch_label' as any),
      };

      const protocolId = createVideoImportProtocolId();
      const generatedEvidenceIds: string[] = [];
      const maxFramesPerVideo = Math.max(
        1,
        Math.floor(12 / Math.max(1, completedVideos.length)),
      );

      for (const item of completedVideos) {
        if (!item.video.mimeType.startsWith("video/") || !item.transcriptionSegments?.length) {
          continue;
        }
        try {
          const frames = await extractCandidateFramesFromSegments({
            projectId: activeProject!.id,
            protocolId,
            videoUri: item.video.uri,
            sourceVideoName: item.video.name,
            segments: item.transcriptionSegments,
            maximum: maxFramesPerVideo,
          });
          generatedEvidenceIds.push(...frames.map((frame) => frame.id));
        } catch {
          // The protocol remains usable. Missing frames stay visibly absent instead
          // of being replaced by an unrelated image.
        }
      }

      const protocol = {
        id: protocolId,
        title: `${docTypeLabels[docType]}: ${completedVideos[0].video.name.replace(/\.[^.]+$/, "") || t('video_upload_video_word' as any)}`,
        createdAt: new Date().toISOString(),
        status: "ready" as const,
        transcription: allTranscriptions,
        protocol: allTranscriptions,
        projectId: activeProject!.id,
        projectName: activeProject!.name,
        source: "video",
        documentType: docType,
        videoCount: completedVideos.length,
        videoFilenames: completedVideos.map((item) => item.video.name),
        videoSources: completedVideos.map((item) => ({
          uri: item.video.uri,
          name: item.video.name,
          mimeType: item.video.mimeType,
          duration: item.video.duration,
          source: item.video.source,
          transcriptionSegments: item.transcriptionSegments || [],
        })),
        evidenceIds: generatedEvidenceIds,
      };

      const existingData = await AsyncStorage.getItem("protocols");
      const protocols = existingData ? JSON.parse(existingData) : [];
      protocols.unshift(protocol);
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));

      setCreatedProtocolId(protocolId);
      setCreatedVideoCount(completedVideos.length);
      setCreatedFailedCount(completion.failedCount);
      setStep("done");

      if (Platform.OS !== "web") {
        const Haptics = await import("expo-haptics");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setStep("error");
      setErrorMessage(err.message || t('video_upload_protokoll_erstellung_failed' as any));
    }
  };

  const reset = () => {
    setQueue([]);
    setCurrentIndex(-1);
    setStep("idle");
    setProgress(0);
    setTranscription("");
    setErrorMessage("");
    setCreatedProtocolId(null);
    setCreatedVideoCount(0);
    setCreatedFailedCount(0);
  };

  const retryFailedVideos = () => {
    const retryQueue: QueueItem[] = queue.map((item) =>
      item.status === "error" || (item.status === "done" && !item.transcription?.trim())
        ? {
            ...item,
            status: "pending",
            transcription: undefined,
            transcriptionSegments: undefined,
            detectedLanguage: undefined,
            errorMessage: undefined,
          }
        : item,
    );
    setStep("idle");
    setErrorMessage("");
    setProgress(0);
    void processQueue(retryQueue);
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('video_upload_video_import_title' as any)}</Text>
        {queue.length > 0 && step === "idle" && (
          <Pressable onPress={reset} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: "#F87171", fontSize: 14, fontWeight: "600" }}>{t('video_upload_leeren' as any)}</Text>
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
              <Text style={[styles.introTitle, { color: colors.foreground }]}>{t('video_upload_video_importieren' as any)}</Text>
              <Text style={[styles.introText, { color: colors.muted }]}>
                {t('video_upload_intro_text' as any)}
              </Text>
            </View>

            <View style={styles.pickSection}>
              <Pressable onPress={pickFromGallery} style={({ pressed }) => [styles.pickButton, { opacity: pressed ? 0.8 : 1 }]}>
                <MaterialIcons name="photo-library" size={28} color="#5DADE2" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickButtonTitle}>{t('video_upload_galerie_whatsapp' as any)}</Text>
                  <Text style={styles.pickButtonHint}>{t('video_upload_videos_alle_apps' as any)}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
              </Pressable>

              <Pressable
                onPress={pickFromFiles}
                disabled={isFilePickerOpen}
                accessibilityState={{ disabled: isFilePickerOpen, busy: isFilePickerOpen }}
                style={({ pressed }) => [
                  styles.pickButton,
                  isFilePickerOpen && styles.pickButtonBusy,
                  { opacity: pressed && !isFilePickerOpen ? 0.8 : 1 },
                ]}
              >
                <MaterialIcons name="folder-open" size={28} color="#FF9800" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickButtonTitle}>{t('video_upload_dateien_downloads' as any)}</Text>
                  <Text style={styles.pickButtonHint}>
                    {isFilePickerOpen ? t('video_upload_dateiauswahl_offen' as any) : t('video_upload_email_dropbox_downloads' as any)}
                  </Text>
                </View>
                {isFilePickerOpen ? (
                  <ActivityIndicator size="small" color="#FF9800" />
                ) : (
                  <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
                )}
              </Pressable>

              <Pressable onPress={recordWithCamera} style={({ pressed }) => [styles.pickButton, { opacity: pressed ? 0.8 : 1 }]}>
                <MaterialIcons name="videocam" size={28} color="#E53935" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickButtonTitle}>{t('kamera')}</Text>
                  <Text style={styles.pickButtonHint}>{t('video_upload_neues_video' as any)}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
              </Pressable>
            </View>
          </>
        )}

        {/* Queue Preview */}
        {queue.length > 0 && step === "idle" && (
          <>
            <Text style={styles.sectionLabel}>{queue.length} {queue.length === 1 ? t('video_upload_video_uc' as any) : t('video_upload_videos_uc' as any)} {t('video_upload_ausgewaehlt_uc' as any)}</Text>
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
                <Text style={styles.addMoreText}>{t('video_upload_weitere_hinzufuegen' as any)}</Text>
              </Pressable>
            </View>

            {/* Process Button */}
            <Pressable
              onPress={() => void processQueue()}
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
                {queue.length === 1 ? t('video_upload_video_verarbeiten' as any) : `${queue.length} ${t('video_upload_videos_verarbeiten_suffix' as any)}`}
              </Text>
            </Pressable>
          </>
        )}

        {/* Processing State */}
        {(step === "uploading" || step === "transcribing") && (
          <View style={styles.processingSection}>
            <ActivityIndicator size="large" color="#5DADE2" />
            <Text style={[styles.processingLabel, { color: colors.foreground }]}>
              {step === "uploading" ? t('video_upload_wird_hochgeladen' as any) : t('video_upload_wird_transkribiert' as any)}
            </Text>
            {queue.length > 1 && (
              <Text style={[styles.processingSubLabel, { color: colors.muted }]}>
                {t('video_upload_video_word' as any)} {currentIndex + 1} {t('video_upload_von' as any)} {queue.length}
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
            <Text style={[styles.docTypeTitle, { color: colors.foreground }]}>{t('video_upload_transkription_abgeschlossen' as any)}</Text>
            <Text style={[styles.docTypeSubtitle, { color: colors.muted }]}>
              {queueSummary.failedCount > 0
                ? `${queueSummary.successfulCount} ${t('video_upload_von' as any)} ${queueSummary.totalCount} ${t('video_upload_videos_erfolgreich' as any)} ${queueSummary.failedCount} ${t('video_upload_failed_which_doc' as any)}`
                : t('video_upload_welches_dokument' as any)}
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
                    <Text style={styles.docTypeCardTitle}>{t(dt.label as any)}</Text>
                    <Text style={styles.docTypeCardDesc}>{t(dt.description as any)}</Text>
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
            <Text style={[styles.processingLabel, { color: colors.foreground }]}>{t('video_upload_protokoll_wird_erstellt' as any)}</Text>
          </View>
        )}

        {/* Error State */}
        {step === "error" && (
          <View style={styles.errorSection}>
            <MaterialIcons name="error-outline" size={40} color="#F87171" />
            <Text style={[styles.errorTitle, { color: colors.foreground }]}>{t('video_upload_kein_video_verarbeitet' as any)}</Text>
            <Text style={[styles.errorMessage, { color: colors.muted }]}>{errorMessage}</Text>
            <View style={styles.errorActions}>
              <Pressable onPress={retryFailedVideos} style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.8 : 1 }]}>
                <MaterialIcons name="refresh" size={18} color="#07131F" />
                <Text style={styles.retryButtonText}>{t('video_upload_erneut_verarbeiten' as any)}</Text>
              </Pressable>
              <Pressable onPress={reset} style={({ pressed }) => [styles.newSelectionButton, { opacity: pressed ? 0.8 : 1 }]}>
                <MaterialIcons name="video-library" size={18} color="#5DADE2" />
                <Text style={styles.newSelectionButtonText}>{t('video_upload_neue_auswahl' as any)}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Success State */}
        {step === "done" && (
          <View style={styles.doneSection}>
            <MaterialIcons name="check-circle" size={48} color="#4ADE80" />
            <Text style={[styles.doneTitle, { color: colors.foreground }]}>{t('video_upload_protokoll_erstellt' as any)}</Text>
            <Text style={[styles.doneText, { color: colors.muted }]}>
              {createdFailedCount > 0
                ? `${createdVideoCount} ${t('video_upload_von' as any)} ${createdVideoCount + createdFailedCount} ${t('video_upload_videos_word' as any)} ${t('video_upload_verarbeitet_als' as any)} ${t((DOC_TYPES.find(d => d.key === selectedDocType)?.label ?? '') as any)}.`
                : `${createdVideoCount} ${createdVideoCount === 1 ? t('video_upload_video_word' as any) : t('video_upload_videos_word' as any)} ${t('video_upload_verarbeitet_als' as any)} ${t((DOC_TYPES.find(d => d.key === selectedDocType)?.label ?? '') as any)}.`}
            </Text>

            {transcription.length > 0 && (
              <View style={[styles.transcriptionPreview, { borderColor: colors.border }]}>
                <Text style={[styles.transcriptionLabel, { color: colors.muted }]}>{t('video_upload_transkription_vorschau' as any)}</Text>
                <Text style={[styles.transcriptionText, { color: colors.foreground }]} numberOfLines={8}>
                  {transcription}
                </Text>
              </View>
            )}

            <View style={styles.doneActions}>
              {createdProtocolId && (
                <Pressable
                  onPress={() => router.push(`/protocol-detail?id=${createdProtocolId}` as any)}
                  style={({ pressed }) => [styles.doneButton, styles.donePrimaryButton, { opacity: pressed ? 0.85 : 1 }]}
                >
                  <MaterialIcons name="description" size={18} color="#fff" />
                  <Text style={styles.donePrimaryText}>{t('video_upload_protokoll_anzeigen' as any)}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={reset}
                style={({ pressed }) => [styles.doneButton, styles.doneSecondaryButton, { opacity: pressed ? 0.85 : 1 }]}
              >
                <MaterialIcons name="add" size={18} color="#5DADE2" />
                <Text style={styles.doneSecondaryText}>{t('video_upload_weitere_videos' as any)}</Text>
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
  pickButtonBusy: { opacity: 0.65 },
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
  errorActions: { width: "100%", gap: 10, marginTop: 8 },
  retryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: "#5DADE2" },
  retryButtonText: { fontSize: 14, fontWeight: "700", color: "#07131F" },
  newSelectionButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F1E30" },
  newSelectionButtonText: { fontSize: 14, fontWeight: "700", color: "#5DADE2" },
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
