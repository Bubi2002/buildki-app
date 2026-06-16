import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CLOUD_PROVIDERS,
  CloudExportProvider,
  exportPhotosToCloud,
  getPreferredProvider,
  getExportHistory,
  type ExportHistoryEntry,
  type CloudExportConfig,
} from "@/lib/cloud-photo-export";

export default function CloudPhotoExportScreen() {
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
  const protocolTitle = params.protocolTitle || "Protokoll";
  const projectName = params.projectName;
  const protocolDate = params.protocolDate;
  const protocolNumber = params.protocolNumber;

  const [isExporting, setIsExporting] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState<CloudExportProvider>("system-share");
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>(
    photos.map((_, i) => i) // All selected by default
  );
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    const pref = await getPreferredProvider();
    setPreferredProvider(pref);
    const history = await getExportHistory();
    setExportHistory(history);
  };

  const togglePhotoSelection = (index: number) => {
    setSelectedPhotos((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const selectAll = () => setSelectedPhotos(photos.map((_, i) => i));
  const deselectAll = () => setSelectedPhotos([]);

  const handleExport = async (provider: CloudExportProvider) => {
    if (selectedPhotos.length === 0) {
      Alert.alert("Keine Fotos ausgewählt", "Bitte wähle mindestens ein Foto zum Exportieren aus.");
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
        "Export erfolgreich",
        `${result.exportedCount} Foto${result.exportedCount !== 1 ? "s" : ""} exportiert.`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } else if (result.error) {
      Alert.alert("Export fehlgeschlagen", result.error);
    }
  };

  const renderProvider = ({ item }: { item: CloudExportConfig }) => (
    <Pressable
      onPress={() => handleExport(item.provider)}
      style={({ pressed }) => [
        styles.providerCard,
        {
          backgroundColor: colors.surface,
          borderColor: preferredProvider === item.provider ? item.color : colors.border,
          borderWidth: preferredProvider === item.provider ? 2 : 1,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.providerIcon, { backgroundColor: item.color + "15" }]}>
        <MaterialIcons name={item.icon as any} size={28} color={item.color} />
      </View>
      <View style={styles.providerInfo}>
        <Text style={[styles.providerLabel, { color: colors.foreground }]}>{item.label}</Text>
        <Text style={[styles.providerDesc, { color: colors.muted }]}>{item.description}</Text>
      </View>
      {preferredProvider === item.provider && (
        <View style={[styles.preferredBadge, { backgroundColor: item.color + "20" }]}>
          <Text style={{ fontSize: 9, color: item.color, fontWeight: "600" }}>Bevorzugt</Text>
        </View>
      )}
      <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );

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
            {item.photoCount} Foto{item.photoCount !== 1 ? "s" : ""} → {providerConfig?.label || item.provider} · {date.toLocaleDateString("de-DE")}
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Fotos exportieren</Text>
        <View style={{ width: 24 }} />
      </View>

      {isExporting ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Exportiere Fotos...</Text>
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
                        {photos.length} Foto{photos.length !== 1 ? "s" : ""} verfügbar
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
                      Auswahl ({selectedPhotos.length}/{photos.length})
                    </Text>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Pressable onPress={selectAll}>
                        <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>Alle</Text>
                      </Pressable>
                      <Pressable onPress={deselectAll}>
                        <Text style={{ fontSize: 13, color: colors.muted }}>Keine</Text>
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
                            Foto {index + 1}
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
                  <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 12 }]}>
                    Exportziel wählen
                  </Text>
                  <Text style={[styles.sectionHint, { color: colors.muted }]}>
                    Die entsprechende Cloud-App muss auf dem Gerät installiert sein.
                  </Text>
                  {CLOUD_PROVIDERS.map((provider) => (
                    <View key={provider.provider}>{renderProvider({ item: provider })}</View>
                  ))}
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
                      Export-Verlauf
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
                      Noch keine Exporte durchgeführt.
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
    borderRadius: 12,
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
    borderRadius: 8,
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
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  providersSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  providerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  providerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
