import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import {
  importFromCloud,
  importPlanFromCloud,
  importDocumentsFromCloud,
  importPhotosFromCloud,
  ImportedFile,
  formatFileSize,
  getProviderIcon,
  getProviderName,
  FileCategory,
} from "@/lib/cloud-import-service";
import { saveFloorPlan, FloorPlan } from "@/lib/floor-plan-store";
import { Image as RNImage } from "react-native";
import { useTranslation } from "@/lib/language-provider";

type ImportAction = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  category: FileCategory;
  multiple: boolean;
};

const IMPORT_ACTIONS: ImportAction[] = [
  {
    id: "plan",
    title: "Grundriss / Plan",
    subtitle: "JPG, PNG, PDF – für Planmarkierungen",
    icon: "map",
    color: "#2196F3",
    category: "plan",
    multiple: false,
  },
  {
    id: "photos",
    title: "Fotos importieren",
    subtitle: "Bilder aus Cloud-Speicher laden",
    icon: "photo-library",
    color: "#4CAF50",
    category: "photo",
    multiple: true,
  },
  {
    id: "documents",
    title: "Dokumente",
    subtitle: "PDF, Word, Textdateien",
    icon: "description",
    color: "#FF9800",
    category: "document",
    multiple: true,
  },
  {
    id: "all",
    title: "Alle Dateien",
    subtitle: "Beliebige Dateien importieren",
    icon: "folder-open",
    color: "#9C27B0",
    category: "all",
    multiple: true,
  },
];

