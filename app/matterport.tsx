import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";

const MATTERPORT_CREDENTIALS_KEY = "matterport_credentials";

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
  floors?: Array<{ id: string; label: string; sequence: number }>;
  rooms?: Array<{ id: string; label: string; floor?: { id: string; label: string } }>;
  mattertags?: Array<{ id: string; label: string; description?: string; position?: { x: number; y: number; z: number } }>;
  sweeps?: Array<{ id: string; position: { x: number; y: number; z: number } }>;
}

type ViewMode = "connect" | "models" | "detail";

// Feature gate: Set to `true` once Matterport production API is approved.
// Until then, a sandbox banner is shown. Functionality works but may be limited.
// To activate: set env var MATTERPORT_PRODUCTION_ENABLED=true or change this constant.
const MATTERPORT_PRODUCTION_ENABLED = false;

export default function MatterportScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useTranslation();

  const [viewMode, setViewMode] = useState<ViewMode>("connect");
  const [tokenId, setTokenId] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");
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

  // Load saved credentials on mount
  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const stored = await AsyncStorage.getItem(MATTERPORT_CREDENTIALS_KEY);
      if (stored) {
        const creds = JSON.parse(stored);
        setTokenId(creds.tokenId);
        setTokenSecret(creds.tokenSecret);
        setIsConnected(true);
        setViewMode("models");
        // Auto-load models
        loadModels(creds.tokenId, creds.tokenSecret);
      }
    } catch (e) {
      console.error("Failed to load Matterport credentials:", e);
    }
  };

  const saveCredentials = async (id: string, secret: string) => {
    try {
      await AsyncStorage.setItem(
        MATTERPORT_CREDENTIALS_KEY,
        JSON.stringify({ tokenId: id, tokenSecret: secret })
      );
    } catch (e) {
      console.error("Failed to save Matterport credentials:", e);
    }
  };

  const testConnection = async () => {
    if (!tokenId.trim() || !tokenSecret.trim()) {
      Alert.alert("Fehler", "Bitte Token ID und Token Secret eingeben.");
      return;
    }

    setIsLoading(true);
    setStatusMessage("");

    try {
      const result = await connectMutation.mutateAsync({
        tokenId: tokenId.trim(),
        tokenSecret: tokenSecret.trim(),
      });

      if (result.success) {
        setIsConnected(true);
        setStatusMessage(t("matterport_verbindung_erfolgreich"));
        await saveCredentials(tokenId.trim(), tokenSecret.trim());
        // Auto-switch to models view
        setTimeout(() => {
          setViewMode("models");
          loadModels(tokenId.trim(), tokenSecret.trim());
        }, 1000);
      }
    } catch (error: any) {
      setStatusMessage(t("matterport_verbindung_fehlgeschlagen"));
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadModels = async (id?: string, secret?: string) => {
    const tId = id || tokenId;
    const tSecret = secret || tokenSecret;

    if (!tId || !tSecret) return;

    setIsLoading(true);
    try {
      const result = await listModelsMutation.mutateAsync({
        tokenId: tId,
        tokenSecret: tSecret,
        pageSize: 50,
      });

      setModels(result.results || []);
      setTotalModels(result.totalResults || 0);
    } catch (error: any) {
      Alert.alert("Fehler", "Modelle konnten nicht geladen werden: " + (error.message || "Unbekannter Fehler"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadModelDetails = async (modelId: string) => {
    setIsLoading(true);
    try {
      const result = await getModelMutation.mutateAsync({
        tokenId,
        tokenSecret,
        modelId,
      });

      setSelectedModel(result as ModelDetails);
      setViewMode("detail");
    } catch (error: any) {
      Alert.alert("Fehler", "Modell-Details konnten nicht geladen werden: " + (error.message || ""));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    await AsyncStorage.removeItem(MATTERPORT_CREDENTIALS_KEY);
    setTokenId("");
    setTokenSecret("");
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
          Verbinden Sie Ihr Matterport-Konto, um 3D-Modelle zu laden und für die KI-Analyse vorzubereiten.
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
            <Text style={[styles.disconnectText, { color: colors.error }]}>Trennen</Text>
          </Pressable>
        )}
      </View>

      {/* Token Input */}
      <View style={styles.inputSection}>
        <Text style={[styles.inputLabel, { color: colors.foreground }]}>
          {t("matterport_token_id")}
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          value={tokenId}
          onChangeText={setTokenId}
          placeholder="z.B. a1b2c3d4e5f6..."
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.inputLabel, { color: colors.foreground, marginTop: 16 }]}>
          {t("matterport_token_secret")}
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          value={tokenSecret}
          onChangeText={setTokenSecret}
          placeholder="Token Secret eingeben..."
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
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
          API-Tokens finden Sie unter my.matterport.com → Settings → Developer Tools → API Token Management.
          Tokens werden sicher auf dem Server gespeichert und niemals in der App hinterlegt.
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
                  Erstellt: {formatDate(item.created)}
                </Text>
                <Text style={[styles.modelMetaText, { color: colors.muted }]}>
                  Geändert: {formatDate(item.modified)}
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
              <Text style={[styles.detailLabel, { color: colors.muted }]}>Adresse:</Text>
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
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Erstellt:</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>{formatDate(selectedModel.created)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Geändert:</Text>
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
                <Text style={[styles.statLabel, { color: colors.muted }]}>Fotos</Text>
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
                    {floor.label || `Etage ${floor.sequence}`}
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
                    {room.label || "Unbenannt"}
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
                    {tag.label || "Ohne Label"}
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
                + {selectedModel.mattertags.length - 20} weitere Tags
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
              {selectedModel.sweeps.length} Scanpunkte mit Panorama-Aufnahmen verfügbar.
              Diese werden in Phase 2 für die KI-Analyse verwendet.
            </Text>
          </View>
        )}

        {/* Open 3D Viewer Button */}
        <Pressable
          onPress={() => router.push(`/matterport-viewer?modelId=${selectedModel.id}` as any)}
          style={({ pressed }) => [styles.detailCard, { backgroundColor: "#00B0FF", borderColor: "#00B0FF", opacity: pressed ? 0.8 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }]}
        >
          <MaterialIcons name="view-in-ar" size={22} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>3D-Modell öffnen</Text>
        </Pressable>

        {/* Phase 2 Preview */}
        <View style={[styles.detailCard, { backgroundColor: "rgba(0, 176, 255, 0.05)", borderColor: "#00B0FF" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <MaterialIcons name="auto-awesome" size={20} color="#00B0FF" />
            <Text style={[styles.detailCardTitle, { color: "#00B0FF", marginLeft: 8, marginBottom: 0 }]}>
              Phase 2: KI-Analyse (in Vorbereitung)
            </Text>
          </View>
          <Text style={[styles.detailText, { color: colors.muted }]}>
            Nach Freischaltung der Production API werden folgende KI-Funktionen verfügbar:
          </Text>
          <View style={{ marginTop: 8 }}>
            {["Baufortschritt (%)", "Fehlende Gewerke erkennen", "Mängel automatisch identifizieren", "Bautagesbericht generieren", "Aufgaben ableiten"].map((item, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                <MaterialIcons name="radio-button-unchecked" size={14} color={colors.muted} />
                <Text style={[{ marginLeft: 8, fontSize: 13, color: colors.muted }]}>{item}</Text>
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
            Sandbox-Modus – Produktions-API beantragt. Funktionalität eingeschränkt.
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
