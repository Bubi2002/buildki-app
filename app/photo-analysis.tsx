/**
 * protoKI – KI-Bildanalyse Screen
 * 
 * Ermöglicht dem Bauleiter:
 * 1. Fotos aus der Galerie oder Kamera auszuwählen
 * 2. KI-Analyse zu starten (Baufortschritt, Mängel, Aufgaben)
 * 3. Ergebnisse als wiederverwendbare Karten anzuzeigen
 * 4. Mängel/Aufgaben per Tap in die Mängelliste/Aufgabenliste übernehmen
 */

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

// Reusable analysis components
import { ProgressCard, type ProgressData } from "@/components/analysis/ProgressCard";
import { DefectCard, type DefectData } from "@/components/analysis/DefectCard";
import { TaskCard, type TaskData } from "@/components/analysis/TaskCard";
import { ReviewCard } from "@/components/analysis/ReviewCard";
import { AnalysisCard } from "@/components/analysis/AnalysisCard";

// Defect store for adoption
import { saveDefect, deleteDefect, type Defect, type DefectPriority } from "@/lib/defect-store";

// PDF export
import { generateAndSharePdf, type ProfessionalPdfOptions, type PdfSection, getCompanyInfo } from "@/lib/pdf-professional";

// Undo toast component
import { UndoToast } from "@/components/UndoToast";
import { createLocalId } from "@/lib/id";

// Central AI Service
import { aiService, type AIServiceMutations } from "@/lib/ai-service";

// Timeline
import { timelineEngine } from "@/lib/timeline-engine";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SelectedPhoto {
  uri: string;
  base64?: string;
  mimeType: string;
  filename: string;
}

interface AnalysisResult {
  id: string;
  source: string;
  timestamp: string;
  projectId: string;
  summary: string;
  progress: {
    overallPercent: number;
    phase: string;
    completedTrades: string[];
    activeTrades: string[];
    pendingTrades: string[];
  };
  defects: {
    id: string;
    title: string;
    description: string;
    severity: string;
    trade: string;
    location: string;
    suggestedAction: string;
    confidence: number;
  }[];
  tasks: {
    id: string;
    title: string;
    description: string;
    priority: string;
    trade: string;
    estimatedDuration: string;
    deadline: string | null;
  }[];
  observations: string[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PhotoAnalysisScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ autoPhotos?: string; projectId?: string; roomName?: string }>();

  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [roomName, setRoomName] = useState(params.roomName || "");
  const [additionalContext, setAdditionalContext] = useState("");

  // Track adopted/dismissed defects and tasks
  const [adoptedDefects, setAdoptedDefects] = useState<Set<string>>(new Set());
  const [dismissedDefects, setDismissedDefects] = useState<Set<string>>(new Set());
  const [adoptedTasks, setAdoptedTasks] = useState<Set<string>>(new Set());
  const [dismissedTasks, setDismissedTasks] = useState<Set<string>>(new Set());

