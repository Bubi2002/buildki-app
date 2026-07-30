import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
  FlatList,
  Modal,
  TextInput,
  Alert,
  Animated,
} from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useRealtimeTranscription } from "@/lib/realtime-transcription";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { PROTOCOL_TEMPLATES, TEMPLATE_CATEGORIES, type ProtocolTemplate, type TemplateCategory } from "@/shared/templates";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { generateProtocolPdf } from "@/lib/pdf-generator";
import { isOnline, addToQueue } from "@/lib/offline-queue";
import { getCurrentEvent, addNotesToEvent, type CalendarEvent } from "@/lib/calendar-integration";
import { getCurrentLocation, type LocationData } from "@/lib/location-service";
import { getWeatherForLocation, formatWeatherForProtocol, type WeatherData } from "@/lib/weather-service";
import { getNextProtocolNumber } from "@/lib/protocol-numbering";
import { getProjectStructure, type Floor, type Room } from "@/lib/room-store";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "@/lib/language-provider";
import { deleteProjectLocally, resolveSelectedProject } from "@/lib/project-context";
import { getPrivacyChoices } from "@/lib/privacy-consent";
import { linkStoredPlanPinToProtocol } from "@/lib/floor-plan-store";
import { syncProtocolDefects } from "@/lib/protocol-defect-sync";

type RecordingMode = "audio-photo";

