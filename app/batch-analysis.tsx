/**
 * protoKI – Batch-Analyse Screen
 * 
 * Ermöglicht die Analyse mehrerer Fotos gleichzeitig mit automatischer
 * Gruppierung nach Raum oder Aufnahmezeit.
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
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";
import { aiService, type AIServiceMutations } from "@/lib/ai-service";
import type { BatchAnalysisResult, BatchGroupStrategy } from "@/shared/ai-types";
import { saveDefect, deleteDefect, type Defect } from "@/lib/defect-store";
import { UndoToast } from "@/components/UndoToast";
import { createLocalId } from "@/lib/id";

// Reusable analysis components
import { DefectCard, type DefectData } from "@/components/analysis/DefectCard";
import { TaskCard, type TaskData } from "@/components/analysis/TaskCard";

export default function BatchAnalysisScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; projectName?: string }>();

  // State
  const [photos, setPhotos] = useState<{
    uri: string;
    timestamp?: string;
    roomName?: string;
  }[]>([]);
  const [groupStrategy, setGroupStrategy] = useState<BatchGroupStrategy>("auto");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchAnalysisResult | null>(null);
  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [roomAssignments, setRoomAssignments] = useState<Record<string, string>>({});
  const [showRoomInput, setShowRoomInput] = useState<string | null>(null);
  // Review state
  const [adoptedDefects, setAdoptedDefects] = useState<Set<string>>(new Set());
  const [dismissedDefects, setDismissedDefects] = useState<Set<string>>(new Set());
  const [adoptedTasks, setAdoptedTasks] = useState<Set<string>>(new Set());
  const [dismissedTasks, setDismissedTasks] = useState<Set<string>>(new Set());
  const [undoToast, setUndoToast] = useState<{ visible: boolean; message: string; itemId: string; itemType: "defect" | "task" }>({
    visible: false, message: "", itemId: "", itemType: "defect",
  });
  const [reviewStep, setReviewStep] = useState<"results" | "review">("results");

  // tRPC mutations
  const uploadPhotoMutation = trpc.analysis.uploadPhoto.useMutation();
  const analyzePhotoMutation = trpc.analysis.analyzePhoto.useMutation();

  const mutations: AIServiceMutations = {
    uploadPhoto: (input) => uploadPhotoMutation.mutateAsync(input),
    analyzePhoto: (input) => analyzePhotoMutation.mutateAsync(input),
  };

  async function loadActiveProject() {
    try {
      const projectsJson = await AsyncStorage.getItem("projects");
      const lastId = await AsyncStorage.getItem("last-selected-project-id");
      if (projectsJson && lastId) {
        const projects = JSON.parse(projectsJson);
        const project = projects.find((p: any) => p.id === lastId);
        if (project) setActiveProject({ id: project.id, name: project.name });
      }
    } catch {}
  }

  // Load project
  useEffect(() => {
    void Promise.resolve().then(() => {
      if (params.projectId && params.projectName) {
        setActiveProject({ id: params.projectId, name: params.projectName });
      } else {
        void loadActiveProject();
      }
    });
  }, []);

  // Pick multiple photos
  const pickPhotos = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t('batch_analysis_permission_title' as any), t('batch_analysis_permission_msg' as any));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: false,
        exif: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const newPhotos = result.assets.map(asset => ({
          uri: asset.uri,
          timestamp: asset.exif?.DateTimeOriginal || new Date().toISOString(),
          roomName: undefined as string | undefined,
        }));
        setPhotos(prev => [...prev, ...newPhotos]);
      }
    } catch  {
      Alert.alert(t('batch_analysis_error_title' as any), t('batch_analysis_load_photos_failed' as any));
    }
  };

  // Assign room to photo
  const assignRoom = (photoUri: string, room: string) => {
    setRoomAssignments(prev => ({ ...prev, [photoUri]: room }));
    setPhotos(prev => prev.map(p => 
      p.uri === photoUri ? { ...p, roomName: room } : p
    ));
    setShowRoomInput(null);
  };

  // Remove photo
  const removePhoto = (uri: string) => {
    setPhotos(prev => prev.filter(p => p.uri !== uri));
    setRoomAssignments(prev => {
      const next = { ...prev };
      delete next[uri];
      return next;
    });
  };

  // Start batch analysis
  const startBatchAnalysis = async () => {
    if (photos.length === 0) {
      Alert.alert(t('batch_analysis_no_photos_title' as any), t('batch_analysis_no_photos_msg' as any));
      return;
    }
    if (!activeProject) {
      Alert.alert(t('batch_analysis_no_project_title' as any), t('batch_analysis_no_project_msg' as any));
      return;
    }

    setIsAnalyzing(true);
    setBatchResult(null);

    try {
      // Upload all photos first
      const uploadedUrls: string[] = [];
      for (const photo of photos) {
        const base64 = await FileSystem.readAsStringAsync(photo.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const uploadResult = await mutations.uploadPhoto({
          base64,
          mimeType: "image/jpeg",
          filename: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`,
        });
        uploadedUrls.push(uploadResult.url);
      }

      // Build photo metadata for grouping
      const photoMeta = photos.map((p, i) => ({
        uri: uploadedUrls[i],
        timestamp: p.timestamp,
        roomName: p.roomName || roomAssignments[p.uri],
      }));

      // Call batch analysis via AI Service
      const result = await aiService.batchAnalyze({
        projectId: activeProject.id,
        projectName: activeProject.name,
        photoUris: uploadedUrls,
        photoMeta,
        groupStrategy,
        mutations,
      });

      setBatchResult(result);
      setReviewStep("review");
    } catch (error: any) {
      Alert.alert(
        t('batch_analysis_failed_title' as any),
        error.message || t('batch_analysis_failed_msg' as any)
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─── Adoption Handlers ──────────────────────────────────────────────────────

  async function handleAdoptDefect(defect: DefectData) {
    if (!activeProject) return;
    const newDefect: Defect = {
      id: createLocalId("defect"),
      projectId: activeProject.id,
      title: defect.title,
      description: `${defect.description}\n\n${t('batch_analysis_measure_label' as any)}${defect.suggestedAction}`,
      status: "offen",
      priority: defect.severity === "critical" ? "hoch" : defect.severity === "major" ? "mittel" : "niedrig",
      category: defect.trade || "Sonstiges",
      photos: [],
      location: defect.location,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "ki_analysis" as const,
      confidence: defect.confidence,
      analysisId: batchResult?.batchId,
    };
    try {
      await saveDefect(newDefect);
      setAdoptedDefects(prev => new Set([...prev, defect.id]));
      setUndoToast({ visible: true, message: t('batch_analysis_defect_adopted' as any), itemId: newDefect.id, itemType: "defect" });
      if (Platform.OS !== "web") {
        const Haptics = require("expo-haptics");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
  }

  async function handleAdoptTask(task: TaskData) {
    if (!activeProject) return;
    const newTask = {
      id: createLocalId("task"),
      projectId: activeProject.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      trade: task.trade,
      estimatedDuration: task.estimatedDuration,
      deadline: task.deadline,
      status: "offen",
      createdAt: new Date().toISOString(),
      source: "ki-batch",
    };
    try {
      const tasksJson = await AsyncStorage.getItem("project-tasks") || "[]";
      const tasks = JSON.parse(tasksJson);
      tasks.push(newTask);
      await AsyncStorage.setItem("project-tasks", JSON.stringify(tasks));
      setAdoptedTasks(prev => new Set([...prev, task.id]));
      setUndoToast({ visible: true, message: t('batch_analysis_task_adopted' as any), itemId: newTask.id, itemType: "task" });
      if (Platform.OS !== "web") {
        const Haptics = require("expo-haptics");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
  }

  async function handleUndo() {
    try {
      if (undoToast.itemType === "defect") {
        await deleteDefect(undoToast.itemId);
      } else {
        const tasksJson = await AsyncStorage.getItem("project-tasks") || "[]";
        const tasks = JSON.parse(tasksJson);
        const filtered = tasks.filter((t: any) => t.id !== undoToast.itemId);
        await AsyncStorage.setItem("project-tasks", JSON.stringify(filtered));
      }
    } catch {}
  }

  async function handleAdoptAllInGroup(group: BatchAnalysisResult["groups"][number]) {
    for (const defect of group.result.defects) {
      if (!adoptedDefects.has(defect.id) && !dismissedDefects.has(defect.id)) {
        await handleAdoptDefect(defect as unknown as DefectData);
      }
    }
    for (const task of group.result.tasks) {
      if (!adoptedTasks.has(task.id) && !dismissedTasks.has(task.id)) {
        await handleAdoptTask(task as unknown as TaskData);
      }
    }
  }

  function handleDismissAllInGroup(group: BatchAnalysisResult["groups"][number]) {
    const newDismissedD = new Set(dismissedDefects);
    for (const defect of group.result.defects) {
      if (!adoptedDefects.has(defect.id)) newDismissedD.add(defect.id);
    }
    setDismissedDefects(newDismissedD);
    const newDismissedT = new Set(dismissedTasks);
    for (const task of group.result.tasks) {
      if (!adoptedTasks.has(task.id)) newDismissedT.add(task.id);
    }
    setDismissedTasks(newDismissedT);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('batch_analysis_title' as any)}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Project Info */}
        {activeProject && (
          <View style={[styles.projectBadge, { backgroundColor: colors.primary + "15" }]}>
            <MaterialIcons name="business" size={16} color={colors.primary} />
            <Text style={[styles.projectName, { color: colors.primary }]}>{activeProject.name}</Text>
          </View>
        )}

        {/* Strategy Selector */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('batch_analysis_grouping' as any)}</Text>
          <View style={styles.strategyRow}>
            {(["auto", "room", "time", "manual"] as BatchGroupStrategy[]).map(strategy => (
              <Pressable
                key={strategy}
                onPress={() => setGroupStrategy(strategy)}
                style={[
                  styles.strategyChip,
                  {
                    backgroundColor: groupStrategy === strategy ? colors.primary + "20" : colors.surface,
                    borderColor: groupStrategy === strategy ? colors.primary : colors.border,
                  },
                ]}
              >
                <MaterialIcons
                  name={strategy === "auto" ? "auto-awesome" : strategy === "room" ? "meeting-room" : strategy === "time" ? "schedule" : "list"}
                  size={14}
                  color={groupStrategy === strategy ? colors.primary : colors.muted}
                />
                <Text style={[
                  styles.strategyLabel,
                  { color: groupStrategy === strategy ? colors.primary : colors.muted },
                ]}>
                  {strategy === "auto" ? t('batch_analysis_strategy_auto' as any) : strategy === "room" ? t('batch_analysis_strategy_room' as any) : strategy === "time" ? t('batch_analysis_strategy_time' as any) : t('batch_analysis_strategy_manual' as any)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Photo Grid */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t('batch_analysis_photos_word' as any)} ({photos.length})
            </Text>
            <Pressable
              onPress={pickPhotos}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <MaterialIcons name="add-photo-alternate" size={18} color="#FFF" />
              <Text style={styles.addButtonText}>{t('batch_analysis_add' as any)}</Text>
            </Pressable>
          </View>

          {photos.length === 0 ? (
            <Pressable
              onPress={pickPhotos}
              style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <MaterialIcons name="photo-library" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {t('batch_analysis_empty_tap' as any)}
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.muted }]}>
                {t('batch_analysis_empty_hint' as any)}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((photo, idx) => (
                <View key={photo.uri + idx} style={[styles.photoItem, { borderColor: colors.border }]}>
                  <Image source={{ uri: photo.uri }} style={styles.photoThumb} contentFit="cover" />
                  <Pressable
                    onPress={() => removePhoto(photo.uri)}
                    style={[styles.removeBtn, { backgroundColor: colors.error }]}
                  >
                    <MaterialIcons name="close" size={12} color="#FFF" />
                  </Pressable>
                  {photo.roomName && (
                    <View style={[styles.roomBadge, { backgroundColor: colors.primary + "E0" }]}>
                      <Text style={styles.roomBadgeText}>{photo.roomName}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Room Assignment (when strategy is "room") */}
        {groupStrategy === "room" && photos.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('batch_analysis_room_assignment' as any)}</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
              {t('batch_analysis_room_assignment_hint' as any)}
            </Text>
            <View style={styles.roomList}>
              {photos.map((photo, idx) => (
                <View key={photo.uri + idx} style={[styles.roomRow, { borderColor: colors.border }]}>
                  <Image source={{ uri: photo.uri }} style={styles.roomThumb} contentFit="cover" />
                  <Pressable
                    onPress={() => {
                      if (Alert.prompt) {
                        Alert.prompt(
                          t('batch_analysis_assign_room_title' as any),
                          `${t('batch_analysis_photo_word' as any)} ${idx + 1}`,
                          (text) => { if (text) assignRoom(photo.uri, text); },
                          "plain-text",
                          photo.roomName || ""
                        );
                      } else {
                        Alert.alert(t('batch_analysis_room_title' as any), t('batch_analysis_room_ios_only' as any));
                      }
                    }}
                    style={[styles.roomInput, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={{ color: photo.roomName ? colors.foreground : colors.muted }}>
                      {photo.roomName || t('batch_analysis_assign_room_placeholder' as any)}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Start Button */}
        {photos.length > 0 && !isAnalyzing && !batchResult && (
          <Pressable
            onPress={startBatchAnalysis}
            style={({ pressed }) => [
              styles.startButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <MaterialIcons name="auto-awesome" size={20} color="#FFF" />
            <Text style={styles.startButtonText}>
              {photos.length} {photos.length > 1 ? t('batch_analysis_photos_word' as any) : t('batch_analysis_photo_word' as any)} {t('batch_analysis_analyze' as any)}
            </Text>
          </Pressable>
        )}

        {/* Loading State */}
        {isAnalyzing && (
          <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.foreground }]}>
              {t('batch_analysis_running' as any)}
            </Text>
            <Text style={[styles.loadingSubtext, { color: colors.muted }]}>
              {photos.length} {t('batch_analysis_grouped_analyzed' as any)}
            </Text>
          </View>
        )}

        {/* Results */}
        {batchResult && (
          <View style={styles.results}>
            {/* Review Step Toggle */}
            <View style={styles.reviewToggle}>
              <Pressable
                onPress={() => setReviewStep("results")}
                style={[styles.reviewTab, reviewStep === "results" && { backgroundColor: colors.primary + "20" }]}
              >
                <Text style={[styles.reviewTabText, { color: reviewStep === "results" ? colors.primary : colors.muted }]}>{t('batch_analysis_overview' as any)}</Text>
              </Pressable>
              <Pressable
                onPress={() => setReviewStep("review")}
                style={[styles.reviewTab, reviewStep === "review" && { backgroundColor: colors.primary + "20" }]}
              >
                <Text style={[styles.reviewTabText, { color: reviewStep === "review" ? colors.primary : colors.muted }]}>Review</Text>
              </Pressable>
            </View>

            {/* Summary */}
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.summaryHeader}>
                <MaterialIcons name="analytics" size={20} color={colors.primary} />
                <Text style={[styles.summaryTitle, { color: colors.foreground }]}>{t('batch_analysis_result_overview' as any)}</Text>
              </View>
              <Text style={[styles.summaryText, { color: colors.muted }]}>
                {batchResult.aggregatedSummary}
              </Text>
              <View style={styles.summaryStats}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.error }]}>{batchResult.totalDefects}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>{t('batch_analysis_defects_word' as any)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.primary }]}>{batchResult.totalTasks}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>{t('batch_analysis_tasks_word' as any)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.success }]}>{batchResult.averageProgress}%</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>{t('batch_analysis_progress' as any)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.foreground }]}>{batchResult.groups.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>{t('batch_analysis_groups' as any)}</Text>
                </View>
              </View>
            </View>

            {/* Group Results */}
            {batchResult.groups.map((group, idx) => (
              <View key={group.groupId} style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.groupHeader}>
                  <MaterialIcons name="folder" size={18} color={colors.primary} />
                  <Text style={[styles.groupTitle, { color: colors.foreground }]}>{group.label}</Text>
                  <Text style={[styles.groupMeta, { color: colors.muted }]}>
                    {group.result.defects.length} {t('batch_analysis_defects_word' as any)} · {group.result.tasks.length} {t('batch_analysis_tasks_word' as any)}
                  </Text>
                </View>
                <Text style={[styles.groupSummary, { color: colors.muted }]}>{group.result.summary}</Text>

                {/* Defects in this group */}
                {group.result.defects.map(defect => (
                  <DefectCard
                    key={defect.id}
                    defect={defect as DefectData}
                    showActions={reviewStep === "review"}
                    isAdopted={adoptedDefects.has(defect.id)}
                    isDismissed={dismissedDefects.has(defect.id)}
                    onAdopt={() => handleAdoptDefect(defect as unknown as DefectData)}
                    onDismiss={() => setDismissedDefects(prev => new Set([...prev, defect.id]))}
                  />
                ))}

                {/* Tasks in this group */}
                {group.result.tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task as TaskData}
                    showActions={reviewStep === "review"}
                    isAdopted={adoptedTasks.has(task.id)}
                    isDismissed={dismissedTasks.has(task.id)}
                    onAdopt={() => handleAdoptTask(task as unknown as TaskData)}
                    onDismiss={() => setDismissedTasks(prev => new Set([...prev, task.id]))}
                  />
                ))}

                {/* Bulk actions per group */}
                {reviewStep === "review" && (
                  <View style={styles.bulkActions}>
                    <Pressable
                      onPress={() => handleAdoptAllInGroup(group)}
                      style={({ pressed }) => [styles.bulkBtn, { backgroundColor: colors.success + "20", opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name="check-circle" size={14} color={colors.success} />
                      <Text style={[styles.bulkBtnText, { color: colors.success }]}>{t('batch_analysis_adopt_all' as any)}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDismissAllInGroup(group)}
                      style={({ pressed }) => [styles.bulkBtn, { backgroundColor: colors.error + "20", opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name="cancel" size={14} color={colors.error} />
                      <Text style={[styles.bulkBtnText, { color: colors.error }]}>{t('batch_analysis_dismiss_all' as any)}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        onUndo={handleUndo}
        onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 40,
  },
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 0,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  projectName: {
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginBottom: 10,
  },
  strategyRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  strategyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1,
  },
  strategyLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    borderRadius: 0,
    borderWidth: 1,
    borderStyle: "dashed",
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 12,
    textAlign: "center",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoItem: {
    width: 80,
    height: 80,
    borderRadius: 0,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  photoThumb: {
    width: "100%",
    height: "100%",
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  roomBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    alignItems: "center",
  },
  roomBadgeText: {
    color: "#FFF",
    fontSize: 8,
    fontWeight: "700",
  },
  roomList: {
    gap: 8,
  },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
  },
  roomThumb: {
    width: 40,
    height: 40,
    borderRadius: 0,
  },
  roomInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 0,
    marginBottom: 20,
  },
  startButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  loadingCard: {
    alignItems: "center",
    padding: 32,
    borderRadius: 0,
    borderWidth: 1,
    gap: 12,
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "600",
  },
  loadingSubtext: {
    fontSize: 12,
  },
  results: {
    gap: 16,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
    gap: 2,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  groupCard: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  groupMeta: {
    fontSize: 11,
  },
  groupSummary: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  reviewToggle: {
    flexDirection: "row",
    backgroundColor: "#0F1E30",
    borderRadius: 0,
    padding: 4,
    gap: 4,
  },
  reviewTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 0,
    alignItems: "center",
  },
  reviewTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  bulkActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#1E3A5F40",
  },
  bulkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 0,
  },
  bulkBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