  // Manual defect entry
  const [manualDefects, setManualDefects] = useState<{ id: string; title: string; description: string; severity: string }[]>([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualSeverity, setManualSeverity] = useState<"critical" | "major" | "minor" | "cosmetic">("major");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Undo toast state
  const [undoToast, setUndoToast] = useState<{ visible: boolean; message: string; itemId: string; itemType: "defect" | "task" }>({
    visible: false, message: "", itemId: "", itemType: "defect",
  });

  const showUndoToast = (savedId: string, type: "defect" | "task", title: string) => {
    const label = type === "defect" ? "Mangel" : "Aufgabe";
    setUndoToast({ visible: true, message: `${label} \u00fcbernommen`, itemId: savedId, itemType: type });
  };

  const handleUndo = async () => {
    try {
      if (undoToast.itemType === "defect") {
        await deleteDefect(undoToast.itemId);
      } else {
        const tasksJson = await AsyncStorage.getItem("project-tasks") || "[]";
        const tasks = JSON.parse(tasksJson);
        const filtered = tasks.filter((t: any) => t.id !== undoToast.itemId);
        await AsyncStorage.setItem("project-tasks", JSON.stringify(filtered));
      }
      if (Platform.OS !== "web") {
        const Haptics = require("expo-haptics");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (err) {
      console.warn("[Undo] Failed:", err);
    }
  };

  const uploadPhotoMutation = trpc.analysis.uploadPhoto.useMutation();
  const analyzePhotoMutation = trpc.analysis.analyzePhoto.useMutation();

  // AI Service mutations bridge (DI from React hooks)
  const mutations: AIServiceMutations = {
    uploadPhoto: (input) => uploadPhotoMutation.mutateAsync(input),
    analyzePhoto: (input) => analyzePhotoMutation.mutateAsync(input),
  };

  // Load active project
  const loadActiveProject = useCallback(async () => {
    try {
      const projectsJson = await AsyncStorage.getItem("projects");
      const lastId = await AsyncStorage.getItem("last-selected-project-id");
      if (projectsJson && lastId) {
        const projects = JSON.parse(projectsJson);
        const project = projects.find((p: any) => p.id === lastId);
        if (project) {
          setActiveProject({ id: project.id, name: project.name });
        }
      }
    } catch {}
  }, []);

  // Load on mount
  useState(() => { loadActiveProject(); });

  // Pick photos from gallery
  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Berechtigung erforderlich", "Bitte erlaube den Zugriff auf die Fotobibliothek.");
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
      base64: true,
    });

    if (!pickerResult.canceled && pickerResult.assets) {
      const newPhotos: SelectedPhoto[] = pickerResult.assets.map((asset) => ({
        uri: asset.uri,
        base64: asset.base64 || undefined,
        mimeType: asset.mimeType || "image/jpeg",
        filename: asset.fileName || `${createLocalId("photo")}.jpg`,
      }));
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, 5));
      setResult(null);
      resetAdoptionState();
    }
  };

  // Take photo with camera
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Berechtigung erforderlich", "Bitte erlaube den Zugriff auf die Kamera.");
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });

    if (!cameraResult.canceled && cameraResult.assets[0]) {
      const asset = cameraResult.assets[0];
      const newPhoto: SelectedPhoto = {
        uri: asset.uri,
        base64: asset.base64 || undefined,
        mimeType: asset.mimeType || "image/jpeg",
        filename: asset.fileName || `${createLocalId("photo")}.jpg`,
      };
      setPhotos((prev) => [...prev, newPhoto].slice(0, 5));
      setResult(null);
      resetAdoptionState();
    }
  };

  // Remove photo
  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
    resetAdoptionState();
  };

  // Reset adoption state
  const resetAdoptionState = () => {
    setAdoptedDefects(new Set());
    setDismissedDefects(new Set());
    setAdoptedTasks(new Set());
    setDismissedTasks(new Set());
  };

  // ─── Adoption Logic ─────────────────────────────────────────────────────────

  const mapSeverityToPriority = (severity: string): DefectPriority => {
    switch (severity) {
      case "critical": return "hoch";
      case "major": return "hoch";
      case "minor": return "mittel";
      case "cosmetic": return "niedrig";
      default: return "mittel";
    }
  };

  const mapCategoryFromTrade = (trade: string): string => {
    const tradeMap: Record<string, string> = {
      "Elektrik": "Elektrik",
      "Sanitär": "Sanitär",
      "Rohbau": "Riss/Bruch",
      "Malerarbeiten": "Oberfläche",
      "Trockenbau": "Oberfläche",
      "Fassade": "Feuchtigkeit",
      "Dachdecker": "Feuchtigkeit",
      "Brandschutz": "Brandschutz",
    };
    return tradeMap[trade] || "Sonstiges";
  };

  // Adopt a defect → save to defect-store
  const handleAdoptDefect = async (defect: DefectData) => {
    if (!activeProject) return;

    const newDefect: Defect = {
      id: `defect_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: activeProject.id,
      title: defect.title,
      description: `${defect.description}\n\nMaßnahme: ${defect.suggestedAction}`,
      status: "offen",
      priority: mapSeverityToPriority(defect.severity),
      category: mapCategoryFromTrade(defect.trade),
      photos: photos.map((p) => p.uri),
      location: defect.location,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "ki_analysis" as const,
      confidence: defect.confidence,
      analysisId: result?.id,
    };

    try {
      await saveDefect(newDefect);
      setAdoptedDefects((prev) => new Set([...prev, defect.id]));
      showUndoToast(newDefect.id, "defect", defect.title);
      if (Platform.OS !== "web") {
        const Haptics = require("expo-haptics");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch  {
      Alert.alert("Fehler", "Mangel konnte nicht gespeichert werden.");
    }
  };

  // Dismiss a defect
  const handleDismissDefect = (defect: DefectData) => {
    setDismissedDefects((prev) => new Set([...prev, defect.id]));
  };

  // Adopt a task → save to AsyncStorage tasks list
  const handleAdoptTask = async (task: TaskData) => {
    if (!activeProject) return;

    const newTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: activeProject.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      trade: task.trade,
      estimatedDuration: task.estimatedDuration,
      deadline: task.deadline,
      status: "offen",
      createdAt: new Date().toISOString(),
      source: "ki-analyse",
    };

    try {
      const tasksJson = await AsyncStorage.getItem("project-tasks") || "[]";
      const tasks = JSON.parse(tasksJson);
      tasks.push(newTask);
      await AsyncStorage.setItem("project-tasks", JSON.stringify(tasks));
      setAdoptedTasks((prev) => new Set([...prev, task.id]));
      showUndoToast(newTask.id, "task", task.title);
      if (Platform.OS !== "web") {
        const Haptics = require("expo-haptics");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch  {
      Alert.alert("Fehler", "Aufgabe konnte nicht gespeichert werden.");
    }
  };

  // Dismiss a task
  const handleDismissTask = (task: TaskData) => {
    setDismissedTasks((prev) => new Set([...prev, task.id]));
  };

  // Adopt all defects
  const handleAdoptAllDefects = async () => {
    if (!result) return;
    for (const defect of result.defects) {
      if (!adoptedDefects.has(defect.id) && !dismissedDefects.has(defect.id)) {
        await handleAdoptDefect(defect as unknown as DefectData);
      }
    }
  };

  // Dismiss all defects
  const handleDismissAllDefects = () => {
    if (!result) return;
    const newDismissed = new Set(dismissedDefects);
    for (const defect of result.defects) {
      if (!adoptedDefects.has(defect.id)) {
        newDismissed.add(defect.id);
      }
    }
    setDismissedDefects(newDismissed);
  };

  // Adopt all tasks
  const handleAdoptAllTasks = async () => {
    if (!result) return;
    for (const task of result.tasks) {
      if (!adoptedTasks.has(task.id) && !dismissedTasks.has(task.id)) {
        await handleAdoptTask(task as unknown as TaskData);
      }
    }
  };

  // Dismiss all tasks
  const handleDismissAllTasks = () => {
    if (!result) return;
    const newDismissed = new Set(dismissedTasks);
    for (const task of result.tasks) {
      if (!adoptedTasks.has(task.id)) {
        newDismissed.add(task.id);
      }
    }
    setDismissedTasks(newDismissed);
  };

  // ─── Manual Defect Helpers ──────────────────────────────────────────────────

  const handleAddManualDefect = () => {
    if (!manualTitle.trim()) {
      Alert.alert("Fehler", "Bitte einen Titel eingeben.");
      return;
    }
    const newDefect = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: manualTitle.trim(),
      description: manualDescription.trim() || "Manuell erfasster Mangel",
      severity: manualSeverity,
    };
    setManualDefects((prev) => [...prev, newDefect]);
    setManualTitle("");
    setManualDescription("");
    setManualSeverity("major");
    setShowManualEntry(false);
    if (Platform.OS !== "web") {
      const Haptics = require("expo-haptics");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleRemoveManualDefect = (id: string) => {
    setManualDefects((prev) => prev.filter((d) => d.id !== id));
  };

  const getSeverityLabel = (severity: string): string => {
    switch (severity) {
      case "critical": return "Kritisch";
      case "major": return "Schwer";
      case "minor": return "Leicht";
      case "cosmetic": return "Kosmetisch";
      default: return severity;
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case "critical": return "#DC2626";
      case "major": return "#F59E0B";
      case "minor": return "#3B82F6";
      case "cosmetic": return "#6B7280";
      default: return "#6B7280";
    }
  };

  // ─── PDF Export ─────────────────────────────────────────────────────────────

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const companyInfo = await getCompanyInfo();
      const sections: PdfSection[] = [];

      // Summary section
      sections.push({
        title: "Analyseergebnis",
        content: [
          `**Projekt:** ${activeProject?.name || "Unbekannt"}`,
          roomName ? `**Raum:** ${roomName}` : "",
          `**Datum:** ${new Date().toLocaleDateString("de-DE")}`,
          `**Fotos analysiert:** ${photos.length}`,
          result ? `**Baufortschritt:** ${result.progress.overallPercent}%` : "",
          result ? `\n${result.summary}` : "",
        ].filter(Boolean).join("\n"),
      });

      // KI-detected defects
      if (result && result.defects.length > 0) {
        sections.push({
          title: "KI-erkannte Mängel",
          content: `Insgesamt **${result.defects.length} Mängel** durch KI-Analyse erkannt.`,
        });
        for (const defect of result.defects) {
          let content = `**Schweregrad:** ${getSeverityLabel(defect.severity)}\n`;
          if (defect.trade) content += `**Gewerk:** ${defect.trade}\n`;
          if (defect.location) content += `**Ort:** ${defect.location}\n`;
          content += `\n${defect.description}`;
          if (defect.suggestedAction) content += `\n\n**Maßnahme:** ${defect.suggestedAction}`;
          sections.push({ title: defect.title, content });
        }
      }

      // Manual defects
      if (manualDefects.length > 0) {
        sections.push({
          title: "Manuell erfasste Mängel",
          content: `Insgesamt **${manualDefects.length} Mängel** manuell hinzugefügt.`,
        });
        for (const defect of manualDefects) {
          let content = `**Schweregrad:** ${getSeverityLabel(defect.severity)}\n`;
          content += `\n${defect.description}`;
          sections.push({ title: defect.title, content });
        }
      }

      // Tasks
      if (result && result.tasks.length > 0) {
        sections.push({
          title: "Aufgaben",
          content: `Insgesamt **${result.tasks.length} Aufgaben** erkannt.`,
        });
        for (const task of result.tasks) {
          let content = `**Priorität:** ${task.priority}\n`;
          if (task.trade) content += `**Gewerk:** ${task.trade}\n`;
          if (task.estimatedDuration) content += `**Geschätzte Dauer:** ${task.estimatedDuration}\n`;
          content += `\n${task.description}`;
          sections.push({ title: task.title, content });
        }
      }

      const options: ProfessionalPdfOptions = {
        title: activeProject?.name || "Bildanalyse-Bericht",
        subtitle: roomName ? `Raum: ${roomName}` : "KI-Bildanalyse",
        reportType: "Bildanalyse-Bericht",
        datum: new Date().toLocaleDateString("de-DE"),
        sections,
        companyInfo: companyInfo || undefined,
        accentColor: "#0a7ea4",
        includeTableOfContents: (result?.defects.length || 0) + manualDefects.length > 5,
      };

      await generateAndSharePdf(options);
    } catch (error: any) {
      Alert.alert("Export-Fehler", error.message || "PDF-Export fehlgeschlagen");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ─── Analysis ───────────────────────────────────────────────────────────────

  const runAnalysis = async () => {
    if (photos.length === 0) {
      Alert.alert("Keine Fotos", "Bitte wähle mindestens ein Foto aus.");
      return;
    }
    if (!activeProject) {
      Alert.alert("Kein Projekt", "Bitte wähle zuerst ein Projekt im Tools-Tab aus.");
      return;
    }

    setIsAnalyzing(true);
    setResult(null);
    resetAdoptionState();

    try {
      // Prepare photos with base64
      const photosWithBase64: { base64: string; mimeType: string; filename: string }[] = [];
      for (const photo of photos) {
        let base64Data = photo.base64;
        if (!base64Data) {
          base64Data = await FileSystem.readAsStringAsync(photo.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        photosWithBase64.push({
          base64: base64Data,
          mimeType: photo.mimeType,
          filename: photo.filename,
        });
      }

      // Use central AI Service (handles upload, analysis, history, knowledge layer)
      const { result: analysisResult } = await aiService.analyzePhotos({
        photos: photosWithBase64,
        projectId: activeProject.id,
        projectName: activeProject.name,
        roomName: roomName || undefined,
        additionalContext: additionalContext || undefined,
        source: "photo",
        mutations,
      });

      setResult(analysisResult as AnalysisResult);

      // Timeline event
      try {
        await timelineEngine.emit({
          projectId: activeProject.id,
          eventType: "analysis_completed",
          source: "photo",
          title: "Fotoanalyse abgeschlossen",
          description: `${photosWithBase64.length} Fotos analysiert${roomName ? ` (${roomName})` : ""}`,
          entityType: "analysis",
          roomName: roomName || undefined,
          tags: ["analysis", "photo", "ki"],
        });
      } catch {}

    } catch (error: any) {
      Alert.alert(
        "Analyse fehlgeschlagen",
        error.message || "Die KI-Analyse konnte nicht durchgeführt werden. Bitte versuche es erneut."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>KI-Bildanalyse</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Project Badge */}
        {activeProject && (
          <View style={[styles.projectBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
            <MaterialIcons name="folder" size={16} color={colors.primary} />
            <Text style={[styles.projectBadgeText, { color: colors.primary }]}>
              {activeProject.name}
            </Text>
          </View>
        )}

        {/* Photo Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Fotos auswählen</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>
            Bis zu 5 Baustellenfotos für die KI-Analyse
          </Text>

          {/* Photo Grid */}
          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <View key={index} style={[styles.photoItem, { borderColor: colors.border }]}>
                  <Image source={{ uri: photo.uri }} style={styles.photoImage} contentFit="cover" />
                  <Pressable
                    onPress={() => removePhoto(index)}
                    style={[styles.removePhotoButton, { backgroundColor: colors.error }]}
                  >
                    <MaterialIcons name="close" size={14} color="#FFF" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Add Photo Buttons */}
          {photos.length < 5 && (
            <View style={styles.addPhotoRow}>
              <Pressable
                onPress={pickPhotos}
                style={({ pressed }) => [
                  styles.addPhotoButton,
                  { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}
              >
                <MaterialIcons name="photo-library" size={22} color={colors.primary} />
                <Text style={[styles.addPhotoText, { color: colors.foreground }]}>Galerie</Text>
              </Pressable>
              <Pressable
                onPress={takePhoto}
                style={({ pressed }) => [
                  styles.addPhotoButton,
                  { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}
              >
                <MaterialIcons name="camera-alt" size={22} color={colors.primary} />
                <Text style={[styles.addPhotoText, { color: colors.foreground }]}>Kamera</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Analyze Button */}
        <Pressable
          onPress={runAnalysis}
          disabled={isAnalyzing || photos.length === 0}
          style={({ pressed }) => [
            styles.analyzeButton,
            {
              backgroundColor: isAnalyzing || photos.length === 0 ? colors.muted : colors.primary,
              transform: [{ scale: pressed && !isAnalyzing ? 0.97 : 1 }],
            },
          ]}
        >
          {isAnalyzing ? (
            <>
              <ActivityIndicator size="small" color="#FFF" />
              <Text style={styles.analyzeButtonText}>Analysiere...</Text>
            </>
          ) : (
            <>
              <MaterialIcons name="auto-awesome" size={20} color="#FFF" />
              <Text style={styles.analyzeButtonText}>KI-Analyse starten</Text>
            </>
          )}
        </Pressable>

        {/* ─── Results ─────────────────────────────────────────────────────── */}
        {result && (
          <View style={styles.resultsSection}>
            {/* Analysis Summary Card */}
            <AnalysisCard
              analysis={{
                id: result.id,
                source: result.source,
                timestamp: result.timestamp,
                summary: result.summary,
                observations: result.observations,
                defectCount: result.defects.length,
                taskCount: result.tasks.length,
                progressPercent: result.progress.overallPercent,
              }}
              projectName={activeProject?.name}
            />

            {/* Progress Card */}
            <ProgressCard
              progress={result.progress as ProgressData}
              source="Foto"
            />

            {/* ─── Defects Section ─────────────────────────────────────────── */}
            {result.defects.length > 0 && (
              <View style={styles.adoptionSection}>
                <ReviewCard
                  itemType="Mängel"
                  totalCount={result.defects.length}
                  adoptedCount={adoptedDefects.size}
                  dismissedCount={dismissedDefects.size}
                  onAdoptAll={handleAdoptAllDefects}
                  onDismissAll={handleDismissAllDefects}
                />
                {result.defects.map((defect) => (
                  <DefectCard
                    key={defect.id}
                    defect={defect as unknown as DefectData}
                    isAdopted={adoptedDefects.has(defect.id)}
                    isDismissed={dismissedDefects.has(defect.id)}
                    onAdopt={handleAdoptDefect}
                    onDismiss={handleDismissDefect}
                    showActions={true}
                  />
                ))}
              </View>
            )}

            {/* ─── Tasks Section ───────────────────────────────────────────── */}
            {result.tasks.length > 0 && (
              <View style={styles.adoptionSection}>
                <ReviewCard
                  itemType="Aufgaben"
                  totalCount={result.tasks.length}
                  adoptedCount={adoptedTasks.size}
                  dismissedCount={dismissedTasks.size}
                  onAdoptAll={handleAdoptAllTasks}
                  onDismissAll={handleDismissAllTasks}
                />
                {result.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task as unknown as TaskData}
                    isAdopted={adoptedTasks.has(task.id)}
                    isDismissed={dismissedTasks.has(task.id)}
                    onAdopt={handleAdoptTask}
                    onDismiss={handleDismissTask}
                    showActions={true}
                  />
                ))}
              </View>
            )}

            {/* ─── Manual Defect Entry ─── */}
            <View style={[styles.manualSection, { borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialIcons name="edit-note" size={20} color={colors.foreground} />
                  <Text style={[styles.manualSectionTitle, { color: colors.foreground }]}>Eigene Mängel</Text>
                </View>
                <Pressable
                  onPress={() => setShowManualEntry(!showManualEntry)}
                  style={({ pressed }) => [styles.addManualBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name={showManualEntry ? "close" : "add"} size={18} color="#FFF" />
                  <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "600" }}>
                    {showManualEntry ? "Abbrechen" : "Hinzufügen"}
                  </Text>
                </Pressable>
              </View>

              {showManualEntry && (
                <View style={[styles.manualForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    value={manualTitle}
                    onChangeText={setManualTitle}
                    placeholder="Mangel-Titel *"
                    placeholderTextColor={colors.muted}
                    style={[styles.manualInput, { color: colors.foreground, borderColor: colors.border }]}
                    returnKeyType="next"
                  />
                  <TextInput
                    value={manualDescription}
                    onChangeText={setManualDescription}
                    placeholder="Beschreibung (optional)"
                    placeholderTextColor={colors.muted}
                    style={[styles.manualInput, styles.manualTextArea, { color: colors.foreground, borderColor: colors.border }]}
                    multiline
                    numberOfLines={3}
                  />
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                    {(["critical", "major", "minor", "cosmetic"] as const).map((sev) => (
                      <Pressable
                        key={sev}
                        onPress={() => setManualSeverity(sev)}
                        style={[styles.severityChip, {
                          backgroundColor: manualSeverity === sev ? getSeverityColor(sev) + "20" : "transparent",
                          borderColor: manualSeverity === sev ? getSeverityColor(sev) : colors.border,
                        }]}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "600", color: manualSeverity === sev ? getSeverityColor(sev) : colors.muted }}>
                          {getSeverityLabel(sev)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    onPress={handleAddManualDefect}
                    style={({ pressed }) => [styles.saveManualBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <MaterialIcons name="check" size={18} color="#FFF" />
                    <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "600" }}>Mangel speichern</Text>
                  </Pressable>
                </View>
              )}

              {manualDefects.map((defect) => (
                <View key={defect.id} style={[styles.manualDefectItem, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[styles.severityDot, { backgroundColor: getSeverityColor(defect.severity) }]} />
                      <Text style={[styles.manualDefectTitle, { color: colors.foreground }]}>{defect.title}</Text>
                    </View>
                    {defect.description !== "Manuell erfasster Mangel" && (
                      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2, marginLeft: 18 }} numberOfLines={2}>{defect.description}</Text>
                    )}
                  </View>
                  <Pressable onPress={() => handleRemoveManualDefect(defect.id)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                  </Pressable>
                </View>
              ))}

              {manualDefects.length === 0 && !showManualEntry && (
                <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 8 }}>
                  Keine manuellen Mängel hinzugefügt
                </Text>
              )}
            </View>

            {/* ─── PDF Export Button ─── */}
            <Pressable
              onPress={handleExportPdf}
              disabled={isExportingPdf}
              style={({ pressed }) => [styles.exportButton, {
                backgroundColor: isExportingPdf ? colors.muted : "#DC2626",
                opacity: pressed && !isExportingPdf ? 0.85 : 1,
              }]}
            >
              {isExportingPdf ? (
                <>
                  <ActivityIndicator size="small" color="#FFF" />
                  <Text style={styles.exportButtonText}>PDF wird erstellt...</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="picture-as-pdf" size={22} color="#FFF" />
                  <Text style={styles.exportButtonText}>Als PDF exportieren</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Undo Toast */}
      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        onUndo={handleUndo}
        onDismiss={() => setUndoToast((prev) => ({ ...prev, visible: false }))}
      />
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  projectBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    marginBottom: 16,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  photoItem: {
    width: 90,
    height: 90,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  removePhotoButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoRow: {
    flexDirection: "row",
    gap: 12,
  },
  addPhotoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  addPhotoText: {
    fontSize: 14,
    fontWeight: "600",
  },
  analyzeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 28,
  },
  analyzeButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  resultsSection: {
    gap: 16,
  },
  adoptionSection: {
    gap: 0,
  },
  manualSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
  },
  manualSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  addManualBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  manualForm: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  manualInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  manualTextArea: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  severityChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  saveManualBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  manualDefectItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  manualDefectTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  severityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  exportButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
