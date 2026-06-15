import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
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
import { useIsFocused } from "@react-navigation/native";
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
import { getApiBaseUrl } from "@/constants/oauth";

type RecordingMode = "video" | "audio" | "audio-photo";

export default function RecordScreen() {
  const colors = useColors();
  const isFocused = useIsFocused();
  const [cameraReady, setCameraReady] = useState(false);

  // When screen regains focus after navigation, camera needs to re-initialize
  // The active={isFocused} prop pauses/resumes the camera, and onCameraReady fires again
  useEffect(() => {
    if (isFocused && !cameraReady) {
      // Camera will fire onCameraReady when it resumes - give it a moment
      const timeout = setTimeout(() => {
        // If onCameraReady hasn't fired yet, force it (workaround for some devices)
        setCameraReady(true);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isFocused]);
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
  const [photoTimestamps, setPhotoTimestamps] = useState<number[]>([]); // recording time when each photo was taken
  const [photoFlash, setPhotoFlash] = useState(false);
  const [mode, setMode] = useState<RecordingMode>("audio");
  const [markers, setMarkers] = useState<Array<{ time: number; label: string }>>([]);
  const [processingSource, setProcessingSource] = useState<"video" | "audio-backup" | "cache" | "audio" | null>(null);
  const [processingStep, setProcessingStep] = useState<"compress" | "upload" | "transcription" | "protocol" | "saving" | "done">("upload");
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

  // Setup audio mode for recording - only enable allowsRecording when actually recording
  useEffect(() => {
    (async () => {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
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
        setPhotoTimestamps((prev) => [...prev, recordingDuration]);
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

  // Video recording: We run a PARALLEL audio recording alongside the camera.
  // This ensures we always have audio for transcription, even if recordAsync() fails to resolve.
  const videoRecordingActiveRef = useRef(false);
  // Stores the video URI for background upload when audio-backup is used
  const pendingVideoUploadRef = useRef<{ videoUri: string; protocolId: string } | null>(null);
  // NOTE: Parallel audio recording in video mode was removed because iOS cannot share
  // the AVAudioSession between CameraView and expo-audio simultaneously.

  // Background upload: uploads video file and attaches it to the protocol
  const uploadVideoInBackground = async (videoUri: string, protocolId: string) => {
    try {
      console.log("[BackgroundUpload] Starting video upload for protocol:", protocolId);
      
      // Check if file exists and is readable
      const fileInfo = await FileSystem.getInfoAsync(videoUri);
      if (!fileInfo.exists || !fileInfo.size || fileInfo.size < 1000) {
        console.warn("[BackgroundUpload] Video file not found or too small:", videoUri);
        return;
      }

      const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024);
      console.log("[BackgroundUpload] Video file size:", fileSizeMB.toFixed(1), "MB");

      // For files > 40MB: Save local reference only (no upload)
      // This prevents RAM crashes on mobile devices
      if (fileSizeMB > 40) {
        console.log("[BackgroundUpload] Video too large for upload (", fileSizeMB.toFixed(1), "MB). Saving local reference.");
        
        // Save local URI reference so user can still access the video
        const protocolsStr = await AsyncStorage.getItem("protocols");
        if (protocolsStr) {
          const protocols = JSON.parse(protocolsStr);
          const protocolIndex = protocols.findIndex((p: any) => p.id === protocolId);
          if (protocolIndex !== -1) {
            protocols[protocolIndex].videoUrl = videoUri; // Local file URI
            protocols[protocolIndex].videoUploadedAt = new Date().toISOString();
            protocols[protocolIndex].videoIsLocal = true;
            protocols[protocolIndex].videoSizeMB = Math.round(fileSizeMB);
            await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
            console.log("[BackgroundUpload] Protocol updated with local video reference");
          }
        }
        return;
      }

      // For files <= 40MB: Upload to server
      const base64 = await FileSystem.readAsStringAsync(videoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log("[BackgroundUpload] Video file read, uploading...");

      // Upload to storage
      const uploadResult = await uploadMutation.mutateAsync({
        base64,
        mimeType: "video/mp4",
        filename: `video-${protocolId}-${Date.now()}.mp4`,
      });

      console.log("[BackgroundUpload] Upload complete, URL:", uploadResult.url);

      // Build absolute URL
      let videoUrl = uploadResult.url;
      if (videoUrl.startsWith("/")) {
        videoUrl = `${getApiBaseUrl()}${videoUrl}`;
      }

      // Update the protocol in AsyncStorage with the video URL
      const protocolsStr = await AsyncStorage.getItem("protocols");
      if (protocolsStr) {
        const protocols = JSON.parse(protocolsStr);
        const protocolIndex = protocols.findIndex((p: any) => p.id === protocolId);
        if (protocolIndex !== -1) {
          protocols[protocolIndex].videoUrl = videoUrl;
          protocols[protocolIndex].videoUploadedAt = new Date().toISOString();
          protocols[protocolIndex].videoIsLocal = false;
          protocols[protocolIndex].videoSizeMB = Math.round(fileSizeMB);
          await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
          console.log("[BackgroundUpload] Protocol updated with video URL");
        }
      }
    } catch (error) {
      console.error("[BackgroundUpload] Video upload failed:", error);
      // Non-critical: don't alert the user, just log
      // Save local reference as fallback
      try {
        const protocolsStr = await AsyncStorage.getItem("protocols");
        if (protocolsStr) {
          const protocols = JSON.parse(protocolsStr);
          const protocolIndex = protocols.findIndex((p: any) => p.id === protocolId);
          if (protocolIndex !== -1) {
            protocols[protocolIndex].videoUrl = videoUri;
            protocols[protocolIndex].videoIsLocal = true;
            protocols[protocolIndex].videoUploadFailed = true;
            await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
          }
        }
      } catch {}
    } finally {
      pendingVideoUploadRef.current = null;
    }
  };

  const startVideoRecording = async () => {
    if (Platform.OS === "web") {
      alert("Videoaufnahme ist nur auf dem Handy verf\u00fcgbar.");
      return;
    }
    if (!cameraRef.current) {
      alert("Kamera nicht verf\u00fcgbar. Bitte warte einen Moment.");
      return;
    }
    if (!cameraReady) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!cameraReady) {
        alert("Kamera wird noch initialisiert. Bitte warte einen Moment.");
        return;
      }
    }

    setShowTemplateSelector(false);
    setCapturedPhotos([]);
    setPhotoTimestamps([]);
    setMarkers([]);
    setIsRecording(true);
    startTimer();
    videoRecordingActiveRef.current = true;

    try {
      // NOTE: On iOS, the AVAudioSession cannot be shared between CameraView recording
      // and a separate expo-audio recorder simultaneously. The camera claims the audio
      // session exclusively. Therefore, we DO NOT start a parallel audio recorder.
      // Instead, we use the VIDEO FILE itself for transcription (Whisper can extract audio).
      // For large files (>15MB), we upload only a portion or use maxFileSize.
      
      console.log("[Video] Starting camera recordAsync (720p)...");
      
      let videoUri: string | null = null;
      try {
        const video = await cameraRef.current!.recordAsync({
          maxDuration: 300,
          maxFileSize: 15 * 1024 * 1024, // 15 MB max - keeps file manageable for upload
        });
        if (video && video.uri) {
          videoUri = video.uri;
          console.log("[Video] recordAsync resolved with URI:", videoUri);
        } else {
          console.warn("[Video] recordAsync resolved without URI");
        }
      } catch (recErr: any) {
        console.warn("[Video] recordAsync error:", recErr?.message);
        videoUri = recErr?.uri || recErr?.data?.uri || null;
      }

      // Recording has stopped (either resolved or errored)
      videoRecordingActiveRef.current = false;
      stopTimer();
      setIsRecording(false);
      // NOTE: Do NOT set cameraReady=false here - prevents dead-state

      if (videoUri) {
        console.log("[Video] Got video URI:", videoUri);
        const fileInfo = await FileSystem.getInfoAsync(videoUri);
        const sizeMB = fileInfo.exists && fileInfo.size ? fileInfo.size / (1024 * 1024) : 0;
        console.log("[Video] File size:", sizeMB.toFixed(1), "MB");
        
        setProcessingSource("video");
        
        // Save video for background upload/local reference
        pendingVideoUploadRef.current = { videoUri, protocolId: "__pending__" };
        
        // For transcription: use the video file directly
        // Whisper API can extract audio from video files
        // If file is too large (>40MB), we still send it but the server
        // will handle the size limit (it streams to Whisper)
        await processRecording(videoUri, "video/mp4");
      } else {
        // No video URI - search cache for recent recording
        console.warn("[Video] No URI from recordAsync, searching cache...");
        let found = false;
        try {
          const cacheDir = FileSystem.cacheDirectory;
          if (cacheDir) {
            const files = await FileSystem.readDirectoryAsync(cacheDir);
            const mediaFiles = files.filter(f => 
              f.endsWith(".mov") || f.endsWith(".mp4")
            );
            mediaFiles.sort().reverse();
            const fiveMinAgo = Date.now() - 5 * 60 * 1000;
            for (const mf of mediaFiles) {
              const latest = `${cacheDir}${mf}`;
              const fInfo = await FileSystem.getInfoAsync(latest);
              if (fInfo.exists && fInfo.size && fInfo.size > 10000 && fInfo.modificationTime && fInfo.modificationTime * 1000 > fiveMinAgo) {
                console.log("[Video] Found recent video in cache:", latest, "size:", ((fInfo.size || 0) / 1024 / 1024).toFixed(1), "MB");
                setProcessingSource("cache");
                pendingVideoUploadRef.current = { videoUri: latest, protocolId: "__pending__" };
                await processRecording(latest, "video/mp4");
                found = true;
                break;
              }
            }
          }
        } catch (cacheErr) {
          console.warn("[Video] Cache search failed:", cacheErr);
        }
        if (!found) {
          alert("Aufnahme fehlgeschlagen: Keine Video-Datei erhalten. Bitte versuche es erneut oder wechsle in den Audio-Modus.");
        }
      }
    } catch (error: any) {
      videoRecordingActiveRef.current = false;
      stopTimer();
      setIsRecording(false);
      // Do NOT set cameraReady=false - prevents dead-state
      
      const errorMsg = error?.message || String(error);
      console.error("[Video] Fatal recording error:", errorMsg);
      
      // Try to find video in cache as fallback
      let found = false;
      try {
        const cacheDir = FileSystem.cacheDirectory;
        if (cacheDir) {
          const files = await FileSystem.readDirectoryAsync(cacheDir);
          const videoFiles = files.filter(f => f.endsWith(".mov") || f.endsWith(".mp4"));
          videoFiles.sort().reverse();
          const fiveMinAgo = Date.now() - 5 * 60 * 1000;
          for (const vf of videoFiles) {
            const candidate = `${cacheDir}${vf}`;
            const fInfo = await FileSystem.getInfoAsync(candidate);
            if (fInfo.exists && fInfo.size && fInfo.size > 10000 && fInfo.modificationTime && fInfo.modificationTime * 1000 > fiveMinAgo) {
              console.log("[Video] Fatal error but found recent video in cache:", candidate);
              setProcessingSource("cache");
              pendingVideoUploadRef.current = { videoUri: candidate, protocolId: "__pending__" };
              await processRecording(candidate, "video/mp4");
              found = true;
              break;
            }
          }
        }
      } catch {}
      
      if (!found) {
        alert(`Aufnahme Fehler: ${errorMsg}\n\nBitte versuche es erneut oder wechsle in den Audio-Modus.`);
      }
    }
  };

  const stopVideoRecording = () => {
    console.log("[Video] stopRecording called");
    if (cameraRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch (e) {
        console.warn("[Video] stopRecording threw:", e);
      }
    }
    
    // Safety timeout: if recordAsync doesn't resolve within 8 seconds after stop,
    // search cache for the video file and process it
    setTimeout(async () => {
      if (videoRecordingActiveRef.current) {
        console.warn("[Video] recordAsync did not resolve within 8s - forcing stop");
        videoRecordingActiveRef.current = false;
        stopTimer();
        setIsRecording(false);
        
        // Search cache for the video file
        let videoUri: string | null = null;
        try {
          const cacheDir = FileSystem.cacheDirectory;
          if (cacheDir) {
            const files = await FileSystem.readDirectoryAsync(cacheDir);
            const videoFiles = files.filter(f => f.endsWith(".mov") || f.endsWith(".mp4"));
            videoFiles.sort().reverse();
            const fiveMinAgo = Date.now() - 5 * 60 * 1000;
            for (const vf of videoFiles) {
              const candidate = `${cacheDir}${vf}`;
              const fInfo = await FileSystem.getInfoAsync(candidate);
              if (fInfo.exists && fInfo.size && fInfo.size > 10000 && fInfo.modificationTime && fInfo.modificationTime * 1000 > fiveMinAgo) {
                videoUri = candidate;
                break;
              }
            }
          }
        } catch {}
        
        if (videoUri) {
          console.log("[Video] Timeout fallback: found video in cache:", videoUri);
          setProcessingSource("cache");
          pendingVideoUploadRef.current = { videoUri, protocolId: "__pending__" };
          await processRecording(videoUri, "video/mp4");
        } else {
          alert("Video-Verarbeitung fehlgeschlagen: Keine Datei gefunden. Bitte versuche den Audio-Modus.");
        }
      }
    }, 8000);
  };

  // --- AUDIO RECORDING ---
  const startAudioRecording = async () => {
    setShowTemplateSelector(false);
    setCapturedPhotos([]);
    setPhotoTimestamps([]);
    setMarkers([]);
    setIsRecording(true);
    startTimer();

    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
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
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });

      const uri = audioRecorder.uri;
      if (uri) {
        setProcessingSource("audio");
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
      // Both 'audio' and 'audio-photo' use the audio recorder
      startAudioRecording();
    }
  };

  const stopRecording = () => {
    if (mode === "video") {
      stopVideoRecording();
    } else {
      // Both 'audio' and 'audio-photo' use the audio recorder
      stopAudioRecording();
    }
  };

  const processRecording = async (fileUri: string, mimeType: string) => {
    // NON-BLOCKING: Create placeholder protocol immediately, navigate away,
    // then process in background. App is instantly usable again.
    
    try {
      // Check internet connectivity
      const online = await isOnline();
      if (!online) {
        // Save to offline queue with all metadata
        await addToQueue({
          id: Date.now().toString(),
          fileUri,
          mimeType,
          templateId: selectedTemplate.id,
          photos: capturedPhotos,
          duration: recordingDuration,
          recordingMode: mode,
          createdAt: new Date().toISOString(),
          markers,
          location: recordingLocation ? {
            latitude: recordingLocation.latitude,
            longitude: recordingLocation.longitude,
            address: recordingLocation.address,
            city: recordingLocation.city,
          } : null,
          weather: weatherData ? formatWeatherForProtocol(weatherData) : null,
          pendingVideoUri: pendingVideoUploadRef.current?.videoUri || null,
        });
        setCapturedPhotos([]);
        setPhotoTimestamps([]);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        alert("Kein Internet – Aufnahme wurde in der Warteschlange gespeichert und wird automatisch verarbeitet, sobald du wieder online bist.");
        return;
      }

      // Generate protocol number if project has a prefix
      let protocolNumber: string | null = null;
      const lastProjectId = await AsyncStorage.getItem("last-selected-project-id");
      if (lastProjectId) {
        protocolNumber = await getNextProtocolNumber(lastProjectId);
      }

      // Create placeholder protocol with status "processing"
      const protocolId = Date.now().toString();
      const placeholderProtocol = {
        id: protocolId,
        title: "Wird verarbeitet...",
        transcription: "",
        protocol: "",
        templateName: selectedTemplate.name,
        templateId: selectedTemplate.id,
        photos: capturedPhotos,
        todos: [],
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
        status: "processing" as const,
        processingStep: "uploading" as string,
        projectId: lastProjectId || undefined,
        protocolNumber: protocolNumber || undefined,
        videoUrl: null as string | null,
        videoUploadedAt: null as string | null,
        videoUploadPending: false,
      };

      // Link to calendar event if available
      if (currentCalendarEvent && Platform.OS !== "web") {
        try {
          await addNotesToEvent(currentCalendarEvent.id, `Protokoll wird verarbeitet...`);
          placeholderProtocol.calendarEventId = currentCalendarEvent.id;
        } catch {}
      }

      // Save placeholder immediately to AsyncStorage
      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      protocols.unshift(placeholderProtocol);
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));

      // Clear recording state and navigate to protocols list
      setCapturedPhotos([]);
      setPhotoTimestamps([]);
      setIsProcessing(false);
      setProcessingSource(null);
      
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      // Navigate to protocols tab (the list will show the placeholder with "processing" status)
      router.push("/(tabs)/protocols" as any);

      // Get settings for protocol style
      const settingsStr = await AsyncStorage.getItem("protokoll-settings");
      const settings = settingsStr ? JSON.parse(settingsStr) : {};

      // Start background processing (fire and forget)
      const { startBackgroundProcessing } = require("@/lib/background-processor");
      startBackgroundProcessing(
        {
          protocolId,
          fileUri,
          mimeType,
          templateId: selectedTemplate.id,
          style: settings.style || "formal",
          format: settings.format || "bullets",
          createdAt: placeholderProtocol.createdAt,
          markers: markers.length > 0 ? markers : undefined,
          photos: capturedPhotos.length > 0 ? capturedPhotos : undefined,
          photoTimestamps: photoTimestamps.length > 0 ? photoTimestamps : undefined,
          status: "queued",
        },
        {
          upload: (base64: string, mime: string, filename: string) =>
            uploadMutation.mutateAsync({ base64, mimeType: mime, filename }),
          transcribe: (audioUrl: string, language: string) =>
            transcribeMutation.mutateAsync({ audioUrl, language }),
          generateProtocol: (transcription: string, templateId: string, style: string, format: string, recordingDate?: string, jobMarkers?: Array<{ time: number; label: string }>, photoCount?: number) =>
            protocolMutation.mutateAsync({ transcription, templateId, style: style as "formal" | "informal", format: format as "bullets" | "paragraphs", recordingDate, markers: jobMarkers, photoCount }),
          extractTodos: (transcription: string, protocolText: string) =>
            todosMutation.mutateAsync({ transcription, protocolText }),
        }
      );

    } catch (error: any) {
      setIsProcessing(false);
      setProcessingSource(null);
      const errMsg = error?.message || String(error);
      console.error("Processing setup error:", errMsg);
      alert(`Fehler beim Starten der Verarbeitung: ${errMsg.substring(0, 100)}`);
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
      setPhotoTimestamps([]);
      
      // Start background video upload if pending
      if (pendingVideoUploadRef.current && pendingVideoUploadRef.current.protocolId === "__pending__") {
        pendingVideoUploadRef.current.protocolId = newProtocol.id;
        const { videoUri, protocolId } = pendingVideoUploadRef.current;
        uploadVideoInBackground(videoUri, protocolId);
      }
      
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

  if (mode === "audio" && micPermission && !micPermission.granted) {
    // Audio mode only needs mic permission - request it
    requestMicPermission();
  }

  if ((mode === "video" || mode === "audio-photo") && (!cameraPermission.granted || !micPermission.granted)) {
    const canAskAgain = cameraPermission?.canAskAgain !== false && micPermission?.canAskAgain !== false;
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <MaterialIcons name="videocam-off" size={64} color={colors.muted} style={{ marginBottom: 16 }} />
        <Text className="text-2xl font-bold text-foreground text-center mb-4">
          Berechtigungen erforderlich
        </Text>
        <Text className="text-base text-muted text-center mb-8">
          ProtoKI benötigt Zugriff auf Kamera und Mikrofon, um Videos aufzunehmen und Protokolle zu erstellen.
        </Text>
        {canAskAgain ? (
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
        ) : (
          <>
            <Pressable
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else if (Platform.OS === 'android') {
                  Linking.openSettings();
                }
              }}
              style={({ pressed }) => [
                styles.permissionButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.permissionButtonText}>Einstellungen öffnen</Text>
            </Pressable>
            <Text className="text-sm text-muted text-center mt-4">
              Berechtigungen wurden verweigert. Bitte aktiviere Kamera und Mikrofon in den Geräteeinstellungen.
            </Text>
          </>
        )}
        {/* Allow switching to audio mode even without camera permission */}
        <Pressable
          onPress={async () => {
            if (!micPermission?.granted) {
              await requestMicPermission();
            }
            setMode("audio");
          }}
          style={({ pressed }) => [
            styles.permissionButton,
            { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 16, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.permissionButtonText, { color: colors.foreground }]}>Nur Audio-Modus nutzen</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  // Processing state with step-by-step progress
  if (isProcessing) {
    const sourceLabel = processingSource === "video" 
      ? "\u2705 Video erfolgreich aufgenommen" 
      : processingSource === "audio-backup" 
        ? "\u26A0\uFE0F Audio-Backup verwendet" 
        : processingSource === "cache" 
          ? "\u26A0\uFE0F Datei aus Cache wiederhergestellt" 
          : processingSource === "audio" 
            ? "\u2705 Audio erfolgreich aufgenommen" 
            : null;

    const steps = [
      ...(processingSource === "video" ? [{ key: "compress", label: "Video komprimieren", icon: "compress" as const }] : []),
      { key: "upload", label: "Datei hochladen", icon: "cloud-upload" as const },
      { key: "transcription", label: "Sprache erkennen", icon: "mic" as const },
      { key: "protocol", label: "Protokoll erstellen", icon: "description" as const },
      { key: "saving", label: "Speichern", icon: "check-circle" as const },
    ];
    const currentStepIndex = steps.findIndex(s => s.key === processingStep);

    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <View style={{ alignItems: "center", width: "100%", maxWidth: 300 }}>
          {/* Spinner */}
          <ActivityIndicator size="large" color={colors.primary} />
          
          {/* Title */}
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, marginTop: 24, textAlign: "center" }}>
            Verarbeitung...
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 6, textAlign: "center" }}>
            {selectedTemplate.name} wird erstellt
          </Text>

          {/* Step progress */}
          <View style={{ marginTop: 32, width: "100%" }}>
            {steps.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const isPending = index > currentStepIndex;
              
              return (
                <View key={step.key} style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
                  {/* Step indicator */}
                  <View style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: isCompleted ? colors.success : isCurrent ? colors.primary : colors.surface,
                    borderWidth: isCurrent ? 2 : 1,
                    borderColor: isCompleted ? colors.success : isCurrent ? colors.primary : colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    {isCompleted ? (
                      <MaterialIcons name="check" size={18} color="#FFFFFF" />
                    ) : isCurrent ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <MaterialIcons name={step.icon} size={16} color={colors.muted} />
                    )}
                  </View>
                  
                  {/* Step label */}
                  <Text style={{
                    marginLeft: 12,
                    fontSize: 15,
                    fontWeight: isCurrent ? "600" : "400",
                    color: isCompleted ? colors.success : isCurrent ? colors.foreground : colors.muted,
                  }}>
                    {step.label}{isCompleted ? " \u2713" : ""}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Source badge */}
          {sourceLabel && (
            <View style={[
              styles.sourceBadge,
              { 
                backgroundColor: processingSource === "video" || processingSource === "audio" 
                  ? colors.success + "15" 
                  : colors.warning + "15",
                borderColor: processingSource === "video" || processingSource === "audio" 
                  ? colors.success + "40" 
                  : colors.warning + "40",
              }
            ]}>
              <Text style={[
                styles.sourceBadgeText,
                { 
                  color: processingSource === "video" || processingSource === "audio" 
                    ? colors.success 
                    : colors.warning 
                }
              ]}>
                {sourceLabel}
              </Text>
            </View>
          )}

          {/* Photos info */}
          {capturedPhotos.length > 0 && (
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 12, textAlign: "center" }}>
              {capturedPhotos.length} Foto{capturedPhotos.length !== 1 ? "s" : ""} werden angeh\u00e4ngt
            </Text>
          )}
        </View>
      </ScreenContainer>
    );
  }

  // --- AUDIO MODE UI ---
  if (mode === "audio") {
    // Pure audio mode - no camera
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
            <Pressable
              onPress={() => { if (!isRecording) setMode("audio-photo"); }}
              style={({ pressed }) => [
                styles.modeButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <MaterialIcons name="photo-camera" size={20} color={colors.muted} />
              <Text style={[styles.modeButtonText, { color: colors.muted }]}>Audio+Foto</Text>
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
              {isRecording ? "Tippe zum Stoppen" : "Nur Sprache • Ohne Kamera"}
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

  // --- VIDEO / AUDIO+PHOTO MODE UI ---
  // Both modes show the camera. Video records video+audio; Audio+Photo records audio only + allows photos.
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
            onPress={() => { setShowPreview(false); setPreviewProtocol(null); setCapturedPhotos([]); setPhotoTimestamps([]); }}
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
        mode={mode === "video" ? "video" : "picture"}
        active={isFocused}
        onCameraReady={() => setCameraReady(true)}
        onMountError={(e) => console.warn("Camera mount error:", e?.message)}
      />
      {/* Overlay layer on top of camera */}
      <View style={[styles.overlayContainer, { pointerEvents: "box-none" }]}>
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
            {mode === "video" ? (
              <View style={[styles.modeButton, styles.modeButtonActive, { backgroundColor: "rgba(255,255,255,0.2)", borderColor: "#FFFFFF" }]}>
                <MaterialIcons name="videocam" size={20} color="#FFFFFF" />
                <Text style={[styles.modeButtonText, { color: "#FFFFFF", fontWeight: "700" }]}>Video</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setMode("video")}
                style={({ pressed }) => [styles.modeButton, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="videocam" size={20} color="rgba(255,255,255,0.7)" />
                <Text style={[styles.modeButtonText, { color: "rgba(255,255,255,0.7)" }]}>Video</Text>
              </Pressable>
            )}
            {mode === "audio-photo" ? (
              <View style={[styles.modeButton, styles.modeButtonActive, { backgroundColor: "rgba(255,255,255,0.2)", borderColor: "#FFFFFF" }]}>
                <MaterialIcons name="photo-camera" size={20} color="#FFFFFF" />
                <Text style={[styles.modeButtonText, { color: "#FFFFFF", fontWeight: "700" }]}>Audio+Foto</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setMode("audio-photo")}
                style={({ pressed }) => [styles.modeButton, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="photo-camera" size={20} color="rgba(255,255,255,0.7)" />
                <Text style={[styles.modeButtonText, { color: "rgba(255,255,255,0.7)" }]}>Audio+Foto</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setMode("audio")}
              style={({ pressed }) => [styles.modeButton, { opacity: pressed ? 0.7 : 1 }]}
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
                  opacity: (!isRecording && !cameraReady && mode === "video") ? 0.5 : 1,
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
              : mode === "audio-photo" ? "Audio + Fotos \u2022 Kein Video" : "Tippe zum Aufnehmen"}
          </Text>
        </View>
      </View>
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
  overlayContainer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  sourceBadge: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  sourceBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
