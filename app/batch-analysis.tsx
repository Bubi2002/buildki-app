/**
 * protoKI – Batch-Analyse Screen
 * 
 * Ermöglicht die Analyse mehrerer Fotos gleichzeitig mit automatischer
 * Gruppierung nach Raum oder Aufnahmezeit.
 */

import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  FlatList,
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
import { aiService, type AIServiceMutations } from "@/lib/ai-service";
import { getSourceLabel, getSourceColor } from "@/shared/ai-types";
import type { BatchAnalysisResult, BatchGroupStrategy } from "@/shared/ai-types";

// Reusable analysis components
import { DefectCard, type DefectData } from "@/components/analysis/DefectCard";
import { TaskCard, type TaskData } from "@/components/analysis/TaskCard";
import { ProgressCard, type ProgressData } from "@/components/analysis/ProgressCard";

export default function BatchAnalysisScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; projectName?: string }>();

  // State
  const [photos, setPhotos] = useState<Array<{
    uri: string;
    timestamp?: string;
    roomName?: string;
  }>>([]);
  const [groupStrategy, setGroupStrategy] = useState<BatchGroupStrategy>("auto");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchAnalysisResult | null>(null);
  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [roomAssignments, setRoomAssignments] = useState<Record<string, string>>({});
  const [showRoomInput, setShowRoomInput] = useState<string | null>(null);

  // tRPC mutations
  const uploadPhotoMutation = trpc.analysis.uploadPhoto.useMutation();
  const analyzePhotoMutation = trpc.analysis.analyzePhoto.useMutation();

  const mutations: AIServiceMutations = {
    uploadPhoto: (input) => uploadPhotoMutation.mutateAsync(input),
    analyzePhoto: (input) => analyzePhotoMutation.mutateAsync(input),
  };

  // Load project
  useEffect(() => {
    if (params.projectId && params.projectName) {
      setActiveProject({ id: params.projectId, name: params.projectName });
    } else {
      loadActiveProject();
    }
  }, []);

  const loadActiveProject = async () => {
    try {
      const projectsJson = await AsyncStorage.getItem("projects");
      const lastId = await AsyncStorage.getItem("last-selected-project-id");
      if (projectsJson && lastId) {
        const projects = JSON.parse(projectsJson);
        const project = projects.find((p: any) => p.id === lastId);
        if (project) setActiveProject({ id: project.id, name: project.name });
      }
    } catch {}
  };

  // Pick multiple photos
  const pickPhotos = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Berechtigung benötigt", "Bitte erlaube den Zugriff auf die Fotogalerie.");
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
    } catch (err) {
      Alert.alert("Fehler", "Fotos konnten nicht geladen werden.");
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
      Alert.alert("Keine Fotos", "Bitte wähle mindestens ein Foto aus.");
      return;
    }
    if (!activeProject) {
      Alert.alert("Kein Projekt", "Bitte wähle zuerst ein Projekt aus.");
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
    } catch (error: any) {
      Alert.alert(
        "Batch-Analyse fehlgeschlagen",
        error.message || "Die Analyse konnte nicht durchgeführt werden."
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Batch-Analyse</Text>
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
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Gruppierung</Text>
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
                  {strategy === "auto" ? "Automatisch" : strategy === "room" ? "Nach Raum" : strategy === "time" ? "Nach Zeit" : "Manuell"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Photo Grid */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Fotos ({photos.length})
            </Text>
            <Pressable
              onPress={pickPhotos}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <MaterialIcons name="add-photo-alternate" size={18} color="#FFF" />
              <Text style={styles.addButtonText}>Hinzufügen</Text>
            </Pressable>
          </View>

          {photos.length === 0 ? (
            <Pressable
              onPress={pickPhotos}
              style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <MaterialIcons name="photo-library" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Tippe um mehrere Fotos auszuwählen
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.muted }]}>
                Die KI gruppiert sie automatisch nach Raum oder Aufnahmezeit
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
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Raumzuordnung</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
              Weise Fotos Räumen zu für präzisere Analyse
            </Text>
            <View style={styles.roomList}>
              {photos.map((photo, idx) => (
                <View key={photo.uri + idx} style={[styles.roomRow, { borderColor: colors.border }]}>
                  <Image source={{ uri: photo.uri }} style={styles.roomThumb} contentFit="cover" />
                  <Pressable
                    onPress={() => {
                      if (Alert.prompt) {
                        Alert.prompt(
                          "Raum zuweisen",
                          `Foto ${idx + 1}`,
                          (text) => { if (text) assignRoom(photo.uri, text); },
                          "plain-text",
                          photo.roomName || ""
                        );
                      } else {
                        Alert.alert("Raum", "Raumzuordnung ist nur auf iOS verfügbar. Nutze die automatische Gruppierung.");
                      }
                    }}
                    style={[styles.roomInput, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={{ color: photo.roomName ? colors.foreground : colors.muted }}>
                      {photo.roomName || "Raum zuweisen..."}
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
              {photos.length} Foto{photos.length > 1 ? "s" : ""} analysieren
            </Text>
          </Pressable>
        )}

        {/* Loading State */}
        {isAnalyzing && (
          <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.foreground }]}>
              Batch-Analyse läuft...
            </Text>
            <Text style={[styles.loadingSubtext, { color: colors.muted }]}>
              {photos.length} Fotos werden gruppiert und analysiert
            </Text>
          </View>
        )}

        {/* Results */}
        {batchResult && (
          <View style={styles.results}>
            {/* Summary */}
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.summaryHeader}>
                <MaterialIcons name="analytics" size={20} color={colors.primary} />
                <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Ergebnis-Übersicht</Text>
              </View>
              <Text style={[styles.summaryText, { color: colors.muted }]}>
                {batchResult.aggregatedSummary}
              </Text>
              <View style={styles.summaryStats}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.error }]}>{batchResult.totalDefects}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>Mängel</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.primary }]}>{batchResult.totalTasks}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>Aufgaben</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.success }]}>{batchResult.averageProgress}%</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>Fortschritt</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.foreground }]}>{batchResult.groups.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>Gruppen</Text>
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
                    {group.result.defects.length} Mängel · {group.result.tasks.length} Aufgaben
                  </Text>
                </View>
                <Text style={[styles.groupSummary, { color: colors.muted }]}>{group.result.summary}</Text>

                {/* Defects in this group */}
                {group.result.defects.map(defect => (
                  <DefectCard
                    key={defect.id}
                    defect={defect as DefectData}
                    showActions={false}
                  />
                ))}

                {/* Tasks in this group */}
                {group.result.tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task as TaskData}
                    showActions={false}
                  />
                ))}
              </View>
            ))}
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 12,
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
    borderRadius: 8,
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
    borderRadius: 9,
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
    borderRadius: 6,
  },
  roomInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
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
    borderRadius: 12,
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
    borderRadius: 12,
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
    borderRadius: 12,
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
});
