/**
 * protoKI – KI-Bildanalyse Screen
 * 
 * Ermöglicht dem Bauleiter:
 * 1. Fotos aus der Galerie oder Kamera auszuwählen
 * 2. KI-Analyse zu starten (Baufortschritt, Mängel, Aufgaben)
 * 3. Ergebnisse als strukturierte Karten anzuzeigen
 * 4. Ergebnisse dem aktuellen Projekt zuzuordnen
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
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

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

  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [roomName, setRoomName] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  const uploadPhotoMutation = trpc.analysis.uploadPhoto.useMutation();
  const analyzePhotoMutation = trpc.analysis.analyzePhoto.useMutation();

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

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets) {
      const newPhotos: SelectedPhoto[] = result.assets.map((asset) => ({
        uri: asset.uri,
        base64: asset.base64 || undefined,
        mimeType: asset.mimeType || "image/jpeg",
        filename: asset.fileName || `photo_${Date.now()}.jpg`,
      }));
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, 5));
      setResult(null);
    }
  };

  // Take photo with camera
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Berechtigung erforderlich", "Bitte erlaube den Zugriff auf die Kamera.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const newPhoto: SelectedPhoto = {
        uri: asset.uri,
        base64: asset.base64 || undefined,
        mimeType: asset.mimeType || "image/jpeg",
        filename: asset.fileName || `photo_${Date.now()}.jpg`,
      };
      setPhotos((prev) => [...prev, newPhoto].slice(0, 5));
      setResult(null);
    }
  };

  // Remove photo
  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  // Run analysis
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

    try {
      // Step 1: Upload photos to storage
      const uploadedUrls: string[] = [];
      for (const photo of photos) {
        let base64Data = photo.base64;
        if (!base64Data) {
          // Read file as base64
          base64Data = await FileSystem.readAsStringAsync(photo.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        const uploadResult = await uploadPhotoMutation.mutateAsync({
          base64: base64Data,
          mimeType: photo.mimeType,
          filename: photo.filename,
        });
        uploadedUrls.push(uploadResult.url);
      }

      // Step 2: Run analysis
      const analysisResult = await analyzePhotoMutation.mutateAsync({
        imageUrls: uploadedUrls,
        projectId: activeProject.id,
        projectName: activeProject.name,
        roomName: roomName || undefined,
        additionalContext: additionalContext || undefined,
      });

      setResult(analysisResult as AnalysisResult);

      // Step 3: Save result to AsyncStorage for history
      const historyJson = await AsyncStorage.getItem("analysis-history") || "[]";
      const history = JSON.parse(historyJson);
      history.unshift(analysisResult);
      await AsyncStorage.setItem("analysis-history", JSON.stringify(history.slice(0, 50)));

    } catch (error: any) {
      Alert.alert(
        "Analyse fehlgeschlagen",
        error.message || "Die KI-Analyse konnte nicht durchgeführt werden. Bitte versuche es erneut."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Severity color helper
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return colors.error;
      case "major": return "#F97316";
      case "minor": return colors.warning;
      case "cosmetic": return colors.muted;
      default: return colors.muted;
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case "critical": return "Kritisch";
      case "major": return "Schwer";
      case "minor": return "Leicht";
      case "cosmetic": return "Kosmetisch";
      default: return severity;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return colors.error;
      case "medium": return colors.warning;
      case "low": return colors.success;
      default: return colors.muted;
    }
  };

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

        {/* Results */}
        {result && (
          <View style={styles.resultsSection}>
            {/* Summary */}
            <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.resultCardHeader}>
                <MaterialIcons name="summarize" size={20} color={colors.primary} />
                <Text style={[styles.resultCardTitle, { color: colors.foreground }]}>Zusammenfassung</Text>
              </View>
              <Text style={[styles.resultCardBody, { color: colors.foreground }]}>{result.summary}</Text>
            </View>

            {/* Progress */}
            <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.resultCardHeader}>
                <MaterialIcons name="trending-up" size={20} color={colors.success} />
                <Text style={[styles.resultCardTitle, { color: colors.foreground }]}>Baufortschritt</Text>
                <View style={[styles.progressBadge, { backgroundColor: colors.success + "20" }]}>
                  <Text style={[styles.progressBadgeText, { color: colors.success }]}>
                    {result.progress.overallPercent}%
                  </Text>
                </View>
              </View>
              <Text style={[styles.resultCardBody, { color: colors.muted }]}>
                Phase: {result.progress.phase}
              </Text>
              {result.progress.activeTrades.length > 0 && (
                <View style={styles.tradesList}>
                  <Text style={[styles.tradesLabel, { color: colors.muted }]}>Aktive Gewerke:</Text>
                  <View style={styles.tradesChips}>
                    {result.progress.activeTrades.map((trade, i) => (
                      <View key={i} style={[styles.tradeChip, { backgroundColor: colors.primary + "15" }]}>
                        <Text style={[styles.tradeChipText, { color: colors.primary }]}>{trade}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Defects */}
            {result.defects.length > 0 && (
              <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.resultCardHeader}>
                  <MaterialIcons name="warning" size={20} color={colors.error} />
                  <Text style={[styles.resultCardTitle, { color: colors.foreground }]}>
                    Mängel ({result.defects.length})
                  </Text>
                </View>
                {result.defects.map((defect) => (
                  <View key={defect.id} style={[styles.defectItem, { borderColor: colors.border }]}>
                    <View style={styles.defectHeader}>
                      <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(defect.severity) + "20" }]}>
                        <Text style={[styles.severityText, { color: getSeverityColor(defect.severity) }]}>
                          {getSeverityLabel(defect.severity)}
                        </Text>
                      </View>
                      <Text style={[styles.defectConfidence, { color: colors.muted }]}>
                        {Math.round(defect.confidence * 100)}%
                      </Text>
                    </View>
                    <Text style={[styles.defectTitle, { color: colors.foreground }]}>{defect.title}</Text>
                    <Text style={[styles.defectDescription, { color: colors.muted }]}>{defect.description}</Text>
                    <View style={styles.defectMeta}>
                      <View style={styles.defectMetaItem}>
                        <MaterialIcons name="build" size={12} color={colors.muted} />
                        <Text style={[styles.defectMetaText, { color: colors.muted }]}>{defect.trade}</Text>
                      </View>
                      <View style={styles.defectMetaItem}>
                        <MaterialIcons name="location-on" size={12} color={colors.muted} />
                        <Text style={[styles.defectMetaText, { color: colors.muted }]}>{defect.location}</Text>
                      </View>
                    </View>
                    <View style={[styles.suggestedAction, { backgroundColor: colors.primary + "08" }]}>
                      <MaterialIcons name="lightbulb" size={14} color={colors.primary} />
                      <Text style={[styles.suggestedActionText, { color: colors.foreground }]}>
                        {defect.suggestedAction}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Tasks */}
            {result.tasks.length > 0 && (
              <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.resultCardHeader}>
                  <MaterialIcons name="task-alt" size={20} color={colors.warning} />
                  <Text style={[styles.resultCardTitle, { color: colors.foreground }]}>
                    Aufgaben ({result.tasks.length})
                  </Text>
                </View>
                {result.tasks.map((task) => (
                  <View key={task.id} style={[styles.taskItem, { borderColor: colors.border }]}>
                    <View style={styles.taskHeader}>
                      <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
                      <Text style={[styles.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
                    </View>
                    <Text style={[styles.taskDescription, { color: colors.muted }]}>{task.description}</Text>
                    <View style={styles.taskMeta}>
                      <Text style={[styles.taskMetaText, { color: colors.muted }]}>
                        {task.trade} • {task.estimatedDuration}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Observations */}
            {result.observations.length > 0 && (
              <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.resultCardHeader}>
                  <MaterialIcons name="visibility" size={20} color={colors.muted} />
                  <Text style={[styles.resultCardTitle, { color: colors.foreground }]}>Beobachtungen</Text>
                </View>
                {result.observations.map((obs, i) => (
                  <View key={i} style={styles.observationItem}>
                    <Text style={[styles.observationBullet, { color: colors.primary }]}>•</Text>
                    <Text style={[styles.observationText, { color: colors.foreground }]}>{obs}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
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
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  resultCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  resultCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  resultCardBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  progressBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  progressBadgeText: {
    fontSize: 14,
    fontWeight: "700",
  },
  tradesList: {
    marginTop: 12,
  },
  tradesLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  tradesChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tradeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tradeChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  defectItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  defectHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  defectConfidence: {
    fontSize: 11,
    fontWeight: "600",
  },
  defectTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  defectDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  defectMeta: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 8,
  },
  defectMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  defectMetaText: {
    fontSize: 11,
    fontWeight: "500",
  },
  suggestedAction: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 8,
  },
  suggestedActionText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  taskItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  taskHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  taskDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
    paddingLeft: 16,
  },
  taskMeta: {
    paddingLeft: 16,
  },
  taskMetaText: {
    fontSize: 11,
    fontWeight: "500",
  },
  observationItem: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  observationBullet: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  observationText: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
});
