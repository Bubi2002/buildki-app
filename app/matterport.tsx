import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";
import {
  MATTERPORT_RELEASE_ALLOWED,
  MATTERPORT_RELEASE_HOLD_MESSAGE,
  MATTERPORT_RELEASE_HOLD_TITLE,
} from "@/shared/matterport-compliance";

// We use mutations for all Matterport API calls since they are imperative (user-triggered)

interface MatterportModel {
  id: string;
  name: string;
  description?: string;
  created: string;
  modified: string;
  visibility: string;
  address?: {
    locality?: string;
    administrativeArea?: string;
    countryName?: string;
  };
}

interface ModelDetails {
  id: string;
  name: string;
  description?: string;
  created: string;
  modified: string;
  visibility: string;
  address?: {
    streetAddressLines?: string;
    locality?: string;
    administrativeArea?: string;
    countryName?: string;
    postalCode?: string;
  };
  assets?: {
    panos?: { count: number };
    photos?: { count: number };
    meshes?: { count: number };
  };
  floors?: { id: string; label: string; sequence: number }[];
  rooms?: { id: string; label: string; floor?: { id: string; label: string } }[];
  mattertags?: { id: string; label: string; description?: string; position?: { x: number; y: number; z: number } }[];
  sweeps?: { id: string; position: { x: number; y: number; z: number } }[];
}

type ViewMode = "connect" | "models" | "detail";

// Vertrags- und Release-Gate: bis zur schriftlichen kommerziellen Freigabe fail-closed.
const MATTERPORT_PRODUCTION_ENABLED = MATTERPORT_RELEASE_ALLOWED;