export default function RecordScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    quickAction,
    projectId: routeProjectId,
    planPinId: routePlanPinId,
  } = useLocalSearchParams<{ quickAction?: string; projectId?: string; planPinId?: string }>();
  const { liveText, isListening, startListening, stopListening, addLiveChunk, clearLiveText , getFullTranscript, streamingActive } = useRealtimeTranscription();
  const isFocused = useIsFocused();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(0);
  const pinchZoomBase = useRef(0);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const [showZoomBadge, setShowZoomBadge] = useState(false);
  const zoomBadgeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashMode, setFlashMode] = useState<"off" | "on" | "auto">("auto");
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("back");
  const [photoTimer, setPhotoTimer] = useState<0 | 3 | 5 | 10>(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const timerCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [annotationText, setAnnotationText] = useState("");
  const [annotatingPhotoIndex, setAnnotatingPhotoIndex] = useState<number | null>(null);
  const [photoAnnotations, setPhotoAnnotations] = useState<Record<number, string>>({});
  const [showGrid, setShowGrid] = useState(false);
  const [showRecordingTips, setShowRecordingTips] = useState(false);

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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [audioLevel, setAudioLevel] = useState<"quiet" | "good" | "loud">("good");
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewProtocol, setPreviewProtocol] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ProtocolTemplate>(
    PROTOCOL_TEMPLATES[PROTOCOL_TEMPLATES.length - 1]
  );
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<TemplateCategory[]>(["bau", "meeting", "gutachten", "allgemein"]);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newTemplatePrompt, setNewTemplatePrompt] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState<TemplateCategory>("allgemein");
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<ProtocolTemplate[]>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [photoTimestamps, setPhotoTimestamps] = useState<number[]>([]); // recording time when each photo was taken
  const [photoVoiceNotes, setPhotoVoiceNotes] = useState<(string | null)[]>([]); // voice note URI per photo
  const [voiceNoteRecording, setVoiceNoteRecording] = useState<{ photoIndex: number; startTime: number } | null>(null);
  const [voiceNoteElapsed, setVoiceNoteElapsed] = useState(0);
  const voiceNoteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [photoFlash, setPhotoFlash] = useState(false);
  const [mode, setMode] = useState<RecordingMode>("audio-photo");
  const [markers, setMarkers] = useState<{ time: number; label: string; photos?: string[] }[]>([]);
  const [processingSource, setProcessingSource] = useState<"audio" | null>(null);
  const [processingStep, setProcessingStep] = useState<"compress" | "upload" | "transcription" | "protocol" | "saving" | "done">("upload");
  const [voiceCommandActive, setVoiceCommandActive] = useState(true);
  const [currentCalendarEvent, setCurrentCalendarEvent] = useState<CalendarEvent | null>(null);
  const [suggestedMeeting, setSuggestedMeeting] = useState<{start: Date; end: Date} | null>(null);
  const [recordingLocation, setRecordingLocation] = useState<LocationData | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [recentProtocols, setRecentProtocols] = useState<any[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
  const waveformInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- PROJECT SELECTION STATE ---
  type ProjectItem = { id: string; name: string; description: string; color: string; createdAt: string; protocolPrefix?: string; protocolCounter?: number; };
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(true);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const quickActionHandledRef = useRef(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newProjectPrefix, setNewProjectPrefix] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#E53935");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectSort, setProjectSort] = useState<"activity" | "name" | "created">("activity");
  const [showArchived, setShowArchived] = useState(false);
  // Room/Floor selection for protocol linking
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [projectFloors, setProjectFloors] = useState<Floor[]>([]);
  const [projectRooms, setProjectRooms] = useState<Room[]>([]);
  const [showEditProject, setShowEditProject] = useState(false);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDesc, setEditProjectDesc] = useState("");
  const [editProjectPrefix, setEditProjectPrefix] = useState("");
  const [editProjectColor, setEditProjectColor] = useState("#E53935");
  const PROJECT_COLORS = ["#E53935","#D81B60","#8E24AA","#5C6BC0","#1E88E5","#00ACC1","#00897B","#43A047","#7CB342","#FDD835","#FB8C00","#6D4C41"];

  // Audio recorders
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const chapterAudioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Note: removed useAudioRecorderState to prevent unnecessary re-renders every 500ms
  // which was causing the timer interval to get cleared on re-render
  const isStoppingRef = useRef(false); // Prevent double-stop calls

  const uploadMutation = trpc.upload.audio.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation();
  const protocolMutation = trpc.protocol.generate.useMutation();
  const todosMutation = trpc.protocol.extractTodos.useMutation();

  // Load floors/rooms when project is selected
  useEffect(() => {
    if (!selectedProject?.id) {
      void Promise.resolve().then(() => {
        setProjectFloors([]);
        setProjectRooms([]);
        setSelectedFloor(null);
        setSelectedRoom(null);
      });
      return;
    }
    (async () => {
      try {
        const structure = await getProjectStructure(selectedProject.id);
        setProjectFloors(structure.floors);
        setProjectRooms(structure.rooms);
      } catch {}
    })();
  }, [selectedProject?.id]);

  // Load projects and reuse the same active project as the rest of the app.
  useEffect(() => {
    (async () => {
      try {
        const [projectsData, lastId, protocolsData] = await Promise.all([
          AsyncStorage.getItem("projects"),
          AsyncStorage.getItem("last-selected-project-id"),
          AsyncStorage.getItem("protocols"),
        ]);
        const allProjects: ProjectItem[] = JSON.parse(projectsData || "[]");
        const allProtocols: any[] = JSON.parse(protocolsData || "[]");
        const enriched = allProjects.map((project) => {
          const projectProtocols = allProtocols.filter((protocol: any) => protocol.projectId === project.id);
          const lastProtocol = [...projectProtocols].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          return { ...project, _protocolCount: projectProtocols.length, _lastDate: lastProtocol?.createdAt || null };
        });
        const activeProject = resolveSelectedProject(enriched, routeProjectId || lastId);
        setProjects(enriched as any);
        setSelectedProject(activeProject as any);
        setShowProjectPicker(!activeProject);
        if (activeProject && activeProject.id !== lastId) {
          await AsyncStorage.setItem("last-selected-project-id", activeProject.id);
        } else if (!activeProject && lastId) {
          await AsyncStorage.removeItem("last-selected-project-id");
        }
      } catch {
        setProjects([]);
        setSelectedProject(null);
        setShowProjectPicker(true);
      } finally {
        setProjectsLoaded(true);
      }
    })();
  }, [routeProjectId]);

  // Handle Quick Action only after a valid project context was restored.
  useEffect(() => {
    if (!quickAction || !projectsLoaded || quickActionHandledRef.current) return;
    if (!selectedProject) {
      void Promise.resolve().then(() => {
        setShowProjectPicker(true);
      });
      return;
    }
    quickActionHandledRef.current = true;
    const timer = setTimeout(() => {
      setShowProjectPicker(false);
      setMode("audio-photo");
      startRecording();
    }, 800);
    return () => clearTimeout(timer);
  }, [quickAction, projectsLoaded, selectedProject?.id]);

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

  // Network monitoring for offline indicator
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const checkNetwork = async () => {
      const online = await isOnline();
      setIsOffline(!online);
    };
    checkNetwork();
    interval = setInterval(checkNetwork, 10000); // Check every 10s
    return () => clearInterval(interval);
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

  async function loadDefaultTemplate() {
    try {
      // First try last-used template
      const lastUsedId = await AsyncStorage.getItem("last-used-template-id");
      if (lastUsedId) {
        const template = PROTOCOL_TEMPLATES.find((t) => t.id === lastUsedId);
        if (template) { setSelectedTemplate(template); return; }
      }
      // Fallback to settings default
      const settingsStr = await AsyncStorage.getItem("protokoll-settings");
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings.templateId) {
          const template = PROTOCOL_TEMPLATES.find((t) => t.id === settings.templateId);
          if (template) setSelectedTemplate(template);
        }
      }
    } catch  {
      // Use default
    }
  }

  // Save last-used template when it changes
  const selectTemplate = (template: ProtocolTemplate) => {
    setSelectedTemplate(template);
    setShowTemplateSelector(false);
    setTemplateSearch("");
    AsyncStorage.setItem("last-used-template-id", template.id);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Load custom templates from storage
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("custom-templates");
        if (stored) setCustomTemplates(JSON.parse(stored));
      } catch {}
    })();
  }, []);

  const allTemplates = useMemo(() => [...PROTOCOL_TEMPLATES, ...customTemplates], [customTemplates]);

  // Filter templates by search
  const filteredTemplates = useMemo(() => {
    if (!templateSearch.trim()) return allTemplates;
    const q = templateSearch.toLowerCase();
    return allTemplates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [templateSearch, allTemplates]);

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    return TEMPLATE_CATEGORIES.map((cat) => ({
      ...cat,
      templates: filteredTemplates.filter((t) => t.category === cat.id),
    })).filter((g) => g.templates.length > 0);
  }, [filteredTemplates]);

  const toggleCategory = (catId: TemplateCategory) => {
    setExpandedCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  };

  const saveCustomTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplatePrompt.trim()) {
      Alert.alert(t('alert_fehler'), t('msg_name_und_prompt_sind_erforderlich'));
      return;
    }
    const newTemplate: ProtocolTemplate = {
      id: `custom-${Date.now()}`,
      name: newTemplateName.trim(),
      icon: "auto-awesome",
      description: newTemplateDesc.trim() || "Benutzerdefinierte Vorlage",
      category: newTemplateCategory,
      systemPrompt: newTemplatePrompt.trim(),
    };
    const updated = [...customTemplates, newTemplate];
    setCustomTemplates(updated);
    await AsyncStorage.setItem("custom-templates", JSON.stringify(updated));
    setShowCreateTemplate(false);
    setNewTemplateName("");
    setNewTemplateDesc("");
    setNewTemplatePrompt("");
    setNewTemplateCategory("allgemein");
    selectTemplate(newTemplate);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const deleteCustomTemplate = async (templateId: string) => {
    const updated = customTemplates.filter(t => t.id !== templateId);
    setCustomTemplates(updated);
    await AsyncStorage.setItem("custom-templates", JSON.stringify(updated));
    if (selectedTemplate.id === templateId) {
      setSelectedTemplate(PROTOCOL_TEMPLATES[PROTOCOL_TEMPLATES.length - 1]);
    }
  };

  const exportCustomTemplates = async () => {
    if (customTemplates.length === 0) {
      Alert.alert(t('alert_keine_vorlagen'), t('msg_es_gibt_noch_keine_eigenen'));
      return;
    }
    try {
      const json = JSON.stringify(customTemplates, null, 2);
      const fileUri = `${FileSystem.cacheDirectory}meine-vorlagen.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: "application/json", dialogTitle: "Vorlagen exportieren" });
      } else {
        Alert.alert(t('export'), t('msg_teilen_ist_auf_diesem_geraet'));
      }
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_export_fehlgeschlagen'));
    }
  };

  const importCustomTemplates = async () => {
    try {
      const { getDocumentAsync } = await import("expo-document-picker");
      const result = await getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const content = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      const imported = JSON.parse(content);
      if (!Array.isArray(imported)) {
        Alert.alert(t('alert_fehler'), t('msg_ungueltiges_dateiformat'));
        return;
      }
      // Validate and add IDs
      const validTemplates = imported.filter((t: any) => t.name && t.systemPrompt).map((t: any) => ({
        ...t,
        id: t.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        icon: t.icon || "auto-awesome",
        category: t.category || "allgemein",
        description: t.description || "Importierte Vorlage",
      }));
      if (validTemplates.length === 0) {
        Alert.alert(t('alert_fehler'), t('msg_keine_gueltigen_vorlagen_in_der'));
        return;
      }
      const merged = [...customTemplates, ...validTemplates];
      setCustomTemplates(merged);
      await AsyncStorage.setItem("custom-templates", JSON.stringify(merged));
      Alert.alert(t('alert_importiert'), `${validTemplates.length} Vorlage(n) erfolgreich importiert.`);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_import_fehlgeschlagen_bitte_eine_gueltige'));
    }
  };

  // --- PROJECT SELECTION FUNCTIONS ---
  const selectProject = async (project: ProjectItem) => {
    setSelectedProject(project); setShowProjectPicker(false);
    await AsyncStorage.setItem("last-selected-project-id", project.id);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const createAndSelectProject = async () => {
    if (!newProjectName.trim()) { Alert.alert(t('alert_fehler'), t('msg_bitte_gib_einen_projektnamen_ein')); return; }
    try {
      const existing = JSON.parse((await AsyncStorage.getItem("projects")) || "[]");
      const np: ProjectItem = { id: Date.now().toString(), name: newProjectName.trim(), description: newProjectDesc.trim(), color: newProjectColor, createdAt: new Date().toISOString(), protocolPrefix: newProjectPrefix.trim().toUpperCase() || undefined, protocolCounter: 0 };
      const updated = [np, ...existing];
      await AsyncStorage.setItem("projects", JSON.stringify(updated));
      setProjects(updated); setShowCreateProject(false); setNewProjectName(""); setNewProjectDesc(""); setNewProjectPrefix(""); setNewProjectColor("#E53935");
      await selectProject(np);
    } catch { Alert.alert(t('alert_fehler'), t('msg_projekt_konnte_nicht_erstellt_werden')); }
  };
  const changeProject = () => {
    setShowProjectPicker(true);
    AsyncStorage.getItem("projects").then((d) => setProjects(JSON.parse(d || "[]"))).catch(() => {});
  };

  const archiveProject = async (projectId: string) => {
    Alert.alert(t('alert_projekt_archivieren'), t('msg_dieses_projekt_wird_ausgeblendet_aber'), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_archivieren'),
        onPress: async () => {
          try {
            const data = JSON.parse((await AsyncStorage.getItem("projects")) || "[]");
            const updated = data.map((p: any) => p.id === projectId ? { ...p, isArchived: true } : p);
            await AsyncStorage.setItem("projects", JSON.stringify(updated));
            setProjects(updated);
            if (selectedProject?.id === projectId) setSelectedProject(null);
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}
        },
      },
    ]);
  };

  const unarchiveProject = async (projectId: string) => {
    try {
      const data = JSON.parse((await AsyncStorage.getItem("projects")) || "[]");
      const updated = data.map((p: any) => p.id === projectId ? { ...p, isArchived: false } : p);
      await AsyncStorage.setItem("projects", JSON.stringify(updated));
      setProjects(updated);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const deleteProject = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    Alert.alert(
      t('alert_projekt_loeschen'),
      `„${project?.name || "Projekt"}“ wird aus der Projektliste entfernt. Zugeordnete Protokolle bleiben erhalten und werden unter „Ohne Projekt“ angezeigt.`,
      [
        { text: t('btn_abbrechen'), style: "cancel" },
        {
          text: t('btn_endgueltig_loeschen'),
          style: "destructive",
          onPress: async () => {
            try {
              const result = await deleteProjectLocally<ProjectItem>(projectId);
              setProjects(result.remainingProjects);
              setSelectedProject(result.nextProject);
              setShowProjectPicker(!result.nextProject);
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Alert.alert(t('alert_fehler'), t('msg_projekt_konnte_nicht_erstellt_werden'));
            }
          },
        },
      ],
    );
  };

  const toggleFavorite = async (projectId: string) => {
    try {
      const data = JSON.parse((await AsyncStorage.getItem("projects")) || "[]");
      const updated = data.map((p: any) => p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p);
      await AsyncStorage.setItem("projects", JSON.stringify(updated));
      setProjects(updated);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const openEditProject = (project: ProjectItem) => {
    setEditProjectId(project.id);
    setEditProjectName(project.name);
    setEditProjectDesc(project.description || "");
    setEditProjectPrefix(project.protocolPrefix || "");
    setEditProjectColor(project.color);
    setShowEditProject(true);
  };

  const saveEditProject = async () => {
    if (!editProjectName.trim()) { Alert.alert(t('alert_fehler'), t('msg_bitte_gib_einen_projektnamen_ein')); return; }
    try {
      const data = JSON.parse((await AsyncStorage.getItem("projects")) || "[]");
      const updated = data.map((p: any) => p.id === editProjectId ? { ...p, name: editProjectName.trim(), description: editProjectDesc.trim(), color: editProjectColor, protocolPrefix: editProjectPrefix.trim().toUpperCase() || undefined } : p);
      await AsyncStorage.setItem("projects", JSON.stringify(updated));
      setProjects(updated);
      if (selectedProject?.id === editProjectId) {
        setSelectedProject({ ...selectedProject, name: editProjectName.trim(), description: editProjectDesc.trim(), color: editProjectColor, protocolPrefix: editProjectPrefix.trim().toUpperCase() || undefined });
      }
      setShowEditProject(false);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert(t('alert_fehler'), t('msg_projekt_konnte_nicht_gespeichert_werden')); }
  };

  const duplicateProject = async (sourceProject: any) => {
    try {
      const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const duplicated = {
        ...sourceProject,
        id: newId,
        name: `${sourceProject.name} (Kopie)`,
        createdAt: new Date().toISOString(),
        protocolCounter: 0,
        isArchived: false,
        isFavorite: false,
      };
      const data = JSON.parse((await AsyncStorage.getItem("projects")) || "[]");
      data.push(duplicated);
      await AsyncStorage.setItem("projects", JSON.stringify(data));
      setProjects(data);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('alert_dupliziert'), `Projekt \"${duplicated.name}\" wurde erstellt.`);
    } catch { Alert.alert(t('alert_fehler'), t('msg_projekt_konnte_nicht_dupliziert_werden')); }
  };

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let list = projects.filter((p: any) => showArchived ? p.isArchived : !p.isArchived);
    // Search filter
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q) || (p.protocolPrefix || "").toLowerCase().includes(q));
    }
    // Sort: favorites first, then by selected sort
    list.sort((a: any, b: any) => {
      // Favorites always on top
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      if (projectSort === "name") return a.name.localeCompare(b.name, "de");
      if (projectSort === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      // activity: by last protocol date, then created
      const aDate = a._lastDate ? new Date(a._lastDate).getTime() : new Date(a.createdAt).getTime();
      const bDate = b._lastDate ? new Date(b._lastDate).getTime() : new Date(b.createdAt).getTime();
      return bDate - aDate;
    });
    return list;
  }, [projects, projectSearch, projectSort, showArchived]);

  // Check for current calendar event when screen loads
  useEffect(() => {
    if (Platform.OS !== "web") {
      getCurrentEvent().then(setCurrentCalendarEvent).catch(() => {});
    }
  }, []);

  // Pulse animation for mic circle during recording
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Waveform simulation during recording + audio level indicator
  useEffect(() => {
    if (isRecording && !isPaused) {
      waveformInterval.current = setInterval(() => {
        const bars = Array.from({ length: 12 }, () => 0.2 + Math.random() * 0.8);
        setWaveformBars(bars);
        // Simulate audio level based on average bar height
        const avg = bars.reduce((a, b) => a + b, 0) / bars.length;
        if (avg < 0.35) setAudioLevel("quiet");
        else if (avg > 0.75) setAudioLevel("loud");
        else setAudioLevel("good");
      }, 150);
      return () => {
        if (waveformInterval.current) clearInterval(waveformInterval.current);
      };
    } else {
      if (waveformInterval.current) {
        clearInterval(waveformInterval.current);
        waveformInterval.current = null;
      }
      if (!isRecording) {
        void Promise.resolve().then(() => {
          setWaveformBars([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
          setAudioLevel("good");
        });
      }
    }
  }, [isRecording, isPaused]);

  // Voice-triggered photo capture: detect "Foto" keyword in live transcription
  const lastVoicePhotoRef = useRef<number>(0);
  useEffect(() => {
    if (!isRecording || !liveText || mode !== "audio-photo") return;
    const lower = liveText.toLowerCase();
    // Check for "foto" keyword (with cooldown of 3 seconds to prevent duplicates)
    if (lower.includes("foto") || lower.includes("photo")) {
      const now = Date.now();
      if (now - lastVoicePhotoRef.current > 3000) {
        lastVoicePhotoRef.current = now;
        takePhoto();
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    }
  }, [liveText, isRecording, mode]);

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

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resumeTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Take photo with optional timer countdown
  const takePhotoWithTimer = useCallback(() => {
    if (photoTimer === 0) {
      takePhoto();
      return;
    }
    // Start countdown
    setTimerCountdown(photoTimer);
    let remaining = photoTimer;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    timerCountdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (timerCountdownRef.current) clearInterval(timerCountdownRef.current);
        timerCountdownRef.current = null;
        setTimerCountdown(null);
        takePhoto();
      } else {
        setTimerCountdown(remaining);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }, 1000);
  }, [photoTimer]);

  async function takePhoto() {
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
        setPhotoVoiceNotes((prev) => [...prev, null]); // placeholder for voice note

        // Auto-link photo to the last chapter marker (if any)
        setMarkers((prev) => {
          const lastChapterIdx = [...prev].reverse().findIndex(m => m.label.startsWith("KAPITEL:"));
          if (lastChapterIdx === -1) return prev;
          const actualIdx = prev.length - 1 - lastChapterIdx;
          const updated = [...prev];
          updated[actualIdx] = {
            ...updated[actualIdx],
            photos: [...(updated[actualIdx].photos || []), newUri],
          };
          return updated;
        });

        // Auto-start voice note for caption dictation
        // Small delay to let state update
        const newPhotoIndex = capturedPhotos.length; // current length = new index
        setTimeout(() => {
          startVoiceNote(newPhotoIndex);
        }, 300);
      }
    } catch (error) {
      console.error("Photo capture error:", error);
    }
  }

  // --- PICK FROM GALLERY ---
  const pickFromGallery = async () => {
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 20,
      });

      if (!result.canceled && result.assets.length > 0) {
        const photoDir = `${FileSystem.documentDirectory}photos/`;
        const dirInfo = await FileSystem.getInfoAsync(photoDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(photoDir, { intermediates: true });
        }

        for (const asset of result.assets) {
          const filename = `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          const newUri = `${photoDir}${filename}`;
          await FileSystem.copyAsync({ from: asset.uri, to: newUri });

          setCapturedPhotos((prev) => [...prev, newUri]);
          setPhotoTimestamps((prev) => [...prev, recordingDuration]);
          setPhotoVoiceNotes((prev) => [...prev, null]);

          // Auto-link to last chapter marker
          setMarkers((prev) => {
            const lastChapterIdx = [...prev].reverse().findIndex(m => m.label.startsWith("KAPITEL:"));
            if (lastChapterIdx === -1) return prev;
            const actualIdx = prev.length - 1 - lastChapterIdx;
            const updated = [...prev];
            updated[actualIdx] = {
              ...updated[actualIdx],
              photos: [...(updated[actualIdx].photos || []), newUri],
            };
            return updated;
          });
        }
      }
    } catch (error) {
      console.error("Gallery pick error:", error);
    }
  };

  // --- VOICE NOTE PER PHOTO ---
  const startVoiceNote = async (photoIndex: number) => {
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setVoiceNoteRecording({ photoIndex, startTime: Date.now() });
      setVoiceNoteElapsed(0);
      // Start countdown timer
      if (voiceNoteTimerRef.current) clearInterval(voiceNoteTimerRef.current);
      voiceNoteTimerRef.current = setInterval(() => {
        setVoiceNoteElapsed((prev) => {
          if (prev >= 29) {
            // Auto-stop at 30 seconds
            stopVoiceNote();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error) {
      console.error("Voice note start error:", error);
    }
  };

  const stopVoiceNote = async () => {
    if (!voiceNoteRecording) return;
    // Clear timer
    if (voiceNoteTimerRef.current) {
      clearInterval(voiceNoteTimerRef.current);
      voiceNoteTimerRef.current = null;
    }
    setVoiceNoteElapsed(0);
    try {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Store the voice note as a time range reference in the main recording
      const endTime = Date.now();
      const duration = (endTime - voiceNoteRecording.startTime) / 1000;
      const photoIndex = voiceNoteRecording.photoIndex;
      
      // Save voice note metadata (start time in recording seconds)
      const noteStartSec = photoTimestamps[photoIndex] || 0;
      const voiceNoteUri = `voice-note://${photoIndex}/${noteStartSec}/${noteStartSec + duration}`;
      
      setPhotoVoiceNotes((prev) => {
        const updated = [...prev];
        updated[photoIndex] = voiceNoteUri;
        return updated;
      });
      setVoiceNoteRecording(null);
    } catch (error) {
      console.error("Voice note stop error:", error);
      setVoiceNoteRecording(null);
    }
  };

  // --- VIDEO RECORDING ---
  const [chapterMode, setChapterMode] = useState(false);
  const [chapterPromptVisible, setChapterPromptVisible] = useState(false);
  const [chapterInput, setChapterInput] = useState("");
  const [chapterListening, setChapterListening] = useState(false);
  const [chapterRecording, setChapterRecording] = useState(false);
  const chapterRecorderActiveRef = useRef(false);

  const addMarker = (label: string) => {
    setMarkers((prev) => [...prev, { time: recordingDuration, label }]);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const startChapterMarker = () => {
    // Show chapter input prompt (text input only - no auto-speech to avoid audio conflicts)
    setChapterInput("");
    setChapterPromptVisible(true);
    setChapterListening(false);
    setChapterRecording(false);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    // Pause main recording while chapter modal is open
    if (isRecording && !isPaused) {
      try { audioRecorder.pause(); } catch (e) { console.warn("Chapter-pause failed:", e); }
      pauseTimer();
    }
  };

  const startChapterSpeech = async () => {
    try {
      // Set audio mode to allow recording BEFORE changing UI state
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await chapterAudioRecorder.prepareToRecordAsync();
      chapterAudioRecorder.record();
      chapterRecorderActiveRef.current = true;
      // Only update UI state AFTER recording successfully started
      setChapterListening(true);
      setChapterRecording(true);
      // Auto-stop after 4 seconds
      setTimeout(() => {
        if (chapterRecorderActiveRef.current) {
          void stopChapterSpeech();
        }
      }, 4000);
    } catch  {
      setChapterListening(false);
      setChapterRecording(false);
      // Show alert so user knows to type instead
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  };

  const stopChapterSpeech = async () => {
    try {
      setChapterRecording(false);
      setChapterListening(false);
      if (!chapterRecorderActiveRef.current) return;
      await chapterAudioRecorder.stop();
      const uri = chapterAudioRecorder.uri;
      chapterRecorderActiveRef.current = false;
      
      // Resume main recording
      if (isRecording) {
        try {
          await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
          audioRecorder.record();
          resumeTimer();
          setIsPaused(false);
        } catch (e) { console.warn("Chapter resume failed:", e); }
      }
      
      if (!uri) return;

      // Read the file and transcribe
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const uploadResult = await uploadMutation.mutateAsync({ base64, mimeType: "audio/m4a", filename: `chapter-${Date.now()}.m4a` });
      const transcribeResult = await transcribeMutation.mutateAsync({ audioUrl: uploadResult.url, language: "de" });
      const chapterName = (transcribeResult.text || "").trim().replace(/[.!?,;:]+$/g, "");
      if (chapterName) {
        setChapterInput(chapterName);
        // Auto-confirm after successful transcription
        confirmChapter(chapterName);
      }
    } catch  {
      // Resume main recording on error too
      if (isRecording) {
        try {
          audioRecorder.record();
          resumeTimer();
          setIsPaused(false);
        } catch {}
      }
      // Keep modal open for manual input
    }
  };

  const confirmChapter = (name: string) => {
    if (name.trim()) {
      // Prefix with "KAPITEL:" so the LLM and renderer know it's a chapter heading
      addMarker(`KAPITEL: ${name.trim()}`);
    }
    setChapterPromptVisible(false);
    setChapterInput("");
    setChapterListening(false);
    setChapterRecording(false);
    // Resume main recording after chapter is set
    if (isRecording) {
      try {
        setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true }).then(() => {
          audioRecorder.record();
          resumeTimer();
          setIsPaused(false);
        });
      } catch {}
    }
  };

  // --- AUDIO RECORDING ---
  const startAudioRecording = async () => {
    setShowTemplateSelector(false);
    setCapturedPhotos([]);
    setPhotoTimestamps([]);
    setPhotoVoiceNotes([]);
    setMarkers([]);

    try {
      // Set audio mode first
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });

      // Prepare with timeout - getUserMedia/native setup can hang
      const preparePromise = audioRecorder.prepareToRecordAsync();
      const prepareTimeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("prepareToRecordAsync timed out")), 8000)
      );
      await Promise.race([preparePromise, prepareTimeout]);

      // Start recording
      audioRecorder.record();

      // Only update UI state AFTER recording successfully started
      setIsRecording(true);
      setIsPaused(false);
      startTimer();
    } catch (error: any) {
      console.error("Audio recording error:", error?.message || error);
      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
      alert("Aufnahme konnte nicht gestartet werden. Bitte versuche es erneut.");
    }
  };

  const stopAudioRecording = async () => {
    // Prevent double-stop calls
    if (isStoppingRef.current) {
      console.warn("stopAudioRecording: already stopping, ignoring duplicate call");
      return;
    }
    isStoppingRef.current = true;

    // IMMEDIATELY update UI state so the app is responsive
    stopTimer();
    setIsRecording(false);
    setIsPaused(false);

    let uri: string | null = null;

    try {
      // On web, stopping from paused state can hang because the
      // 'dataavailable' event may not fire. Resume briefly first.
      if (Platform.OS === "web") {
        try {
          audioRecorder.record();
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (resumeErr) {
          console.warn("Pre-stop resume failed (ok):", resumeErr);
        }
      }

      // Stop with a timeout
      const stopPromise = audioRecorder.stop();
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("stop() timed out")), 4000)
      );

      try {
        await Promise.race([stopPromise, timeoutPromise]);
      } catch (raceErr: any) {
        console.warn("audioRecorder.stop() race:", raceErr?.message || raceErr);
      }

      // Get the URI
      try { uri = audioRecorder.uri; } catch {}
    } catch (error) {
      console.error("Audio stop error:", error);
      try { uri = audioRecorder.uri; } catch {}
    }

    // Reset audio mode
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    } catch (e) {
      console.warn("setAudioModeAsync reset failed:", e);
    }

    isStoppingRef.current = false;

    // Process the recording if we have a URI
    if (uri) {
      setProcessingSource("audio");
      await processRecording(uri, "audio/m4a");
    } else {
      console.error("No recording URI available after stop");
      alert("Die Aufnahme konnte nicht gespeichert werden. Bitte versuche es erneut.");
    }
  };

  // --- PAUSE/RESUME ---
  const pauseRecording = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { audioRecorder.pause(); } catch (e) { console.warn("Pause failed:", e); }
    pauseTimer();
    setIsPaused(true);
  };

  const resumeRecording = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { audioRecorder.record(); } catch (e) { console.warn("Resume failed:", e); }
    resumeTimer();
    setIsPaused(false);
  };

  // --- UNIFIED RECORDING CONTROLS ---
  const beginRecordingAfterNotice = async () => {
    const privacyChoices = await getPrivacyChoices();
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Realtime/AI-related speech processing remains off unless explicitly enabled.
    if (privacyChoices.aiProcessing) {
      startListening();
    } else {
      clearLiveText();
    }

    // Ask the OS for location only after the user enabled this exact purpose.
    if (Platform.OS !== "web" && privacyChoices.gpsTracking) {
      getCurrentLocation()
        .then((loc) => {
          setRecordingLocation(loc);
          if (loc) getWeatherForLocation(loc).then(setWeatherData).catch(() => {});
        })
        .catch(() => {});
    } else {
      setRecordingLocation(null);
      setWeatherData(null);
    }

    startAudioRecording();
  };

  function startRecording() {
    if (!selectedProject) {
      Alert.alert(
        "Projekt auswählen",
        "Bitte wähle oder erstelle zuerst ein Projekt. Jede Aufnahme wird einem Projekt zugeordnet.",
      );
      setShowProjectPicker(true);
      return;
    }

    Alert.alert(
      "Personen vor Aufnahme informieren",
      "Bestätigen Sie für diese Aufnahme, dass alle betroffenen Personen über Zweck, Empfänger und mögliche KI-/Cloud-Verarbeitung informiert wurden und eine geeignete Rechtsgrundlage beziehungsweise erforderliche Zustimmung vorliegt. Ohne KI-/Cloud-Freigabe wird nur eine lokale Rohaufnahme gespeichert.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Bestätigt – Aufnahme starten",
          onPress: () => beginRecordingAfterNotice(),
        },
      ],
    );
  }

  const stopRecording = () => {
    // Prevent triggering stop if already stopping
    if (isStoppingRef.current) return;
    // Show confirmation dialog instead of immediately stopping
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Pause the recording so nothing is lost while user decides
    if (!isPaused) {
      try { audioRecorder.pause(); } catch (e) { console.warn("Stop-pause failed:", e); }
      pauseTimer();
    }
    setShowStopConfirm(true);
  };

  const confirmStopRecording = async () => {
    setShowStopConfirm(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopListening();
    // stopAudioRecording handles all state updates internally
    await stopAudioRecording();
  };

  const cancelStopRecording = () => {
    setShowStopConfirm(false);
    // Resume recording - it was paused by the stop action
    try { audioRecorder.record(); } catch (e) { console.warn("Cancel-resume failed:", e); }
    resumeTimer();
    setIsPaused(false);
  };

  const processRecording = async (fileUri: string, mimeType: string) => {
    // NON-BLOCKING: Create placeholder protocol immediately, navigate away,
    // then process in background. App is instantly usable again.
    
    try {
      if (!selectedProject) {
        setIsProcessing(false);
        setProcessingSource(null);
        setShowProjectPicker(true);
        Alert.alert("Projekt auswählen", "Die Aufnahme kann erst verarbeitet werden, wenn ein Projekt ausgewählt ist.");
        return;
      }

      const activeProject = selectedProject;
      const privacyChoices = await getPrivacyChoices();
      const canProcessWithServer = privacyChoices.aiProcessing && privacyChoices.cloudSync;
      const protocolId = Date.now().toString();
      const createdAt = new Date().toISOString();
      const protocolNumber = await getNextProtocolNumber(activeProject.id);
      const placeholderProtocol = {
        id: protocolId,
        title: canProcessWithServer
          ? "Wird verarbeitet..."
          : "Lokale Aufnahme – Verarbeitung deaktiviert",
        transcription: "",
        protocol: "",
        templateName: selectedTemplate.name,
        templateId: selectedTemplate.id,
        photos: capturedPhotos,
        photoTimestamps: photoTimestamps.length > 0 ? photoTimestamps : undefined,
        photoVoiceNotes: photoVoiceNotes.some(n => n !== null) ? photoVoiceNotes : undefined,
        todos: [],
        markers,
        duration: recordingDuration,
        recordingMode: mode,
        createdAt,
        calendarEventId: null as string | null,
        location: recordingLocation ? {
          latitude: recordingLocation.latitude,
          longitude: recordingLocation.longitude,
          address: recordingLocation.address,
          city: recordingLocation.city,
        } : null,
        weather: weatherData ? formatWeatherForProtocol(weatherData) : null,
        status: canProcessWithServer ? ("processing" as const) : ("draft" as const),
        processingStep: canProcessWithServer ? "queued" : "consent_required",
        sourceAudioUri: fileUri,
        projectId: activeProject.id,
        projectName: activeProject.name,
        protocolNumber: protocolNumber || undefined,
        roomId: selectedRoom?.id || undefined,
        roomName: selectedRoom?.name || undefined,
        floorId: selectedFloor?.id || undefined,
        floorName: selectedFloor?.name || undefined,
      };

      if (currentCalendarEvent && Platform.OS !== "web") {
        try {
          await addNotesToEvent(currentCalendarEvent.id, "Protokoll wird verarbeitet...");
          placeholderProtocol.calendarEventId = currentCalendarEvent.id;
        } catch {}
      }

      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      protocols.unshift(placeholderProtocol);
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      if (routePlanPinId) {
        await linkStoredPlanPinToProtocol(routePlanPinId, {
          id: placeholderProtocol.id,
          title: placeholderProtocol.title || placeholderProtocol.templateName || t('protokoll'),
        });
      }

      if (!canProcessWithServer) {
        setCapturedPhotos([]);
        setPhotoTimestamps([]);
        setPhotoVoiceNotes([]);
        setIsProcessing(false);
        setProcessingSource(null);
        Alert.alert(
          "Lokal gespeichert",
          "Die Rohaufnahme wurde im ausgewählten Projekt gespeichert. Es wurden keine Daten an Cloud- oder KI-Dienste übertragen. Für Transkription und Protokollerstellung müssen KI und Cloud in den Datenschutzoptionen aktiviert werden.",
        );
        router.push("/(tabs)/protocols" as any);
        return;
      }

      const online = await isOnline();
      if (!online) {
        await addToQueue({
          id: protocolId,
          fileUri,
          mimeType,
          templateId: selectedTemplate.id,
          photos: capturedPhotos,
          duration: recordingDuration,
          recordingMode: mode,
          createdAt,
          markers,
          projectId: activeProject.id,
          projectName: activeProject.name,
          location: recordingLocation ? {
            latitude: recordingLocation.latitude,
            longitude: recordingLocation.longitude,
            address: recordingLocation.address,
            city: recordingLocation.city,
          } : null,
          weather: weatherData ? formatWeatherForProtocol(weatherData) : null,
        });
        setCapturedPhotos([]);
        setPhotoTimestamps([]);
        setPhotoVoiceNotes([]);
        setIsProcessing(false);
        setProcessingSource(null);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        alert("Kein Internet – das Protokoll ist im ausgewählten Projekt sichtbar. Die Verarbeitung startet bei Verbindung nur, solange Cloud- und KI-Freigabe aktiv bleiben.");
        router.push("/(tabs)/protocols" as any);
        return;
      }

      // Clear recording state and navigate to protocols list
      setCapturedPhotos([]);
      setPhotoTimestamps([]);
      setPhotoVoiceNotes([]);
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
          generateProtocol: (transcription: string, templateId: string, style: string, format: string, recordingDate?: string, jobMarkers?: { time: number; label: string }[], photoCount?: number, jobPhotoTimestamps?: number[]) =>
            protocolMutation.mutateAsync({ transcription, templateId, style: style as "formal" | "informal", format: format as "bullets" | "paragraphs", recordingDate, markers: jobMarkers, photoCount, photoTimestamps: jobPhotoTimestamps }),
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
      await syncProtocolDefects(newProtocol);
      if (routePlanPinId) {
        await linkStoredPlanPinToProtocol(routePlanPinId, {
          id: newProtocol.id,
          title: newProtocol.title || newProtocol.templateName || t('protokoll'),
        });
      }

      // Auto-send if enabled
      try {
        const settingsStr2 = await AsyncStorage.getItem("protokoll-settings");
        const appSettings = settingsStr2 ? JSON.parse(settingsStr2) : {};
        if (appSettings.autoSend) {
          const companyStr = await AsyncStorage.getItem("company-settings");
          const companySettings = companyStr ? JSON.parse(companyStr) : {};

          // generateProtocolPdf returns a file URI directly (not HTML)
          const pdfUri = await generateProtocolPdf({
            title: newProtocol.templateName || t('protokoll'),
            protocol: newProtocol.protocol,
            templateName: newProtocol.templateName || t('protokoll'),
            photos: newProtocol.photos || [],
            photoTimestamps: newProtocol.photoTimestamps || undefined,
            todos: newProtocol.todos || [],
            duration: newProtocol.duration,
            createdAt: newProtocol.createdAt,
            protocolNumber: newProtocol.protocolNumber,
            projectName: selectedProject?.name || undefined,
          });

          // Share via system share sheet (opens WhatsApp/Email picker)
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(pdfUri, {
              mimeType: "application/pdf",
              dialogTitle: t('protokoll_senden'),
              UTI: "com.adobe.pdf",
            });
          }
        }
      } catch (autoSendError) {
        console.error("Auto-send error:", autoSendError);
      }

      // Auto-analyse photos if enabled and photos exist
      try {
        const settingsStr3 = await AsyncStorage.getItem("protokoll-settings");
        const appSettings3 = settingsStr3 ? JSON.parse(settingsStr3) : {};
        if (appSettings3.autoAnalyzePhotos && newProtocol.photos && newProtocol.photos.length > 0) {
          router.push(
            `/photo-analysis?autoPhotos=${encodeURIComponent(JSON.stringify(newProtocol.photos.slice(0, 5)))}&projectId=${selectedProject?.id || ""}&roomName=${selectedRoom?.name || ""}` as any
          );
          setIsProcessing(false);
          setCapturedPhotos([]);
          setPhotoTimestamps([]);
          return;
        }
      } catch (autoAnalyzeError) {
        console.error("Auto-analyse error:", autoAnalyzeError);
      }

      setIsProcessing(false);
      setCapturedPhotos([]);
      setPhotoTimestamps([]);

      router.push(
        `/protocol-detail?id=${newProtocol.id}` as any
      );
    } catch (error) {
      setIsProcessing(false);
      console.error("Processing error:", error);
      alert("Fehler bei der Verarbeitung. Bitte versuche es erneut.");
    }
  };

  // --- PROJECT PICKER UI (shown FIRST before anything else) ---
  if (showProjectPicker && !isRecording && !isProcessing) {
    return (
      <ScreenContainer className="flex-1">
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20 }}>
          {/* Header */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="business" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{t('projekt_waehlen')}</Text>
              {isListening && liveText ? (
                <Text style={{ fontSize: 12, color: "#22C55E", marginTop: 6, textAlign: "center", maxWidth: 280 }} numberOfLines={2}>{liveText}</Text>
              ) : null}
              </View>
            </View>
            <Text style={{ fontSize: 14, color: colors.muted, marginLeft: 46 }}>Jede Aufnahme wird dem ausgewählten Projekt zugeordnet.</Text>
          </View>

          {/* Summary Stats */}
          {projects.length > 0 && (
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 0, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: colors.primary }}>{projects.filter((p: any) => !p.isArchived).length}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{t('project_active')}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 0, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: colors.success }}>{projects.reduce((sum, p: any) => sum + (p._protocolCount || 0), 0)}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{t('project_protocols')}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 0, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: "#FDD835" }}>{projects.filter((p: any) => p.isFavorite && !p.isArchived).length}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{t('project_favorites')}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 0, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: colors.muted }}>{projects.filter((p: any) => p.isArchived).length}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{t('project_archived')}</Text>
              </View>
            </View>
          )}

          {/* Search Bar */}
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 10 }}>
            <MaterialIcons name="search" size={20} color={colors.muted} />
            <TextInput
              value={projectSearch}
              onChangeText={setProjectSearch}
              placeholder={t('projekt_suchen')}
              placeholderTextColor={colors.muted}
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14, color: colors.foreground }}
              returnKeyType="done"
            />
            {projectSearch.length > 0 && (
              <Pressable onPress={() => setProjectSearch("")} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <MaterialIcons name="close" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {/* Sort & Archive Toggle Row */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 6 }}>
            <Pressable
              onPress={() => setProjectSort("activity")}
              style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0, backgroundColor: projectSort === "activity" ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: projectSort === "activity" ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: projectSort === "activity" ? colors.primary : colors.muted }}>{t('stats_activity')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setProjectSort("name")}
              style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0, backgroundColor: projectSort === "name" ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: projectSort === "name" ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: projectSort === "name" ? colors.primary : colors.muted }}>{t('project_sort_name')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setProjectSort("created")}
              style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0, backgroundColor: projectSort === "created" ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: projectSort === "created" ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: projectSort === "created" ? colors.primary : colors.muted }}>{t('project_sort_created')}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => setShowArchived(!showArchived)}
              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0, backgroundColor: showArchived ? colors.warning + "15" : colors.surface, borderWidth: 1, borderColor: showArchived ? colors.warning : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name={showArchived ? "inventory" : "archive"} size={14} color={showArchived ? colors.warning : colors.muted} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: showArchived ? colors.warning : colors.muted }}>{t('label_archiv')}</Text>
            </Pressable>
          </View>

          <FlatList
            data={filteredProjects}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListHeaderComponent={
              <Pressable onPress={() => setShowCreateProject(true)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 0, borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", marginBottom: 14, gap: 12, opacity: pressed ? 0.7 : 1 }]}>
                <View style={{ width: 44, height: 44, borderRadius: 0, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="add" size={26} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>{t('neues_projekt_anlegen')}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t('mit_nummerierung_farbe_und')}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
              </Pressable>
            }
            renderItem={({ item }) => {
              const pItem = item as any;
              const isSelected = selectedProject?.id === item.id;
              const isFav = pItem.isFavorite;
              return (
                <Pressable onPress={() => selectProject(item)} style={({ pressed }) => [{ padding: 14, borderRadius: 0, borderWidth: isSelected ? 2 : 1, borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary + "08" : colors.surface, marginBottom: 10, opacity: pressed ? 0.7 : 1 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {/* Favorite Star */}
                    <Pressable
                      onPress={() => toggleFavorite(item.id)}
                      style={({ pressed }) => [{ marginRight: 8, opacity: pressed ? 0.5 : 1 }]}
                    >
                      <MaterialIcons name={isFav ? "star" : "star-border"} size={22} color={isFav ? "#FDD835" : colors.border} />
                    </Pressable>
                    <View style={{ width: 42, height: 42, borderRadius: 0, backgroundColor: item.color + "20", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: item.color }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{item.name}</Text>
                      {item.description ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{item.description}</Text> : null}
                    </View>
                    {isSelected && <MaterialIcons name="check-circle" size={24} color={colors.primary} />}
                  </View>
                  {/* Extra Info Row */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border + "60", gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <MaterialIcons name="description" size={14} color={colors.muted} />
                      <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "500" }}>{pItem._protocolCount || 0} Prot.</Text>
                    </View>
                    {item.protocolPrefix && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <MaterialIcons name="tag" size={14} color={colors.primary} />
                        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>{item.protocolPrefix}-{String((item.protocolCounter || 0) + 1).padStart(3, "0")}</Text>
                      </View>
                    )}
                    {pItem._lastDate && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <MaterialIcons name="schedule" size={14} color={colors.muted} />
                        <Text style={{ fontSize: 12, color: colors.muted }}>{new Date(pItem._lastDate).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    {showArchived ? (
                      <>
                        <Pressable
                          onPress={() => deleteProject(item.id)}
                          style={({ pressed }) => [{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.error + "15", opacity: pressed ? 0.6 : 1 }]}
                        >
                          <MaterialIcons name="delete" size={14} color={colors.error} />
                        </Pressable>
                        <Pressable
                          onPress={() => unarchiveProject(item.id)}
                          style={({ pressed }) => [{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.success + "15", opacity: pressed ? 0.6 : 1 }]}
                        >
                          <MaterialIcons name="unarchive" size={14} color={colors.success} />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          onPress={() => openEditProject(item)}
                          style={({ pressed }) => [{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.primary + "10", opacity: pressed ? 0.6 : 1 }]}
                        >
                          <MaterialIcons name="edit" size={14} color={colors.primary} />
                        </Pressable>
                        <Pressable
                          onPress={() => archiveProject(item.id)}
                          style={({ pressed }) => [{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.muted + "15", opacity: pressed ? 0.6 : 1 }]}
                        >
                          <MaterialIcons name="archive" size={14} color={colors.muted} />
                        </Pressable>
                        <Pressable
                          onPress={() => { selectProject(item); setShowProjectPicker(false); router.push(`/project-detail?id=${item.id}` as any); }}
                          style={({ pressed }) => [{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.primary + "10", opacity: pressed ? 0.6 : 1 }]}
                        >
                          <MaterialIcons name="open-in-new" size={14} color={colors.primary} />
                        </Pressable>
                      </>
                    )}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 50 }}>
                <View style={{ width: 80, height: 80, borderRadius: 0, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <MaterialIcons name={showArchived ? "inventory" : "folder-open"} size={40} color={colors.border} />
                </View>
                <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>{showArchived ? "Kein archiviertes Projekt" : (projectSearch ? "Keine Treffer" : "Noch keine Projekte")}</Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center", paddingHorizontal: 20 }}>{showArchived ? t('archivierte_projekte_hier') : (projectSearch ? t('anderer_suchbegriff') : t('erstes_projekt_erstellen'))}</Text>
              </View>
            }
          />

        </View>

        {/* Create Project Modal */}
        <Modal visible={showCreateProject} animationType="fade" transparent>
          <View style={{ flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16 }}>
            <View style={{ borderRadius: 0, padding: 24, paddingBottom: 24, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{t('project_new')}</Text>
                <Pressable onPress={() => setShowCreateProject(false)}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable>
              </View>
              <TextInput value={newProjectName} onChangeText={setNewProjectName} placeholder={t('projektname_zb_baustelle_muehlenstrasse')} placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }} autoFocus />
              <TextInput value={newProjectDesc} onChangeText={setNewProjectDesc} placeholder={t('beschreibung_optional')} placeholderTextColor={colors.muted} multiline numberOfLines={2} style={{ borderWidth: 1, borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, minHeight: 60, textAlignVertical: "top", color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }} />
              <TextInput value={newProjectPrefix} onChangeText={(v) => setNewProjectPrefix(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} placeholder={t('protokollpraefix_zb_bst_mng')} placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 6, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }} autoCapitalize="characters" maxLength={5} />
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 14 }}>{newProjectPrefix ? `Nummerierung: ${newProjectPrefix}-001, ${newProjectPrefix}-002, ...` : "Optional: Automatische Nummerierung (z.B. BST-001)"}</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>{t('farbe_waehlen')}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
                {PROJECT_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setNewProjectColor(c)} style={[{ width: 32, height: 32, borderRadius: 0, backgroundColor: c, alignItems: "center", justifyContent: "center" }, newProjectColor === c && { borderWidth: 3, borderColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 }]}>
                    {newProjectColor === c && <MaterialIcons name="check" size={16} color="#FFF" />}
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={createAndSelectProject} style={({ pressed }) => [{ paddingVertical: 14, borderRadius: 0, backgroundColor: colors.primary, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}>
                <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "600" }}>{t('projekt_erstellen_auswaehlen')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Edit Project Modal */}
        <Modal visible={showEditProject} animationType="fade" transparent>
          <View style={{ flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16 }}>
            <View style={{ borderRadius: 0, padding: 24, paddingBottom: 24, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{t('projekt_bearbeiten')}</Text>
                <Pressable onPress={() => setShowEditProject(false)}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable>
              </View>
              <TextInput value={editProjectName} onChangeText={setEditProjectName} placeholder={t('project_name')} placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }} autoFocus />
              <TextInput value={editProjectDesc} onChangeText={setEditProjectDesc} placeholder={t('beschreibung_optional')} placeholderTextColor={colors.muted} multiline numberOfLines={2} style={{ borderWidth: 1, borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, minHeight: 60, textAlignVertical: "top", color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }} />
              <TextInput value={editProjectPrefix} onChangeText={(v) => setEditProjectPrefix(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} placeholder={t('protokollpraefix_zb_bst_mng')} placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 6, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }} autoCapitalize="characters" maxLength={5} />
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 14 }}>{editProjectPrefix ? t('praefix_label').replace('{prefix}', editProjectPrefix) : t('kein_praefix')}</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>{t('farbe_waehlen')}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
                {PROJECT_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setEditProjectColor(c)} style={[{ width: 32, height: 32, borderRadius: 0, backgroundColor: c, alignItems: "center", justifyContent: "center" }, editProjectColor === c && { borderWidth: 3, borderColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 }]}>
                    {editProjectColor === c && <MaterialIcons name="check" size={16} color="#FFF" />}
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                <Pressable onPress={() => { setShowEditProject(false); const proj = projects.find((p: any) => p.id === editProjectId); if (proj) duplicateProject(proj); }} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
                  <MaterialIcons name="content-copy" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>{t('project_duplicate')}</Text>
                </Pressable>
                <Pressable onPress={() => { setShowEditProject(false); deleteProject(editProjectId!); }} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 0, backgroundColor: colors.error + "15", borderWidth: 1, borderColor: colors.error, opacity: pressed ? 0.8 : 1 }]}>
                  <MaterialIcons name="delete" size={16} color={colors.error} />
                  <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>{t('delete')}</Text>
                </Pressable>
              </View>
              <Pressable onPress={saveEditProject} style={({ pressed }) => [{ paddingVertical: 14, borderRadius: 0, backgroundColor: colors.primary, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}>
                <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "600" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
    );
  }

  // Permission handling
  if (!cameraPermission || !micPermission) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }
  if (!cameraPermission.granted || !micPermission.granted) {
    const canAskAgain = cameraPermission?.canAskAgain !== false && micPermission?.canAskAgain !== false;
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <MaterialIcons name="no-photography" size={64} color={colors.muted} style={{ marginBottom: 16 }} />
        <Text className="text-2xl font-bold text-foreground text-center mb-4">
          Berechtigungen erforderlich
        </Text>
        <Text className="text-base text-muted text-center mb-8">
          Baudikt benötigt Zugriff auf Kamera und Mikrofon, um Fotos aufzunehmen und Protokolle zu erstellen.
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
            <Text style={styles.permissionButtonText}>{t('berechtigungen_erteilen')}</Text>
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
              <Text style={styles.permissionButtonText}>{t('einstellungen_oeffnen')}</Text>
            </Pressable>
            <Text className="text-sm text-muted text-center mt-4">
              Berechtigungen wurden verweigert. Bitte aktiviere Kamera und Mikrofon in den Geräteeinstellungen.
            </Text>
          </>
        )}
      </ScreenContainer>
    );
  }

  // Processing state with step-by-step progress
  if (isProcessing) {
    const sourceLabel = processingSource === "audio" 
      ? "✅ Audio erfolgreich aufgenommen" 
      : null;

    const steps = [

      { key: "upload", label: t('datei_hochladen'), icon: "cloud-upload" as const },
      { key: "transcription", label: t('sprache_erkennen'), icon: "mic" as const },
      { key: "protocol", label: t('protokoll_erstellen_step'), icon: "description" as const },
      { key: "saving", label: t('speichern_step'), icon: "check-circle" as const },
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
                    borderRadius: 0,
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
                    {step.label}{isCompleted ? " ✓" : ""}
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
                backgroundColor: processingSource === "audio" 
                  ? colors.success + "15" 
                  : colors.warning + "15",
                borderColor: processingSource === "audio" 
                  ? colors.success + "40" 
                  : colors.warning + "40",
              }
            ]}>
              <Text style={[
                styles.sourceBadgeText,
                { 
                  color: processingSource === "audio" 
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
              {capturedPhotos.length} Foto{capturedPhotos.length !== 1 ? "s" : ""} werden angehängt
            </Text>
          )}
        </View>
      </ScreenContainer>
    );
  }
  // --- AUDIO+PHOTO MODE UI ---
  // Audio+Photo mode shows the camera for photos while recording audio.
  // Preview Modal
  if (showPreview && previewProtocol) {
    const { newProtocol } = previewProtocol;
    return (
      <ScreenContainer className="p-4">
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>{t('protokollvorschau')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{t('pruefe_das_generierte_protokoll')}</Text>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>{newProtocol.templateName || t('protokoll')}</Text>
            {newProtocol.protocolNumber && <Text style={{ fontSize: 12, color: colors.primary, marginBottom: 8 }}>{newProtocol.protocolNumber}</Text>}
            <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 22 }} numberOfLines={30}>{newProtocol.protocol}</Text>
          </View>

          {newProtocol.todos && newProtocol.todos.length > 0 && (
            <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
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
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>{newProtocol.photos.length} Foto(s) angehängt</Text>
          )}
        </ScrollView>

        <View style={{ position: "absolute", bottom: 30, left: 16, right: 16, flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => { setShowPreview(false); setPreviewProtocol(null); setCapturedPhotos([]); setPhotoTimestamps([]); }}
            style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 0, borderWidth: 1, borderColor: colors.border, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('verwerfen')}</Text>
          </Pressable>
          <Pressable
            onPress={confirmSaveProtocol}
            style={({ pressed }) => [{ flex: 2, paddingVertical: 14, borderRadius: 0, backgroundColor: colors.primary, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFFFFF" }}>{t('save')}</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  // Tap-to-focus handler
  const handleTapFocus = (x: number, y: number) => {
    setFocusPoint({ x, y });
    focusAnim.setValue(0);
    Animated.sequence([
      Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(focusAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setFocusPoint(null));
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // Show zoom badge temporarily
  const showZoomLevel = () => {
    setShowZoomBadge(true);
    if (zoomBadgeTimeout.current) clearTimeout(zoomBadgeTimeout.current);
    zoomBadgeTimeout.current = setTimeout(() => setShowZoomBadge(false), 1500);
  };

  // Pinch-to-zoom gesture for camera
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      pinchZoomBase.current = cameraZoom;
      showZoomLevel();
    })
    .onUpdate((e) => {
      const newZoom = Math.min(1, Math.max(0, pinchZoomBase.current + (e.scale - 1) * 0.5));
      setCameraZoom(newZoom);
      showZoomLevel();
    })
    .runOnJS(true);

  // Tap gesture for focus
  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      handleTapFocus(e.x, e.y);
    })
    .runOnJS(true);

  // Combine pinch and tap gestures
  const combinedGesture = Gesture.Race(pinchGesture, tapGesture);

  // Calculate zoom display value
  const getZoomDisplayValue = () => {
    // Map 0-1 range to approximate optical zoom values
    if (cameraZoom <= 0) return "1x";
    if (cameraZoom <= 0.11) return `${(1 + cameraZoom * 9).toFixed(1)}x`;
    if (cameraZoom <= 0.44) return `${(2 + (cameraZoom - 0.11) * 9).toFixed(1)}x`;
    return `${(5 + (cameraZoom - 0.44) * 9).toFixed(1)}x`;
  };

  return (
    <View style={styles.container}>
      <GestureDetector gesture={combinedGesture}>
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={cameraFacing}
            mode="picture"
            zoom={cameraZoom}
            flash={flashMode}
            enableTorch={cameraFacing === "back" && flashMode === "on"}
            active={isFocused}
            onCameraReady={() => setCameraReady(true)}
            onMountError={(e) => console.warn("Camera mount error:", e?.message)}
          />
        </View>
      </GestureDetector>
      {/* Overlay layer on top of camera */}
      <View style={[styles.overlayContainer, { pointerEvents: "box-none", paddingTop: insets.top }]}>
        {/* Active Project Header (top of camera) */}
        {selectedProject && (
          <Pressable onPress={changeProject} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, margin: 12, marginTop: 4, borderRadius: 0, gap: 8, backgroundColor: "rgba(0,0,0,0.5)", alignSelf: "flex-start", maxWidth: "58%", opacity: pressed ? 0.7 : 1 }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: selectedProject.color, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" }} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF" }}>{selectedProject.name}</Text>
            <MaterialIcons name="swap-horiz" size={14} color="rgba(255,255,255,0.7)" />
          </Pressable>
        )}
        {!selectedProject && (
          <Pressable onPress={changeProject} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, margin: 12, marginTop: 4, borderRadius: 0, gap: 6, backgroundColor: "rgba(255,152,0,0.8)", alignSelf: "flex-start", opacity: pressed ? 0.7 : 1 }]}>
            <MaterialIcons name="warning" size={14} color="#FFFFFF" />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#FFFFFF" }}>{t('kein_projekt')}</Text>
          </Pressable>
        )}

        {/* Camera controls - safe-area aware and never hidden behind the Dynamic Island */}
        <View style={{ position: "absolute", top: insets.top + 8, right: 16, width: 104, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            {/* Camera flip */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kamera wechseln"
              onPress={() => {
                setCameraFacing((previous) => {
                  const next = previous === "back" ? "front" : "back";
                  if (next === "front") setFlashMode("off");
                  return next;
                });
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              style={({ pressed }) => [{ backgroundColor: "rgba(0,0,0,0.62)", borderRadius: 0, padding: 10, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="flip-camera-ios" size={22} color="#FFFFFF" />
            </Pressable>
            {/* Grid toggle */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showGrid ? "Kameraraster ausschalten" : "Kameraraster einschalten"}
              onPress={() => {
                setShowGrid(previous => !previous);
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => [{ backgroundColor: "rgba(0,0,0,0.62)", borderRadius: 0, padding: 10, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="grid-on" size={22} color={showGrid ? "#FFD700" : "rgba(255,255,255,0.65)"} />
            </Pressable>
          </View>

          {/* Photo flash / continuous light. One tap from AUTO enables the torch. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={flashMode === "on" ? "Dauerlicht eingeschaltet" : flashMode === "auto" ? "Fotoblitz automatisch, Dauerlicht einschalten" : "Dauerlicht ausgeschaltet"}
            accessibilityHint="Wechselt zwischen Automatik, Dauerlicht und Aus"
            disabled={cameraFacing === "front"}
            onPress={() => {
              const modes: ("auto" | "on" | "off")[] = ["auto", "on", "off"];
              const index = modes.indexOf(flashMode);
              setFlashMode(modes[(index + 1) % modes.length]);
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={({ pressed }) => [{
              minHeight: 44,
              paddingHorizontal: 8,
              paddingVertical: 8,
              borderRadius: 0,
              borderWidth: 1,
              borderColor: flashMode === "on" ? "#FFD700" : "rgba(255,255,255,0.25)",
              backgroundColor: flashMode === "on" ? "rgba(255,215,0,0.24)" : "rgba(0,0,0,0.62)",
              opacity: cameraFacing === "front" ? 0.42 : pressed ? 0.7 : 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }]}
          >
            <MaterialIcons
              name={flashMode === "on" ? "flashlight-on" : flashMode === "auto" ? "flash-auto" : "flash-off"}
              size={20}
              color={flashMode === "off" || cameraFacing === "front" ? "rgba(255,255,255,0.65)" : "#FFD700"}
            />
            <Text style={{ color: flashMode === "on" ? "#FFD700" : "#FFFFFF", fontSize: 10, fontWeight: "800" }}>
              {cameraFacing === "front" ? "NICHT VERFÜGBAR" : flashMode === "on" ? "LICHT EIN" : flashMode === "auto" ? "AUTO" : "LICHT AUS"}
            </Text>
          </Pressable>

          {/* Photo timer */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={photoTimer > 0 ? `Fototimer ${photoTimer} Sekunden` : "Fototimer aus"}
            onPress={() => {
              const timers: (0 | 3 | 5 | 10)[] = [0, 3, 5, 10];
              const index = timers.indexOf(photoTimer);
              setPhotoTimer(timers[(index + 1) % timers.length]);
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={({ pressed }) => [{
              minHeight: 40,
              paddingHorizontal: 8,
              paddingVertical: 7,
              borderRadius: 0,
              backgroundColor: "rgba(0,0,0,0.62)",
              opacity: pressed ? 0.7 : 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }]}
          >
            <MaterialIcons name="timer" size={18} color={photoTimer > 0 ? "#FFD700" : "rgba(255,255,255,0.65)"} />
            <Text style={{ fontSize: 10, color: photoTimer > 0 ? "#FFD700" : "#FFFFFF", fontWeight: "800" }}>
              {photoTimer > 0 ? `${photoTimer} SEK.` : "TIMER AUS"}
            </Text>
          </Pressable>
        </View>

        {/* Zoom slider - always visible */}
        <View style={{ position: "absolute", right: 16, top: insets.top + 176, bottom: 200, justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 0, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", gap: 4 }}>
            <Pressable onPress={() => setCameraZoom(Math.min(1, cameraZoom + 0.05))} style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.5 : 1 }]}>
              <MaterialIcons name="add" size={18} color="#FFFFFF" />
            </Pressable>
            {[{ label: "5x", value: 0.44 }, { label: "2x", value: 0.11 }, { label: "1x", value: 0 }, { label: "0.5x", value: -0.05 }].map((preset) => (
              <Pressable
                key={preset.label}
                onPress={() => setCameraZoom(Math.max(0, preset.value))}
                style={({ pressed }) => [{
                  paddingHorizontal: 6, paddingVertical: 3, borderRadius: 0,
                  backgroundColor: Math.abs(cameraZoom - Math.max(0, preset.value)) < 0.02 ? "rgba(255,255,255,0.3)" : "transparent",
                  opacity: pressed ? 0.5 : 1,
                }]}
              >
                <Text style={{ fontSize: 11, color: "#FFFFFF", fontWeight: Math.abs(cameraZoom - Math.max(0, preset.value)) < 0.02 ? "800" : "500" }}>{preset.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setCameraZoom(Math.max(0, cameraZoom - 0.05))} style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.5 : 1 }]}>
              <MaterialIcons name="remove" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
        {/* Zoom level badge */}
        {showZoomBadge && (
          <View style={{ position: "absolute", top: "50%", alignSelf: "center", marginTop: -20, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 0 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>{getZoomDisplayValue()}</Text>
          </View>
        )}

        {/* Tap-to-focus indicator */}
        {focusPoint && (
          <Animated.View
            style={{
              position: "absolute",
              left: focusPoint.x - 30,
              top: focusPoint.y - 30,
              width: 60,
              height: 60,
              borderRadius: 0,
              borderWidth: 2,
              borderColor: "#FFD700",
              opacity: focusAnim,
              transform: [{ scale: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) }],
            }}
          />
        )}

        {/* Camera grid overlay */}
        {showGrid && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 }} pointerEvents="none">
            {/* Horizontal lines */}
            <View style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 0.5, backgroundColor: "rgba(255,255,255,0.4)" }} />
            <View style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 0.5, backgroundColor: "rgba(255,255,255,0.4)" }} />
            {/* Vertical lines */}
            <View style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 0.5, backgroundColor: "rgba(255,255,255,0.4)" }} />
            <View style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 0.5, backgroundColor: "rgba(255,255,255,0.4)" }} />
          </View>
        )}

        {/* Photo flash effect */}
        {photoFlash && <View style={styles.flashOverlay} />}

        {/* Timer countdown overlay */}
        {timerCountdown !== null && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)", zIndex: 100 }}>
            <View style={{ width: 100, height: 100, borderRadius: 0, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", borderWidth: 3, borderColor: "#FFD700" }}>
              <Text style={{ fontSize: 48, fontWeight: "800", color: "#FFD700" }}>{timerCountdown}</Text>
            </View>
          </View>
        )}

        {/* Timer overlay */}
        {isRecording && (
          <View style={styles.timerContainer}>
            <View style={styles.timerBadge}>
              <View style={styles.recordDot} />
              <Text style={styles.timerText}>
                {formatDuration(recordingDuration)}
              </Text>
            </View>
            {/* Progress bar */}
            <View style={{ width: 100, height: 2, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 1, marginTop: 4, overflow: "hidden" }}>
              <View style={{ height: "100%", backgroundColor: isPaused ? "#F59E0B" : "#FF3B30", borderRadius: 1, width: `${Math.min(100, (recordingDuration / 3600) * 100)}%` }} />
            </View>
            {/* Photo counter */}
            {capturedPhotos.length > 0 && (
              <View style={styles.photoCountBadge}>
                <MaterialIcons name="photo-camera" size={14} color="#FFFFFF" />
                <Text style={styles.photoCountText}>{capturedPhotos.length}</Text>
              </View>
            )}
            {/* Voice note button for last photo */}
            {capturedPhotos.length > 0 && isRecording && (
              <View style={{ marginLeft: 6 }}>
                <Pressable
                  onPress={() => {
                    if (voiceNoteRecording) {
                      stopVoiceNote();
                    } else {
                      startVoiceNote(capturedPhotos.length - 1);
                    }
                  }}
                  style={({ pressed }) => [styles.photoCountBadge, {
                    backgroundColor: voiceNoteRecording ? "rgba(244,67,54,0.8)" : "rgba(76,175,80,0.8)",
                    opacity: pressed ? 0.7 : 1,
                    minWidth: voiceNoteRecording ? 80 : undefined,
                  }]}
                >
                  <MaterialIcons name={voiceNoteRecording ? "stop" : "mic"} size={14} color="#FFFFFF" />
                  <Text style={styles.photoCountText}>
                    {voiceNoteRecording ? `${30 - voiceNoteElapsed}s` : t('notiz')}
                  </Text>
                </Pressable>
                {/* Countdown progress bar */}
                {voiceNoteRecording && (
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", marginTop: 3, overflow: "hidden" }}>
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: "#F44336", width: `${(voiceNoteElapsed / 30) * 100}%` }} />
                  </View>
                )}
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

        {/* Template selector modal */}
        <Modal visible={showTemplateSelector && !isRecording} animationType="slide" transparent>
          <View style={styles.templateModalOverlay}>
            <Pressable style={styles.templateModalDismiss} onPress={() => { setShowTemplateSelector(false); setTemplateSearch(""); }} />
            <View style={[styles.templateModalContent, { backgroundColor: colors.background }]}>
              <View style={styles.templateSheetHeader}>
                <Text style={[styles.templateSheetTitle, { color: colors.foreground }]}>
                  Vorlage wählen
                </Text>
                <Pressable onPress={() => { setShowTemplateSelector(false); setTemplateSearch(""); }}>
                  <MaterialIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>
              {/* Search field */}
              <View style={[styles.templateSearchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="search" size={20} color={colors.muted} />
                <TextInput
                  style={[styles.templateSearchInput, { color: colors.foreground }]}
                  placeholder={t('vorlage_suchen')}
                  placeholderTextColor={colors.muted}
                  value={templateSearch}
                  onChangeText={setTemplateSearch}
                  autoCapitalize="none"
                  returnKeyType="done"
                />
                {templateSearch.length > 0 && (
                  <Pressable onPress={() => setTemplateSearch("")}>
                    <MaterialIcons name="close" size={18} color={colors.muted} />
                  </Pressable>
                )}
              </View>
              {/* Categorized list */}
              <ScrollView style={styles.templateList} showsVerticalScrollIndicator={false}>
                {groupedTemplates.map((group) => (
                  <View key={group.id} style={{ marginBottom: 8 }}>
                    <Pressable
                      onPress={() => toggleCategory(group.id)}
                      style={({ pressed }) => [styles.templateCategoryHeader, { opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name={group.icon as any} size={18} color={colors.muted} />
                      <Text style={[styles.templateCategoryTitle, { color: colors.muted }]}>{group.name}</Text>
                      <MaterialIcons
                        name={expandedCategories.includes(group.id) ? "expand-less" : "expand-more"}
                        size={20}
                        color={colors.muted}
                      />
                    </Pressable>
                    {expandedCategories.includes(group.id) && group.templates.map((template) => (
                      <Pressable
                        key={template.id}
                        onPress={() => selectTemplate(template)}
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
                  </View>
                ))}
                {/* Create custom template button */}
                <Pressable
                  onPress={() => { setShowTemplateSelector(false); setShowCreateTemplate(true); }}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16, marginTop: 8, borderRadius: 0, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary }}>{t('eigene_vorlage_erstellen')}</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>

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
            {/* Photo button - same height as STOPP and KAPITEL */}
            {isRecording ? (
              <Pressable
                onPress={takePhotoWithTimer}
                style={({ pressed }) => [
                  styles.actionButtonLarge,
                  { backgroundColor: "#2196F3", transform: [{ scale: pressed ? 0.9 : 1 }] },
                ]}
              >
                <MaterialIcons name="photo-camera" size={32} color="#FFFFFF" />
                <Text style={styles.actionButtonLabel}>{t('foto')}</Text>
                {capturedPhotos.length > 0 && (
                  <View style={styles.photoBadge}>
                    <Text style={styles.photoBadgeText}>{capturedPhotos.length}</Text>
                  </View>
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={pickFromGallery}
                style={({ pressed }) => [
                  styles.actionButtonLarge,
                  { backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", transform: [{ scale: pressed ? 0.9 : 1 }] },
                ]}
              >
                <MaterialIcons name="photo-library" size={32} color="#FFFFFF" />
                <Text style={styles.actionButtonLabel}>{t('galerie')}</Text>
                {capturedPhotos.length > 0 && (
                  <View style={styles.photoBadge}>
                    <Text style={styles.photoBadgeText}>{capturedPhotos.length}</Text>
                  </View>
                )}
              </Pressable>
            )}

            {/* Record / Stop button - smaller, with label */}
            <View style={{ alignItems: "center" }}>
              <Pressable
                onPress={isRecording ? stopRecording : startRecording}
                style={({ pressed }) => [
                  styles.recordButtonSmall,
                  {
                    borderColor: isRecording ? "#F44336" : "#FFFFFF",
                    transform: [{ scale: pressed ? 0.93 : 1 }],
                  },
                ]}
              >
                <View
                  style={[
                    isRecording ? styles.stopIcon : styles.recordIconSmall,
                    { backgroundColor: isRecording ? "#F44336" : colors.primary },
                  ]}
                />
              </Pressable>
              <Text style={styles.recordButtonLabel}>{isRecording ? t('stopp') : t('start')}</Text>
            </View>

            {/* Marker button - larger, orange color */}
            {isRecording ? (
              <Pressable
                onPress={startChapterMarker}
                style={({ pressed }) => [
                  styles.actionButtonLarge,
                  { backgroundColor: "#FF9800", transform: [{ scale: pressed ? 0.9 : 1 }] },
                ]}
              >
                <MaterialIcons name="bookmark-add" size={32} color="#FFFFFF" />
                <Text style={styles.actionButtonLabel}>{t('kapitel')}</Text>
                {markers.length > 0 && (
                  <View style={[styles.photoBadge, { backgroundColor: "#E53935" }]}>
                    <Text style={styles.photoBadgeText}>{markers.length}</Text>
                  </View>
                )}
              </Pressable>
            ) : (
              <View style={styles.actionButtonPlaceholder} />
            )}
          </View>

          {/* Gallery button below controls row */}
          {isRecording && (
            <View style={{ alignItems: "center", marginTop: 12 }}>
              <Pressable
                onPress={pickFromGallery}
                style={({ pressed }) => [{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 0,
                  backgroundColor: "rgba(255,255,255,0.1)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.3)",
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MaterialIcons name="photo-library" size={18} color="#FFFFFF" />
                <Text style={{ fontSize: 12, color: "#FFFFFF", fontWeight: "600" }}>{t('galerie')}</Text>
                {capturedPhotos.length > 0 && (
                  <View style={{ backgroundColor: "#2196F3", borderRadius: 0, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#FFFFFF" }}>{capturedPhotos.length}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          )}

          {/* Photo gallery thumbnail */}
          {capturedPhotos.length > 0 && !isRecording && (
            <Pressable
              onPress={() => setShowPhotoGallery(true)}
              style={({ pressed }) => [{ position: "absolute", left: 16, bottom: 16, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={{ width: 48, height: 48, borderRadius: 0, borderWidth: 2, borderColor: "#FFFFFF", overflow: "hidden" }}>
                <Image source={{ uri: capturedPhotos[capturedPhotos.length - 1] }} style={{ width: 48, height: 48 }} contentFit="cover" />
              </View>
              <View style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#2196F3", borderRadius: 0, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFFFFF" }}>{capturedPhotos.length}</Text>
              </View>
            </Pressable>
          )}

          <Text style={styles.hintText}>
            {isRecording
              ? ""
              : "Tippe zum Aufnehmen"}
          </Text>
        </View>
      </View>

      {/* Photo Gallery Modal */}
      <Modal visible={showPhotoGallery} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#FFFFFF" }}>{capturedPhotos.length} Foto{capturedPhotos.length !== 1 ? "s" : ""}</Text>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{t('lang_druecken_zum_loeschen')}</Text>
            </View>
            <Pressable onPress={() => setShowPhotoGallery(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.7 : 1 }]}>
              <MaterialIcons name="close" size={28} color="#FFFFFF" />
            </Pressable>
          </View>
          <FlatList
            data={capturedPhotos}
            keyExtractor={(_, i) => i.toString()}
            numColumns={2}
            contentContainerStyle={{ padding: 8 }}
            renderItem={({ item, index }) => (
              <Pressable
                onLongPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  Alert.alert(
                    t('alert_foto_loeschen'),
                    t('msg_foto_wirklich_loeschen_nr').replace('{nr}', String(index + 1)),
                    [
                      { text: t('btn_abbrechen'), style: "cancel" },
                      {
                        text: t('btn_loeschen'),
                        style: "destructive",
                        onPress: () => {
                          setCapturedPhotos(prev => prev.filter((_, i) => i !== index));
                          setPhotoTimestamps(prev => prev.filter((_, i) => i !== index));
                          setPhotoVoiceNotes(prev => prev.filter((_, i) => i !== index));
                          // Rebuild annotations with shifted indices
                          setPhotoAnnotations(prev => {
                            const newAnnotations: Record<number, string> = {};
                            Object.entries(prev).forEach(([k, v]) => {
                              const key = parseInt(k);
                              if (key < index) newAnnotations[key] = v;
                              else if (key > index) newAnnotations[key - 1] = v;
                            });
                            return newAnnotations;
                          });
                          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        },
                      },
                    ]
                  );
                }}
                style={({ pressed }) => [{ flex: 1, margin: 4, borderRadius: 0, overflow: "hidden", opacity: pressed ? 0.8 : 1 }]}
              >
                <Image source={{ uri: item }} style={{ width: "100%", aspectRatio: 1 }} contentFit="cover" />
                <View style={{ position: "absolute", bottom: 6, left: 6, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 0, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: "#FFFFFF", fontWeight: "600" }}>#{index + 1}</Text>
                </View>
                {/* Move/reorder buttons */}
                <View style={{ position: "absolute", bottom: 6, right: 6, flexDirection: "row", gap: 4 }}>
                  {index > 0 && (
                    <Pressable
                      onPress={() => {
                        const newPhotos = [...capturedPhotos];
                        [newPhotos[index - 1], newPhotos[index]] = [newPhotos[index], newPhotos[index - 1]];
                        setCapturedPhotos(newPhotos);
                        const newTimestamps = [...photoTimestamps];
                        [newTimestamps[index - 1], newTimestamps[index]] = [newTimestamps[index], newTimestamps[index - 1]];
                        setPhotoTimestamps(newTimestamps);
                        const newNotes = [...photoVoiceNotes];
                        [newNotes[index - 1], newNotes[index]] = [newNotes[index], newNotes[index - 1]];
                        setPhotoVoiceNotes(newNotes);
                        // Swap annotations
                        setPhotoAnnotations(prev => {
                          const updated = { ...prev };
                          const a = updated[index - 1];
                          const b = updated[index];
                          if (b) updated[index - 1] = b; else delete updated[index - 1];
                          if (a) updated[index] = a; else delete updated[index];
                          return updated;
                        });
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={({ pressed }) => [{ backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 0, padding: 4, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <MaterialIcons name="arrow-back" size={14} color="#FFFFFF" />
                    </Pressable>
                  )}
                  {index < capturedPhotos.length - 1 && (
                    <Pressable
                      onPress={() => {
                        const newPhotos = [...capturedPhotos];
                        [newPhotos[index], newPhotos[index + 1]] = [newPhotos[index + 1], newPhotos[index]];
                        setCapturedPhotos(newPhotos);
                        const newTimestamps = [...photoTimestamps];
                        [newTimestamps[index], newTimestamps[index + 1]] = [newTimestamps[index + 1], newTimestamps[index]];
                        setPhotoTimestamps(newTimestamps);
                        const newNotes = [...photoVoiceNotes];
                        [newNotes[index], newNotes[index + 1]] = [newNotes[index + 1], newNotes[index]];
                        setPhotoVoiceNotes(newNotes);
                        setPhotoAnnotations(prev => {
                          const updated = { ...prev };
                          const a = updated[index];
                          const b = updated[index + 1];
                          if (b) updated[index] = b; else delete updated[index];
                          if (a) updated[index + 1] = a; else delete updated[index + 1];
                          return updated;
                        });
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={({ pressed }) => [{ backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 0, padding: 4, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <MaterialIcons name="arrow-forward" size={14} color="#FFFFFF" />
                    </Pressable>
                  )}
                </View>
                {/* Annotation button */}
                <Pressable
                  onPress={() => {
                    setAnnotatingPhotoIndex(index);
                    setAnnotationText(photoAnnotations[index] || "");
                    setShowAnnotation(true);
                  }}
                  style={({ pressed }) => [{ position: "absolute", top: 6, right: 6, backgroundColor: photoAnnotations[index] ? "#4CAF50" : "rgba(0,0,0,0.6)", borderRadius: 0, padding: 6, opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name={photoAnnotations[index] ? "edit-note" : "add-comment"} size={16} color="#FFFFFF" />
                </Pressable>
                {/* Show annotation preview */}
                {photoAnnotations[index] && (
                  <View style={{ position: "absolute", top: 6, left: 6, right: 34, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 0, paddingHorizontal: 6, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, color: "#FFFFFF" }} numberOfLines={1}>{photoAnnotations[index]}</Text>
                  </View>
                )}
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* Photo Annotation Modal */}
      <Modal visible={showAnnotation} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 0, padding: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>{t('fotonotiz')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>Beschreibung oder Anmerkung zu Foto #{annotatingPhotoIndex !== null ? annotatingPhotoIndex + 1 : ""}</Text>
            <TextInput
              value={annotationText}
              onChangeText={setAnnotationText}
              placeholder="z.B. Riss an der Decke, ca. 30cm"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: 12, fontSize: 15, color: colors.foreground, backgroundColor: colors.surface, minHeight: 80, textAlignVertical: "top", marginBottom: 16 }}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  setShowAnnotation(false);
                  setAnnotationText("");
                  setAnnotatingPhotoIndex(null);
                }}
                style={({ pressed }) => [{ flex: 1, paddingVertical: 12, borderRadius: 0, backgroundColor: colors.surface, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (annotatingPhotoIndex !== null) {
                    setPhotoAnnotations(prev => ({ ...prev, [annotatingPhotoIndex]: annotationText.trim() }));
                  }
                  setShowAnnotation(false);
                  setAnnotationText("");
                  setAnnotatingPhotoIndex(null);
                  if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
                style={({ pressed }) => [{ flex: 1, paddingVertical: 12, borderRadius: 0, backgroundColor: colors.primary, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFFFFF" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Custom Template Modal */}
      <Modal visible={showCreateTemplate} animationType="slide" transparent>
        <View style={styles.templateModalOverlay}>
          <Pressable style={styles.templateModalDismiss} onPress={() => setShowCreateTemplate(false)} />
          <View style={[styles.templateModalContent, { backgroundColor: colors.background }]}>
            <View style={styles.templateSheetHeader}>
              <Text style={[styles.templateSheetTitle, { color: colors.foreground }]}>{t('eigene_vorlage')}</Text>
              <Pressable onPress={() => setShowCreateTemplate(false)}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6, marginTop: 8 }}>{t('name')}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: 12, fontSize: 15, color: colors.foreground, backgroundColor: colors.surface, marginBottom: 12 }}
                placeholder="z.B. Abnahmeprotokoll"
                placeholderTextColor={colors.muted}
                value={newTemplateName}
                onChangeText={setNewTemplateName}
                returnKeyType="next"
              />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>{t('project_description')}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: 12, fontSize: 15, color: colors.foreground, backgroundColor: colors.surface, marginBottom: 12 }}
                placeholder={t('kurze_beschreibung_der_vorlage')}
                placeholderTextColor={colors.muted}
                value={newTemplateDesc}
                onChangeText={setNewTemplateDesc}
                returnKeyType="next"
              />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>{t('kategorie')}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => setNewTemplateCategory(cat.id)}
                    style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 0, borderWidth: 1, borderColor: newTemplateCategory === cat.id ? colors.primary : colors.border, backgroundColor: newTemplateCategory === cat.id ? colors.primary + "15" : "transparent", opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={{ fontSize: 13, color: newTemplateCategory === cat.id ? colors.primary : colors.foreground }}>{cat.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>{t('kianweisung_prompt')}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: 12, fontSize: 14, color: colors.foreground, backgroundColor: colors.surface, marginBottom: 16, minHeight: 120, textAlignVertical: "top" }}
                placeholder={t('beschreibe_wie_die_ki')}
                placeholderTextColor={colors.muted}
                value={newTemplatePrompt}
                onChangeText={setNewTemplatePrompt}
                multiline
                numberOfLines={6}
              />
              {/* Preview button */}
              <Pressable
                onPress={async () => {
                  if (!newTemplatePrompt.trim()) {
                    Alert.alert(t('alert_fehler'), t('msg_bitte_zuerst_einen_prompt_eingeben'));
                    return;
                  }
                  setIsGeneratingPreview(true);
                  setTemplatePreview(null);
                  try {
                    // Generate a sample output using the prompt with example text
                    const sampleTranscript = t('beispiel_transkript');
                    const previewText = `${t('vorschau_beispiel_output')}\n\n${t('prompt_vorschau').replace('{prompt}', newTemplatePrompt.trim().substring(0, 100))}\n\n${t('beispiel_transkript_label')}\n\"${sampleTranscript}\"\n\n${t('erwartetes_ergebnis')}\n${t('ki_verarbeitung_hinweis')}\n\n${t('tipp_vorlage_testen')}`;
                    setTemplatePreview(previewText);
                  } catch  {
                    Alert.alert(t('alert_fehler'), t('msg_vorschau_konnte_nicht_generiert_werden'));
                  } finally {
                    setIsGeneratingPreview(false);
                  }
                }}
                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, borderRadius: 0, opacity: pressed ? 0.7 : 1, marginBottom: 10, backgroundColor: colors.surface }]}
              >
                {isGeneratingPreview ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons name="visibility" size={18} color={colors.primary} />
                )}
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>{t('vorschau_testen')}</Text>
              </Pressable>

              {/* Preview result */}
              {templatePreview && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>{t('vorschau')}</Text>
                    <Pressable onPress={() => setTemplatePreview(null)}>
                      <MaterialIcons name="close" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 18 }}>{templatePreview}</Text>
                </View>
              )}

              <Pressable
                onPress={saveCustomTemplate}
                style={({ pressed }) => [{ backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 0, alignItems: "center", opacity: pressed ? 0.8 : 1, marginBottom: 20 }]}
              >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{t('vorlage_speichern')}</Text>
              </Pressable>

              {/* List existing custom templates with delete */}
              {customTemplates.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>{t('meine_vorlagen')}</Text>
                  {customTemplates.map((ct) => (
                    <View key={ct.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
                      <Text style={{ flex: 1, marginLeft: 10, fontSize: 14, color: colors.foreground }}>{ct.name}</Text>
                      <Pressable onPress={() => { Alert.alert(t('alert_loeschen_frage'), t('vorlage_loeschen_frage').replace('{name}', ct.name), [{ text: t('btn_abbrechen') }, { text: t('btn_loeschen'), style: "destructive", onPress: () => deleteCustomTemplate(ct.id) }]); }}>
                        <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* Import/Export buttons */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 20 }}>
                <Pressable
                  onPress={importCustomTemplates}
                  style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name="file-download" size={18} color={colors.foreground} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{t('importieren')}</Text>
                </Pressable>
                {customTemplates.length > 0 && (
                  <Pressable
                    onPress={exportCustomTemplates}
                    style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="file-upload" size={18} color={colors.foreground} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{t('export_title')}</Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Template Library Modal */}
      <Modal visible={showTemplateLibrary} animationType="slide" transparent>
        <View style={styles.templateModalOverlay}>
          <Pressable style={styles.templateModalDismiss} onPress={() => setShowTemplateLibrary(false)} />
          <View style={[styles.templateModalContent, { backgroundColor: colors.background }]}>
            <View style={styles.templateSheetHeader}>
              <Text style={[styles.templateSheetTitle, { color: colors.foreground }]}>
                Vorlagen-Bibliothek
              </Text>
              <Pressable onPress={() => setShowTemplateLibrary(false)}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 13, color: colors.muted, paddingHorizontal: 20, marginBottom: 12 }}>
              Community-Vorlagen herunterladen und als eigene Vorlage speichern.
            </Text>
            <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              {[
                { name: t('tpl_abnahmeprotokoll'), desc: t('tpl_abnahmeprotokoll_desc'), category: "bau" as TemplateCategory, icon: "assignment-turned-in", prompt: t('prompt_abnahmeprotokoll') },
                { name: t('tpl_wartungsprotokoll'), desc: t('tpl_wartungsprotokoll_desc'), category: "bau" as TemplateCategory, icon: "build", prompt: t('prompt_wartungsprotokoll') },
                { name: t('tpl_brandschutzbegehung'), desc: t('tpl_brandschutzbegehung_desc'), category: "bau" as TemplateCategory, icon: "local-fire-department", prompt: t('prompt_brandschutzbegehung') },
                { name: t('tpl_projektstatusbericht'), desc: t('tpl_projektstatusbericht_desc'), category: "meeting" as TemplateCategory, icon: "trending-up", prompt: t('prompt_projektstatusbericht') },
                { name: t('tpl_kundengespraech'), desc: t('tpl_kundengespraech_desc'), category: "meeting" as TemplateCategory, icon: "people", prompt: t('prompt_kundengespraech') },
                { name: t('tpl_schulungsprotokoll'), desc: t('tpl_schulungsprotokoll_desc'), category: "meeting" as TemplateCategory, icon: "school", prompt: t('prompt_schulungsprotokoll') },
                { name: t('tpl_schadensgutachten'), desc: t('tpl_schadensgutachten_desc'), category: "gutachten" as TemplateCategory, icon: "report-problem", prompt: t('prompt_schadensgutachten') },
                { name: t('tpl_energieausweis'), desc: t('tpl_energieausweis_desc'), category: "gutachten" as TemplateCategory, icon: "bolt", prompt: t('prompt_energieausweis') },
                { name: t('tpl_telefonnotiz'), desc: t('tpl_telefonnotiz_desc'), category: "allgemein" as TemplateCategory, icon: "phone", prompt: t('prompt_telefonnotiz') },
                { name: t('tpl_tagesrapport'), desc: t('tpl_tagesrapport_desc'), category: "bau" as TemplateCategory, icon: "schedule", prompt: t('prompt_tagesrapport') },
              ].map((libTemplate, idx) => (
                <Pressable
                  key={idx}
                  onPress={async () => {
                    const newTemplate: ProtocolTemplate = {
                      id: `community-${Date.now()}-${idx}`,
                      name: libTemplate.name,
                      icon: libTemplate.icon,
                      description: libTemplate.desc,
                      category: libTemplate.category,
                      systemPrompt: libTemplate.prompt,
                    };
                    const updated = [...customTemplates, newTemplate];
                    setCustomTemplates(updated);
                    await AsyncStorage.setItem("custom-templates", JSON.stringify(updated));
                    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert(t('hinzugefuegt'), t('msg_template_zu_vorlagen_hinzugefuegt').replace('{name}', libTemplate.name));
                  }}
                  style={({ pressed }) => [{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 0, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                    <MaterialIcons name={libTemplate.icon as any} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{libTemplate.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={2}>{libTemplate.desc}</Text>
                  </View>
                  <MaterialIcons name="add-circle" size={22} color={colors.primary} />
                </Pressable>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Stop Confirmation Modal */}
      <Modal visible={showStopConfirm} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 24, alignItems: "center" }}>
            <View style={{ width: 56, height: 56, borderRadius: 0, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <MaterialIcons name="stop-circle" size={32} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: "center" }}>{t('aufnahme_beenden')}</Text>
            <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 20, lineHeight: 20 }}>
              Möchtest du die Aufnahme abschließen und das Protokoll erstellen, oder möchtest du weiter aufnehmen?
            </Text>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <Pressable
                onPress={cancelStopRecording}
                style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 0, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="play-arrow" size={20} color={colors.foreground} style={{ marginBottom: 4 }} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t('record_resume')}</Text>
              </Pressable>
              <Pressable
                onPress={confirmStopRecording}
                style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 0, backgroundColor: colors.primary, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="check-circle" size={20} color="#FFF" style={{ marginBottom: 4 }} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>{t('abschliessen')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Chapter Name Input Modal */}
      <Modal visible={chapterPromptVisible} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>{t('neues_kapitel')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
              {chapterListening ? t('hoere_zu_kapitelname') : t('sprich_kapitelname')}
            </Text>

            {/* Speech indicator */}
            {chapterListening && (
              <View style={{ alignItems: "center", paddingVertical: 16 }}>
                <View style={{ width: 64, height: 64, borderRadius: 0, backgroundColor: "#FF9800" + "20", alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="mic" size={32} color="#FF9800" />
                </View>
                <Text style={{ fontSize: 12, color: "#FF9800", marginTop: 8, fontWeight: "600" }}>{t('aufnahme_laeuft')}</Text>
              </View>
            )}

            {/* Manual text input (always available as fallback) */}
            {!chapterListening && (
              <TextInput
                value={chapterInput}
                onChangeText={setChapterInput}
                placeholder={t('kapitelname')}
                placeholderTextColor={colors.muted}
                autoFocus={false}
                returnKeyType="done"
                onSubmitEditing={() => confirmChapter(chapterInput)}
                style={{ fontSize: 16, padding: 12, borderRadius: 0, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, color: colors.foreground, marginBottom: 12 }}
              />
            )}

            {/* Mic button to restart speech */}
            {!chapterListening && (
              <Pressable
                onPress={startChapterSpeech}
                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 0, backgroundColor: "#FF9800" + "15", borderWidth: 1, borderColor: "#FF9800" + "40", marginBottom: 12, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="mic" size={20} color="#FF9800" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#FF9800" }}>{t('erneut_einsprechen')}</Text>
              </Pressable>
            )}

            {/* Stop speech button */}
            {chapterListening && (
              <Pressable
                onPress={stopChapterSpeech}
                style={({ pressed }) => [{ alignItems: "center", paddingVertical: 12, borderRadius: 0, backgroundColor: "#FF9800", marginBottom: 12, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>{t('fertig_kapitel_setzen')}</Text>
              </Pressable>
            )}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={async () => { setChapterPromptVisible(false); setChapterListening(false); setChapterRecording(false); if (chapterRecorderActiveRef.current) { try { await chapterAudioRecorder.stop(); } catch {} chapterRecorderActiveRef.current = false; } if (isRecording) { try { audioRecorder.record(); resumeTimer(); setIsPaused(false); } catch {} } }}
                style={({ pressed }) => [{ flex: 1, paddingVertical: 12, borderRadius: 0, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted }}>{t('cancel')}</Text>
              </Pressable>
              {!chapterListening && (
                <Pressable
                  onPress={() => confirmChapter(chapterInput || `Kapitel ${markers.filter(m => m.label.startsWith("KAPITEL:")).length + 1}`)}
                  style={({ pressed }) => [{ flex: 1, paddingVertical: 12, borderRadius: 0, backgroundColor: chapterInput.trim() ? "#FF9800" : "#FF980080", alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>{t('kapitel_setzen')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
      {/* Construction Brain FAB */}
      {!isRecording && !isProcessing && (
        <Pressable
          onPress={() => router.push("/ai-assistant")}
          style={({ pressed }) => [{
            position: "absolute",
            bottom: 100,
            right: 16,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#E040FB",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
            opacity: pressed ? 0.8 : 1,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          }]}
        >
          <MaterialIcons name="psychology" size={28} color="#FFFFFF" />
        </Pressable>
      )}
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    top: 80,
    right: 12,
    flexDirection: "column",
    gap: 6,
  },
  modeToggleTop: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingTop: 16,
    paddingBottom: 12,
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
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
  // Template overlay
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
    borderRadius: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderWidth: 1,
    maxHeight: 350,
  },
  templateModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  templateModalDismiss: {
    flex: 1,
  },
  templateModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 40,
    maxHeight: "75%",
  },
  templateSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  templateSearchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  templateCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 8,
  },
  templateCategoryTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    borderRadius: 0,
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
    bottom: 30,
    width: "100%",
    alignItems: "center",
    paddingBottom: 10,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 24,
    gap: 20,
  },
  templateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
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
    borderRadius: 0,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  actionButtonLarge: {
    width: 72,
    height: 72,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  actionButtonLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionButtonPlaceholder: {
    width: 72,
    height: 72,
  },
  photoBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#E53935",
    width: 20,
    height: 20,
    borderRadius: 0,
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
  recordButtonSmall: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  recordButtonLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  recordIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  recordIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 0,
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
    borderRadius: 0,
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
    gap: 12,
  },
  audioCircle: {
    width: 140,
    height: 140,
    borderRadius: 0,
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
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: 60,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
    minHeight: 8,
  },
  audioLevelContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
  },
  audioLevelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  audioLevelText: {
    fontSize: 13,
    fontWeight: "600",
  },
  pausedBadge: {
    fontSize: 11,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  audioControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  pauseButton: {
    width: 48,
    height: 48,
    borderRadius: 0,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  audioControls: {
    alignItems: "center",
    paddingBottom: 32,
    paddingTop: 8,
    gap: 12,
  },
  templateBadgeAudio: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
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
    borderRadius: 0,
    borderWidth: 1,
  },
  sourceBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
