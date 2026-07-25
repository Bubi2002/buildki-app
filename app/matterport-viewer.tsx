/**
 * protoKI – Matterport 3D Viewer (Production)
 * 
 * Full Matterport SDK integration with:
 * - SDK Bridge via postMessage for programmatic 3D control
 * - Interactive pin placement with real 3D coordinates (tap to place)
 * - Defect ↔ Pin linking with position data
 * - Navigation: jump to pin from defect list
 * - Floor switching, view modes (Dollhouse/Floorplan/Inside)
 * - Room import from Matterport → local room-store
 * - Color-coded pin overlay by status (offen/erledigt/überfällig)
 * - Offline fallback with pin list
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
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { WebView } from "react-native-webview";
import { ScreenContainer } from "@/components/screen-container";
import { TradePicker } from "@/components/trade-picker";
import { useColors } from "@/hooks/use-colors";
import { getProjectStructure, addFloor, addRoom } from "@/lib/room-store";
import { trpc } from "@/lib/trpc";

const MATTERPORT_CREDENTIALS_KEY = "matterport_credentials";
const LINKED_MODELS_KEY = "matterport_linked_models";
// Legacy key kept only for non-defect pins (notes, tasks, photos)
const LEGACY_PINS_KEY = "matterport_pins";

interface LinkedModel {
  modelId: string;
  projectId: string;
  name: string;
  linkedAt: string;
}

export interface MatterportPin {
  id: string;
  modelId: string;
  type: "defect" | "note" | "task" | "photo";
  label: string;
  description?: string;
  position?: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  sweepId?: string;
  floorIndex?: number;
  floorName?: string;
  roomId?: string;
  roomName?: string;
  gewerk?: string;
  linkedEntityId?: string;
  status?: string;
  createdAt: string;
}

type ViewMode3D = "inside" | "dollhouse" | "floorplan";

export default function MatterportViewerScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{
    modelId?: string;
    projectId?: string;
    navigateToPin?: string;
    navigateToDefect?: string;
  }>();

  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modelId, setModelId] = useState(params.modelId || "");
  const [projectId, setProjectId] = useState(params.projectId || "");
  const [credentials, setCredentials] = useState<{ tokenId: string; tokenSecret: string } | null>(null);
  const [sdkKey, setSdkKey] = useState("");
  const [linkedModels, setLinkedModels] = useState<LinkedModel[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showPinListModal, setShowPinListModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pins, setPins] = useState<MatterportPin[]>([]);
  const [newPinLabel, setNewPinLabel] = useState("");
  const [newPinType, setNewPinType] = useState<MatterportPin["type"]>("defect");
  const [newPinDescription, setNewPinDescription] = useState("");
  const [newPinFloor, setNewPinFloor] = useState("");
  const [newPinRoom, setNewPinRoom] = useState("");
  const [newPinGewerk, setNewPinGewerk] = useState("");
  const [modelFloors, setModelFloors] = useState<Array<{ id: string; label: string; sequence: number }>>([]);
  const [modelRooms, setModelRooms] = useState<Array<{ id: string; label: string; floor?: { id: string; label: string } }>>([]);
  const [importStatus, setImportStatus] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [hasFullSdk, setHasFullSdk] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [currentViewMode, setCurrentViewMode] = useState<ViewMode3D>("inside");
  const [placementMode, setPlacementMode] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<{ position: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; sweepId?: string; floorIndex?: number } | null>(null);
  const [currentFloor, setCurrentFloor] = useState<number>(0);

  // tRPC
  const getFloorsMutation = trpc.matterport.getFloors.useMutation();
  const getRoomsMutation = trpc.matterport.getRooms.useMutation();
  const sdkKeyQuery = trpc.matterport.getSdkKey.useQuery();

  useEffect(() => {
    loadCredentials();
    loadLinkedModels();
  }, []);

  useEffect(() => {
    if (modelId) loadPins();
  }, [modelId]);

  useEffect(() => {
    if (sdkKeyQuery.data?.sdkKey) {
      setSdkKey(sdkKeyQuery.data.sdkKey);
    }
  }, [sdkKeyQuery.data]);

  // Navigate to pin if requested via params
  useEffect(() => {
    if (sdkReady && params.navigateToPin) {
      const pin = pins.find(p => p.id === params.navigateToPin);
      if (pin) navigateToPin(pin);
    }
    if (sdkReady && params.navigateToDefect) {
      const pin = pins.find(p => p.linkedEntityId === params.navigateToDefect);
      if (pin) navigateToPin(pin);
    }
  }, [sdkReady, params.navigateToPin, params.navigateToDefect, pins]);

  const loadCredentials = async () => {
    try {
      const stored = await AsyncStorage.getItem(MATTERPORT_CREDENTIALS_KEY);
      if (stored) setCredentials(JSON.parse(stored));
    } catch (e) {
      console.error("Failed to load Matterport credentials:", e);
    }
  };

  const loadLinkedModels = async () => {
    try {
      const stored = await AsyncStorage.getItem(LINKED_MODELS_KEY);
      if (stored) setLinkedModels(JSON.parse(stored));
    } catch (e) {}
  };

  const loadPins = async () => {
    try {
      // Primary: Load defect pins from defect-store (Single Source of Truth)
      const { getMatterportDefects } = await import("@/lib/defect-store");
      const matterportDefects = await getMatterportDefects(modelId);
      const defectPins: MatterportPin[] = matterportDefects.map(d => ({
        id: d.pinId || `pin_${d.id}`,
        modelId,
        type: "defect" as const,
        label: d.title,
        description: d.description,
        position: d.matterportPosition,
        normal: d.matterportNormal,
        sweepId: d.matterportSweepId,
        floorIndex: d.matterportFloorIndex,
        floorName: d.matterportFloorName,
        roomId: d.matterportRoomId,
        roomName: d.matterportRoomName,
        gewerk: d.gewerk,
        linkedEntityId: d.id,
        status: d.status,
        createdAt: d.createdAt,
      }));
      // Also load non-defect pins from legacy storage
      const legacyStored = await AsyncStorage.getItem(`${LEGACY_PINS_KEY}_${modelId}`);
      let legacyPins: MatterportPin[] = [];
      if (legacyStored) {
        const parsed = JSON.parse(legacyStored) as MatterportPin[];
        legacyPins = parsed.filter(p => p.type !== "defect");
      }
      setPins([...defectPins, ...legacyPins]);
    } catch (e) {
      // Fallback: try legacy storage
      try {
        const stored = await AsyncStorage.getItem(`${LEGACY_PINS_KEY}_${modelId}`);
        if (stored) setPins(JSON.parse(stored));
      } catch {}
    }
  };

  const savePins = async (newPins: MatterportPin[]) => {
    setPins(newPins);
    // Only save non-defect pins to legacy storage (defect pins live in defect-store)
    const nonDefectPins = newPins.filter(p => p.type !== "defect");
    await AsyncStorage.setItem(`${LEGACY_PINS_KEY}_${modelId}`, JSON.stringify(nonDefectPins));
  };

  const linkModelToProject = async (mId: string, pId: string, name: string) => {
    const newLink: LinkedModel = { modelId: mId, projectId: pId, name, linkedAt: new Date().toISOString() };
    const updated = [...linkedModels.filter(l => !(l.modelId === mId && l.projectId === pId)), newLink];
    setLinkedModels(updated);
    await AsyncStorage.setItem(LINKED_MODELS_KEY, JSON.stringify(updated));
  };

  // ─── SDK Bridge Commands ─────────────────────────────────────────────────────

  const sendSdkCommand = (command: string, args?: any) => {
    if (!webViewRef.current || !sdkReady) return;
    const msg = JSON.stringify({ type: "sdk_command", command, args });
    webViewRef.current.injectJavaScript(`window.handleRNCommand(${JSON.stringify(msg)}); true;`);
  };

  const navigateToPin = (pin: MatterportPin) => {
    if (pin.sweepId) {
      sendSdkCommand("moveTo", { sweepId: pin.sweepId, rotation: pin.position });
    } else if (pin.position) {
      sendSdkCommand("navigateToPosition", { position: pin.position });
    }
  };

  const switchViewMode = (mode: ViewMode3D) => {
    setCurrentViewMode(mode);
    sendSdkCommand("setMode", { mode });
  };

  const switchFloor = (floorIndex: number) => {
    setCurrentFloor(floorIndex);
    sendSdkCommand("setFloor", { floorIndex });
  };

  const togglePlacementMode = () => {
    const newState = !placementMode;
    setPlacementMode(newState);
    sendSdkCommand("setPlacementMode", { enabled: newState });
  };

  // ─── Pin Creation ────────────────────────────────────────────────────────────

  const addPin = async () => {
    if (!newPinLabel.trim()) return;
    const selectedFloor = modelFloors.find(f => f.id === newPinFloor);
    const selectedRoom = modelRooms.find(r => r.id === newPinRoom);

    const pin: MatterportPin = {
      id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      modelId,
      type: newPinType,
      label: newPinLabel.trim(),
      description: newPinDescription.trim() || undefined,
      position: pendingPosition?.position || undefined,
      normal: pendingPosition?.normal || undefined,
      sweepId: pendingPosition?.sweepId || undefined,
      floorIndex: pendingPosition?.floorIndex ?? (selectedFloor ? selectedFloor.sequence : undefined),
      floorName: selectedFloor?.label || undefined,
      roomId: newPinRoom || undefined,
      roomName: selectedRoom?.label || undefined,
      gewerk: newPinGewerk || undefined,
      createdAt: new Date().toISOString(),
    };

    // If pin type is defect, create a linked defect entry with Matterport 3D data (Single Source of Truth)
    if (newPinType === "defect" && projectId) {
      try {
        const { saveDefect, recordDefectCreated } = await import("@/lib/defect-store");
        const defect = {
          id: `defect-${Date.now()}`,
          projectId,
          pinId: pin.id,
          title: newPinLabel.trim(),
          description: newPinDescription.trim(),
          status: "offen" as const,
          priority: "mittel" as const,
          category: "Sonstiges",
          gewerk: newPinGewerk || undefined,
          photos: [] as string[],
          floor: selectedFloor?.label || undefined,
          room: selectedRoom?.label || undefined,
          location: `3D-Modell: ${selectedFloor?.label || ""} ${selectedRoom?.label || ""}`.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: "matterport" as const,
          // Matterport 3D data stored directly on defect (Single Source of Truth)
          matterportModelId: modelId,
          matterportPosition: pendingPosition?.position || undefined,
          matterportNormal: pendingPosition?.normal || undefined,
          matterportSweepId: pendingPosition?.sweepId || undefined,
          matterportFloorIndex: pendingPosition?.floorIndex ?? (selectedFloor ? selectedFloor.sequence : undefined),
          matterportFloorName: selectedFloor?.label || undefined,
          matterportRoomId: newPinRoom || undefined,
          matterportRoomName: selectedRoom?.label || undefined,
        };
        // Generate position code
        if (newPinGewerk && selectedFloor) {
          try {
            const { generatePositionCode } = await import("@/lib/position-numbering");
            const floorNum = selectedFloor.sequence ?? 0;
            const code = await generatePositionCode(projectId, newPinGewerk, floorNum, defect.id);
            (defect as any).positionCode = code;
          } catch {}
        }
        await saveDefect(defect);
        await recordDefectCreated(defect.id);
        pin.linkedEntityId = defect.id;
        pin.status = "offen";
      } catch (e) {
        // Non-critical
      }
    }

    await savePins([...pins, pin]);

    // Add visual tag in 3D model
    if (pin.position) {
      sendSdkCommand("addTag", {
        id: pin.id,
        label: pin.label,
        position: pin.position,
        normal: pin.normal,
        color: getPinColor(pin.type),
      });
    }

    // Reset form
    setNewPinLabel("");
    setNewPinDescription("");
    setNewPinFloor("");
    setNewPinRoom("");
    setNewPinGewerk("");
    setPendingPosition(null);
    setPlacementMode(false);
    setShowPinModal(false);
  };

  const deletePin = async (pinId: string) => {
    const updated = pins.filter(p => p.id !== pinId);
    await savePins(updated);
    sendSdkCommand("removeTag", { id: pinId });
  };

  // ─── Room Import ─────────────────────────────────────────────────────────────

  const importRoomsFromMatterport = async () => {
    if (!credentials || !modelId || !projectId) {
      Alert.alert("Fehler", "Keine Zugangsdaten oder kein Projekt verknüpft.");
      return;
    }
    setShowImportModal(true);
    setImportStatus("Lade Etagen...");
    try {
      const floors = await getFloorsMutation.mutateAsync({ modelId });
      setModelFloors(floors);
      setImportStatus(`${floors.length} Etagen geladen. Lade Räume...`);

      const rooms = await getRoomsMutation.mutateAsync({ modelId });
      setModelRooms(rooms);
      setImportStatus(`${rooms.length} Räume geladen. Importiere...`);

      const existing = await getProjectStructure(projectId);
      let importedFloors = 0;
      for (const mFloor of floors) {
        const exists = existing.floors.find(f => f.name === mFloor.label);
        if (!exists) {
          await addFloor(projectId, mFloor.label || `Etage ${mFloor.sequence}`, mFloor.sequence);
          importedFloors++;
        }
      }
      const updatedStructure = await getProjectStructure(projectId);
      let importedRooms = 0;
      for (const mRoom of rooms) {
        const exists = updatedStructure.rooms.find(r => r.name === mRoom.label);
        if (!exists && mRoom.label) {
          const floorLabel = mRoom.floor?.label || "EG";
          const matchingFloor = updatedStructure.floors.find(f => f.name === floorLabel);
          if (matchingFloor) {
            await addRoom(projectId, matchingFloor.id, mRoom.label);
            importedRooms++;
          }
        }
      }
      setImportStatus(`Import abgeschlossen: ${importedFloors} Etagen, ${importedRooms} Räume importiert.`);
      await linkModelToProject(modelId, projectId, `Matterport ${modelId.slice(0, 8)}`);
    } catch (error: any) {
      setImportStatus(`Fehler: ${error.message || "Import fehlgeschlagen"}`);
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const getPinColor = (type: MatterportPin["type"], status?: string) => {
    if (status === "erledigt" || status === "geschlossen") return "#22C55E";
    if (status === "überfällig") return "#F97316";
    switch (type) {
      case "defect": return "#EF4444";
      case "task": return "#F59E0B";
      case "note": return "#3B82F6";
      case "photo": return "#10B981";
      default: return "#6B7280";
    }
  };

  const getPinIcon = (type: MatterportPin["type"]): string => {
    switch (type) {
      case "defect": return "warning";
      case "task": return "assignment";
      case "note": return "sticky-note-2";
      case "photo": return "photo-camera";
      default: return "place";
    }
  };

  // ─── WebView HTML with SDK Bridge ────────────────────────────────────────────

  const getViewerHtml = () => {
    const applicationKey = sdkKey || "";
    const embedParams = new URLSearchParams({
      m: modelId,
      play: "1",
      qs: "1",
      lang: "de",
      help: "0",
      brand: "0",
      mt: "1",
      pin: "1",
      search: "0",
      wh: "0",
      ...(applicationKey ? { applicationKey } : {}),
    });
    const embedUrl = `https://my.matterport.com/show/?${embedParams.toString()}`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0f1a; }
    iframe { width: 100%; height: 100%; border: none; }
    .loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #00B0FF; font-family: system-ui; text-align: center; }
    .loading-spinner { width: 40px; height: 40px; border: 3px solid rgba(0,176,255,0.2); border-top-color: #00B0FF; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .placement-indicator { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); background: rgba(239,68,68,0.9); color: #fff; padding: 6px 16px; border-radius: 4px; font-size: 13px; font-family: system-ui; display: none; z-index: 1000; pointer-events: none; }
    .placement-indicator.active { display: block; }
  </style>
</head>
<body>
  <div class="loading" id="loader">
    <div class="loading-spinner"></div>
    <div>3D-Modell wird geladen...</div>
  </div>
  <div class="placement-indicator" id="placementBanner">Tippen Sie auf eine Stelle im 3D-Modell</div>
  <iframe id="showcase" src="${embedUrl}" allow="xr-spatial-tracking; fullscreen" allowfullscreen></iframe>
  
  <script type="module">
    let mpSdk = null;
    let placementEnabled = false;
    let currentSweep = null;
    let currentFloor = 0;

    const iframe = document.getElementById('showcase');
    
    // Try to connect SDK after iframe loads
    iframe.addEventListener('load', async () => {
      document.getElementById('loader').style.display = 'none';
      
      // Attempt SDK connection
      try {
        // Method 1: SDK for Embeds via iframe contentWindow
        if (iframe.contentWindow && iframe.contentWindow.MP_SDK) {
          mpSdk = await iframe.contentWindow.MP_SDK.connect(iframe.contentWindow);
        }
      } catch(e) {
      }

      // If SDK connected, set up event listeners
      if (mpSdk) {
        setupSdkListeners();
        sendToRN({ type: 'sdk_ready', hasFullSdk: true });
      } else {
        // Fallback: basic embed without SDK control
        sendToRN({ type: 'sdk_ready', hasFullSdk: false });
      }
    });

    function setupSdkListeners() {
      if (!mpSdk) return;

      // Track current sweep position
      mpSdk.Sweep.current.subscribe((sweep) => {
        if (sweep.id) {
          currentSweep = sweep;
          sendToRN({ type: 'sweep_changed', sweepId: sweep.id, position: sweep.position, rotation: sweep.rotation });
        }
      });

      // Track floor changes
      mpSdk.Floor.current.subscribe((floor) => {
        if (floor.id !== undefined) {
          currentFloor = floor.sequence || 0;
          sendToRN({ type: 'floor_changed', floorIndex: currentFloor, floorId: floor.id });
        }
      });

      // Pointer/intersection for pin placement
      mpSdk.Pointer.intersection.subscribe((intersection) => {
        if (placementEnabled && intersection.object !== 'none') {
          // User tapped a surface - capture 3D position
          const pos = intersection.position;
          const norm = intersection.normal;
          placementEnabled = false;
          document.getElementById('placementBanner').classList.remove('active');
          sendToRN({
            type: 'position_captured',
            position: { x: pos.x, y: pos.y, z: pos.z },
            normal: { x: norm.x, y: norm.y, z: norm.z },
            sweepId: currentSweep?.id || null,
            floorIndex: currentFloor,
          });
        }
      });
    }

    function sendToRN(data) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      } catch(e) {}
    }

    // Handle commands from React Native
    window.handleRNCommand = function(msgStr) {
      try {
        const msg = JSON.parse(msgStr);
        if (msg.type !== 'sdk_command' || !mpSdk) return;
        
        switch(msg.command) {
          case 'moveTo':
            if (msg.args.sweepId) {
              mpSdk.Sweep.moveTo(msg.args.sweepId, {
                rotation: msg.args.rotation || undefined,
                transition: mpSdk.Sweep.Transition.FLY,
              });
            }
            break;
          case 'navigateToPosition':
            // Find nearest sweep to position and navigate there
            mpSdk.Sweep.Collection.find((sweep) => {
              const dx = sweep.position.x - msg.args.position.x;
              const dz = sweep.position.z - msg.args.position.z;
              return Math.sqrt(dx*dx + dz*dz) < 3;
            }).then((sweeps) => {
              if (sweeps.length > 0) {
                mpSdk.Sweep.moveTo(sweeps[0].id, { transition: mpSdk.Sweep.Transition.FLY });
              }
            }).catch(() => {});
            break;
          case 'setMode':
            const modeMap = { inside: mpSdk.Mode.Mode.INSIDE, dollhouse: mpSdk.Mode.Mode.DOLLHOUSE, floorplan: mpSdk.Mode.Mode.FLOORPLAN };
            mpSdk.Mode.moveTo(modeMap[msg.args.mode] || mpSdk.Mode.Mode.INSIDE);
            break;
          case 'setFloor':
            mpSdk.Floor.moveTo(msg.args.floorIndex);
            break;
          case 'setPlacementMode':
            placementEnabled = msg.args.enabled;
            document.getElementById('placementBanner').classList.toggle('active', placementEnabled);
            break;
          case 'addTag':
            mpSdk.Mattertag.add([{
              label: msg.args.label,
              anchorPosition: msg.args.position,
              stemVector: msg.args.normal ? { x: msg.args.normal.x * 0.3, y: msg.args.normal.y * 0.3, z: msg.args.normal.z * 0.3 } : { x: 0, y: 0.3, z: 0 },
              color: { r: parseInt(msg.args.color.slice(1,3),16)/255, g: parseInt(msg.args.color.slice(3,5),16)/255, b: parseInt(msg.args.color.slice(5,7),16)/255 },
            }]).catch(() => {});
            break;
          case 'removeTag':
            // Cannot remove SDK-added tags easily, but we track locally
            break;
        }
      } catch(e) {}
    };

    // Fallback: if SDK doesn't connect within 5s, still report ready
    setTimeout(() => {
      if (!mpSdk) {
        document.getElementById('loader').style.display = 'none';
        sendToRN({ type: 'sdk_ready', hasFullSdk: false });
      }
    }, 8000);
  </script>
</body>
</html>`;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case "sdk_ready":
          setSdkReady(true);
          setHasFullSdk(data.hasFullSdk === true);
          setIsLoading(false);
          break;
        case "position_captured":
          setPendingPosition({
            position: data.position,
            normal: data.normal,
            sweepId: data.sweepId,
            floorIndex: data.floorIndex,
          });
          setShowPinModal(true);
          break;
        case "sweep_changed":
          // Could update UI with current position info
          break;
        case "floor_changed":
          setCurrentFloor(data.floorIndex);
          break;
      }
    } catch (e) {}
  };

  // ─── No Model Selected ──────────────────────────────────────────────────────

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
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Kein Modell ausgewählt</Text>
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

  // ─── Main Viewer ────────────────────────────────────────────────────────────

  return (
    <ScreenContainer className="p-0" edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          3D-Viewer {pins.length > 0 ? `(${pins.length} Pins)` : ""}
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={() => setShowPinListModal(true)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="list" size={22} color="#00B0FF" />
          </Pressable>
          <Pressable onPress={importRoomsFromMatterport} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="download" size={22} color="#00B0FF" />
          </Pressable>
        </View>
      </View>

      {/* SDK Fallback Info Banner */}
      {sdkReady && !hasFullSdk && (
        <View style={{ backgroundColor: "rgba(245,158,11,0.12)", paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <MaterialIcons name="info-outline" size={16} color="#F59E0B" />
          <Text style={{ color: colors.foreground, fontSize: 12, flex: 1 }}>
            Eingeschränkter Modus: 3D-Navigation aktiv, SDK-Steuerung (Pin-Platzierung) erfordert einen gültigen SDK-Key.
          </Text>
        </View>
      )}

      {/* WebView 3D Viewer */}
      <View style={{ flex: 1 }}>
        {loadError ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="wifi-off" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Keine Verbindung</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Das 3D-Modell kann nicht geladen werden. Bitte prüfen Sie Ihre Internetverbindung.
            </Text>
            <Pressable
              onPress={() => { setLoadError(false); setIsLoading(true); }}
              style={({ pressed }) => [styles.actionButton, { backgroundColor: "#00B0FF", opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="refresh" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            ref={webViewRef}
            source={{ html: getViewerHtml() }}
            style={{ flex: 1, backgroundColor: "#0a0f1a" }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onMessage={handleWebViewMessage}
            onLoadEnd={() => {/* wait for sdk_ready message */}}
            onError={() => { setLoadError(true); setIsLoading(false); }}
            onHttpError={() => { setLoadError(true); setIsLoading(false); }}
            originWhitelist={["*"]}
            allowsFullscreenVideo
            mixedContentMode="compatibility"
          />
        )}

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#00B0FF" />
            <Text style={styles.loadingText}>3D-Modell wird geladen...</Text>
          </View>
        )}
      </View>

      {/* Bottom Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {/* Pin Placement */}
        <Pressable
          onPress={togglePlacementMode}
          style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1, backgroundColor: placementMode ? "#EF444420" : "transparent" }]}
        >
          <MaterialIcons name="add-location-alt" size={22} color={placementMode ? "#EF4444" : "#00B0FF"} />
          <Text style={[styles.toolbarLabel, { color: placementMode ? "#EF4444" : colors.muted }]}>
            {placementMode ? "Aktiv" : "Pin"}
          </Text>
        </Pressable>

        {/* View Modes */}
        <Pressable
          onPress={() => switchViewMode(currentViewMode === "inside" ? "dollhouse" : currentViewMode === "dollhouse" ? "floorplan" : "inside")}
          style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons
            name={currentViewMode === "inside" ? "visibility" : currentViewMode === "dollhouse" ? "home" : "layers"}
            size={22}
            color="#66BB6A"
          />
          <Text style={[styles.toolbarLabel, { color: colors.muted }]}>
            {currentViewMode === "inside" ? "Innen" : currentViewMode === "dollhouse" ? "Puppe" : "Plan"}
          </Text>
        </Pressable>

        {/* Floor Switch */}
        {modelFloors.length > 1 && (
          <Pressable
            onPress={() => {
              const nextFloor = (currentFloor + 1) % modelFloors.length;
              switchFloor(nextFloor);
            }}
            style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="stairs" size={22} color="#FF9800" />
            <Text style={[styles.toolbarLabel, { color: colors.muted }]}>
              {modelFloors[currentFloor]?.label || `E${currentFloor}`}
            </Text>
          </Pressable>
        )}

        {/* Pin List */}
        <Pressable
          onPress={() => setShowPinListModal(true)}
          style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="local-offer" size={22} color="#AB47BC" />
          <Text style={[styles.toolbarLabel, { color: colors.muted }]}>{pins.length} Pins</Text>
        </Pressable>

        {/* Fullscreen */}
        <Pressable
          onPress={() => {
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`document.getElementById('showcase').requestFullscreen?.(); true;`);
            }
          }}
          style={({ pressed }) => [styles.toolbarBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="fullscreen" size={22} color={colors.muted} />
          <Text style={[styles.toolbarLabel, { color: colors.muted }]}>Voll</Text>
        </Pressable>
      </View>

      {/* ─── Pin Creation Modal ─────────────────────────────────────────────── */}
      <Modal visible={showPinModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {pendingPosition ? "Pin an 3D-Position" : "Neuer Pin"}
              </Text>
              <Pressable onPress={() => { setShowPinModal(false); setPendingPosition(null); }}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            {/* Position Info */}
            {pendingPosition && (
              <View style={[styles.positionInfo, { backgroundColor: "#00B0FF10", borderColor: "#00B0FF" }]}>
                <MaterialIcons name="place" size={16} color="#00B0FF" />
                <Text style={{ color: "#00B0FF", fontSize: 12, flex: 1 }}>
                  3D-Position erfasst: ({pendingPosition.position.x.toFixed(1)}, {pendingPosition.position.y.toFixed(1)}, {pendingPosition.position.z.toFixed(1)})
                </Text>
              </View>
            )}

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {/* Pin Type Selector */}
              <View style={styles.pinTypeRow}>
                {(["defect", "task", "note", "photo"] as const).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setNewPinType(type)}
                    style={[styles.pinTypeBtn, {
                      backgroundColor: newPinType === type ? getPinColor(type) + "20" : colors.surface,
                      borderColor: newPinType === type ? getPinColor(type) : colors.border,
                    }]}
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

              {/* Floor Picker */}
              {modelFloors.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>Geschoss</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {modelFloors.sort((a, b) => a.sequence - b.sequence).map((f) => (
                      <Pressable
                        key={f.id}
                        onPress={() => { setNewPinFloor(newPinFloor === f.id ? "" : f.id); setNewPinRoom(""); }}
                        style={[styles.chipBtn, { borderColor: newPinFloor === f.id ? "#00B0FF" : colors.border, backgroundColor: newPinFloor === f.id ? "#00B0FF15" : colors.surface }]}
                      >
                        <Text style={{ fontSize: 12, color: newPinFloor === f.id ? "#00B0FF" : colors.muted }}>{f.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Room Picker */}
              {newPinFloor && modelRooms.filter(r => r.floor?.id === newPinFloor).length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>Raum</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {modelRooms.filter(r => r.floor?.id === newPinFloor).map((r) => (
                      <Pressable
                        key={r.id}
                        onPress={() => setNewPinRoom(newPinRoom === r.id ? "" : r.id)}
                        style={[styles.chipBtn, { borderColor: newPinRoom === r.id ? "#00B0FF" : colors.border, backgroundColor: newPinRoom === r.id ? "#00B0FF15" : colors.surface }]}
                      >
                        <Text style={{ fontSize: 12, color: newPinRoom === r.id ? "#00B0FF" : colors.muted }}>{r.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Gewerk Picker */}
              {(newPinType === "defect" || newPinType === "task") && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>Gewerk</Text>
                  <TradePicker
                    value={newPinGewerk}
                    onChange={setNewPinGewerk}
                    placeholder="Gewerk auswählen (optional)"
                    accessibilityLabel="Gewerk für den Matterport-Pin auswählen"
                  />
                </View>
              )}
            </ScrollView>

            <Pressable
              onPress={addPin}
              disabled={!newPinLabel.trim()}
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: "#00B0FF", opacity: !newPinLabel.trim() ? 0.4 : pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="add-location" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Pin erstellen{newPinType === "defect" ? " + Mangel" : ""}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ─── Pin List Modal ─────────────────────────────────────────────────── */}
      <Modal visible={showPinListModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Pins ({pins.length})
              </Text>
              <Pressable onPress={() => setShowPinListModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            {pins.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <MaterialIcons name="place" size={40} color={colors.muted} />
                <Text style={{ color: colors.muted, marginTop: 8, fontSize: 14 }}>
                  Noch keine Pins. Tippen Sie auf &quot;Pin&quot; in der Toolbar, dann auf eine Stelle im 3D-Modell.
                </Text>
              </View>
            ) : (
              <FlatList
                data={pins}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => { navigateToPin(item); setShowPinListModal(false); }}
                    style={({ pressed }) => [styles.pinItem, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name={getPinIcon(item.type) as any} size={18} color={getPinColor(item.type, item.status)} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.pinItemLabel, { color: colors.foreground }]}>{item.label}</Text>
                      <Text style={[styles.pinItemDesc, { color: colors.muted }]} numberOfLines={1}>
                        {[item.floorName, item.roomName, item.gewerk].filter(Boolean).join(" · ") || "Keine Position"}
                        {item.position ? " · 3D" : ""}
                      </Text>
                    </View>
                    {item.linkedEntityId && (
                      <Pressable
                        onPress={() => { setShowPinListModal(false); router.push(`/defects?defectId=${item.linkedEntityId}` as any); }}
                        style={{ padding: 4 }}
                      >
                        <MaterialIcons name="open-in-new" size={16} color="#00B0FF" />
                      </Pressable>
                    )}
                    <Pressable onPress={() => deletePin(item.id)} style={{ padding: 4, marginLeft: 4 }}>
                      <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                    </Pressable>
                  </Pressable>
                )}
              />
            )}

            {/* Quick add without 3D position */}
            <Pressable
              onPress={() => { setShowPinListModal(false); setShowPinModal(true); }}
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1, marginTop: 12 }]}
            >
              <MaterialIcons name="add" size={18} color={colors.foreground} />
              <Text style={[styles.saveBtnText, { color: colors.foreground }]}>Pin ohne 3D-Position</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ─── Import Status Modal ────────────────────────────────────────────── */}
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
              <Text style={[styles.importStatusText, { color: colors.foreground }]}>{importStatus}</Text>
            </View>
            {importStatus.includes("abgeschlossen") && (
              <Pressable
                onPress={() => setShowImportModal(false)}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1, marginTop: 12 }]}
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
  emptyTitle: { fontSize: 20, fontWeight: "600", marginTop: 8 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 0,
    marginTop: 12,
  },
  actionButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 15, 26, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { color: "#00B0FF", fontSize: 14 },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: 0.5,
  },
  toolbarBtn: {
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  toolbarLabel: { fontSize: 10, fontWeight: "500" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "600" },
  positionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 12,
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
    borderRadius: 0,
    borderWidth: 1,
    gap: 4,
  },
  pinTypeLabel: { fontSize: 11, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  inputMulti: { minHeight: 70, textAlignVertical: "top" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 0,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
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
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  pinItemLabel: { fontSize: 14, fontWeight: "500" },
  pinItemDesc: { fontSize: 12, marginTop: 2 },
  importStatusText: { fontSize: 14, textAlign: "center", marginTop: 12, lineHeight: 20 },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 0,
  },
});