export default function MatterportScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useTranslation();

  const [viewMode, setViewMode] = useState<ViewMode>("connect");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<MatterportModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelDetails | null>(null);
  const [totalModels, setTotalModels] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  // tRPC mutations
  const connectMutation = trpc.matterport.connect.useMutation();
  const listModelsMutation = trpc.matterport.listModels.useMutation();
  const getModelMutation = trpc.matterport.getModel.useMutation();

  useEffect(() => {
    AsyncStorage.removeItem("matterport_credentials").catch(() => undefined);
  }, []);

  if (!MATTERPORT_RELEASE_ALLOWED) {
    return (
      <ScreenContainer className="p-0">
        <View style={[styles.navHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.navTitle, { color: colors.foreground }]}>Matterport</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
          <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="gpp-maybe" size={34} color="#F59E0B" />
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 14 }]}>
              {MATTERPORT_RELEASE_HOLD_TITLE}
            </Text>
            <Text style={[styles.detailText, { color: colors.muted, marginTop: 12 }]}>
              {MATTERPORT_RELEASE_HOLD_MESSAGE}
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  const testConnection = async () => {
    setIsLoading(true);
    setStatusMessage("");

    try {
      const result = await connectMutation.mutateAsync({});

      if (result.success) {
        setIsConnected(true);
        setStatusMessage(t("matterport_verbindung_erfolgreich"));
        // Auto-switch to models view
        setTimeout(() => {
          setViewMode("models");
          loadModels();
        }, 1000);
      }
    } catch  {
      setStatusMessage(t("matterport_verbindung_fehlgeschlagen"));
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadModels = async () => {
    setIsLoading(true);
    try {
      const result = await listModelsMutation.mutateAsync({
        pageSize: 50,
      });

      setModels(result.results || []);
      setTotalModels(result.totalResults || 0);
    } catch (error: any) {
      Alert.alert(t("matterport_fehler" as any), t("matterport_modelle_laden_fehler" as any) + (error.message || t("matterport_unbekannter_fehler" as any)));
    } finally {
      setIsLoading(false);
    }
  };

  const loadModelDetails = async (modelId: string) => {
    setIsLoading(true);
    try {
      const result = await getModelMutation.mutateAsync({
        modelId,
      });

      setSelectedModel(result as ModelDetails);
      setViewMode("detail");
    } catch (error: any) {
      Alert.alert(t("matterport_fehler" as any), t("matterport_modell_details_fehler" as any) + (error.message || ""));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    setIsConnected(false);
    setModels([]);
    setSelectedModel(null);
    setViewMode("connect");
    setStatusMessage("");
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  // ===== CONNECT VIEW =====
  const renderConnectView = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="view-in-ar" size={28} color="#00B0FF" />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Matterport
          </Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
          {t("matterport_konto_verbinden_desc" as any)}
        </Text>
      </View>

      {/* Status */}
      <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.statusRow}>
          <MaterialIcons
            name={isConnected ? "check-circle" : "cancel"}
            size={20}
            color={isConnected ? colors.success : colors.error}
          />
          <Text style={[styles.statusText, { color: colors.foreground }]}>
            {isConnected ? t("matterport_verbunden") : t("matterport_nicht_verbunden")}
          </Text>
        </View>
        {isConnected && (
          <Pressable
            onPress={disconnect}
            style={({ pressed }) => [styles.disconnectBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.disconnectText, { color: colors.error }]}>{t("matterport_trennen" as any)}</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 16 }]}>
        <MaterialIcons name="security" size={18} color="#00B0FF" />
        <Text style={[styles.infoText, { color: colors.foreground }]}>
          {t("matterport_secrets_hinweis" as any)}
        </Text>
      </View>

      {/* Status Message */}
      {statusMessage ? (
        <View style={[styles.messageBox, {
          backgroundColor: statusMessage.includes("erfolgreich") || statusMessage.includes("successful")
            ? "rgba(34, 197, 94, 0.1)"
            : "rgba(239, 68, 68, 0.1)",
          borderColor: statusMessage.includes("erfolgreich") || statusMessage.includes("successful")
            ? colors.success
            : colors.error,
        }]}>
          <Text style={{
            color: statusMessage.includes("erfolgreich") || statusMessage.includes("successful")
              ? colors.success
              : colors.error,
            fontSize: 14,
          }}>
            {statusMessage}
          </Text>
        </View>
      ) : null}

      {/* Connect Button */}
      <Pressable
        onPress={testConnection}
        disabled={isLoading}
        style={({ pressed }) => [
          styles.connectButton,
          { backgroundColor: "#00B0FF", opacity: pressed || isLoading ? 0.7 : 1 },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialIcons name="link" size={20} color="#fff" />
            <Text style={styles.connectButtonText}>{t("matterport_verbindung_testen")}</Text>
          </>
        )}
      </Pressable>

      {/* Info Box */}
      <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="info-outline" size={18} color={colors.muted} />
        <Text style={[styles.infoText, { color: colors.muted }]}>
          {t("matterport_funktion_hinweis" as any)}
        </Text>
      </View>
    </ScrollView>
  );

  // ===== MODELS VIEW =====
  const renderModelsView = () => (
    <View style={{ flex: 1 }}>
      {/* Header with back and sync */}
      <View style={styles.modelsHeader}>
        <Pressable onPress={() => setViewMode("connect")} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.modelsTitle, { color: colors.foreground }]}>
          {t("matterport_modelle")} ({totalModels})
        </Text>
        <Pressable
          onPress={() => loadModels()}
          disabled={isLoading}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <MaterialIcons name="sync" size={24} color="#00B0FF" />
        </Pressable>
      </View>

      {isLoading && models.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00B0FF" />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            {t("matterport_modelle_laden")}
          </Text>
        </View>
      ) : models.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="view-in-ar" size={48} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {t("matterport_keine_modelle")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={models}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => loadModelDetails(item.id)}
              style={({ pressed }) => [
                styles.modelCard,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <View style={styles.modelCardHeader}>
                <MaterialIcons name="view-in-ar" size={24} color="#00B0FF" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.modelName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.address?.locality && (
                    <Text style={[styles.modelAddress, { color: colors.muted }]} numberOfLines={1}>
                      {[item.address.locality, item.address.administrativeArea, item.address.countryName]
                        .filter(Boolean)
                        .join(", ")}
                    </Text>
                  )}
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
              </View>
              <View style={styles.modelMeta}>
                <Text style={[styles.modelMetaText, { color: colors.muted }]}>
                  {t("matterport_erstellt" as any)}: {formatDate(item.created)}
                </Text>
                <Text style={[styles.modelMetaText, { color: colors.muted }]}>
                  {t("matterport_geaendert" as any)}: {formatDate(item.modified)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );

  // ===== DETAIL VIEW =====
  const renderDetailView = () => {
    if (!selectedModel) return null;

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Header */}
        <View style={styles.detailHeader}>
          <Pressable onPress={() => setViewMode("models")} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.detailTitle, { color: colors.foreground }]} numberOfLines={1}>
            {selectedModel.name}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Model Info */}
        <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.detailCardTitle, { color: colors.foreground }]}>
            {t("matterport_details")}
          </Text>
          {selectedModel.description && (
            <Text style={[styles.detailText, { color: colors.muted }]}>
              {selectedModel.description}
            </Text>
          )}
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>ID:</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>{selectedModel.id}</Text>
          </View>
          {selectedModel.address && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.muted }]}>{t("matterport_adresse" as any)}:</Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>
                {[
                  selectedModel.address.streetAddressLines,
                  selectedModel.address.postalCode,
                  selectedModel.address.locality,
                  selectedModel.address.countryName,
                ].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>{t("matterport_erstellt" as any)}:</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>{formatDate(selectedModel.created)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>{t("matterport_geaendert" as any)}:</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>{formatDate(selectedModel.modified)}</Text>
          </View>
        </View>

        {/* Assets Stats */}
        {selectedModel.assets && (
          <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.detailCardTitle, { color: colors.foreground }]}>Assets</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <MaterialIcons name="panorama" size={24} color="#00B0FF" />
                <Text style={[styles.statNumber, { color: colors.foreground }]}>
                  {selectedModel.assets.panos?.count || 0}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>{t("matterport_panoramen")}</Text>
              </View>
              <View style={styles.statItem}>
                <MaterialIcons name="photo" size={24} color="#66BB6A" />
                <Text style={[styles.statNumber, { color: colors.foreground }]}>
                  {selectedModel.assets.photos?.count || 0}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>{t("matterport_fotos" as any)}</Text>
              </View>
              <View style={styles.statItem}>
                <MaterialIcons name="view-in-ar" size={24} color="#AB47BC" />
                <Text style={[styles.statNumber, { color: colors.foreground }]}>
                  {selectedModel.assets.meshes?.count || 0}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Meshes</Text>
              </View>
            </View>
          </View>
        )}

        {/* Floors */}
        {selectedModel.floors && selectedModel.floors.length > 0 && (
          <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.detailCardTitle, { color: colors.foreground }]}>
              {t("matterport_etagen")} ({selectedModel.floors.length})
            </Text>
            {selectedModel.floors
              .sort((a, b) => a.sequence - b.sequence)
              .map((floor) => (
                <View key={floor.id} style={styles.listItem}>
                  <MaterialIcons name="layers" size={18} color="#00B0FF" />
                  <Text style={[styles.listItemText, { color: colors.foreground }]}>
                    {floor.label || t("matterport_etage" as any).replace('{n}', String(floor.sequence))}
                  </Text>
                </View>
              ))}
          </View>
        )}

        {/* Rooms */}
        {selectedModel.rooms && selectedModel.rooms.length > 0 && (
          <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.detailCardTitle, { color: colors.foreground }]}>
              {t("matterport_raeume")} ({selectedModel.rooms.length})
            </Text>
            {selectedModel.rooms.map((room) => (
              <View key={room.id} style={styles.listItem}>
                <MaterialIcons name="meeting-room" size={18} color="#66BB6A" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listItemText, { color: colors.foreground }]}>
                    {room.label || t("matterport_unbenannt" as any)}
                  </Text>
                  {room.floor && (
                    <Text style={[styles.listItemSub, { color: colors.muted }]}>
                      {room.floor.label}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* MatterTags */}
        {selectedModel.mattertags && selectedModel.mattertags.length > 0 && (
          <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.detailCardTitle, { color: colors.foreground }]}>
              {t("matterport_tags")} ({selectedModel.mattertags.length})
            </Text>
            {selectedModel.mattertags.slice(0, 20).map((tag) => (
              <View key={tag.id} style={styles.listItem}>
                <MaterialIcons name="local-offer" size={18} color="#FF9800" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listItemText, { color: colors.foreground }]}>
                    {tag.label || t("matterport_ohne_label" as any)}
                  </Text>
                  {tag.description && (
                    <Text style={[styles.listItemSub, { color: colors.muted }]} numberOfLines={2}>
                      {tag.description}
                    </Text>
                  )}
                </View>
              </View>
            ))}
            {selectedModel.mattertags.length > 20 && (
              <Text style={[styles.moreText, { color: colors.muted }]}>
                {t("matterport_weitere_tags" as any).replace('{n}', String(selectedModel.mattertags.length - 20))}
              </Text>
            )}
          </View>
        )}

        {/* Sweeps */}
        {selectedModel.sweeps && selectedModel.sweeps.length > 0 && (
          <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.detailCardTitle, { color: colors.foreground }]}>
              {t("matterport_scanpunkte")} ({selectedModel.sweeps.length})
            </Text>
            <Text style={[styles.detailText, { color: colors.muted }]}>
              {t("matterport_scanpunkte_info" as any).replace('{n}', String(selectedModel.sweeps.length))}
            </Text>
          </View>
        )}

        {/* Open 3D Viewer Button */}
        <Pressable
          onPress={() => {
            // Pass projectId from active_project for room import & defect linking
            AsyncStorage.getItem("active_project").then(stored => {
              const proj = stored ? JSON.parse(stored) : null;
              const projectParam = proj?.id ? `&projectId=${proj.id}` : "";
              router.push(`/matterport-viewer?modelId=${selectedModel.id}${projectParam}` as any);
            }).catch(() => {
              router.push(`/matterport-viewer?modelId=${selectedModel.id}` as any);
            });
          }}
          style={({ pressed }) => [styles.detailCard, { backgroundColor: "#00B0FF", borderColor: "#00B0FF", opacity: pressed ? 0.8 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }]}
        >
          <MaterialIcons name="view-in-ar" size={22} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>{t("matterport_3d_modell_oeffnen" as any)}</Text>
        </Pressable>

        {/* KI-Analyse Features */}
        <View style={[styles.detailCard, { backgroundColor: "rgba(0, 176, 255, 0.05)", borderColor: "#00B0FF" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <MaterialIcons name="auto-awesome" size={20} color="#00B0FF" />
            <Text style={[styles.detailCardTitle, { color: "#00B0FF", marginLeft: 8, marginBottom: 0 }]}>
              {t("matterport_ki_analyse" as any)}
            </Text>
          </View>
          <Text style={[styles.detailText, { color: colors.muted }]}>
            {t("matterport_ki_funktionen_desc" as any)}
          </Text>
          <View style={{ marginTop: 8 }}>
            {[t("matterport_feature_baufortschritt" as any), t("matterport_feature_fehlende_gewerke" as any), t("matterport_feature_maengel_identifizieren" as any), t("matterport_feature_bautagesbericht" as any), t("matterport_feature_aufgaben_ableiten" as any)].map((item, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                <MaterialIcons name="check-circle-outline" size={14} color="#00B0FF" />
                <Text style={[{ marginLeft: 8, fontSize: 13, color: colors.foreground }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  return (
    <ScreenContainer className="p-0">
      {/* Navigation Header */}
      <View style={[styles.navHeader, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>Matterport</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Sandbox Mode Banner */}
      {!MATTERPORT_PRODUCTION_ENABLED && (
        <View style={{ backgroundColor: '#FF980020', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialIcons name="science" size={18} color="#FF9800" />
          <Text style={{ color: '#FF9800', fontSize: 12, fontWeight: '600', flex: 1 }}>
            {t("matterport_sandbox_modus" as any)}
          </Text>
        </View>
      )}

      {/* Tab Switcher (when connected) */}
      {isConnected && viewMode !== "detail" && (
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => setViewMode("connect")}
            style={[styles.tab, viewMode === "connect" && styles.activeTab]}
          >
            <Text style={[styles.tabText, { color: viewMode === "connect" ? "#00B0FF" : colors.muted }]}>
              {t("matterport_verbinden")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setViewMode("models"); loadModels(); }}
            style={[styles.tab, viewMode === "models" && styles.activeTab]}
          >
            <Text style={[styles.tabText, { color: viewMode === "models" ? "#00B0FF" : colors.muted }]}>
              {t("matterport_modelle")}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {viewMode === "connect" && renderConnectView()}
      {viewMode === "models" && renderModelsView()}
      {viewMode === "detail" && renderDetailView()}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  navTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#00B0FF",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  sectionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderWidth: 1,
    borderRadius: 0,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  disconnectText: {
    fontSize: 13,
    fontWeight: "500",
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  messageBox: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 0,
    marginBottom: 16,
  },
  connectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 0,
    marginBottom: 20,
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  infoBox: {
    flexDirection: "row",
    padding: 12,
    borderWidth: 1,
    borderRadius: 0,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  modelsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modelsTitle: {
    fontSize: 18,
    fontWeight: "600",
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
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  modelCard: {
    borderWidth: 1,
    borderRadius: 0,
    padding: 14,
    marginBottom: 10,
  },
  modelCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  modelName: {
    fontSize: 15,
    fontWeight: "600",
  },
  modelAddress: {
    fontSize: 12,
    marginTop: 2,
  },
  modelMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  modelMetaText: {
    fontSize: 11,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  detailCard: {
    borderWidth: 1,
    borderRadius: 0,
    padding: 16,
    marginBottom: 12,
  },
  detailCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 10,
  },
  detailText: {
    fontSize: 13,
    lineHeight: 19,
  },
  detailRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  detailLabel: {
    fontSize: 13,
    width: 80,
  },
  detailValue: {
    fontSize: 13,
    flex: 1,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
    gap: 4,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  listItemText: {
    fontSize: 14,
  },
  listItemSub: {
    fontSize: 11,
    marginTop: 2,
  },
  moreText: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: "italic",
  },
});
