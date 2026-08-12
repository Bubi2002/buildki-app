import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "@/lib/language-provider";
import {
  CLOUD_PROVIDERS,
  CloudExportProvider,
  exportPhotosToCloud,
  getExportHistory,
  type ExportHistoryEntry,
} from "@/lib/cloud-photo-export";

export default function CloudPhotoExportScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    photos?: string;
    protocolTitle?: string;
    projectName?: string;
    protocolDate?: string;
    protocolNumber?: string;
  }>();

  const photos: string[] = params.photos ? JSON.parse(params.photos) : [];
  const protocolTitle = params.protocolTitle || t('cloud_photo_export_protokoll' as any);
  const projectName = params.projectName;
  const protocolDate = params.protocolDate;
  const protocolNumber = params.protocolNumber;

  const [isExporting, setIsExporting] = useState(false);
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>(
    photos.map((_, i) => i) // All selected by default
  );
  const [showHistory, setShowHistory] = useState(false);

  async function loadPreferences() {
    const history = await getExportHistory();
    setExportHistory(history);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadPreferences();
    });
  }, []);

  const togglePhotoSelection = (index: number) => {
    setSelectedPhotos((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const selectAll = () => setSelectedPhotos(photos.map((_, i) => i));
  const deselectAll = () => setSelectedPhotos([]);

  const handleExport = async (provider: CloudExportProvider) => {
    if (selectedPhotos.length === 0) {
      Alert.alert(t('alert_keine_fotos_ausgewaehlt'), t('msg_bitte_waehle_mindestens_ein_foto'));
      return;
    }

    setIsExporting(true);
    const selectedPhotoUris = selectedPhotos.map((i) => photos[i]);

    const result = await exportPhotosToCloud(selectedPhotoUris, {
      provider,
      protocolTitle,
      projectName,
      protocolDate,
      protocolNumber,
    });

    setIsExporting(false);

    if (result.success) {
      Alert.alert(
        t('cloud_photo_export_export_erfolgreich' as any),
        t('cloud_photo_export_exportiert_msg' as any)
          .replace('{count}', String(result.exportedCount))
          .replace('{noun}', result.exportedCount !== 1 ? t('cloud_photo_export_fotos' as any) : t('cloud_photo_export_foto' as any)),
        [{ text: t('ok'), onPress: () => router.back() }]
      );
    } else if (result.error) {
      Alert.alert(t('alert_export_fehlgeschlagen'), result.error);
    }
  };

  const renderHistoryItem = ({ item }: { item: ExportHistoryEntry }) => {
    const providerConfig = CLOUD_PROVIDERS.find((p) => p.provider === item.provider);
    const date = new Date(item.timestamp);
    return (
      <View style={[styles.historyItem, { borderBottomColor: colors.border }]}>
        <MaterialIcons
          name={(providerConfig?.icon || "cloud") as any}
          size={20}
          color={providerConfig?.color || colors.muted}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.historyTitle, { color: colors.foreground }]}>
            {item.protocolTitle}
          </Text>
          <Text style={[styles.historyMeta, { color: colors.muted }]}>
            {item.photoCount} {item.photoCount !== 1 ? t('cloud_photo_export_fotos' as any) : t('cloud_photo_export_foto' as any)} → {providerConfig?.label || item.provider} · {date.toLocaleDateString("de-DE")}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
          <MaterialIcons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('fotos_exportieren')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {isExporting ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>{t('exportiere_fotos')}</Text>
        </View>
      ) : (
        <FlatList
          data={[{ type: "info" }, { type: "selection" }, { type: "providers" }, { type: "history" }]}
          keyExtractor={(item) => item.type}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => {
            if (item.type === "info") {
              return (
                <View style={styles.infoSection}>
                  <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <MaterialIcons name="photo-library" size={32} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.infoTitle, { color: colors.foreground }]}>
                        {photos.length} {photos.length !== 1 ? t('cloud_photo_export_fotos' as any) : t('cloud_photo_export_foto' as any)} {t('cloud_photo_export_verfuegbar' as any)}
                      </Text>
                      <Text style={[styles.infoSubtitle, { color: colors.muted }]}>
                        {protocolTitle}{projectName ? ` · ${projectName}` : ""}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }

            if (item.type === "selection") {
              return (
                <View style={styles.selectionSection}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                      {t('cloud_photo_export_auswahl' as any)} ({selectedPhotos.length}/{photos.length})
                    </Text>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Pressable onPress={selectAll}>
                        <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>{t('all')}</Text>
                      </Pressable>
                      <Pressable onPress={deselectAll}>
                        <Text style={{ fontSize: 13, color: colors.muted }}>{t('none')}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.photoGrid}>
                    {photos.map((uri, index) => (
                      <Pressable
                        key={index}
                        onPress={() => togglePhotoSelection(index)}
                        style={[
                          styles.photoThumb,
                          {
                            borderColor: selectedPhotos.includes(index) ? colors.primary : colors.border,
                            borderWidth: selectedPhotos.includes(index) ? 2 : 1,
                          },
                        ]}
                      >
                        <View style={[styles.photoPlaceholder, { backgroundColor: colors.surface }]}>
                          <MaterialIcons name="image" size={24} color={colors.muted} />
                          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
                            {t('cloud_photo_export_foto' as any)} {index + 1}
                          </Text>
                        </View>
                        {selectedPhotos.includes(index) && (
                          <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                            <MaterialIcons name="check" size={14} color="#FFFFFF" />
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            }

            if (item.type === "providers") {
              return (
                <View style={styles.providersSection}>
                  <Text style={[styles.sectionHint, { color: colors.muted, marginBottom: 14 }]}>
                    {t('cloud_photo_export_cloud_app_hinweis' as any)}
                  </Text>
                  <Pressable
                    onPress={() => handleExport("system-share")}
                    style={({ pressed }) => [styles.exportButton, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <MaterialIcons name="ios-share" size={20} color="#FFFFFF" />
                    <Text style={styles.exportButtonText}>{t('fotos_exportieren')}</Text>
                  </Pressable>
                </View>
              );
            }

            if (item.type === "history") {
              return (
                <View style={styles.historySection}>
                  <Pressable
                    onPress={() => setShowHistory(!showHistory)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                      {t('cloud_photo_export_export_verlauf' as any)}
                    </Text>
                    <MaterialIcons
                      name={showHistory ? "expand-less" : "expand-more"}
                      size={20}
                      color={colors.muted}
                    />
                  </Pressable>
                  {showHistory && exportHistory.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      {exportHistory.slice(0, 10).map((entry) => (
                        <View key={entry.id}>{renderHistoryItem({ item: entry })}</View>
                      ))}
                    </View>
                  )}
                  {showHistory && exportHistory.length === 0 && (
                    <Text style={[styles.emptyText, { color: colors.muted }]}>
                      {t('cloud_photo_export_keine_exporte' as any)}
                    </Text>
                  )}
                </View>
              );
            }

            return null;
          }}
        />
      )}
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
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  infoSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  selectionSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  sectionHint: {
    fontSize: 12,
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 0,
    overflow: "hidden",
    position: "relative",
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  providersSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 10,
  },
  exportButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  providerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 0,
    marginBottom: 10,
    borderWidth: 1,
  },
  providerIcon: {
    width: 44,
    height: 44,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  providerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  providerLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  providerDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  preferredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  historySection: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  historyMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    marginTop: 8,
    fontStyle: "italic",
  },
});
