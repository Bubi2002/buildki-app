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
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { PROTOCOL_TEMPLATES, type ProtocolTemplate } from "@/shared/templates";

export default function RecordScreen() {
  const colors = useColors();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<ProtocolTemplate>(
    PROTOCOL_TEMPLATES[PROTOCOL_TEMPLATES.length - 1]
  );
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uploadMutation = trpc.upload.audio.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation();
  const protocolMutation = trpc.protocol.generate.useMutation();

  // Load default template from settings
  useEffect(() => {
    loadDefaultTemplate();
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

  const startRecording = async () => {
    if (Platform.OS === "web") {
      alert("Videoaufnahme ist nur auf dem Handy verfügbar.");
      return;
    }
    if (!cameraRef.current) return;

    setShowTemplateSelector(false);
    setIsRecording(true);
    startTimer();

    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: 300, // 5 minutes max
      });

      stopTimer();
      setIsRecording(false);

      if (video?.uri) {
        await processRecording(video.uri);
      }
    } catch (error) {
      stopTimer();
      setIsRecording(false);
      console.error("Recording error:", error);
    }
  };

  const stopRecording = () => {
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
  };

  const processRecording = async (videoUri: string) => {
    setIsProcessing(true);

    try {
      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(videoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Upload audio to storage
      const uploadResult = await uploadMutation.mutateAsync({
        base64,
        mimeType: "video/mp4",
        filename: `recording-${Date.now()}.mp4`,
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

      // Save protocol locally
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );
      const newProtocol = {
        id: Date.now().toString(),
        title: transcription.text.substring(0, 50) + "...",
        transcription: transcription.text,
        protocol: protocol.protocol,
        templateName: selectedTemplate.name,
        templateId: selectedTemplate.id,
        duration: recordingDuration,
        createdAt: new Date().toISOString(),
        status: "ready" as const,
      };
      protocols.unshift(newProtocol);
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));

      setIsProcessing(false);
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
          Deine Aufnahme wird transkribiert und ein {selectedTemplate.name} erstellt.
        </Text>
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
        {/* Timer overlay */}
        {isRecording && (
          <View style={styles.timerContainer}>
            <View style={styles.timerBadge}>
              <View style={styles.recordDot} />
              <Text style={styles.timerText}>
                {formatDuration(recordingDuration)}
              </Text>
            </View>
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

          <Text style={styles.hintText}>
            {isRecording
              ? "Tippe zum Stoppen"
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
  timerContainer: {
    position: "absolute",
    top: 60,
    width: "100%",
    alignItems: "center",
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
    bottom: 60,
    width: "100%",
    alignItems: "center",
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
    fontSize: 14,
    marginTop: 12,
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
});
