/**
 * protoKI – Multi-Format Export Screen
 * 
 * Ermöglicht den Export von Mängeln, Aufgaben und Analysen
 * in verschiedene Formate (PDF, CSV, Excel, JSON).
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sharing from "expo-sharing";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { exportService, type ExportFormat, type ExportScope } from "@/lib/export-service";

export default function ExportScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; projectName?: string }>();

  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("pdf");
  const [selectedScope, setSelectedScope] = useState<ExportScope>("full");
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ success: boolean; fileName?: string; filePath?: string; mimeType?: string } | null>(null);

  const formats = exportService.getFormats();
  const scopes = exportService.getScopes();

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

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (params.projectId && params.projectName) {
        setActiveProject({ id: params.projectId, name: decodeURIComponent(params.projectName) });
      } else {
        void loadActiveProject();
      }
    });
  }, [params.projectId, params.projectName]);

  const handleExport = async () => {
    if (!activeProject) {
      Alert.alert(t('export_no_project_title' as any), t('export_no_project_msg' as any));
      return;
    }

    setIsExporting(true);
    setExportResult(null);

    try {
      const result = await exportService.exportData({
        projectId: activeProject.id,
        projectName: activeProject.name,
        format: selectedFormat,
        scope: selectedScope,
      });

      setExportResult(result);

      if (result.success && result.filePath) {
        if (Platform.OS !== "web") {
          const Haptics = await import("expo-haptics");
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        Alert.alert(t('export_failed_title' as any), result.error || t('export_unknown_error' as any));
      }
    } catch (error: any) {
      Alert.alert(t('export_error_title' as any), error.message || t('export_create_failed' as any));
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    if (!exportResult?.filePath) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(exportResult.filePath, {
          mimeType: exportResult.mimeType,
          dialogTitle: `${exportResult.fileName || t('export_export_fallback' as any)} ${t('export_share_word' as any)}`,
        });
      } else {
        Alert.alert(t('export_share_unavailable_title' as any), t('export_share_unavailable_msg' as any));
      }
    } catch  {
      Alert.alert(t('export_error_title' as any), t('export_share_failed' as any));
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('export_title' as any)}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Project Info */}
        {activeProject && (
          <View style={[styles.projectBadge, { backgroundColor: colors.primary + "15" }]}>
            <MaterialIcons name="business" size={16} color={colors.primary} />
            <Text style={[styles.projectName, { color: colors.primary }]}>{activeProject.name}</Text>
          </View>
        )}

        {/* Format Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('export_format' as any)}</Text>
          <View style={styles.optionGrid}>
            {formats.map(format => (
              <Pressable
                key={format.id}
                onPress={() => setSelectedFormat(format.id)}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: selectedFormat === format.id ? colors.primary + "15" : colors.surface,
                    borderColor: selectedFormat === format.id ? colors.primary : colors.border,
                  },
                ]}
              >
                <MaterialIcons
                  name={format.icon as any}
                  size={22}
                  color={selectedFormat === format.id ? colors.primary : colors.muted}
                />
                <Text style={[styles.optionLabel, { color: selectedFormat === format.id ? colors.primary : colors.foreground }]}>
                  {format.label}
                </Text>
                <Text style={[styles.optionDesc, { color: colors.muted }]} numberOfLines={2}>
                  {format.description}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Scope Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('export_scope' as any)}</Text>
          <View style={styles.scopeList}>
            {scopes.map(scope => (
              <Pressable
                key={scope.id}
                onPress={() => setSelectedScope(scope.id)}
                style={[
                  styles.scopeItem,
                  {
                    backgroundColor: selectedScope === scope.id ? colors.primary + "15" : colors.surface,
                    borderColor: selectedScope === scope.id ? colors.primary : colors.border,
                  },
                ]}
              >
                <MaterialIcons
                  name={scope.icon as any}
                  size={18}
                  color={selectedScope === scope.id ? colors.primary : colors.muted}
                />
                <Text style={[styles.scopeLabel, { color: selectedScope === scope.id ? colors.primary : colors.foreground }]}>
                  {scope.label}
                </Text>
                {selectedScope === scope.id && (
                  <MaterialIcons name="check-circle" size={16} color={colors.primary} style={{ marginLeft: "auto" }} />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Export Button */}
        <Pressable
          onPress={handleExport}
          disabled={isExporting}
          style={({ pressed }) => [
            styles.exportButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.9 : isExporting ? 0.6 : 1 },
          ]}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <MaterialIcons name="file-download" size={20} color="#FFF" />
          )}
          <Text style={styles.exportButtonText}>
            {isExporting ? t('export_exporting' as any) : `${t('export_as_prefix' as any)} ${formats.find(f => f.id === selectedFormat)?.label}`}
          </Text>
        </Pressable>

        {/* Result */}
        {exportResult?.success && (
          <View style={[styles.resultCard, { backgroundColor: colors.success + "15", borderColor: colors.success }]}>
            <View style={styles.resultHeader}>
              <MaterialIcons name="check-circle" size={20} color={colors.success} />
              <Text style={[styles.resultTitle, { color: colors.success }]}>{t('export_success' as any)}</Text>
            </View>
            <Text style={[styles.resultFile, { color: colors.foreground }]}>{exportResult.fileName}</Text>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.shareButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="share" size={16} color="#FFF" />
              <Text style={styles.shareButtonText}>{t('export_share_button' as any)}</Text>
            </Pressable>
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
    marginBottom: 20,
  },
  projectName: {
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  optionCard: {
    width: "47%",
    padding: 14,
    borderRadius: 0,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 6,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  optionDesc: {
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
  },
  scopeList: {
    gap: 8,
  },
  scopeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 0,
    borderWidth: 1,
  },
  scopeLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 0,
    marginBottom: 16,
  },
  exportButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  resultCard: {
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    gap: 10,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  resultFile: {
    fontSize: 12,
    fontWeight: "500",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 0,
    marginTop: 4,
  },
  shareButtonText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