export default function CloudImportScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; mode?: string }>();
  const projectId = params.projectId || "";
  const mode = params.mode || "general"; // "general" | "plan" | "photo"

  const [importing, setImporting] = useState(false);
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const handleImport = async (action: ImportAction) => {
    setSelectedAction(action.id);
    setImporting(true);

    try {
      let files: ImportedFile[] = [];

      if (action.category === "plan") {
        const file = await importPlanFromCloud();
        if (file) files = [file];
      } else if (action.category === "photo") {
        files = await importPhotosFromCloud();
      } else if (action.category === "document") {
        files = await importDocumentsFromCloud();
      } else {
        files = await importFromCloud({ category: "all", multiple: action.multiple });
      }

      if (files.length > 0) {
        setImportedFiles((prev) => [...files, ...prev]);

        // If importing a plan, automatically save it as floor plan
        if (action.category === "plan" && files[0]) {
          await savePlanAsFloorPlan(files[0]);
        }

        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        Alert.alert(
          "Import erfolgreich",
          `${files.length} ${files.length === 1 ? "Datei" : "Dateien"} importiert.`,
          [{ text: t('ok') }]
        );
      }
    } catch (error) {
      Alert.alert(t('alert_fehler'), t('msg_beim_import_ist_ein_fehler'));
    } finally {
      setImporting(false);
      setSelectedAction(null);
    }
  };

  const savePlanAsFloorPlan = async (file: ImportedFile) => {
    // Get image dimensions
    return new Promise<void>((resolve) => {
      if (file.mimeType.startsWith("image/")) {
        RNImage.getSize(
          file.uri,
          async (width, height) => {
            const plan: FloorPlan = {
              id: `plan-${Date.now()}`,
              projectId,
              name: file.name.replace(/\.[^/.]+$/, ""),
              imageUri: file.uri,
              width,
              height,
              createdAt: new Date().toISOString(),
            };
            await saveFloorPlan(plan);
            resolve();
          },
          () => {
            // Fallback for PDFs or failed size detection
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  };

  const filteredActions = mode === "plan"
    ? IMPORT_ACTIONS.filter((a) => a.id === "plan")
    : mode === "photo"
    ? IMPORT_ACTIONS.filter((a) => a.id === "photos")
    : IMPORT_ACTIONS;

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
          <MaterialIcons name="arrow-back-ios" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('cloud_import')}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>{t('dropbox_google_drive_icloud')}</Text>
        </View>
      </View>

      <FlatList
        data={[]}
        keyExtractor={() => ""}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={{ padding: 16 }}>
            {/* Cloud Provider Info */}
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.infoIconRow}>
                <View style={[styles.providerBadge, { backgroundColor: "#2196F3" + "15" }]}>
                  <MaterialIcons name="cloud" size={18} color="#2196F3" />
                </View>
                <View style={[styles.providerBadge, { backgroundColor: "#4CAF50" + "15" }]}>
                  <MaterialIcons name="add-to-drive" size={18} color="#4CAF50" />
                </View>
                <View style={[styles.providerBadge, { backgroundColor: "#9E9E9E" + "15" }]}>
                  <MaterialIcons name="cloud-queue" size={18} color="#9E9E9E" />
                </View>
                <View style={[styles.providerBadge, { backgroundColor: "#0078D4" + "15" }]}>
                  <MaterialIcons name="cloud-circle" size={18} color="#0078D4" />
                </View>
              </View>
              <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600", marginTop: 10 }}>
                Dateien aus Cloud-Speichern importieren
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 18 }}>
                Greife auf Dropbox, Google Drive, iCloud Drive und OneDrive zu. Die Dateien werden automatisch in dein Projekt kopiert.
              </Text>
            </View>

            {/* Import Actions */}
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 20, marginBottom: 12 }}>
              Was möchtest du importieren?
            </Text>

            {filteredActions.map((action) => (
              <Pressable
                key={action.id}
                onPress={() => handleImport(action)}
                disabled={importing}
                style={({ pressed }) => [
                  styles.actionCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                  importing && selectedAction === action.id && { borderColor: action.color },
                ]}
              >
                <View style={[styles.actionIcon, { backgroundColor: action.color + "15" }]}>
                  {importing && selectedAction === action.id ? (
                    <ActivityIndicator size="small" color={action.color} />
                  ) : (
                    <MaterialIcons name={action.icon as any} size={24} color={action.color} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{action.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{action.subtitle}</Text>
                </View>
                <MaterialIcons name="cloud-download" size={20} color={colors.muted} />
              </Pressable>
            ))}

            {/* Recently Imported Files */}
            {importedFiles.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
                  Importierte Dateien ({importedFiles.length})
                </Text>
                {importedFiles.map((file) => (
                  <View key={file.id} style={[styles.fileItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.fileIcon, { backgroundColor: colors.primary + "10" }]}>
                      <MaterialIcons
                        name={file.mimeType.startsWith("image/") ? "image" : "insert-drive-file"}
                        size={20}
                        color={colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                        {file.name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
                        <MaterialIcons name={getProviderIcon(file.source) as any} size={12} color={colors.muted} />
                        <Text style={{ fontSize: 11, color: colors.muted }}>{getProviderName(file.source)}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>•</Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{formatFileSize(file.size)}</Text>
                      </View>
                    </View>
                    <MaterialIcons name="check-circle" size={18} color={colors.success} />
                  </View>
                ))}
              </View>
            )}

            {/* Tips */}
            <View style={[styles.tipsCard, { backgroundColor: colors.primary + "08", borderColor: colors.primary + "20" }]}>
              <MaterialIcons name="lightbulb-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>{t('tipp')}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2, lineHeight: 16 }}>
                  Stelle sicher, dass die Cloud-Apps (Dropbox, Google Drive, OneDrive) auf deinem Gerät installiert sind. 
                  Sie erscheinen dann automatisch als Speicherort im Datei-Picker.
                </Text>
              </View>
            </View>
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6, marginRight: 8 },
  title: { fontSize: 20, fontWeight: "800" },
  infoCard: {
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
  },
  infoIconRow: {
    flexDirection: "row",
    gap: 8,
  },
  providerBadge: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 10,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 8,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tipsCard: {
    flexDirection: "row",
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginTop: 24,
  },
});
