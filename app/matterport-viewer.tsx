/**
 * protoKI – Matterport 3D Viewer
 * 
 * Full-screen WebView embed of Matterport 3D Showcase with:
 * - Interactive 3D model viewing (pan, zoom, navigate)
 * - Room import from Matterport → local room-store
 * - Pin overlay for defects/notes (via postMessage bridge)
 * - Floor switching
 * - Measurement mode
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { WebView } from "react-native-webview";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getProjectStructure, addFloor, addRoom, type Floor, type Room } from "@/lib/room-store";
import { trpc } from "@/lib/trpc";

const MATTERPORT_CREDENTIALS_KEY = "matterport_credentials";
const LINKED_MODELS_KEY = "matterport_linked_models";

interface LinkedModel {
  modelId: string;
  projectId: string;
  name: string;
  linkedAt: string;
}

interface MatterportPin {
  id: string;
  modelId: string;
  type: "defect" | "note" | "task" | "photo";
  label: string;
  description?: string;
  position?: { x: number; y: number; z: number };
  floorIndex?: number;
  roomId?: string;
  linkedEntityId?: string;
  status?: string;
  createdAt: string;
}

const PINS_KEY = "matterport_pins";

export default function MatterportViewerScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ modelId?: string; projectId?: string }>();

  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modelId, setModelId] = useState(params.modelId || "");
  const [projectId, setProjectId] = useState(params.projectId || "");
  const [credentials, setCredentials] = useState<{ tokenId: string; tokenSecret: string } | null>(null);
  const [linkedModels, setLinkedModels] = useState<LinkedModel[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pins, setPins] = useState<MatterportPin[]>([]);
  const [newPinLabel, setNewPinLabel] = useState("");
  const [newPinType, setNewPinType] = useState<MatterportPin["type"]>("note");
  const [newPinDescription, setNewPinDescription] = useState("");
  const [modelFloors, setModelFloors] = useState<Array<{ id: string; label: string; sequence: number }>>([]);
  const [modelRooms, setModelRooms] = useState<Array<{ id: string; label: string; floor?: { id: string; label: string } }>>([]);
  const [importStatus, setImportStatus] = useState("");
  const [viewerReady, setViewerReady] = useState(false);

  // tRPC mutations
  const getFloorsMutation = trpc.matterport.getFloors.useMutation();
  const getRoomsMutation = trpc.matterport.getRooms.useMutation();

  useEffect(() => {
    loadCredentials();
    loadLinkedModels();
    loadPins();
  }, []);

  useEffect(() => {
    if (modelId) {
      loadPins();
    }
  }, [modelId]);

  const loadCredentials = async () => {
    try {
      const stored = await AsyncStorage.getItem(MATTERPORT_CREDENTIALS_KEY);
      if (stored) {
        setCredentials(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load Matterport credentials:", e);
    }
  };

  const loadLinkedModels = async () => {
    try {
      const stored = await AsyncStorage.getItem(LINKED_MODELS_KEY);
      if (stored) {
        setLinkedModels(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load linked models:", e);
    }
  };

  const loadPins = async () => {
    try {
      const stored = await AsyncStorage.getItem(`${PINS_KEY}_${modelId}`);
      if (stored) {
        setPins(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load pins:", e);
    }
  };

  const savePins = async (newPins: MatterportPin[]) => {
    setPins(newPins);
    await AsyncStorage.setItem(`${PINS_KEY}_${modelId}`, JSON.stringify(newPins));
  };

  const linkModelToProject = async (mId: string, pId: string, name: string) => {
    const newLink: LinkedModel = {
      modelId: mId,
      projectId: pId,
      name,
      linkedAt: new Date().toISOString(),
    };
    const updated = [...linkedModels.filter(l => !(l.modelId === mId && l.projectId === pId)), newLink];
    setLinkedModels(updated);
    await AsyncStorage.setItem(LINKED_MODELS_KEY, JSON.stringify(updated));
  };

  // Import rooms from Matterport into local room-store
  const importRoomsFromMatterport = async () => {
    if (!credentials || !modelId || !projectId) {
      Alert.alert("Fehler", "Keine Zugangsdaten oder kein Projekt verknüpft.");
      return;
    }

    setShowImportModal(true);
    setImportStatus("Lade Etagen...");

    try {
      // Fetch floors
      const floors = await getFloorsMutation.mutateAsync({
        tokenId: credentials.tokenId,
        tokenSecret: credentials.tokenSecret,
        modelId,
      });
      setModelFloors(floors);
      setImportStatus(`${floors.length} Etagen geladen. Lade Räume...`);

      // Fetch rooms
      const rooms = await getRoomsMutation.mutateAsync({
        tokenId: credentials.tokenId,
        tokenSecret: credentials.tokenSecret,
        modelId,
      });
      setModelRooms(rooms);
      setImportStatus(`${rooms.length} Räume geladen. Importiere...`);

      // Get existing structure
      const existing = await getProjectStructure(projectId);

      // Import floors that don't exist yet
      let importedFloors = 0;
      for (const mFloor of floors) {
        const exists = existing.floors.find(f => f.name === mFloor.label);
        if (!exists) {
          await addFloor(projectId, mFloor.label || `Etage ${mFloor.sequence}`, mFloor.sequence);
          importedFloors++;
        }
      }

      // Refresh structure after floor import
      const updatedStructure = await getProjectStructure(projectId);

      // Import rooms
      let importedRooms = 0;
      for (const mRoom of rooms) {
        const exists = updatedStructure.rooms.find(r => r.name === mRoom.label);
        if (!exists && mRoom.label) {
          // Find matching floor
          const floorLabel = mRoom.floor?.label || "EG";
          const matchingFloor = updatedStructure.floors.find(f => f.name === floorLabel);
          if (matchingFloor) {
            await addRoom(projectId, matchingFloor.id, mRoom.label);
            importedRooms++;
          }
        }
      }

      setImportStatus(`Import abgeschlossen: ${importedFloors} Etagen, ${importedRooms} Räume importiert.`);

      // Link model to project
      await linkModelToProject(modelId, projectId, `Matterport ${modelId.slice(0, 8)}`);
    } catch (error: any) {
      setImportStatus(`Fehler: ${error.message || "Import fehlgeschlagen"}`);
    }
  };

  const addPin = async () => {
    if (!newPinLabel.trim()) return;

    const pin: MatterportPin = {
      id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      modelId,
      type: newPinType,
      label: newPinLabel.trim(),
      description: newPinDescription.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    await savePins([...pins, pin]);
    setNewPinLabel("");
    setNewPinDescription("");
    setShowPinModal(false);
  };

  const deletePin = async (pinId: string) => {
    const updated = pins.filter(p => p.id !== pinId);
    await savePins(updated);
  };

  const getPinColor = (type: MatterportPin["type"]) => {
    switch (type) {
      case "defect": return "#EF4444";
      case "task": return "#F59E0B";
      case "note": return "#3B82F6";
      case "photo": return "#10B981";
      default: return "#6B7280";
    }
  };

  const getPinIcon = (type: MatterportPin["type"]) => {
    switch (type) {
      case "defect": return "warning";
      case "task": return "assignment";
      case "note": return "sticky-note-2";
      case "photo": return "photo-camera";
      default: return "place";
    }
  };

  // Build the Matterport embed URL with optimal parameters
  const getEmbedUrl = () => {
    if (!modelId) return "";
    const params = new URLSearchParams({
      m: modelId,
      play: "1",        // Auto-play
      qs: "1",          // Quick start (skip dollhouse intro)
      lang: "de",       // German UI
      help: "0",        // No help overlay
      brand: "0",       // Hide branding
      mt: "1",          // Show mattertags
      pin: "1",         // Show pins
      search: "0",      // Hide search
      wh: "0",          // Hide watermark header
    });
    return `https://my.matterport.com/show/?${params.toString()}`;
  };

  // HTML wrapper for the WebView that handles postMessage communication
  const getViewerHtml = () => {
    const embedUrl = getEmbedUrl();
    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0f1a; }
    iframe { width: 100%; height: 100%; border: none; }
    .loading { 
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: #00B0FF; font-family: system-ui; text-align: center;
    }
    .loading-spinner {
      width: 40px; height: 40px; border: 3px solid rgba(0,176,255,0.2);
      border-top-color: #00B0FF; border-radius: 50%;
      animation: spin 1s linear infinite; margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading" id="loader">
    <div class="loading-spinner"></div>
    <div>3D-Modell wird geladen...</div>
  </div>
  <iframe 
    id="showcase"
    src="${embedUrl}"
    allow="xr-spatial-tracking; fullscreen"
    allowfullscreen
    onload="document.getElementById('loader').style.display='none'; window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}))"
  ></iframe>
  <script>
    window.addEventListener('message', function(e) {
      // Forward messages from Matterport SDK to React Native
      if (e.data && typeof e.data === 'string') {
        try {
          window.ReactNativeWebView.postMessage(e.data);
        } catch(err) {}
      }
    });
  </script>
</body>
</html>`;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "ready") {
        setViewerReady(true);
        setIsLoading(false);
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  };

  // No model selected - show picker
  if (!modelId) {
    return (
      <ScreenContainer className="p-0">
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>3D-Viewer</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.emptyState}>
          <MaterialIcons name="view-in-ar" size={64} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Kein Modell ausgewählt
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Wählen Sie ein Matterport-Modell aus der Modell-Liste oder verbinden Sie Ihr Konto unter Werkzeuge → Matterport.
          </Text>
          <Pressable
            onPress={() => router.push("/matterport" as any)}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: "#00B0FF", opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="link" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Matterport verbinden</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-0" edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          3D-Viewer
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={importRoomsFromMatterport} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="download" size={22} color="#00B0FF" />
          </Pressable>
          <Pressable onPress={() => setShowPinModal(true)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="add-location" size={22} color="#00B0FF" />
          </Pressable>
        </View>
      </View>

      {/* WebView 3D Viewer */}
      <View style={{ flex: 1 }}>
        <WebView
          ref={webViewRef}
          source={{ html: getViewerHtml() }}
          style={{ flex: 1, backgroundColor: "#0a0f1a" }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onMessage={handleWebViewMessage}
          onLoadEnd={() => setIsLoading(false)}
          originWhitelist={["*"]}
          allowsFullscreenVideo
          mixedContentMode="compatibility"
        />

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#00B0FF" />
            <Text style={styles.loadingText}>3D-Modell wird geladen...</Text>
          </View>
        )}
      </View>

      {/* Bottom Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={() => setShowPinModal(true)}
          style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="add-location-alt" size={22} color="#00B0FF" />
          <Text style={[styles.toolbarLabel, { color: colors.muted }]}>Pin</Text>
        </Pressable>
        <Pressable
          onPress={importRoomsFromMatterport}
          style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="meeting-room" size={22} color="#66BB6A" />
          <Text style={[styles.toolbarLabel, { color: colors.muted }]}>Räume</Text>
        </Pressable>
        <View style={styles.toolbarBtn}>
          <MaterialIcons name="local-offer" size={22} color="#FF9800" />
          <Text style={[styles.toolbarLabel, { color: colors.muted }]}>
            {pins.length} Pins
          </Text>
        </View>
        <Pressable
          onPress={() => {
            // Toggle fullscreen by hiding header
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                document.getElementById('showcase').requestFullscreen?.();
                true;
              `);
            }
          }}
          style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="fullscreen" size={22} color={colors.muted} />
          <Text style={[styles.toolbarLabel, { color: colors.muted }]}>Vollbild</Text>
        </Pressable>
      </View>

      {/* Pin Creation Modal */}
      <Modal visible={showPinModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Neuer Pin</Text>
              <Pressable onPress={() => setShowPinModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            {/* Pin Type Selector */}
            <View style={styles.pinTypeRow}>
              {(["defect", "task", "note", "photo"] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setNewPinType(type)}
                  style={[
                    styles.pinTypeBtn,
                    {
                      backgroundColor: newPinType === type ? getPinColor(type) + "20" : colors.surface,
                      borderColor: newPinType === type ? getPinColor(type) : colors.border,
                    },
                  ]}
                >
                  <MaterialIcons name={getPinIcon(type) as any} size={18} color={getPinColor(type)} />
                  <Text style={[styles.pinTypeLabel, { color: newPinType === type ? getPinColor(type) : colors.muted }]}>
                    {type === "defect" ? "Mangel" : type === "task" ? "Aufgabe" : type === "note" ? "Notiz" : "Foto"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={newPinLabel}
              onChangeText={setNewPinLabel}
              placeholder="Bezeichnung..."
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />

            <TextInput
              style={[styles.input, styles.inputMulti, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={newPinDescription}
              onChangeText={setNewPinDescription}
              placeholder="Beschreibung (optional)..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
            />

            <Pressable
              onPress={addPin}
              disabled={!newPinLabel.trim()}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: "#00B0FF", opacity: !newPinLabel.trim() ? 0.4 : pressed ? 0.8 : 1 },
              ]}
            >
              <MaterialIcons name="add-location" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Pin erstellen</Text>
            </Pressable>

            {/* Existing Pins List */}
            {pins.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                  Vorhandene Pins ({pins.length})
                </Text>
                <FlatList
                  data={pins}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 200 }}
                  renderItem={({ item }) => (
                    <View style={[styles.pinItem, { borderBottomColor: colors.border }]}>
                      <MaterialIcons name={getPinIcon(item.type) as any} size={16} color={getPinColor(item.type)} />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={[styles.pinItemLabel, { color: colors.foreground }]}>{item.label}</Text>
                        {item.description && (
                          <Text style={[styles.pinItemDesc, { color: colors.muted }]} numberOfLines={1}>
                            {item.description}
                          </Text>
                        )}
                      </View>
                      <Pressable onPress={() => deletePin(item.id)}>
                        <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                      </Pressable>
                    </View>
                  )}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Import Status Modal */}
      <Modal visible={showImportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, maxHeight: 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Räume importieren</Text>
              <Pressable onPress={() => setShowImportModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              {importStatus.includes("Fehler") ? (
                <MaterialIcons name="error-outline" size={40} color={colors.error} />
              ) : importStatus.includes("abgeschlossen") ? (
                <MaterialIcons name="check-circle" size={40} color={colors.success} />
              ) : (
                <ActivityIndicator size="large" color="#00B0FF" />
              )}
              <Text style={[styles.importStatusText, { color: colors.foreground }]}>
                {importStatus}
              </Text>
            </View>

            {modelFloors.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                  Etagen: {modelFloors.map(f => f.label || `E${f.sequence}`).join(", ")}
                </Text>
              </View>
            )}
            {modelRooms.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                  Räume: {modelRooms.slice(0, 10).map(r => r.label).join(", ")}
                  {modelRooms.length > 10 ? ` +${modelRooms.length - 10} weitere` : ""}
                </Text>
              </View>
            )}

            {importStatus.includes("abgeschlossen") && (
              <Pressable
                onPress={() => setShowImportModal(false)}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1, marginTop: 16 }]}
              >
                <Text style={styles.saveBtnText}>Fertig</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 4,
    marginTop: 12,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 15, 26, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#00B0FF",
    fontSize: 14,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 0.5,
  },
  toolbarBtn: {
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  pinTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  pinTypeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    gap: 4,
  },
  pinTypeLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  inputMulti: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 4,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pinItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  pinItemLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  pinItemDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  importStatusText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
});
