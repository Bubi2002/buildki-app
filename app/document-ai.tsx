/**
 * protoKI – Document AI Screen
 * 
 * Upload und automatische Analyse von Dokumenten (PDF, DOCX, XLSX, Bilder).
 * Extrahiert Räume, Gewerke, Termine, Ansprechpartner, Aufgaben, Mängel.
 * Ergebnisse fließen in den Knowledge Layer.
 */

import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { DocumentAnalysisDetail } from "@/components/document-analysis-detail";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import {
  DocumentAnalysisError,
  documentAI,
  type DocumentAnalysisResult,
} from "@/lib/document-ai";
import type { DocumentEntity, DocumentCategory } from "@/shared/entities";
import { trpc } from "@/lib/trpc";

export default function DocumentAIScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();

  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [documents, setDocuments] = useState<DocumentEntity[]>([]);
  const [analysisPhase, setAnalysisPhase] = useState<"idle" | "preparing" | "uploading" | "extracting" | "analyzing">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<DocumentAnalysisResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);

  const analysisMutation = trpc.analysis.analyzePhoto.useMutation();
  const uploadPhotoMutation = trpc.analysis.uploadPhoto.useMutation();
  const analyzeDocumentMutation = trpc.analysis.analyzeDocument.useMutation();
  const isAnalyzing = analysisPhase !== "idle";
  const analyzePhoto = analysisMutation.mutateAsync;
  const analyzeDocumentText = analyzeDocumentMutation.mutateAsync;

  const loadDocuments = useCallback(async () => {
    if (!activeProject) return;
    const docs = await documentAI.getDocuments(activeProject.id);
    setDocuments(docs);
  }, [activeProject]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const projectsJson = await AsyncStorage.getItem("projects");
        const lastId = await AsyncStorage.getItem("last-selected-project-id");
        if (!projectsJson || !lastId || cancelled) return;
        const projects = JSON.parse(projectsJson);
        const project = projects.find((candidate: any) => candidate.id === lastId);
        if (!project || cancelled) return;
        const selectedProject = { id: project.id, name: project.name };
        const docs = await documentAI.getDocuments(selectedProject.id);
        if (cancelled) return;
        setActiveProject(selectedProject);
        setDocuments(docs);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    documentAI.setAnalyzeMutation(async (input: any) => await analyzePhoto(input));
    documentAI.setAnalyzeDocumentMutation(async (input: any) => await analyzeDocumentText(input));
  }, [analyzePhoto, analyzeDocumentText]);

  const handlePickDocument = async () => {
    if (!activeProject) {
      Alert.alert(t('document_ai_kein_projekt' as any), t('document_ai_bitte_projekt' as any));
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
      if (fileType === "other") {
        Alert.alert(t('document_ai_format_nicht_unterstuetzt' as any), t('document_ai_format_hinweis' as any));
        return;
      }

      setAnalysisPhase("preparing");
      setAnalysisError(null);
      setShowResult(false);
      setCurrentResult(null);

      let remoteUri: string | undefined;
      if (fileType === "image") {
        setAnalysisPhase("uploading");
        const base64 = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const uploaded = await uploadPhotoMutation.mutateAsync({
          base64,
          mimeType: file.mimeType || "image/jpeg",
          filename: file.name,
        });
        remoteUri = uploaded.url;
        setAnalysisPhase("analyzing");
      } else {
        setAnalysisPhase("extracting");
      }

      const analysisResult = await documentAI.analyzeDocument({
        projectId: activeProject.id,
        projectName: activeProject.name,
        fileUri: file.uri,
        fileName: file.name,
        fileType,
        fileSize: file.size,
        remoteUri,
      });

      setCurrentResult(analysisResult);
      setShowResult(true);
      await loadDocuments();
    } catch (error) {
      const message = error instanceof DocumentAnalysisError
        ? error.userMessage
        : error instanceof Error
          ? error.message
          : t('document_ai_analyse_fehler_fallback' as any);
      setAnalysisError(message);
      Alert.alert(t('document_ai_analyse_nicht_moeglich' as any), message);
    } finally {
      setAnalysisPhase("idle");
    }
  };

  const getAnalysisPhaseLabel = (): string => {
    if (analysisPhase === "preparing") return t('document_ai_phase_vorbereiten' as any);
    if (analysisPhase === "uploading") return t('document_ai_phase_hochladen' as any);
    if (analysisPhase === "extracting") return t('document_ai_phase_auslesen' as any);
    if (analysisPhase === "analyzing") return t('document_ai_phase_auswerten' as any);
    return t('document_ai_upload_analysieren' as any);
  };

  const handleOpenOriginalFile = async (result: DocumentAnalysisResult) => {
    if (!result.fileUri) {
      Alert.alert(t('document_ai_datei_nicht_verfuegbar' as any), t('document_ai_datei_nicht_im_speicher' as any));
      return;
    }
    const mimeType = result.fileType === "pdf"
      ? "application/pdf"
      : result.fileType === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : result.fileType === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : result.fileType === "image"
            ? "image/*"
            : "application/octet-stream";
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.fileUri, {
          mimeType,
          dialogTitle: `${t('document_ai_originaldatei_oeffnen' as any)}: ${result.fileName}`,
        });
      } else {
        await Linking.openURL(result.fileUri);
      }
    } catch {
      Alert.alert(t('document_ai_datei_nicht_verfuegbar' as any), t('document_ai_datei_nicht_geoeffnet' as any));
    }
  };

  const getCategoryLabel = (category: DocumentCategory): string => {
    const labels: Record<DocumentCategory, string> = {
      plan: t('document_ai_cat_plan' as any),
      contract: t('document_ai_cat_vertrag' as any),
      specification: t('document_ai_cat_leistungsverzeichnis' as any),
      protocol: t('document_ai_cat_protokoll' as any),
      invoice: t('document_ai_cat_rechnung' as any),
      correspondence: t('document_ai_cat_korrespondenz' as any),
      permit: t('document_ai_cat_genehmigung' as any),
      certificate: t('document_ai_cat_zertifikat' as any),
      photo_documentation: t('document_ai_cat_fotodokumentation' as any),
      other: t('document_ai_cat_sonstiges' as any),
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
        setOpeningDocumentId(item.id);
        setAnalysisError(null);
        try {
          const result = await documentAI.getAnalysisResult(item.id);
          if (!result) {
            setAnalysisError(`${t('document_ai_fuer' as any)} „${item.fileName}” ${t('document_ai_kein_ergebnis_body' as any)}`);
            return;
          }
          setCurrentResult(result);
          setShowResult(true);
        } finally {
          setOpeningDocumentId(null);
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
              {item.extractedEntities.length} {t('document_ai_entitaeten' as any)}
            </Text>
          )}
        </View>
      </View>
      {openingDocumentId === item.id ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
      )}
    </Pressable>
  );

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
            {getAnalysisPhaseLabel()}
          </Text>
          <Text style={[styles.uploadHint, { color: colors.muted }]}>
            {t('document_ai_upload_hint' as any)}
          </Text>
        </Pressable>
      </View>

      {analysisError && (
        <View style={[styles.errorCard, { borderColor: "#EF4444", backgroundColor: "#EF444412" }]}>
          <MaterialIcons name="error-outline" size={20} color="#EF4444" />
          <View style={styles.errorCopy}>
            <Text style={[styles.errorTitle, { color: colors.foreground }]}>{t('document_ai_analyse_nicht_abgeschlossen' as any)}</Text>
            <Text style={[styles.errorMessage, { color: colors.muted }]}>{analysisError}</Text>
          </View>
          <Pressable onPress={() => setAnalysisError(null)} accessibilityLabel={t('document_ai_fehlerhinweis_schliessen' as any)}>
            <MaterialIcons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      )}

      <DocumentAnalysisDetail
        result={currentResult}
        visible={showResult}
        onClose={() => setShowResult(false)}
        onOpenFile={handleOpenOriginalFile}
      />

      {/* Document List */}
      <View style={styles.listSection}>
        <Text style={[styles.listTitle, { color: colors.foreground }]}>
          {t('document_ai_analysierte_dokumente' as any)} ({documents.length})
        </Text>
        {documents.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="folder-open" size={36} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {t('document_ai_keine_dokumente' as any)}
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
  errorCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  errorCopy: { flex: 1, gap: 3 },
  errorTitle: { fontSize: 13, fontWeight: "700" },
  errorMessage: { fontSize: 12, lineHeight: 17 },
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
