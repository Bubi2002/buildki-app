import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { PROTOCOL_TEMPLATES, type ProtocolTemplate } from "@/shared/templates";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { generateProtocolPdf } from "@/lib/pdf-generator";
import { isOnline, addToQueue, getPendingCount } from "@/lib/offline-queue";
import { getCurrentEvent, addNotesToEvent, type CalendarEvent } from "@/lib/calendar-integration";
import { getCurrentLocation, formatLocation, type LocationData } from "@/lib/location-service";
import { getWeatherForLocation, formatWeatherForProtocol, type WeatherData } from "@/lib/weather-service";
import { getNextProtocolNumber } from "@/lib/protocol-numbering";

type RecordingMode = "video" | "audio";

export default function RecordScreen() {
  const colors = useColors();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewProtocol, setPreviewProtocol] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ProtocolTemplate>(
    PROTOCOL_TEMPLATES[PROTOCOL_TEMPLATES.length - 1]
  );
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [photoFlash, setPhotoFlash] = useState(false);
  const [mode, setMode] = useState<RecordingMode>("video");
  const [markers, setMarkers] = useState<Array<{ time: number; label: string }>>([]);
  const [voiceCommandActive, setVoiceCommandActive] = useState(true);
  const [currentCalendarEvent, setCurrentCalendarEvent] = useState<CalendarEvent | null>(null);
  const [recordingLocation, setRecordingLocation] = useState<LocationData | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [recentProtocols, setRecentProtocols] = useState<any[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio recorder
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const uploadMutation = trpc.upload.audio.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation();
  const protocolMutation = trpc.protocol.generate.useMutation();
  const todosMutation = trpc.protocol.extractTodos.useMutation();

  // Load recent protocols for quick access
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("protocols");
        const all = stored ? JSON.parse(stored) : [];
        setRecentProtocols(all.filter((p: any) => !p.isArchived).slice(0, 3));
      } catch {}
    })();
  }, [isProcessing]);

  // Check onboarding
  useEffect(() => {
    (async () => {
      const done = await AsyncStorage.getItem("onboarding_complete");
      if (!done) {
        router.replace("/onboarding" as any);
      }
    })();
  }, []);

  // Load default template from settings
  useEffect(() => {
    loadDefaultTemplate();
  }, []);

  // Setup audio mode for recording
  useEffect(() => {
    (async () => {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
    })();
  }, []);

  const loadDefaultTemplate = async () => {
    try {
      const settingsStr = await AsyncStorage.getItem("protokoll-settings");
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings.templateId) {
          const template = PROTOCOL_TEMPLATES.find((t) => t.id === settings.templateId);
          if (template) setSelectedTemplate(template);
        }
      }
    } catch (error) {
      // Use default
    }
  };

  // Check for current calendar event when screen loads
  useEffect(() => {
    if (Platform.OS !== "web") {
      getCurrentEvent().then(setCurrentCalendarEvent).catch(() => {});
    }
  }, []);

  const startTimer = useCallback(() => {
    setRecordingDuration(0);
    timerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Flash effect
      setPhotoFlash(true);
      setTimeout(() => setPhotoFlash(false), 150);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (photo?.uri) {
        // Copy to persistent directory
        const photoDir = `${FileSystem.documentDirectory}photos/`;
        const dirInfo = await FileSystem.getInfoAsync(photoDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(photoDir, { intermediates: true });
        }

        const filename = `photo-${Date.now()}.jpg`;
        const newUri = `${photoDir}${filename}`;
        await FileSystem.copyAsync({ from: photo.uri, to: newUri });

        setCapturedPhotos((prev) => [...prev, newUri]);
      }
    } catch (error) {
      console.error("Photo capture error:", error);
    }
  };

  // --- VIDEO RECORDING ---
  const addMarker = (label: string) => {
    setMarkers((prev) => [...prev, { time: recordingDuration, label }]);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const startVideoRecording = async () => {
    if (Platform.OS === "web") {
      alert("Videoaufnahme ist nur auf dem Handy verfügbar.");
      return;
    }
    if (!cameraRef.current) return;

    setShowTemplateSelector(false);
    setCapturedPhotos([]);
    setMarkers([]);
    setIsRecording(true);
    startTimer();

    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: 300,
      });

      stopTimer();
      setIsRecording(false);

      if (video?.uri) {
        await processRecording(video.uri, "video/mp4");
      }
    } catch (error) {
      stopTimer();
      setIsRecording(false);
      console.error("Recording error:", error);
    }
  };

  const stopVideoRecording = () => {
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
  };

  // --- AUDIO RECORDING ---
  const startAudioRecording = async () => {
    setShowTemplateSelector(false);
    setCapturedPhotos([]);
    setMarkers([]);
    setIsRecording(true);
    startTimer();

    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      stopTimer();
      setIsRecording(false);
      console.error("Audio recording error:", error);
    }
  };

  const stopAudioRecording = async () => {
    try {
      await audioRecorder.stop();
      stopTimer();
      setIsRecording(false);

      const uri = audioRecorder.uri;
      if (uri) {
        await processRecording(uri, "audio/m4a");
      }
    } catch (error) {
      stopTimer();
      setIsRecording(false);
      console.error("Audio stop error:", error);
    }
  };

  // --- UNIFIED RECORDING CONTROLS ---
  const startRecording = () => {
    // Capture location and weather at recording start
    if (Platform.OS !== "web") {
      getCurrentLocation().then((loc) => {
        setRecordingLocation(loc);
        if (loc) getWeatherForLocation(loc).then(setWeatherData).catch(() => {});
      }).catch(() => {});
    }
    if (mode === "video") {
      startVideoRecording();
    } else {
      startAudioRecording();
    }
  };

  const stopRecording = () => {
    if (mode === "video") {
      stopVideoRecording();
    } else {
      stopAudioRecording();
    }
  };

  const processRecording = async (fileUri: string, mimeType: string) => {
    setIsProcessing(true);

    try {
      // Check internet connectivity
      const online = await isOnline();
      if (!online) {
        // Save to offline queue
        await addToQueue({
          id: Date.now().toString(),
          fileUri,
          mimeType,
          templateId: selectedTemplate.id,
          photos: capturedPhotos,
          duration: recordingDuration,
          recordingMode: mode,
          createdAt: new Date().toISOString(),
        });
        setIsProcessing(false);
        setCapturedPhotos([]);
        alert("Kein Internet – Aufnahme wurde in der Warteschlange gespeichert und wird automatisch verarbeitet, sobald du wieder online bist.");
        return;
      }

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const ext = mimeType === "video/mp4" ? "mp4" : "m4a";

      // Upload audio to storage
      const uploadResult = await uploadMutation.mutateAsync({
        base64,
        mimeType,
        filename: `recording-${Date.now()}.${ext}`,
      });

      // Transcribe audio
      const transcription = await transcribeMutation.mutateAsync({
        audioUrl: uploadResult.url,
        language: "de",
      });

      // Get settings for protocol style
      const settingsStr = await AsyncStorage.getItem("protokoll-settings");
      const settings = settingsStr ? JSON.parse(settingsStr) : {};

      // Generate protocol with selected template
      const protocol = await protocolMutation.mutateAsync({
        transcription: transcription.text,
        templateId: selectedTemplate.id,
        style: settings.style || "formal",
        format: settings.format || "bullets",
      });

      // Extract To-Dos from transcription and protocol
      let todos: Array<{ task: string; assignee: string; priority: string; deadline: string; done: boolean }> = [];
      try {
        const todosResult = await todosMutation.mutateAsync({
          transcription: transcription.text,
          protocolText: protocol.protocol,
        });
        todos = (todosResult.todos || []).map((t: any) => ({
          task: t.task || "",
          assignee: t.assignee || "Nicht zugewiesen",
          priority: t.priority || "mittel",
          deadline: t.deadline || "Offen",
          done: false,
        }));
      } catch (todoError) {
        console.error("Todo extraction error:", todoError);
      }

      // Save protocol locally with photos and todos
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );

      // Generate protocol number if project has a prefix
      let protocolNumber: string | null = null;
      const lastProjectId = await AsyncStorage.getItem("last-selected-project-id");
      if (lastProjectId) {
        protocolNumber = await getNextProtocolNumber(lastProjectId);
      }

      const newProtocol = {
        id: Date.now().toString(),
        title: transcription.text.substring(0, 50) + "...",
        transcription: transcription.text,
        protocol: protocol.protocol,
        templateName: selectedTemplate.name,
        templateId: selectedTemplate.id,
        photos: capturedPhotos,
        todos,
        markers,
        duration: recordingDuration,
        recordingMode: mode,
        createdAt: new Date().toISOString(),
        calendarEventId: null as string | null,
        location: recordingLocation ? {
          latitude: recordingLocation.latitude,
          longitude: recordingLocation.longitude,
          address: recordingLocation.address,
          city: recordingLocation.city,
        } : null,
        weather: weatherData ? formatWeatherForProtocol(weatherData) : null,
        status: "ready" as const,
        projectId: lastProjectId || undefined,
        protocolNumber: protocolNumber || undefined,
      };
      // Link to calendar event if available
      if (currentCalendarEvent && Platform.OS !== "web") {
        try {
          const summary = `Protokoll: ${newProtocol.title}\n\n${protocol.protocol.substring(0, 500)}...`;
          await addNotesToEvent(currentCalendarEvent.id, summary);
          newProtocol.calendarEventId = currentCalendarEvent.id;
        } catch {
          // Calendar linking is optional
        }
      }

      // Show preview before saving (if feature enabled)
      const { isFeatureEnabled } = require("@/lib/feature-toggles");
      const previewEnabled = await isFeatureEnabled("protocolPreview");
      if (previewEnabled) {
        setPreviewProtocol({ newProtocol, protocols });
        setShowPreview(true);
        setIsProcessing(false);
        return;
      }
      // Skip preview - save directly
      protocols.unshift(newProtocol);
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      setIsProcessing(false);
      setCapturedPhotos([]);
      router.push(`/protocol-detail?id=${newProtocol.id}` as any);
    } catch (error) {
      setIsProcessing(false);
      console.error("Processing error:", error);
      alert("Fehler bei der Verarbeitung. Bitte versuche es erneut.");
    }
  };

  const confirmSaveProtocol = async () => {
    if (!previewProtocol) return;
    const { newProtocol, protocols } = previewProtocol;
    setShowPreview(false);
    setIsProcessing(true);
    try {
      protocols.unshift(newProtocol);
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));

      // Auto-send if enabled
      try {
        const settingsStr2 = await AsyncStorage.getItem("protokoll-settings");
        const appSettings = settingsStr2 ? JSON.parse(settingsStr2) : {};
        if (appSettings.autoSend) {
          const companyStr = await AsyncStorage.getItem("company-settings");
          const companySettings = companyStr ? JSON.parse(companyStr) : {};

          const pdfHtml = await generateProtocolPdf({
            title: newProtocol.templateName || "Protokoll",
            protocol: newProtocol.protocol,
            templateName: newProtocol.templateName || "Protokoll",
            photos: newProtocol.photos || [],
            todos: newProtocol.todos || [],
            duration: newProtocol.duration,
            createdAt: newProtocol.createdAt,
            protocolNumber: newProtocol.protocolNumber,
          });

          const { uri: pdfUri } = await Print.printToFileAsync({
            html: pdfHtml,
            base64: false,
          });

          // Share via system share sheet (opens WhatsApp/Email picker)
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(pdfUri, {
              mimeType: "application/pdf",
              dialogTitle: "Protokoll senden",
              UTI: "com.adobe.pdf",
            });
          }
        }
      } catch (autoSendError) {
        console.error("Auto-send error:", autoSendError);
      }

      setIsProcessing(false);
      setCapturedPhotos([]);
      router.push(
        `/protocol-detail?id=${newProtocol.id}` as any
      );
    } catch (error) {
      setIsProcessing(false);
      console.error("Processing error:", error);
      alert("Fehler bei der Verarbeitung. Bitte versuche es erneut.");
    }
  };

  // Permission handling
  if (!cameraPermission || !micPermission) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <Text className="text-2xl font-bold text-foreground text-center mb-4">
          Berechtigungen erforderlich
        </Text>
        <Text className="text-base text-muted text-center mb-8">
          ProtoKI benötigt Zugriff auf Kamera und Mikrofon, um Videos aufzunehmen und Protokolle zu erstellen.
        </Text>
        <Pressable
          onPress={async () => {
            await requestCameraPermission();
            await requestMicPermission();
          }}
          style={({ pressed }) => [
            styles.permissionButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.permissionButtonText}>Berechtigungen erteilen</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  // Processing state
  if (isProcessing) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-xl font-semibold text-foreground mt-6 text-center">
          Verarbeitung...
        </Text>
        <Text className="text-base text-muted mt-2 text-center">
          Deine {mode === "video" ? "Aufnahme" : "Sprachnotiz"} wird transkribiert und ein {selectedTemplate.name} erstellt.
        </Text>
        {capturedPhotos.length > 0 && (
          <Text className="text-sm text-muted mt-2 text-center">
            {capturedPhotos.length} Foto{capturedPhotos.length !== 1 ? "s" : ""} werden angehängt.
          </Text>
        )}
      </ScreenContainer>
    );
  }

  // --- AUDIO MODE UI ---
  if (mode === "audio") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Audio waveform area */}
        <View style={styles.audioContainer}>
          {/* Mode toggle */}
          <View style={styles.modeToggleTop}>
            <Pressable
              onPress={() => { if (!isRecording) setMode("video"); }}
              style={({ pressed }) => [
                styles.modeButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <MaterialIcons name="videocam" size={20} color={colors.muted} />
              <Text style={[styles.modeButtonText, { color: colors.muted }]}>Video</Text>
            </Pressable>
            <View style={[styles.modeButton, styles.modeButtonActive, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
              <MaterialIcons name="mic" size={20} color={colors.primary} />
              <Text style={[styles.modeButtonText, { color: colors.primary, fontWeight: "700" }]}>Audio</Text>
            </View>
          </View>

          {/* Audio visualization */}
          <View style={styles.audioVisualArea}>
            <View style={[styles.audioCircle, { borderColor: isRecording ? colors.primary : colors.border }]}>
              <MaterialIcons
                name={isRecording ? "graphic-eq" : "mic"}
                size={64}
                color={isRecording ? colors.primary : colors.muted}
              />
            </View>
            {isRecording && (
              <View style={styles.timerContainerAudio}>
                <View style={styles.recordDot} />
                <Text style={[styles.timerTextAudio, { color: colors.foreground }]}>
                  {formatDuration(recordingDuration)}
                </Text>
              </View>
            )}
            {!isRecording && (
              <Text style={[styles.audioHintText, { color: colors.muted }]}>
                Tippe zum Starten der Sprachaufnahme
              </Text>
            )}
          </View>

          {/* Template selector */}
          {showTemplateSelector && !isRecording && (
            <View style={[styles.templateSheetAudio, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.templateSheetHeader}>
                <Text style={[styles.templateSheetTitle, { color: colors.foreground }]}>
                  Vorlage wählen
                </Text>
                <Pressable onPress={() => setShowTemplateSelector(false)}>
                  <MaterialIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>
              <ScrollView style={styles.templateList} showsVerticalScrollIndicator={false}>
                {PROTOCOL_TEMPLATES.map((template) => (
                  <Pressable
                    key={template.id}
                    onPress={() => {
                      setSelectedTemplate(template);
                      setShowTemplateSelector(false);
                    }}
                    style={({ pressed }) => [
                      styles.templateListItem,
                      {
                        backgroundColor:
                          selectedTemplate.id === template.id
                            ? colors.primary + "15"
                            : "transparent",
                        borderColor:
                          selectedTemplate.id === template.id
                            ? colors.primary
                            : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={template.icon as any}
                      size={22}
                      color={
                        selectedTemplate.id === template.id
                          ? colors.primary
                          : colors.muted
                      }
                    />
                    <View style={styles.templateListText}>
                      <Text
                        style={[
                          styles.templateListName,
                          {
                            color:
                              selectedTemplate.id === template.id
                                ? colors.primary
                                : colors.foreground,
                          },
                        ]}
                      >
                        {template.name}
                      </Text>
                      <Text
                        style={[styles.templateListDesc, { color: colors.muted }]}
                        numberOfLines={1}
                      >
                        {template.description}
                      </Text>
                    </View>
                    {selectedTemplate.id === template.id && (
                      <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Controls */}
          <View style={styles.audioControls}>
            {/* Template badge */}
            {!isRecording && (
              <Pressable
                onPress={() => setShowTemplateSelector(true)}
                style={({ pressed }) => [
                  styles.templateBadgeAudio,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name={selectedTemplate.icon as any} size={16} color={colors.primary} />
                <Text style={[styles.templateBadgeTextAudio, { color: colors.foreground }]}>{selectedTemplate.name}</Text>
                <MaterialIcons name="expand-more" size={16} color={colors.muted} />
              </Pressable>
            )}

            {/* Location badge */}
            {recordingLocation && isRecording && (
              <View style={[styles.templateBadgeAudio, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="location-on" size={16} color={colors.primary} />
                <Text style={[styles.templateBadgeTextAudio, { color: colors.muted }]} numberOfLines={1}>
                  {recordingLocation.address || recordingLocation.city || `${recordingLocation.latitude.toFixed(4)}, ${recordingLocation.longitude.toFixed(4)}`}
                </Text>
              </View>
            )}

            {/* Record button */}
            <Pressable
              onPress={isRecording ? stopRecording : startRecording}
              style={({ pressed }) => [
                styles.recordButton,
                {
                  borderColor: colors.primary,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              <View
                style={[
                  isRecording ? styles.stopIcon : styles.recordIcon,
                  { backgroundColor: colors.primary },
                ]}
              />
            </Pressable>

            <Text style={[styles.audioControlHint, { color: colors.muted }]}>
              {isRecording ? "Tippe zum Stoppen" : "Nur Sprache \u2022 Kein Video"}
            </Text>

            {/* Quick access: last 3 protocols */}
            {!isRecording && recentProtocols.length > 0 && (
              <View style={{ marginTop: 24, width: "100%", paddingHorizontal: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Letzte Protokolle</Text>
                {recentProtocols.map((p: any) => (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push(`/protocol-detail?id=${p.id}` as any)}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surface, marginBottom: 6, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name={p.recordingMode === "audio" ? "mic" : "videocam"} size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }} numberOfLines={1}>{p.templateName || "Protokoll"}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>{new Date(p.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Text>
                    </View>
                    {p.protocolNumber && <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>{p.protocolNumber}</Text>}
                    <MaterialIcons name="chevron-right" size={16} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  // --- VIDEO MODE UI ---
  // Preview Modal
  if (showPreview && previewProtocol) {
    const { newProtocol } = previewProtocol;
    return (
      <ScreenContainer className="p-4">
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>Protokoll-Vorschau</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>Pr\u00fcfe das generierte Protokoll vor dem Speichern</Text>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>{newProtocol.templateName || "Protokoll"}</Text>
            {newProtocol.protocolNumber && <Text style={{ fontSize: 12, color: colors.primary, marginBottom: 8 }}>{newProtocol.protocolNumber}</Text>}
            <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 22 }} numberOfLines={30}>{newProtocol.protocol}</Text>
          </View>

          {newProtocol.todos && newProtocol.todos.length > 0 && (
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>Aufgaben ({newProtocol.todos.length})</Text>
              {newProtocol.todos.slice(0, 5).map((t: any, i: number) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.priority === "hoch" ? "#E53935" : t.priority === "mittel" ? "#FF9800" : colors.muted }} />
                  <Text style={{ fontSize: 13, color: colors.foreground, flex: 1 }} numberOfLines={1}>{t.task}</Text>
                </View>
              ))}
              {newProtocol.todos.length > 5 && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>+{newProtocol.todos.length - 5} weitere</Text>}
            </View>
          )}

          {newProtocol.photos && newProtocol.photos.length > 0 && (
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>{newProtocol.photos.length} Foto(s) angeh\u00e4ngt</Text>
          )}
        </ScrollView>

        <View style={{ position: "absolute", bottom: 30, left: 16, right: 16, flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => { setShowPreview(false); setPreviewProtocol(null); setCapturedPhotos([]); }}
            style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Verwerfen</Text>
          </Pressable>
          <Pressable
            onPress={confirmSaveProtocol}
            style={({ pressed }) => [{ flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFFFFF" }}>Speichern</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        mode="video"
      >
        {/* Photo flash effect */}
        {photoFlash && <View style={styles.flashOverlay} />}

        {/* Timer overlay */}
        {isRecording && (
          <View style={styles.timerContainer}>
            <View style={styles.timerBadge}>
              <View style={styles.recordDot} />
              <Text style={styles.timerText}>
                {formatDuration(recordingDuration)}
              </Text>
            </View>
            {/* Photo counter */}
            {capturedPhotos.length > 0 && (
              <View style={styles.photoCountBadge}>
                <MaterialIcons name="photo-camera" size={14} color="#FFFFFF" />
                <Text style={styles.photoCountText}>{capturedPhotos.length}</Text>
              </View>
            )}
            {/* Location badge */}
            {recordingLocation && (
              <View style={[styles.photoCountBadge, { marginLeft: 6 }]}>
                <MaterialIcons name="location-on" size={14} color="#FFFFFF" />
                <Text style={styles.photoCountText} numberOfLines={1}>
                  {recordingLocation.city || "GPS"}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Mode toggle */}
        {!isRecording && (
          <View style={styles.modeToggleCamera}>
            <View style={[styles.modeButton, styles.modeButtonActive, { backgroundColor: "rgba(255,255,255,0.2)", borderColor: "#FFFFFF" }]}>
              <MaterialIcons name="videocam" size={20} color="#FFFFFF" />
              <Text style={[styles.modeButtonText, { color: "#FFFFFF", fontWeight: "700" }]}>Video</Text>
            </View>
            <Pressable
              onPress={() => setMode("audio")}
              style={({ pressed }) => [
                styles.modeButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <MaterialIcons name="mic" size={20} color="rgba(255,255,255,0.7)" />
              <Text style={[styles.modeButtonText, { color: "rgba(255,255,255,0.7)" }]}>Audio</Text>
            </Pressable>
          </View>
        )}

        {/* Template selector overlay */}
        {showTemplateSelector && !isRecording && (
          <View style={styles.templateOverlay}>
            <View style={[styles.templateSheet, { backgroundColor: colors.background }]}>
              <View style={styles.templateSheetHeader}>
                <Text style={[styles.templateSheetTitle, { color: colors.foreground }]}>
                  Vorlage wählen
                </Text>
                <Pressable onPress={() => setShowTemplateSelector(false)}>
                  <MaterialIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>
              <ScrollView style={styles.templateList} showsVerticalScrollIndicator={false}>
                {PROTOCOL_TEMPLATES.map((template) => (
                  <Pressable
                    key={template.id}
                    onPress={() => {
                      setSelectedTemplate(template);
                      setShowTemplateSelector(false);
                    }}
                    style={({ pressed }) => [
                      styles.templateListItem,
                      {
                        backgroundColor:
                          selectedTemplate.id === template.id
                            ? colors.primary + "15"
                            : "transparent",
                        borderColor:
                          selectedTemplate.id === template.id
                            ? colors.primary
                            : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={template.icon as any}
                      size={22}
                      color={
                        selectedTemplate.id === template.id
                          ? colors.primary
                          : colors.muted
                      }
                    />
                    <View style={styles.templateListText}>
                      <Text
                        style={[
                          styles.templateListName,
                          {
                            color:
                              selectedTemplate.id === template.id
                                ? colors.primary
                                : colors.foreground,
                          },
                        ]}
                      >
                        {template.name}
                      </Text>
                      <Text
                        style={[styles.templateListDesc, { color: colors.muted }]}
                        numberOfLines={1}
                      >
                        {template.description}
                      </Text>
                    </View>
                    {selectedTemplate.id === template.id && (
                      <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controlsContainer}>
          {/* Template badge */}
          {!isRecording && (
            <Pressable
              onPress={() => setShowTemplateSelector(true)}
              style={({ pressed }) => [
                styles.templateBadge,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <MaterialIcons name={selectedTemplate.icon as any} size={16} color="#FFFFFF" />
              <Text style={styles.templateBadgeText}>{selectedTemplate.name}</Text>
              <MaterialIcons name="expand-more" size={16} color="#FFFFFF" />
            </Pressable>
          )}

          <View style={styles.controlsRow}>
            {/* Photo button - only visible during recording */}
            {isRecording ? (
              <Pressable
                onPress={takePhoto}
                style={({ pressed }) => [
                  styles.photoButton,
                  { transform: [{ scale: pressed ? 0.9 : 1 }] },
                ]}
              >
                <MaterialIcons name="photo-camera" size={28} color="#FFFFFF" />
                {capturedPhotos.length > 0 && (
                  <View style={styles.photoBadge}>
                    <Text style={styles.photoBadgeText}>{capturedPhotos.length}</Text>
                  </View>
                )}
              </Pressable>
            ) : (
              <View style={styles.photoButtonPlaceholder} />
            )}

            {/* Record / Stop button */}
            <Pressable
              onPress={isRecording ? stopRecording : startRecording}
              style={({ pressed }) => [
                styles.recordButton,
                {
                  borderColor: "#FFFFFF",
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              <View
                style={[
                  isRecording ? styles.stopIcon : styles.recordIcon,
                  { backgroundColor: colors.primary },
                ]}
              />
            </Pressable>

            {/* Marker button - only visible during recording */}
            {isRecording ? (
              <Pressable
                onPress={() => addMarker("Markierung")}
                style={({ pressed }) => [
                  styles.photoButton,
                  { transform: [{ scale: pressed ? 0.9 : 1 }] },
                ]}
              >
                <MaterialIcons name="bookmark-add" size={28} color="#FFFFFF" />
                {markers.length > 0 && (
                  <View style={[styles.photoBadge, { backgroundColor: "#FF9800" }]}>
                    <Text style={styles.photoBadgeText}>{markers.length}</Text>
                  </View>
                )}
              </Pressable>
            ) : (
              <View style={styles.photoButtonPlaceholder} />
            )}
          </View>

          <Text style={styles.hintText}>
            {isRecording
              ? "Foto \u2022 Stopp \u2022 Markierung"
              : "Tippe zum Aufnehmen"}
          </Text>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  flashOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    opacity: 0.8,
    zIndex: 100,
  },
  timerContainer: {
    position: "absolute",
    top: 60,
    width: "100%",
    alignItems: "center",
    gap: 8,
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E53935",
    marginRight: 8,
  },
  timerText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  photoCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  photoCountText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  // Mode toggle
  modeToggleCamera: {
    position: "absolute",
    top: 60,
    right: 16,
    flexDirection: "column",
    gap: 8,
  },
  modeToggleTop: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingTop: 60,
    paddingBottom: 24,
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  modeButtonActive: {
    borderWidth: 1.5,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },
  // Template overlay (video mode)
  templateOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  templateSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 40,
    maxHeight: "70%",
  },
  templateSheetAudio: {
    position: "absolute",
    bottom: 200,
    left: 16,
    right: 16,
    borderRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderWidth: 1,
    maxHeight: 350,
  },
  templateSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  templateSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  templateList: {
    maxHeight: 400,
  },
  templateListItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  templateListText: {
    flex: 1,
  },
  templateListName: {
    fontSize: 15,
    fontWeight: "600",
  },
  templateListDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  controlsContainer: {
    position: "absolute",
    bottom: 50,
    width: "100%",
    alignItems: "center",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 40,
    gap: 30,
  },
  templateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
    gap: 6,
  },
  templateBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  photoButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  photoBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#E53935",
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  photoBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  photoButtonPlaceholder: {
    width: 52,
    height: 52,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  recordIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  stopIcon: {
    width: 30,
    height: 30,
    borderRadius: 4,
  },
  hintText: {
    color: "#FFFFFF",
    fontSize: 13,
    marginTop: 14,
    opacity: 0.8,
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  // Audio mode styles
  audioContainer: {
    flex: 1,
    justifyContent: "space-between",
  },
  audioVisualArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  audioCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  timerContainerAudio: {
    flexDirection: "row",
    alignItems: "center",
  },
  timerTextAudio: {
    fontSize: 32,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  audioHintText: {
    fontSize: 15,
  },
  audioControls: {
    alignItems: "center",
    paddingBottom: 60,
    gap: 16,
  },
  templateBadgeAudio: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  templateBadgeTextAudio: {
    fontSize: 13,
    fontWeight: "500",
  },
  audioControlHint: {
    fontSize: 13,
  },
});
