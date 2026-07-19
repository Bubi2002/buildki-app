/**
 * protoKI – KI-Bildanalyse Screen
 * 
 * Ermöglicht dem Bauleiter:
 * 1. Fotos aus der Galerie oder Kamera auszuwählen
 * 2. KI-Analyse zu starten (Baufortschritt, Mängel, Aufgaben)
 * 3. Ergebnisse als wiederverwendbare Karten anzuzeigen
 * 4. Mängel/Aufgaben per Tap in die Mängelliste/Aufgabenliste übernehmen
 */

import { useState, useCallback, useRef } from "react";
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
import { AnalysisCard, type AnalysisData } from "@/components/analysis/AnalysisCard";

// Defect store for adoption
import { saveDefect, deleteDefect, type Defect, type DefectPriority } from "@/lib/defect-store";

// Undo toast component
import { UndoToast } from "@/components/UndoToast";

// Central AI Service
import { aiService, type AIServiceMutations } from "@/lib/ai-service";
import { getSourceLabel, getSourceColor } from "@/shared/ai-types";

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
  defects: Array<{
    id: string;
    title: string;
    description: string;
    severity: string;
    trade: string;
    location: string;
    suggestedAction: string;
    confidence: number;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: string;
    trade: string;
    estimatedDuration: string;
    deadline: string | null;
  }>;
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
        filename: asset.fileName || `photo_${Date.now()}.jpg`,
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
        filename: asset.fileName || `photo_${Date.now()}.jpg`,
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
    } catch (error) {
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
    } catch (error) {
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
      const photosWithBase64: Array<{ base64: string; mimeType: string; filename: string }> = [];
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
});
