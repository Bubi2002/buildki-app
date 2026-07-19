/**
 * protoKI – Document AI Screen
 * 
 * Upload und automatische Analyse von Dokumenten (PDF, DOCX, XLSX, Bilder).
 * Extrahiert Räume, Gewerke, Termine, Ansprechpartner, Aufgaben, Mängel.
 * Ergebnisse fließen in den Knowledge Layer.
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { documentAI, type DocumentAnalysisResult, type DocumentFileType } from "@/lib/document-ai";
import type { DocumentEntity, DocumentCategory } from "@/shared/entities";
import { trpc } from "@/lib/trpc";

export default function DocumentAIScreen() {
  const colors = useColors();
  const router = useRouter();

  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [documents, setDocuments] = useState<DocumentEntity[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentResult, setCurrentResult] = useState<DocumentAnalysisResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  const analysisMutation = trpc.analysis.analyzePhoto.useMutation();

  useEffect(() => {
    loadActiveProject();
    // Inject mutation into service
    documentAI.setAnalyzeMutation(async (input: any) => {
      return await analysisMutation.mutateAsync(input);
    });
  }, []);

  useEffect(() => {
    if (activeProject) loadDocuments();
  }, [activeProject]);

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

  const loadDocuments = async () => {
    if (!activeProject) return;
    const docs = await documentAI.getDocuments(activeProject.id);
    setDocuments(docs);
  };

  const handlePickDocument = async () => {
    if (!activeProject) {
      Alert.alert("Kein Projekt", "Bitte wähle zuerst ein Projekt aus.");
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "image/*",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      const fileType = documentAI.detectFileType(file.name);

      setIsAnalyzing(true);
      setShowResult(false);

      const analysisResult = await documentAI.analyzeDocument({
        projectId: activeProject.id,
        projectName: activeProject.name,
        fileUri: file.uri,
        fileName: file.name,
        fileType,
      });

      setCurrentResult(analysisResult);
      setShowResult(true);
      await loadDocuments();
    } catch (error) {
      Alert.alert("Fehler", "Dokument konnte nicht analysiert werden.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getCategoryLabel = (category: DocumentCategory): string => {
    const labels: Record<DocumentCategory, string> = {
      plan: "Plan",
      contract: "Vertrag",
      specification: "Leistungsverzeichnis",
      protocol: "Protokoll",
      invoice: "Rechnung",
      correspondence: "Korrespondenz",
      permit: "Genehmigung",
      certificate: "Zertifikat",
      photo_documentation: "Fotodokumentation",
      other: "Sonstiges",
    };
    return labels[category] || category;
  };

  const getFileIcon = (type: string): string => {
    switch (type) {
      case "pdf": return "picture-as-pdf";
      case "docx": return "description";
      case "xlsx": return "table-chart";
      case "image": return "image";
      default: return "insert-drive-file";
    }
  };

  const renderDocument = ({ item }: { item: DocumentEntity }) => (
    <Pressable
      onPress={async () => {
        const result = await documentAI.getAnalysisResult(item.id);
        if (result) {
          setCurrentResult(result);
          setShowResult(true);
        }
      }}
      style={({ pressed }) => [
        styles.docCard,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.docIcon, { backgroundColor: "#F9731615" }]}>
        <MaterialIcons name={getFileIcon(item.fileType) as any} size={20} color="#F97316" />
      </View>
      <View style={styles.docInfo}>
        <Text style={[styles.docTitle, { color: colors.foreground }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.docMeta}>
          <Text style={[styles.docType, { color: colors.muted }]}>
            {item.fileType.toUpperCase()}
          </Text>
          <Text style={[styles.docCategory, { color: colors.primary }]}>
            {getCategoryLabel(item.category || "other")}
          </Text>
          {item.extractedEntities && item.extractedEntities.length > 0 && (
            <Text style={[styles.docEntities, { color: "#10B981" }]}>
              {item.extractedEntities.length} Entitäten
            </Text>
          )}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
    </Pressable>
  );

  const renderResultSection = () => {
    if (!currentResult) return null;

    return (
      <View style={[styles.resultContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.resultHeader}>
          <MaterialIcons name="analytics" size={20} color="#10B981" />
          <Text style={[styles.resultTitle, { color: colors.foreground }]}>Analyse-Ergebnis</Text>
          <Pressable onPress={() => setShowResult(false)}>
            <MaterialIcons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Summary */}
        {currentResult.summary && (
          <Text style={[styles.resultSummary, { color: colors.foreground }]}>
            {currentResult.summary}
          </Text>
        )}

        {/* Extracted data badges */}
        <View style={styles.resultBadges}>
          {currentResult.rooms.length > 0 && (
            <View style={[styles.badge, { backgroundColor: "#14B8A615" }]}>
              <MaterialIcons name="meeting-room" size={12} color="#14B8A6" />
              <Text style={[styles.badgeText, { color: "#14B8A6" }]}>
                {currentResult.rooms.length} Räume
              </Text>
            </View>
          )}
          {currentResult.trades.length > 0 && (
            <View style={[styles.badge, { backgroundColor: "#F59E0B15" }]}>
              <MaterialIcons name="construction" size={12} color="#F59E0B" />
              <Text style={[styles.badgeText, { color: "#F59E0B" }]}>
                {currentResult.trades.length} Gewerke
              </Text>
            </View>
          )}
          {currentResult.persons.length > 0 && (
            <View style={[styles.badge, { backgroundColor: "#06B6D415" }]}>
              <MaterialIcons name="people" size={12} color="#06B6D4" />
              <Text style={[styles.badgeText, { color: "#06B6D4" }]}>
                {currentResult.persons.length} Personen
              </Text>
            </View>
          )}
          {currentResult.appointments.length > 0 && (
            <View style={[styles.badge, { backgroundColor: "#8B5CF615" }]}>
              <MaterialIcons name="event" size={12} color="#8B5CF6" />
              <Text style={[styles.badgeText, { color: "#8B5CF6" }]}>
                {currentResult.appointments.length} Termine
              </Text>
            </View>
          )}
          {currentResult.tasks.length > 0 && (
            <View style={[styles.badge, { backgroundColor: "#3B82F615" }]}>
              <MaterialIcons name="task-alt" size={12} color="#3B82F6" />
              <Text style={[styles.badgeText, { color: "#3B82F6" }]}>
                {currentResult.tasks.length} Aufgaben
              </Text>
            </View>
          )}
          {currentResult.defects.length > 0 && (
            <View style={[styles.badge, { backgroundColor: "#EF444415" }]}>
              <MaterialIcons name="warning" size={12} color="#EF4444" />
              <Text style={[styles.badgeText, { color: "#EF4444" }]}>
                {currentResult.defects.length} Mängel
              </Text>
            </View>
          )}
        </View>

        {/* Confidence */}
        <View style={styles.confidenceRow}>
          <Text style={[styles.confidenceLabel, { color: colors.muted }]}>Confidence:</Text>
          <Text style={[styles.confidenceValue, { color: "#10B981" }]}>
            {currentResult.overallConfidence}%
          </Text>
          <Text style={[styles.processingTime, { color: colors.muted }]}>
            {(currentResult.processingTime / 1000).toFixed(1)}s
          </Text>
        </View>

        {/* Extracted rooms list */}
        {currentResult.rooms.length > 0 && (
          <View style={styles.extractedSection}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Räume</Text>
            <Text style={[styles.sectionContent, { color: colors.muted }]}>
              {currentResult.rooms.join(", ")}
            </Text>
          </View>
        )}

        {/* Extracted trades list */}
        {currentResult.trades.length > 0 && (
          <View style={styles.extractedSection}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Gewerke</Text>
            <Text style={[styles.sectionContent, { color: colors.muted }]}>
              {currentResult.trades.join(", ")}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Document AI</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Upload Button */}
      <View style={styles.uploadSection}>
        <Pressable
          onPress={handlePickDocument}
          disabled={isAnalyzing}
          style={({ pressed }) => [
            styles.uploadButton,
            {
              backgroundColor: isAnalyzing ? colors.muted + "30" : colors.primary + "15",
              borderColor: isAnalyzing ? colors.muted : colors.primary,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          {isAnalyzing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialIcons name="upload-file" size={24} color={colors.primary} />
          )}
          <Text style={[styles.uploadText, { color: isAnalyzing ? colors.muted : colors.primary }]}>
            {isAnalyzing ? "Dokument wird analysiert..." : "Dokument hochladen & analysieren"}
          </Text>
          <Text style={[styles.uploadHint, { color: colors.muted }]}>
            PDF, DOCX, XLSX, Bilder
          </Text>
        </Pressable>
      </View>

      {/* Result */}
      {showResult && renderResultSection()}

      {/* Document List */}
      <View style={styles.listSection}>
        <Text style={[styles.listTitle, { color: colors.foreground }]}>
          Analysierte Dokumente ({documents.length})
        </Text>
        {documents.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="folder-open" size={36} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Noch keine Dokumente analysiert
            </Text>
          </View>
        ) : (
          <FlatList
            data={documents}
            keyExtractor={item => item.id}
            renderItem={renderDocument}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
      </View>
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
  headerTitle: { fontSize: 17, fontWeight: "700" },
  uploadSection: { padding: 16 },
  uploadButton: {
    alignItems: "center",
    gap: 6,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  uploadText: { fontSize: 14, fontWeight: "600" },
  uploadHint: { fontSize: 11 },
  resultContainer: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  resultTitle: { flex: 1, fontSize: 14, fontWeight: "700" },
  resultSummary: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  resultBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  confidenceLabel: { fontSize: 11 },
  confidenceValue: { fontSize: 12, fontWeight: "700" },
  processingTime: { fontSize: 10, marginLeft: "auto" },
  extractedSection: { marginTop: 8 },
  sectionLabel: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  sectionContent: { fontSize: 11, lineHeight: 16 },
  listSection: { flex: 1, paddingHorizontal: 16 },
  listTitle: { fontSize: 14, fontWeight: "700", marginBottom: 10 },
  emptyState: { alignItems: "center", paddingTop: 30, gap: 8 },
  emptyText: { fontSize: 12 },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  docInfo: { flex: 1 },
  docTitle: { fontSize: 13, fontWeight: "600" },
  docMeta: { flexDirection: "row", gap: 8, marginTop: 3 },
  docType: { fontSize: 10, fontWeight: "600" },
  docCategory: { fontSize: 10, fontWeight: "600" },
  docEntities: { fontSize: 10, fontWeight: "600" },
});
