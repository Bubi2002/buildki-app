import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  ScrollView,
  Image as RNImage,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  ActivityIndicator,
  InteractionManager,
} from "react-native";
import { Image } from "expo-image";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { FullscreenPhotoViewer } from "@/components/fullscreen-photo-viewer";
import { ZoomableCanvas, type ZoomableCanvasHandle } from "@/components/zoomable-canvas";
import { PhotoAnnotator, type Annotation } from "@/components/photo-annotator";
import { PdfRasterizer, type RasterResult } from "@/components/pdf-rasterizer";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import {
  FloorPlan,
  PlanPin,
  getFloorPlans,
  saveFloorPlan,
  deleteFloorPlan,
  getPlanPins,
  savePlanPin,
  deletePlanPin,
} from "@/lib/floor-plan-store";
import { importPlanFromCloud } from "@/lib/cloud-import-service";
import { getDefects, saveDefect, type Defect } from "@/lib/defect-store";
import { GEWERKE } from "@/lib/defect-pdf-export";
import { AssigneeInput } from "@/components/assignee-input";
import { DateOnlyPicker } from "@/components/date-only-picker";
import { pickImagesWithSource } from "@/lib/import-picker";
import { defectStatusColor } from "@/lib/status-colors";
import { exportFloorPlansPdf } from "@/lib/floor-plan-export";
import { splitPdfIntoPages } from "@/lib/pdf-pages";
import { decodeUnicodeEscapes } from "@/lib/display-text";
import { persistFloorPlanMedia } from "@/lib/floor-plan-media";
import {
  linkPlanPinToProtocol,
  parseProjectProtocolReferences,
  updatePlanPinText,
  type FloorPlanProtocolReference,
} from "@/lib/floor-plan-pin-actions";
import { useTranslation } from "@/lib/language-provider";
import type { Point } from "@/lib/zoom-transform";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const PIN_COLORS: Record<PlanPin["type"], string> = {
  photo: "#2196F3",
  defect: "#F44336",
  note: "#FF9800",
  protocol: "#4CAF50",
  chapter: "#9C27B0",
  task: "#818CF8",
};

const PIN_ICONS: Record<PlanPin["type"], string> = {
  photo: "photo-camera",
  defect: "report-problem",
  note: "edit-note",
  protocol: "description",
  chapter: "bookmark",
  task: "task-alt",
};

const PIN_W = 22, PIN_H = 26;

/**
 * A floor-plan pin rendered in SCREEN space (overlay outside the zoom transform).
 * Its position tracks the canvas's live scale/translation on the UI thread, so
 * the marker stays a CONSTANT size (no counter-scale → crisp, no blur) and never
 * flickers while panning/zooming. nx/ny are canvas-content coordinates.
 */
function AnimatedPin({ nx, ny, color, icon, highlight, scale, translateX, translateY, cw, ch }: {
  nx: number; ny: number; color: string; icon: string; highlight: boolean;
  scale: SharedValue<number>; translateX: SharedValue<number>; translateY: SharedValue<number>;
  cw: number; ch: number;
}) {
  const aStyle = useAnimatedStyle(() => {
    const s = scale.value;
    const sx = (nx - cw / 2) * s + cw / 2 + translateX.value;
    const sy = (ny - ch / 2) * s + ch / 2 + translateY.value;
    return { transform: [{ translateX: sx - PIN_W / 2 }, { translateY: sy - PIN_H }] };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: PIN_W, alignItems: "center" }, aStyle]}>
      <View style={[styles.pinMarker, { backgroundColor: color }, highlight && styles.pinMarkerHighlight]}>
        <MaterialIcons name={icon as any} size={12} color="#FFF" />
      </View>
      <View style={[styles.pinTail, { borderTopColor: color }]} />
    </Animated.View>
  );
}

export default function FloorPlanScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; focusDefect?: string; focusPin?: string }>();
  const projectId = params.projectId || "";
  const focusHandledRef = useRef(false);

  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<FloorPlan | null>(null);
  const [pins, setPins] = useState<PlanPin[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showPlanNameModal, setShowPlanNameModal] = useState(false);
  const [showPinDetail, setShowPinDetail] = useState<PlanPin | null>(null);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pinLabel, setPinLabel] = useState("");
  const [pinType, setPinType] = useState<PlanPin["type"]>("note");
  const [pinDescription, setPinDescription] = useState("");
  // Attach a photo / link a protocol while CREATING a marker (not only afterwards).
  const [newPinPhotos, setNewPinPhotos] = useState<string[]>([]);
  const [newPinProtocol, setNewPinProtocol] = useState<FloorPlanProtocolReference | null>(null);
  const [pinProtoOptions, setPinProtoOptions] = useState<FloorPlanProtocolReference[]>([]);
  const [pinProtoListOpen, setPinProtoListOpen] = useState(false);
  // Mangel marker: either fill in a new defect (Gewerk/Prioritaet/Zustaendig/Frist)
  // or link an existing one from the Maengelliste.
  const [mangelMode, setMangelMode] = useState<"new" | "existing">("new");
  const [newDefectGewerk, setNewDefectGewerk] = useState("");
  const [newDefectPriority, setNewDefectPriority] = useState<"hoch" | "mittel" | "niedrig" | null>(null);
  const [newDefectAssignee, setNewDefectAssignee] = useState("");
  const [newDefectDue, setNewDefectDue] = useState("");
  const [existingDefects, setExistingDefects] = useState<Defect[]>([]);
  const [existingDefectListOpen, setExistingDefectListOpen] = useState(false);
  const [selectedExistingDefect, setSelectedExistingDefect] = useState<Defect | null>(null);
  const [newPlanName, setNewPlanName] = useState("");
  const [pendingPlanAsset, setPendingPlanAsset] = useState<any>(null);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [viewMode, setViewMode] = useState<"plan" | "list">("plan");
  const [filterType, setFilterType] = useState<PlanPin["type"] | "all">("all");
  const [defectsById, setDefectsById] = useState<Record<string, Defect>>({});
  const [hideDone, setHideDone] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [planInteractionActive, setPlanInteractionActive] = useState(false);
  const [zoomResetKey, setZoomResetKey] = useState(0);
  const [drawingPlan, setDrawingPlan] = useState(false);
  const [pdfToConvert, setPdfToConvert] = useState<string | null>(null);
  const [pdfConvertName, setPdfConvertName] = useState("");
  const [converting, setConverting] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<{
    photos: string[];
    title: string;
    initialIndex: number;
  } | null>(null);
  const [movingPin, setMovingPin] = useState<PlanPin | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editingPin, setEditingPin] = useState<PlanPin | null>(null);
  const [editPinLabel, setEditPinLabel] = useState("");
  const [editPinDescription, setEditPinDescription] = useState("");
  const [protocolPickerPin, setProtocolPickerPin] = useState<PlanPin | null>(null);
  const [protocolOptions, setProtocolOptions] = useState<FloorPlanProtocolReference[]>([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [highlightPinId, setHighlightPinId] = useState<string | null>(null);
  const canvasRef = useRef<ZoomableCanvasHandle>(null);
  // Current plan zoom, so pins can be kept a CONSTANT size on screen (and thus
  // anchored exactly on the tapped point) instead of growing with the zoom.
  const [canvasScale, setCanvasScale] = useState(1);
  const rasterResolveRef = useRef<((r: RasterResult | null) => void) | null>(null);
  const mountedRef = useRef(true);
  const plansLoadRequestRef = useRef(0);
  const loadRequestRef = useRef(0);
  const selectedPlanRef = useRef<FloorPlan | null>(null);

  useEffect(() => {
    selectedPlanRef.current = selectedPlan;
  }, [selectedPlan]);

  useEffect(() => () => {
    mountedRef.current = false;
    plansLoadRequestRef.current += 1;
    loadRequestRef.current += 1;
  }, []);

  const selectPlan = useCallback(async (plan: FloorPlan) => {
    const requestId = ++loadRequestRef.current;
    setLoadingPlanId(plan.id);
    try {
      const loadedPins = await getPlanPins(plan.id);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      selectedPlanRef.current = plan;
      setSelectedPlan(plan);
      setPins(loadedPins);
      // Load defects to color status pins and hide resolved ones.
      try {
        const defs = await getDefects(projectId || undefined);
        if (mountedRef.current) setDefectsById(Object.fromEntries(defs.map((d) => [d.id, d])));
      } catch {}
      setImageSize({ width: Math.max(1, plan.width), height: Math.max(1, plan.height) });
      setPendingPin(null);
      setZoomResetKey((value) => value + 1);
    } finally {
      if (mountedRef.current && requestId === loadRequestRef.current) setLoadingPlanId(null);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    const requestId = ++plansLoadRequestRef.current;
    const loaded = await getFloorPlans(projectId);
    if (!mountedRef.current || requestId !== plansLoadRequestRef.current) return;
    setPlans(loaded);
    const currentId = selectedPlanRef.current?.id;
    const nextPlan = loaded.find((plan) => plan.id === currentId) || loaded[0];
    if (nextPlan) {
      await selectPlan(nextPlan);
    } else {
      selectedPlanRef.current = null;
      setSelectedPlan(null);
      setPins([]);
    }
  }, [projectId, selectPlan]);

  useEffect(() => {
    mountedRef.current = true;
    void loadPlans();
  }, [loadPlans]);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadPlans();
      return () => {
        plansLoadRequestRef.current += 1;
        loadRequestRef.current += 1;
      };
    }, [loadPlans])
  );

  // Deep-link: jump to the plan pin of a specific defect (Mangel → Plan).
  useEffect(() => {
    const target = params.focusDefect || params.focusPin;
    if (!target || plans.length === 0 || focusHandledRef.current) return;
    focusHandledRef.current = true;
    (async () => {
      const all = await getPlanPins();
      const pin = params.focusPin
        ? all.find((p) => p.id === params.focusPin)
        : all.find((p) => p.defectId === params.focusDefect);
      if (!pin) return;
      const plan = plans.find((p) => p.id === pin.planId);
      if (plan) await selectPlan(plan);
      setHighlightPinId(pin.id);
      setShowPinDetail(pin);
      setTimeout(() => setHighlightPinId(null), 4000);
    })();
  }, [params.focusDefect, params.focusPin, plans, selectPlan]);

  // Rasterize one PDF (single page) to a sharp image via the PdfRasterizer.
  const rasterizeOne = (uri: string): Promise<RasterResult | null> =>
    new Promise((resolve) => {
      rasterResolveRef.current = resolve;
      setPdfToConvert(uri);
    });

  // Turn rendered PDF pages into one plan each.
  const createPlansFromPages = async (
    pages: { uri: string; width: number; height: number }[],
    baseName: string,
  ) => {
    let firstId: string | null = null;
    const stamp = Date.now();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const planId = `plan-${stamp}-${i}`;
      const optimized = await persistFloorPlanMedia({
        sourceUri: p.uri,
        projectId,
        ownerId: planId,
        width: p.width,
        height: p.height,
        kind: "plan",
      });
      const newPlan: FloorPlan = {
        id: planId,
        projectId,
        name: pages.length > 1 ? `${baseName} – ${t('floor_plan_page' as any)} ${i + 1}` : baseName,
        imageUri: optimized.uri,
        width: optimized.width || p.width || 1000,
        height: optimized.height || p.height || 1000,
        createdAt: new Date().toISOString(),
      };
      await saveFloorPlan(newPlan);
      if (!firstId) firstId = planId;
    }
    await loadPlans();
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const addPlan = async () => {
    // Show options: Galerie or Cloud
    Alert.alert(t('alert_plan_hinzufuegen'), t('msg_woher_moechtest_du_den_plan'), [
      {
        text: t('btn_fotogalerie'),
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1,
          });
          if (!result.canceled && result.assets[0]) {
            setPendingPlanAsset(result.assets[0]);
            setNewPlanName(`Plan ${plans.length + 1}`);
            setShowPlanNameModal(true);
          }
        },
      },
      {
        text: "Cloud (Dropbox, Drive...)",
        onPress: async () => {
          const file = await importPlanFromCloud();
          if (!file) return;
          const isPdf = file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);
          if (isPdf) {
            const baseName = file.name.replace(/\.[^/.]+$/, "");
            // Multi-page: split the PDF into single-page PDFs (pdf-lib), then
            // rasterize each one sharply via the existing expo-image rasterizer.
            let pageUris: string[] = [];
            setConverting(true);
            try {
              pageUris = await splitPdfIntoPages(file.uri);
            } finally {
              setConverting(false);
            }
            if (pageUris.length > 0) {
              const rasters: { uri: string; width: number; height: number }[] = [];
              for (const uri of pageUris) {
                const r = await rasterizeOne(uri);
                if (r) rasters.push({ uri: r.uri, width: r.width, height: r.height });
              }
              if (rasters.length > 0) {
                await createPlansFromPages(rasters, baseName);
                return;
              }
            }
            // Single page (or split failed): rasterize the original directly.
            setPdfConvertName(baseName);
            setPdfToConvert(file.uri);
            return;
          }
          setPendingPlanAsset({ uri: file.uri, width: 1000, height: 1000 });
          setNewPlanName(file.name.replace(/\.[^/.]+$/, ""));
          setShowPlanNameModal(true);
          // Try to get actual dimensions
          RNImage.getSize(file.uri, (w, h) => {
            setPendingPlanAsset((prev: any) => prev ? { ...prev, width: w, height: h } : prev);
          }, () => {});
        },
      },
      { text: t('btn_abbrechen'), style: "cancel" },
    ]);
  };

  // Receive the rasterized PDF (now a sharp JPG) and continue the normal flow.
  const handlePdfConverted = (result: RasterResult | null) => {
    const name = pdfConvertName;
    setPdfToConvert(null);
    // Multi-page queue: hand the result back to the awaiting rasterizeOne().
    if (rasterResolveRef.current) {
      const resolve = rasterResolveRef.current;
      rasterResolveRef.current = null;
      resolve(result);
      return;
    }
    if (!result) {
      Alert.alert(t('alert_fehler' as any), t('floor_plan_pdf_convert_failed' as any));
      return;
    }
    setPendingPlanAsset({ uri: result.uri, width: result.width, height: result.height });
    setNewPlanName(name || `Plan ${plans.length + 1}`);
    setShowPlanNameModal(true);
  };

  // Bake freehand drawings into the current plan image (pins stay intact).
  const handlePlanDrawSave = async (_annotations: Annotation[], flattenedUri?: string) => {
    setDrawingPlan(false);
    const plan = selectedPlan;
    if (!flattenedUri || !plan) return;
    try {
      const optimized = await persistFloorPlanMedia({
        sourceUri: flattenedUri,
        projectId,
        ownerId: plan.id,
        width: plan.width,
        height: plan.height,
        kind: "plan",
      });
      const updated: FloorPlan = {
        ...plan,
        imageUri: optimized.uri,
        width: optimized.width || plan.width,
        height: optimized.height || plan.height,
      };
      await saveFloorPlan(updated);
      setPlans((current) => current.map((p) => (p.id === updated.id ? updated : p)));
      setSelectedPlan(updated);
      selectedPlanRef.current = updated;
      setZoomResetKey((value) => value + 1);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t('alert_fehler' as any), t('floor_plan_draw_failed' as any));
    }
  };

  const savePlanWithName = async () => {
    if (!pendingPlanAsset) return;
    const asset = pendingPlanAsset;
    const planId = `plan-${Date.now()}`;
    const optimized = await persistFloorPlanMedia({
      sourceUri: asset.uri,
      projectId,
      ownerId: planId,
      width: asset.width,
      height: asset.height,
      kind: "plan",
    });
    const newPlan: FloorPlan = {
      id: planId,
      projectId,
      name: newPlanName.trim() || `Plan ${plans.length + 1}`,
      imageUri: optimized.uri,
      width: optimized.width || asset.width || 1000,
      height: optimized.height || asset.height || 1000,
      createdAt: new Date().toISOString(),
    };
    await saveFloorPlan(newPlan);
    setShowPlanNameModal(false);
    setPendingPlanAsset(null);
    setNewPlanName("");
    setPlans((current) => [...current.filter((plan) => plan.id !== newPlan.id), newPlan]);
    await selectPlan(newPlan);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handlePlanTap = (point: Point) => {
    if (!selectedPlan) return;
    // Map the container-normalized tap onto the actually-visible plan rectangle
    // (contentFit="contain" letterbox) so the pin lands exactly where tapped.
    const img = containerPointToImage(point);
    // Move mode: the next tap relocates the selected marking instead of
    // creating a new one or opening a detail.
    if (movingPin) {
      void finishMovePin(img);
      return;
    }
    const nearestPin = filteredPins.reduce<{ pin: PlanPin; distance: number } | null>((nearest, pin) => {
      const distance = Math.hypot(pin.x - img.x, pin.y - img.y);
      return !nearest || distance < nearest.distance ? { pin, distance } : nearest;
    }, null);
    if (nearestPin && nearestPin.distance <= 0.045) {
      setShowPinDetail(nearestPin.pin);
      return;
    }
    setPendingPin(img);
    setPinLabel("");
    setPinDescription("");
    setPinType("note");
    setNewPinPhotos([]);
    setNewPinProtocol(null);
    setPinProtoListOpen(false);
    setPinProtoOptions([]);
    setMangelMode("new");
    setNewDefectGewerk("");
    setNewDefectPriority(null);
    setNewDefectAssignee("");
    setNewDefectDue("");
    setExistingDefectListOpen(false);
    setSelectedExistingDefect(null);
    setShowPinModal(true);
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // Long-press ON a marker, then drag it to move it live; release to drop.
  // "Draufdrücken und verschieben."
  const draggingPinRef = useRef<string | null>(null);
  const handlePinDrag = (phase: "start" | "move" | "end", point: Point) => {
    if (!selectedPlan) return;
    const img = containerPointToImage(point);
    if (phase === "start") {
      // Explicit move mode (via "Verschieben"): drag the chosen pin from
      // anywhere on the plan — it jumps to the finger and follows.
      if (movingPin) {
        draggingPinRef.current = movingPin.id;
        setPins((cur) => cur.map((p) => (p.id === movingPin.id ? { ...p, x: img.x, y: img.y } : p)));
        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }
      const nearestPin = filteredPins.reduce<{ pin: PlanPin; distance: number } | null>((nearest, pin) => {
        const distance = Math.hypot(pin.x - img.x, pin.y - img.y);
        return !nearest || distance < nearest.distance ? { pin, distance } : nearest;
      }, null);
      if (nearestPin && nearestPin.distance <= 0.09) {
        draggingPinRef.current = nearestPin.pin.id;
        setPlanInteractionActive(true);
        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        draggingPinRef.current = null;
      }
    } else if (phase === "move") {
      const id = draggingPinRef.current;
      if (!id) return;
      setPins((cur) => cur.map((p) => (p.id === id ? { ...p, x: img.x, y: img.y } : p)));
    } else {
      const id = draggingPinRef.current;
      draggingPinRef.current = null;
      setPlanInteractionActive(false);
      if (!id) return;
      setPins((cur) => {
        const pin = cur.find((p) => p.id === id);
        if (pin) void savePlanPin({ ...pin, x: img.x, y: img.y });
        return cur.map((p) => (p.id === id ? { ...p, x: img.x, y: img.y } : p));
      });
      if (movingPin) setMovingPin(null); // drag ended → leave move mode
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // Press & hold ON a marker → pick it up (enter move mode); then drag to move
  // and release/tap to drop. Gives the "draufdrücken und verschieben" the user
  // expects, with clear feedback the moment the marker is grabbed.
  const handlePlanLongPress = (point: Point) => {
    if (!selectedPlan || movingPin) return;
    const img = containerPointToImage(point);
    const nearest = filteredPins.reduce<{ pin: PlanPin; distance: number } | null>((best, pin) => {
      const distance = Math.hypot(pin.x - img.x, pin.y - img.y);
      return !best || distance < best.distance ? { pin, distance } : best;
    }, null);
    if (nearest && nearest.distance <= 0.09) startMovePin(nearest.pin);
  };

  // --- Move an existing marking ---
  const startMovePin = (pin: PlanPin) => {
    setShowPinDetail(null);
    setMovingPin(pin);
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const finishMovePin = async (img: Point) => {
    const pin = movingPin;
    if (!pin) return;
    const updated: PlanPin = { ...pin, x: img.x, y: img.y };
    await savePlanPin(updated);
    setPins((current) => current.map((p) => (p.id === updated.id ? updated : p)));
    setMovingPin(null);
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // --- Export plan(s) to PDF ---
  const runExport = async (which: FloorPlan[]) => {
    if (which.length === 0) return;
    setExporting(true);
    try {
      const pinsByPlan: Record<string, PlanPin[]> = {};
      for (const plan of which) {
        // Reuse the already-loaded pins for the selected plan; fetch the rest.
        pinsByPlan[plan.id] =
          selectedPlan?.id === plan.id ? pins : await getPlanPins(plan.id);
      }
      const title = which.length === 1 ? decodeUnicodeEscapes(which[0].name) : t('grundrisse');
      const result = await exportFloorPlansPdf(which, pinsByPlan, title);
      if (result === "unavailable") {
        Alert.alert(t('hinweis'), t('floor_plan_export_unavailable' as any));
      } else if (result === "empty") {
        Alert.alert(t('hinweis'), t('floor_plan_export_empty' as any));
      }
    } catch (e) {
      console.error("Floor plan export failed:", e);
      Alert.alert(t('alert_fehler'), t('floor_plan_export_error' as any));
    } finally {
      setExporting(false);
    }
  };

  const handleExport = () => {
    if (plans.length === 0) return;
    if (plans.length === 1) {
      void runExport(plans);
      return;
    }
    const opts: any[] = [];
    if (selectedPlan) {
      opts.push({ text: t('floor_plan_export_current' as any), onPress: () => void runExport([selectedPlan]) });
    }
    opts.push({ text: `${t('floor_plan_export_all' as any)} (${plans.length})`, onPress: () => void runExport(plans) });
    opts.push({ text: t('btn_abbrechen'), style: "cancel" as const });
    Alert.alert(t('floor_plan_export_title' as any), t('floor_plan_export_msg' as any), opts);
  };

  const startDrawingFromModal = () => {
    setShowPinModal(false);
    setPendingPin(null);
    // Close the pin sheet first, then open the annotator (iOS won't show two
    // modals at once).
    setTimeout(() => setDrawingPlan(true), 350);
  };

  // Pick photos while creating a "Foto" marker.
  const pickNewPinPhotos = async () => {
    try {
      const picked = await pickImagesWithSource({ t, multiple: true } as any);
      if (!picked || picked.length === 0) return;
      const uris: string[] = [];
      for (const [i, asset] of picked.entries()) {
        try {
          const persisted = await persistFloorPlanMedia({ sourceUri: asset.uri, projectId, ownerId: `newpin-${Date.now()}-${i}`, width: (asset as any).width, height: (asset as any).height, kind: "photo" });
          uris.push(persisted.uri);
        } catch { uris.push(asset.uri); }
      }
      setNewPinPhotos((prev) => [...prev, ...uris]);
    } catch (e) { console.warn("pickNewPinPhotos failed:", e); }
  };

  // Load this project's protocols to pick one for a "Protokoll" marker.
  const loadPinProtocols = async () => {
    setPinProtoListOpen(true);
    try {
      const stored = await AsyncStorage.getItem("protocols");
      setPinProtoOptions(parseProjectProtocolReferences(stored, projectId));
    } catch {}
  };

  // Load existing Mängel of this project to link one to a Mangel marker.
  const loadExistingDefects = async () => {
    setExistingDefectListOpen(true);
    try { setExistingDefects(await getDefects(projectId || undefined)); } catch {}
  };
  const selectExistingDefect = (d: Defect) => {
    setSelectedExistingDefect(d);
    setExistingDefectListOpen(false);
    if (!pinLabel.trim()) setPinLabel(decodeUnicodeEscapes(d.title || ""));
  };

  const savePin = async () => {
    const linkingExisting = pinType === "defect" && mangelMode === "existing" && !!selectedExistingDefect;
    const effectiveLabel = linkingExisting ? (pinLabel.trim() || decodeUnicodeEscapes(selectedExistingDefect!.title || "")) : pinLabel.trim();
    if (!pendingPin || !selectedPlan || !effectiveLabel) {
      Alert.alert(t('hinweis'), t('msg_bitte_gib_eine_bezeichnung_ein'));
      return;
    }

    const newPin: PlanPin = {
      id: `pin-${Date.now()}`,
      planId: selectedPlan.id,
      projectId,
      x: pendingPin.x,
      y: pendingPin.y,
      type: pinType,
      label: effectiveLabel,
      description: pinDescription.trim() || undefined,
      color: PIN_COLORS[pinType],
      createdAt: new Date().toISOString(),
    };

    // A "Mangel" marker is tied to a real defect in the Mängelliste (PlanRadar
    // style): either link an existing one, or create a new one with its details.
    if (pinType === "defect") {
      const nowIso = new Date().toISOString();
      if (linkingExisting && selectedExistingDefect) {
        (newPin as any).defectId = selectedExistingDefect.id;
        try {
          await saveDefect({ ...selectedExistingDefect, planId: selectedPlan.id, pinId: newPin.id, updatedAt: nowIso });
        } catch (e) { console.warn("Could not link existing defect:", e); }
      } else {
        const defectId = `defect-${Date.now()}`;
        (newPin as any).defectId = defectId;
        try {
          await saveDefect({
            id: defectId,
            projectId,
            planId: selectedPlan.id,
            pinId: newPin.id,
            title: effectiveLabel,
            description: pinDescription.trim() || "",
            status: "offen",
            priority: newDefectPriority || undefined,
            category: "sonstiges",
            gewerk: newDefectGewerk.trim() || undefined,
            assignee: newDefectAssignee.trim() || undefined,
            dueDate: newDefectDue.trim() || undefined,
            photos: [],
            location: decodeUnicodeEscapes(selectedPlan.name),
            createdAt: nowIso,
            updatedAt: nowIso,
          } as Defect);
        } catch (e) {
          console.warn("Could not create defect for plan pin:", e);
        }
      }
    }

    // Attach photos (Foto marker) or link a protocol (Protokoll marker) chosen
    // during creation.
    let finalPin: PlanPin = newPin;
    if (pinType === "photo" && newPinPhotos.length > 0) {
      finalPin = { ...finalPin, photos: [...newPinPhotos] };
    }
    if (pinType === "protocol" && newPinProtocol) {
      finalPin = linkPlanPinToProtocol(finalPin, newPinProtocol);
    }

    await savePlanPin(finalPin);
    setPins((current) => [...current, finalPin]);
    setShowPinModal(false);
    setPendingPin(null);
    setPinLabel("");
    setPinDescription("");
    setNewPinPhotos([]);
    setNewPinProtocol(null);
    setPinProtoListOpen(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removePin = async (pinId: string) => {
    Alert.alert(t('alert_markierung_loeschen'), t('msg_diese_markierung_wirklich_entfernen'), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_loeschen'),
        style: "destructive",
        onPress: async () => {
          await deletePlanPin(pinId);
          setPins((current) => current.filter((p) => p.id !== pinId));
          setShowPinDetail(null);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const removePlan = async (planId: string) => {
    Alert.alert(t('alert_plan_loeschen'), t('msg_diesen_grundriss_und_alle_zugehoerigen'), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_loeschen'),
        style: "destructive",
        onPress: async () => {
          await deleteFloorPlan(planId);
          if (selectedPlan?.id === planId) {
            setSelectedPlan(null);
            setPins([]);
          }
          await loadPlans();
        },
      },
    ]);
  };

  const containerWidth = SCREEN_WIDTH - 32;
  const aspectRatio = imageSize.width / imageSize.height;
  const containerHeight = Math.min(containerWidth / aspectRatio, SCREEN_HEIGHT * 0.5);

  // Rectangle the plan image actually occupies inside the canvas after
  // contentFit="contain" letterboxing. Pins/taps are mapped to THIS rect so
  // markers land exactly where the user tapped (no offset from the padding).
  const _contAspect = containerWidth / containerHeight;
  const dispW = aspectRatio > _contAspect ? containerWidth : containerHeight * aspectRatio;
  const dispH = aspectRatio > _contAspect ? containerWidth / aspectRatio : containerHeight;
  const offX = (containerWidth - dispW) / 2;
  const offY = (containerHeight - dispH) / 2;

  const containerPointToImage = (point: Point): Point => {
    const clampN = (v: number) => Math.min(1, Math.max(0, v));
    return {
      x: clampN((point.x * containerWidth - offX) / dispW),
      y: clampN((point.y * containerHeight - offY) / dispH),
    };
  };

  // Color a defect pin by its linked defect's status (falls back to pin.color).
  const pinColor = (pin: PlanPin): string => {
    if (pin.type === "defect" && pin.defectId && defectsById[pin.defectId]) {
      const d = defectsById[pin.defectId];
      return defectStatusColor(d.status, { dueDate: d.dueDate });
    }
    return pin.color;
  };
  const isPinDone = (pin: PlanPin): boolean => {
    const d = pin.defectId ? defectsById[pin.defectId] : undefined;
    return !!d && (d.status === "erledigt" || d.status === "geschlossen");
  };
  const filteredPins = pins.filter((p) => {
    if (filterType !== "all" && p.type !== filterType) return false;
    if (hideDone && isPinDone(p)) return false;
    return true;
  });

  const pinTypeOptions: { type: PlanPin["type"]; label: string; icon: string; color: string }[] = [
    { type: "task", label: t('floor_plan_typ_aufgabe' as any), icon: "task-alt", color: PIN_COLORS.task },
    { type: "note", label: t('floor_plan_typ_notiz' as any), icon: "edit-note", color: PIN_COLORS.note },
    { type: "defect", label: t('floor_plan_typ_mangel' as any), icon: "report-problem", color: PIN_COLORS.defect },
    { type: "photo", label: t('floor_plan_typ_foto' as any), icon: "photo-camera", color: PIN_COLORS.photo },
    { type: "protocol", label: t('floor_plan_typ_protokoll' as any), icon: "description", color: PIN_COLORS.protocol },
  ];

  const beginPinEdit = async (pin: PlanPin) => {
    // Mangel-Pins: den vollständigen Mangel-Editor öffnen, damit ALLES bearbeitet
    // werden kann (Status, Priorität, Gewerk, Frist, Zuständig, Fotos …) – nicht
    // nur Titel/Beschreibung. Andere Pin-Typen behalten das kurze Textsheet.
    if (pin.type === "defect" && pin.defectId && defectsById[pin.defectId]) {
      setShowPinDetail(null);
      router.push(`/defects?projectId=${encodeURIComponent(pin.projectId)}&defectId=${encodeURIComponent(pin.defectId)}` as any);
      return;
    }
    setShowPinDetail(null);
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    setEditPinLabel(decodeUnicodeEscapes(pin.label));
    setEditPinDescription(decodeUnicodeEscapes(pin.description || ""));
    setEditingPin(pin);
  };

  const cancelPinEdit = () => {
    const pin = editingPin;
    Keyboard.dismiss();
    setEditingPin(null);
    if (pin) setShowPinDetail(pin);
  };

  const saveEditedPin = async () => {
    if (!editingPin || !editPinLabel.trim()) {
      Alert.alert(t('hinweis'), t('msg_bitte_gib_eine_bezeichnung_ein'));
      return;
    }

    const updatedPin = updatePlanPinText(editingPin, editPinLabel, editPinDescription);
    await savePlanPin(updatedPin);
    setPins((current) => current.map((pin) => pin.id === updatedPin.id ? updatedPin : pin));
    Keyboard.dismiss();
    setEditingPin(null);
    setShowPinDetail(updatedPin);
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const showProtocolsForPin = async (pin: PlanPin) => {
    setShowPinDetail(null);
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    setProtocolPickerPin(pin);
    setLoadingProtocols(true);
    try {
      const stored = await AsyncStorage.getItem("protocols");
      setProtocolOptions(parseProjectProtocolReferences(stored, pin.projectId));
    } finally {
      setLoadingProtocols(false);
    }
  };

  const linkProtocolToPin = async (protocol: FloorPlanProtocolReference) => {
    if (!protocolPickerPin) return;
    const updatedPin = linkPlanPinToProtocol(protocolPickerPin, protocol);
    await savePlanPin(updatedPin);
    setPins((current) => current.map((pin) => pin.id === updatedPin.id ? updatedPin : pin));
    setProtocolPickerPin(null);
    setShowPinDetail(updatedPin);
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const createProtocolForPin = (pin: PlanPin) => {
    setShowPinDetail(null);
    setProtocolPickerPin(null);
    router.push(
      `/(tabs)/record?projectId=${encodeURIComponent(pin.projectId)}&planPinId=${encodeURIComponent(pin.id)}` as any,
    );
  };

  const openLinkedProtocol = (pin: PlanPin) => {
    if (!pin.protocolId) return;
    setShowPinDetail(null);
    router.push(`/protocol-detail?id=${encodeURIComponent(pin.protocolId)}` as any);
  };

  const addPhotoToPin = async (pin: PlanPin) => {
    // Launch the picker WITHOUT closing the detail modal first — on iOS,
    // dismissing the modal and presenting the picker at the same time fails
    // silently ("nothing happens"). The standard picker offers Kamera/Galerie.
    try {
      const picked = await pickImagesWithSource({ t, multiple: true } as any);
      if (!picked || picked.length === 0) return;
      const newPhotos: string[] = [];
      for (const [index, asset] of picked.entries()) {
        const persisted = await persistFloorPlanMedia({
          sourceUri: asset.uri,
          projectId,
          ownerId: `${pin.id}-${(pin.photos?.length || 0) + index}`,
          width: (asset as any).width,
          height: (asset as any).height,
          kind: "photo",
        });
        newPhotos.push(persisted.uri);
      }
      if (newPhotos.length === 0) return;
      const updatedPin: PlanPin = {
        ...pin,
        photos: [...(pin.photos || []), ...newPhotos],
      };
      await savePlanPin(updatedPin);
      setPins((current) => current.map((item) => item.id === pin.id ? updatedPin : item));
      setShowPinDetail(updatedPin);
      // Keep a linked Mangel's photos in sync (PlanRadar style).
      const linkedDefectId = (pin as any).defectId;
      if (linkedDefectId) {
        try {
          const all = await getDefects(projectId);
          const d = all.find((x) => x.id === linkedDefectId);
          if (d) await saveDefect({ ...d, photos: [...(d.photos || []), ...newPhotos], updatedAt: new Date().toISOString() });
        } catch {}
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn("addPhotoToPin failed:", e);
    }
  };

  const viewPinPhotos = (pin: PlanPin, initialIndex = 0) => {
    const photos = pin.photos || (pin.photoUri ? [pin.photoUri] : []);
    if (photos.length === 0) {
      Alert.alert(t('gallery_no_photos'), t('msg_marker_keine_fotos'));
      return;
    }
    setShowPinDetail(null);
    InteractionManager.runAfterInteractions(() => {
      if (!mountedRef.current) return;
      setPhotoViewer({
        photos,
        title: decodeUnicodeEscapes(pin.label),
        initialIndex: Math.min(Math.max(0, initialIndex), photos.length - 1),
      });
    });
  };

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
          <MaterialIcons name="arrow-back-ios" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('grundrisse')}</Text>
          {selectedPlan && (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{decodeUnicodeEscapes(selectedPlan.name)}</Text>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {/* Draw/annotate now lives in the "Neue Markierung" sheet (tap the plan). */}
          {/* Export plan(s) to PDF */}
          {plans.length > 0 && (
            <Pressable
              onPress={handleExport}
              disabled={exporting}
              style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.surface }, (pressed || exporting) && { opacity: 0.6 }]}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialIcons name="ios-share" size={20} color={colors.primary} />
              )}
            </Pressable>
          )}
          {/* Delete the currently shown plan */}
          {selectedPlan && (
            <Pressable
              onPress={() => removePlan(selectedPlan.id)}
              style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.surface }, pressed && { opacity: 0.6 }]}
            >
              <MaterialIcons name="delete-outline" size={20} color={colors.error} />
            </Pressable>
          )}
          {/* View mode toggle */}
          <Pressable
            onPress={() => setViewMode(viewMode === "plan" ? "list" : "plan")}
            style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name={viewMode === "plan" ? "list" : "map"} size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={addPlan}
            style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="add" size={20} color="#FFF" />
          </Pressable>
        </View>
      </View>

      {/* Plan selector: compact dropdown for many plans, tab strip for a few */}
      {plans.length > 1 && (
        plans.length > 4 ? (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <Pressable
              onPress={() => setShowPlanPicker(true)}
              style={({ pressed }) => [styles.planDropdown, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="layers" size={16} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                {selectedPlan ? decodeUnicodeEscapes(selectedPlan.name) : t('floor_plan_plan_waehlen' as any)}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginRight: 6 }}>{plans.length}</Text>
              <MaterialIcons name="arrow-drop-down" size={22} color={colors.muted} />
            </Pressable>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.planTabs} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {plans.map((plan) => (
              <Pressable
                key={plan.id}
                onPress={() => selectPlan(plan)}
                onLongPress={() => removePlan(plan.id)}
                style={({ pressed }) => [
                  styles.planTab,
                  {
                    borderColor: selectedPlan?.id === plan.id ? colors.primary : colors.border,
                    backgroundColor: selectedPlan?.id === plan.id ? colors.primary + "12" : colors.surface,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <MaterialIcons name="layers" size={14} color={selectedPlan?.id === plan.id ? colors.primary : colors.muted} />
                <Text style={[styles.planTabText, { color: selectedPlan?.id === plan.id ? colors.primary : colors.foreground }]}>
                  {decodeUnicodeEscapes(plan.name)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )
      )}

      {/* Filter Bar */}
      {selectedPlan && pins.length > 0 && (
        <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => setFilterType("all")}
            style={[styles.filterChip, { backgroundColor: filterType === "all" ? colors.primary + "15" : "transparent", borderColor: filterType === "all" ? colors.primary : colors.border }]}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: filterType === "all" ? colors.primary : colors.muted }}>
              {t('floor_plan_alle' as any)} ({pins.length})
            </Text>
          </Pressable>
          {pinTypeOptions.map((opt) => {
            const count = pins.filter((p) => p.type === opt.type).length;
            if (count === 0) return null;
            return (
              <Pressable
                key={opt.type}
                onPress={() => setFilterType(filterType === opt.type ? "all" : opt.type)}
                style={[styles.filterChip, { backgroundColor: filterType === opt.type ? opt.color + "15" : "transparent", borderColor: filterType === opt.type ? opt.color : colors.border }]}
              >
                <MaterialIcons name={opt.icon as any} size={12} color={filterType === opt.type ? opt.color : colors.muted} />
                <Text style={{ fontSize: 11, fontWeight: "500", color: filterType === opt.type ? opt.color : colors.muted }}>
                  {count}
                </Text>
              </Pressable>
            );
          })}
          {/* Hide resolved pins */}
          <Pressable
            onPress={() => setHideDone((v) => !v)}
            style={[styles.filterChip, { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto", backgroundColor: hideDone ? colors.primary + "15" : "transparent", borderColor: hideDone ? colors.primary : colors.border }]}
          >
            <MaterialIcons name={hideDone ? "visibility-off" : "visibility"} size={12} color={hideDone ? colors.primary : colors.muted} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: hideDone ? colors.primary : colors.muted }}>
              {t('floor_plan_hide_done' as any)}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Move-mode banner */}
      {movingPin && (
        <View style={[styles.moveBanner, { backgroundColor: colors.primary + "18", borderColor: colors.primary }]}>
          <MaterialIcons name="open-with" size={18} color={colors.primary} />
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
            {t('floor_plan_move_hint' as any)}
          </Text>
          <Pressable onPress={() => setMovingPin(null)} hitSlop={8}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>{t('btn_abbrechen')}</Text>
          </Pressable>
        </View>
      )}

      {/* Main Content */}
      {selectedPlan ? (
        viewMode === "plan" ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16 }}
            scrollEnabled={!planInteractionActive && !movingPin}
          >
            {/* Plan Image with Pins */}
            <View style={[styles.planImageContainer, { borderColor: colors.border }]}>
              <ZoomableCanvas
                key={`${selectedPlan.id}-${zoomResetKey}`}
                ref={canvasRef}
                width={containerWidth}
                height={containerHeight}
                maxScale={4}
                onSingleTap={handlePlanTap}
                onPinDrag={handlePinDrag}
                onLongPress={handlePlanLongPress}
                onZoomChange={setCanvasScale}
                dragImmediate={!!movingPin}
                onInteractionChange={setPlanInteractionActive}
                overlay={({ scale, translateX, translateY, width, height }) => (
                  <>
                    {filteredPins.map((pin) => (
                      <AnimatedPin
                        key={pin.id}
                        nx={offX + pin.x * dispW}
                        ny={offY + pin.y * dispH}
                        color={pinColor(pin)}
                        icon={PIN_ICONS[pin.type]}
                        highlight={pin.id === highlightPinId}
                        scale={scale}
                        translateX={translateX}
                        translateY={translateY}
                        cw={width}
                        ch={height}
                      />
                    ))}
                    {pendingPin && (
                      <AnimatedPin
                        nx={offX + pendingPin.x * dispW}
                        ny={offY + pendingPin.y * dispH}
                        color="#9E9E9E"
                        icon="add"
                        highlight={false}
                        scale={scale}
                        translateX={translateX}
                        translateY={translateY}
                        cw={width}
                        ch={height}
                      />
                    )}
                  </>
                )}
                testID="floor-plan-zoom-stage"
              >
                <View style={{ width: containerWidth, height: containerHeight, backgroundColor: "#FFFFFF" }}>
                <Image
                  source={{ uri: selectedPlan.imageUri }}
                  style={{ width: containerWidth, height: containerHeight }}
                  contentFit="contain"
                  // "disk" (not "memory-disk"): a multi-page plan would otherwise
                  // pile up full-res (allowDownscaling off) bitmaps in the memory
                  // cache as you page through, eventually failing to decode a new
                  // page → white. Disk cache keeps switching fast without the pileup.
                  cachePolicy="disk"
                  allowDownscaling={false}
                  recyclingKey={`floor-plan-${selectedPlan.id}`}
                  onLoadStart={() => setLoadingPlanId(selectedPlan.id)}
                  onLoad={(e: any) => {
                    setLoadingPlanId(null);
                    // Use the image's real dimensions so the canvas aspect ratio
                    // matches the plan (no distortion) and pins stay aligned.
                    const src = e?.source;
                    if (src?.width > 0 && src?.height > 0) {
                      setImageSize((prev) => (prev.width === src.width && prev.height === src.height ? prev : { width: src.width, height: src.height }));
                    }
                  }}
                  onError={() => setLoadingPlanId(null)}
                />
                {/* Pins werden jetzt als bildschirmfestes Overlay (konstante Größe,
                    scharf, kein Flackern) über die ZoomableCanvas gerendert. */}
                </View>
              </ZoomableCanvas>
              {loadingPlanId === selectedPlan.id ? (
                <View pointerEvents="none" style={styles.planLoadingOverlay}>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.planLoadingText}>{t('floor_plan_wird_geladen' as any)}</Text>
                </View>
              ) : null}
              <View style={styles.zoomControls} pointerEvents="box-none">
                <Pressable
                  onPress={() => canvasRef.current?.zoomBy(1.4)}
                  accessibilityRole="button"
                  accessibilityLabel={t('floor_plan_zoom_in' as any)}
                  style={({ pressed }) => [styles.zoomBtn, pressed && { opacity: 0.65 }]}
                >
                  <MaterialIcons name="add" size={20} color="#FFFFFF" />
                </Pressable>
                <Pressable
                  onPress={() => canvasRef.current?.zoomBy(1 / 1.4)}
                  accessibilityRole="button"
                  accessibilityLabel={t('floor_plan_zoom_out' as any)}
                  style={({ pressed }) => [styles.zoomBtn, pressed && { opacity: 0.65 }]}
                >
                  <MaterialIcons name="remove" size={20} color="#FFFFFF" />
                </Pressable>
                <Pressable
                  onPress={() => { canvasRef.current?.reset(); setZoomResetKey((value) => value + 1); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('floor_plan_zoom_zuruecksetzen' as any)}
                  style={({ pressed }) => [styles.zoomBtnWide, pressed && { opacity: 0.65 }]}
                >
                  <MaterialIcons name="fit-screen" size={18} color="#FFFFFF" />
                  <Text style={styles.resetZoomText}>{t('floor_plan_ansicht' as any)}</Text>
                </Pressable>
              </View>
            </View>

            {/* Instruction */}
            <View style={[styles.instructionBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="touch-app" size={18} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 8, flex: 1 }}>
                {t('floor_plan_gesten_hinweis' as any)}
              </Text>
            </View>

            {/* Pin Summary */}
            {filteredPins.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
                  {t('floor_plan_markierungen' as any)} ({filteredPins.length})
                </Text>
                {filteredPins.slice(0, 5).map((pin) => (
                  <Pressable
                    key={pin.id}
                    onPress={() => setShowPinDetail(pin)}
                    style={({ pressed }) => [styles.pinListItem, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={[styles.pinListDot, { backgroundColor: pin.color }]}>
                      <MaterialIcons name={PIN_ICONS[pin.type] as any} size={12} color="#FFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{decodeUnicodeEscapes(pin.label)}</Text>
                      {pin.description && (
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{decodeUnicodeEscapes(pin.description)}</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 10, color: colors.muted }}>
                      {new Date(pin.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        ) : (
          /* List View */
          <FlatList
            data={filteredPins}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <MaterialIcons name="pin-drop" size={40} color={colors.muted} />
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}>{t('keine_markierungen')}</Text>
              </View>
            }
            renderItem={({ item: pin }) => (
              <Pressable
                onPress={() => setShowPinDetail(pin)}
                onLongPress={() => removePin(pin.id)}
                style={({ pressed }) => [styles.pinListItemFull, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={[styles.pinListDotLarge, { backgroundColor: pin.color }]}>
                  <MaterialIcons name={PIN_ICONS[pin.type] as any} size={18} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{decodeUnicodeEscapes(pin.label)}</Text>
                  {pin.description && (
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }} numberOfLines={2}>{decodeUnicodeEscapes(pin.description)}</Text>
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <Text style={{ fontSize: 10, color: colors.muted, backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      {pinTypeOptions.find((o) => o.type === pin.type)?.label}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>
                      {new Date(pin.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            )}
          />
        )
      ) : (
        /* Empty State */
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "10" }]}>
            <MaterialIcons name="map" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('grundrisse_plaene')}</Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            {t('floor_plan_empty_subtext' as any)}
          </Text>
          <Pressable
            onPress={addPlan}
            style={({ pressed }) => [styles.uploadBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="cloud-upload" size={20} color="#FFF" />
            <Text style={styles.uploadBtnText}>{t('plan_hochladen')}</Text>
          </Pressable>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 12 }}>
            {t('floor_plan_unterstuetzt' as any)}
          </Text>
        </View>
      )}

      {/* Pin Creation Modal (Bottom Sheet Style) */}
      <Modal visible={showPinModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowPinModal(false); setPendingPin(null); }}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%", justifyContent: "flex-end" }}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[styles.modalContent, { backgroundColor: colors.background, maxHeight: "90%" }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('neue_markierung')}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>
              {t('floor_plan_typ_hinweis' as any)}
            </Text>

            {/* Pin Type Selection */}
            <View style={styles.typeRow}>
              {pinTypeOptions.map((opt) => (
                <Pressable
                  key={opt.type}
                  onPress={() => setPinType(opt.type)}
                  style={({ pressed }) => [
                    styles.typeBtn,
                    {
                      borderColor: pinType === opt.type ? opt.color : colors.border,
                      backgroundColor: pinType === opt.type ? opt.color + "12" : colors.surface,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.typeBtnIcon, { backgroundColor: pinType === opt.type ? opt.color : colors.muted + "30" }]}>
                    <MaterialIcons name={opt.icon as any} size={18} color={pinType === opt.type ? "#FFF" : colors.muted} />
                  </View>
                  <Text style={[styles.typeBtnText, { color: pinType === opt.type ? opt.color : colors.muted }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
              {/* Draw/annotate directly from the marking area */}
              <Pressable
                key="draw"
                onPress={startDrawingFromModal}
                style={({ pressed }) => [
                  styles.typeBtn,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.typeBtnIcon, { backgroundColor: colors.primary + "30" }]}>
                  <MaterialIcons name="gesture" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.typeBtnText, { color: colors.primary }]}>{t('floor_plan_draw' as any)}</Text>
              </Pressable>
            </View>

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder={t('bezeichnung')}
              placeholderTextColor={colors.muted}
              value={pinLabel}
              onChangeText={setPinLabel}
              autoFocus={false}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <TextInput
              style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder={t('beschreibung_optional')}
              placeholderTextColor={colors.muted}
              value={pinDescription}
              onChangeText={setPinDescription}
              multiline
              numberOfLines={3}
              blurOnSubmit={true}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            {/* Foto-Typ: direkt ein Foto hinzufügen */}
            {pinType === "photo" && (
              <View style={{ marginBottom: 12 }}>
                <Pressable onPress={pickNewPinPhotos} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}>
                  <MaterialIcons name="add-a-photo" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{t('fotos_hinzufuegen')}</Text>
                </Pressable>
                {newPinPhotos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
                    {newPinPhotos.map((uri, i) => (
                      <View key={`${uri}-${i}`}>
                        <Image source={{ uri }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" />
                        <Pressable onPress={() => setNewPinPhotos((prev) => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#EF4444", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                          <MaterialIcons name="close" size={13} color="#fff" />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Protokoll-Typ: ein vorhandenes Protokoll auswählen */}
            {pinType === "protocol" && (
              <View style={{ marginBottom: 12 }}>
                {newPinProtocol ? (
                  <Pressable onPress={() => { setNewPinProtocol(null); void loadPinProtocols(); }} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary + "12", opacity: pressed ? 0.8 : 1 }]}>
                    <MaterialIcons name="description" size={18} color={colors.primary} />
                    <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, flex: 1 }} numberOfLines={1}>{decodeUnicodeEscapes(newPinProtocol.title || "")}</Text>
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{t('aendern' as any)}</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => void loadPinProtocols()} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}>
                    <MaterialIcons name="post-add" size={18} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{t('protokoll_zuordnen')}</Text>
                  </Pressable>
                )}
                {pinProtoListOpen && !newPinProtocol && (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, maxHeight: 180, overflow: "hidden" }}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                      {pinProtoOptions.length === 0 ? (
                        <Text style={{ padding: 12, fontSize: 13, color: colors.muted }}>{t('protocol_no_protocols' as any)}</Text>
                      ) : pinProtoOptions.map((p) => (
                        <Pressable key={p.id} onPress={() => { setNewPinProtocol(p); setPinProtoListOpen(false); }} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                          <MaterialIcons name="description" size={16} color={colors.muted} />
                          <Text style={{ fontSize: 13, color: colors.foreground, flex: 1 }} numberOfLines={1}>{decodeUnicodeEscapes(p.title || "")}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* Mangel-Typ: neuer Mangel mit Details ODER bestehenden auswählen */}
            {pinType === "defect" && (
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                  {([["new", t('floor_plan_mangel_new' as any)], ["existing", t('floor_plan_mangel_existing' as any)]] as const).map(([m, lbl]) => {
                    const on = mangelMode === m;
                    return (
                      <Pressable key={m} onPress={() => { setMangelMode(m); if (m === "existing") void loadExistingDefects(); }} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, alignItems: "center", borderColor: on ? "#F44336" : colors.border, backgroundColor: on ? "#F4433618" : colors.surface }}>
                        <Text style={{ fontSize: 12, fontWeight: on ? "800" : "600", color: on ? "#F44336" : colors.muted }}>{lbl}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {mangelMode === "new" ? (
                  <>
                    <Text style={styles.pinFieldLabel}>{t('gewerk')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
                      {GEWERKE.map((g) => {
                        const on = newDefectGewerk === g;
                        return (
                          <Pressable key={g} onPress={() => setNewDefectGewerk(on ? "" : g)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "18" : colors.surface }}>
                            <Text style={{ fontSize: 13, fontWeight: on ? "700" : "600", color: on ? colors.primary : colors.muted }}>{g}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    <Text style={styles.pinFieldLabel}>{t('prioritaet')}</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {(["hoch", "mittel", "niedrig"] as const).map((p) => {
                        const on = newDefectPriority === p;
                        const c = p === "hoch" ? "#DC2626" : p === "mittel" ? "#F59E0B" : "#16A34A";
                        return (
                          <Pressable key={p} onPress={() => setNewDefectPriority(p)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center", borderColor: on ? c : colors.border, backgroundColor: on ? c + "18" : colors.surface }}>
                            <Text style={{ fontSize: 13, fontWeight: on ? "800" : "600", color: on ? c : colors.muted }}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={styles.pinFieldLabel}>{t('zustaendig')}</Text>
                    <AssigneeInput value={newDefectAssignee} onChange={setNewDefectAssignee} placeholder={t('zustaendig')} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 0 }]} />

                    <View style={{ marginTop: 10 }}>
                      <DateOnlyPicker value={newDefectDue} onChange={setNewDefectDue} label={t('frist')} withTime />
                    </View>
                  </>
                ) : (
                  <>
                    {selectedExistingDefect ? (
                      <Pressable onPress={() => { setSelectedExistingDefect(null); void loadExistingDefects(); }} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#F44336", backgroundColor: "#F4433612", opacity: pressed ? 0.8 : 1 }]}>
                        <MaterialIcons name="warning" size={18} color="#F44336" />
                        <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, flex: 1 }} numberOfLines={1}>{decodeUnicodeEscapes(selectedExistingDefect.title || "")}</Text>
                        <Text style={{ color: "#F44336", fontSize: 12, fontWeight: "700" }}>{t('aendern' as any)}</Text>
                      </Pressable>
                    ) : (
                      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, maxHeight: 200, overflow: "hidden" }}>
                        <ScrollView keyboardShouldPersistTaps="handled">
                          {existingDefects.length === 0 ? (
                            <Text style={{ padding: 12, fontSize: 13, color: colors.muted }}>{t('keine_maengel' as any)}</Text>
                          ) : existingDefects.map((d) => (
                            <Pressable key={d.id} onPress={() => selectExistingDefect(d)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                              <MaterialIcons name="warning" size={16} color="#F44336" />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600" }} numberOfLines={1}>{decodeUnicodeEscapes(d.title || "")}</Text>
                                {(d.gewerk || d.location) ? <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>{[d.gewerk, d.location].filter(Boolean).join(" · ")}</Text> : null}
                              </View>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { Keyboard.dismiss(); setShowPinModal(false); setPendingPin(null); }}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { Keyboard.dismiss(); savePin(); }}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: PIN_COLORS[pinType] }, pressed && { opacity: 0.85 }]}
              >
                <MaterialIcons name="check" size={18} color="#FFF" />
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF", marginLeft: 6 }}>{t('save')}</Text>
              </Pressable>
            </View>
            </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Plan Name Modal */}
      <Modal visible={showPlanNameModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { justifyContent: "center" }]}>
          <View style={[styles.nameModalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('plan_benennen')}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder={t('floor_plan_name_placeholder' as any)}
              placeholderTextColor={colors.muted}
              value={newPlanName}
              onChangeText={setNewPlanName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={savePlanWithName}
            />
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setShowPlanNameModal(false); setPendingPlanAsset(null); }}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={savePlanWithName}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pin Detail Modal */}
      <Modal
        visible={!!showPinDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPinDetail(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPinDetail(null)}>
          <Pressable style={[styles.detailModalContent, { backgroundColor: colors.background }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            {showPinDetail && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <View style={[styles.detailIcon, { backgroundColor: showPinDetail.color }]}>
                    <MaterialIcons name={PIN_ICONS[showPinDetail.type] as any} size={22} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{decodeUnicodeEscapes(showPinDetail.label)}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      {decodeUnicodeEscapes(`${pinTypeOptions.find((o) => o.type === showPinDetail.type)?.label || ""} • ${new Date(showPinDetail.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}`)}
                    </Text>
                  </View>
                </View>
                {showPinDetail.description && (
                  <View style={[styles.detailDescBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20 }}>{decodeUnicodeEscapes(showPinDetail.description)}</Text>
                  </View>
                )}

                {/* Vollständige Mangeldaten aus dem verknüpften Defect. */}
                {(() => {
                  const d = showPinDetail.defectId ? defectsById[showPinDetail.defectId] : undefined;
                  if (!d) return null;
                  const statusLabel: Record<string, string> = { offen: "Offen", zugewiesen: "Zugewiesen", in_bearbeitung: "In Bearbeitung", nachbesserung: "Nachbesserung", pruefung: "Prüfung", erledigt: "Erledigt", abgelehnt: "Abgelehnt", geschlossen: "Geschlossen" };
                  const prioLabel = d.priority ? (d.priority === "hoch" ? "Hoch" : d.priority === "mittel" ? "Mittel" : "Niedrig") : "–";
                  const rows: { k: string; v: string }[] = [
                    { k: t('gewerk'), v: ((d as any).gewerk || d.category || "").trim() },
                    { k: t('prioritaet'), v: prioLabel },
                    { k: "Frist", v: d.dueDate ? new Date(d.dueDate).toLocaleDateString("de-DE") : "–" },
                    { k: t('zustaendig'), v: [d.assignee, d.assigneeFirma].filter(Boolean).join(" · ") },
                    { k: "Ort", v: [d.floor, d.room].filter(Boolean).join(" · ") || d.location || "" },
                    { k: t('status_label' as any), v: statusLabel[d.status] || d.status },
                  ].filter((r) => r.v);
                  const descExtra = d.description && d.description.trim() && d.description.trim() !== (showPinDetail.description || "").trim() ? d.description.trim() : "";
                  const photos = d.photos || [];
                  return (
                    <View style={[styles.detailDescBox, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}>
                      {descExtra ? <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20, marginBottom: 8 }}>{descExtra}</Text> : null}
                      {rows.map((r) => (
                        <View key={r.k} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 4 }}>
                          <Text style={{ fontSize: 12.5, color: colors.muted, width: 92 }}>{r.k}</Text>
                          <Text style={{ fontSize: 12.5, color: colors.foreground, fontWeight: "600", flex: 1 }}>{r.v}</Text>
                        </View>
                      ))}
                      {photos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                          {photos.map((uri, i) => (
                            <Image key={`dp-${i}`} source={{ uri }} style={{ width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: colors.border }} contentFit="cover" />
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  );
                })()}

                {showPinDetail.type === "protocol" && (
                  <View style={{ marginBottom: 12, gap: 8 }}>
                    {showPinDetail.protocolId && (
                      <View style={[styles.protocolLinkStatus, { backgroundColor: PIN_COLORS.protocol + "12", borderColor: PIN_COLORS.protocol + "50" }]}>
                        <MaterialIcons name="description" size={18} color={PIN_COLORS.protocol} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted }}>{t('verknuepftes_protokoll')}</Text>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }} numberOfLines={2}>
                            {decodeUnicodeEscapes(showPinDetail.protocolTitle || showPinDetail.label)}
                          </Text>
                        </View>
                      </View>
                    )}
                    <Pressable
                      onPress={() => showPinDetail.protocolId ? openLinkedProtocol(showPinDetail) : showProtocolsForPin(showPinDetail)}
                      style={({ pressed }) => [styles.primaryDetailAction, { backgroundColor: PIN_COLORS.protocol, opacity: pressed ? 0.8 : 1 }]}
                    >
                      <MaterialIcons name={showPinDetail.protocolId ? "open-in-new" : "post-add"} size={19} color="#FFF" />
                      <Text style={styles.primaryDetailActionText}>
                        {showPinDetail.protocolId ? t('zum_protokoll') : t('protokoll_hinzufuegen')}
                      </Text>
                    </Pressable>
                    {showPinDetail.protocolId && (
                      <Pressable
                        onPress={() => showProtocolsForPin(showPinDetail)}
                        style={({ pressed }) => [styles.secondaryDetailAction, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                      >
                        <MaterialIcons name="swap-horiz" size={18} color={colors.primary} />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>{t('protokoll_zuordnen')}</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => beginPinEdit(showPinDetail)}
                    style={({ pressed }) => [styles.secondaryDetailAction, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="edit" size={18} color={colors.primary} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>
                      {showPinDetail.type === "defect" && showPinDetail.defectId && defectsById[showPinDetail.defectId]
                        ? t('floor_plan_mangel_bearbeiten' as any)
                        : t('markierung_bearbeiten')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => startMovePin(showPinDetail)}
                    style={({ pressed }) => [styles.secondaryDetailAction, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="open-with" size={18} color={colors.primary} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>{t('floor_plan_verschieben' as any)}</Text>
                  </Pressable>
                </View>

                {/* Photos linked to this pin */}
                {((showPinDetail.photos && showPinDetail.photos.length > 0) || showPinDetail.photoUri) && (
                  <View style={{ marginBottom: 12 }}>
                    <Pressable
                      onPress={() => viewPinPhotos(showPinDetail)}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 0, backgroundColor: colors.primary + "10", borderWidth: 1, borderColor: colors.primary + "30", opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name="photo-library" size={20} color={colors.primary} />
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary, flex: 1 }}>
                        {(showPinDetail.photos?.length || 1)} {(showPinDetail.photos?.length || 1) !== 1 ? t('floor_plan_fotos_anzeigen' as any) : t('floor_plan_foto_anzeigen' as any)}
                      </Text>
                      <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
                    </Pressable>
                    {/* Photo thumbnails */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {(showPinDetail.photos || (showPinDetail.photoUri ? [showPinDetail.photoUri] : [])).slice(0, 5).map((uri, idx) => (
                        <Pressable
                          key={`${uri}-${idx}`}
                          onPress={() => viewPinPhotos(showPinDetail, idx)}
                          accessibilityRole="button"
                          accessibilityLabel={t('floor_plan_foto_gross_anzeigen' as any).replace('{n}', String(idx + 1))}
                        >
                          <Image
                            source={{ uri }}
                            style={{ width: 60, height: 60, borderRadius: 0, marginRight: 6 }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            recyclingKey={`pin-photo-${showPinDetail.id}-${idx}`}
                          />
                        </Pressable>
                      ))}
                      {(showPinDetail.photos?.length || 0) > 5 && (
                        <View style={{ width: 60, height: 60, borderRadius: 0, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>+{(showPinDetail.photos?.length || 0) - 5}</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}

                {/* Add photos button */}
                <Pressable
                  onPress={() => addPhotoToPin(showPinDetail)}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 12, opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name="add-a-photo" size={18} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{decodeUnicodeEscapes(t('fotos_hinzufuegen'))}</Text>
                </Pressable>

                <View style={[styles.detailCoords, { backgroundColor: colors.surface }]}>
                  <MaterialIcons name="my-location" size={14} color={colors.muted} />
                  <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>
                    {t('floor_plan_position' as any)}: {(showPinDetail.x * 100).toFixed(1)}% / {(showPinDetail.y * 100).toFixed(1)}%
                  </Text>
                </View>
                <Pressable
                  onPress={() => removePin(showPinDetail.id)}
                  style={({ pressed }) => [styles.deleteBtn, { borderColor: colors.error }, pressed && { opacity: 0.7 }]}
                >
                  <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.error, marginLeft: 8 }}>{decodeUnicodeEscapes(t('alert_markierung_loeschen'))}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Existing pin edit modal */}
      <Modal
        visible={!!editingPin}
        transparent
        animationType="slide"
        onRequestClose={cancelPinEdit}
      >
        <TouchableWithoutFeedback onPress={cancelPinEdit}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%", justifyContent: "center" }}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                  <View style={styles.modalHandle} />
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('markierung_bearbeiten')}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>
                    {editingPin?.type === "protocol" ? t('protokolltext_bearbeiten') : t('markierungstext_bearbeiten')}
                  </Text>
                  <TextInput
                    style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder={t('bezeichnung')}
                    placeholderTextColor={colors.muted}
                    value={editPinLabel}
                    onChangeText={setEditPinLabel}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder={editingPin?.type === "protocol" ? t('protokolltext_optional') : t('beschreibung_optional')}
                    placeholderTextColor={colors.muted}
                    value={editPinDescription}
                    onChangeText={setEditPinDescription}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  <View style={styles.modalButtons}>
                    <Pressable
                      onPress={cancelPinEdit}
                      style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{t('cancel')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={saveEditedPin}
                      style={({ pressed }) => [styles.saveBtn, { backgroundColor: editingPin?.color || colors.primary }, pressed && { opacity: 0.85 }]}
                    >
                      <MaterialIcons name="check" size={18} color="#FFF" />
                      <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF", marginLeft: 6 }}>{t('save')}</Text>
                    </Pressable>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Protocol selection modal */}
      <Modal
        visible={!!protocolPickerPin}
        transparent
        animationType="slide"
        onRequestClose={() => setProtocolPickerPin(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setProtocolPickerPin(null)}>
          <Pressable style={[styles.detailModalContent, { backgroundColor: colors.background, maxHeight: "82%" }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('protokoll_hinzufuegen')}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>{t('protokoll_aus_projekt_waehlen')}</Text>

            {loadingProtocols ? (
              <View style={{ minHeight: 120, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {protocolOptions.map((protocol) => (
                  <Pressable
                    key={protocol.id}
                    onPress={() => linkProtocolToPin(protocol)}
                    style={({ pressed }) => [styles.protocolOption, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={[styles.protocolOptionIcon, { backgroundColor: PIN_COLORS.protocol + "18" }]}>
                      <MaterialIcons name="description" size={20} color={PIN_COLORS.protocol} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={2}>
                        {decodeUnicodeEscapes(protocol.title)}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>
                        {[
                          protocol.protocolNumber,
                          protocol.createdAt ? new Date(protocol.createdAt).toLocaleDateString("de-DE") : null,
                        ].filter(Boolean).join(" • ")}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                  </Pressable>
                ))}
                {protocolOptions.length === 0 && (
                  <View style={[styles.protocolEmptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <MaterialIcons name="description" size={30} color={colors.muted} />
                    <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 19 }}>{t('keine_protokolle_im_projekt')}</Text>
                  </View>
                )}
              </ScrollView>
            )}

            {protocolPickerPin && (
              <Pressable
                onPress={() => createProtocolForPin(protocolPickerPin)}
                style={({ pressed }) => [styles.primaryDetailAction, { backgroundColor: PIN_COLORS.protocol, marginTop: 12, opacity: pressed ? 0.8 : 1 }]}
              >
                <MaterialIcons name="add" size={20} color="#FFF" />
                <Text style={styles.primaryDetailActionText}>{t('neues_protokoll_erstellen')}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setProtocolPickerPin(null)}
              style={({ pressed }) => [styles.cancelStandalone, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.muted }}>{t('cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {photoViewer ? (
        <FullscreenPhotoViewer
          key={`${photoViewer.title}-${photoViewer.initialIndex}-${photoViewer.photos.join("|")}`}
          visible
          photos={photoViewer.photos}
          initialIndex={photoViewer.initialIndex}
          title={photoViewer.title}
          onClose={() => setPhotoViewer(null)}
        />
      ) : null}

      {selectedPlan && (
        <PhotoAnnotator
          visible={drawingPlan}
          photoUri={selectedPlan.imageUri}
          onClose={() => setDrawingPlan(false)}
          onSave={handlePlanDrawSave}
        />
      )}

      <PdfRasterizer
        pdfUri={pdfToConvert}
        label={t('floor_plan_pdf_converting' as any)}
        maxSize={3072}
        onDone={handlePdfConverted}
      />

      <Modal visible={converting} transparent animationType="fade">
        <View style={styles.convertOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.convertText}>{t('floor_plan_pdf_converting' as any)}</Text>
        </View>
      </Modal>

      {/* Plan picker (used when there are many plans) */}
      <Modal visible={showPlanPicker} transparent animationType="slide" onRequestClose={() => setShowPlanPicker(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center" }} onPress={() => setShowPlanPicker(false)}>
          <Pressable style={{ backgroundColor: colors.background, borderRadius: 18, paddingBottom: 24, maxHeight: "80%" }} onPress={() => {}}>
            <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground }}>{t('floor_plan_plan_waehlen' as any)}</Text>
              <Pressable onPress={() => setShowPlanPicker(false)} style={{ padding: 6 }}>
                <MaterialIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView>
              {plans.map((plan) => {
                const active = selectedPlan?.id === plan.id;
                const count = plan.id === selectedPlan?.id ? pins.length : undefined;
                return (
                  <Pressable
                    key={plan.id}
                    onPress={() => { setShowPlanPicker(false); if (!active) selectPlan(plan); }}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: active ? colors.primary + "12" : "transparent" }, pressed && { opacity: 0.7 }]}
                  >
                    <MaterialIcons name="layers" size={20} color={active ? colors.primary : colors.muted} />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: active ? "700" : "500", color: active ? colors.primary : colors.foreground }} numberOfLines={1}>
                      {decodeUnicodeEscapes(plan.name)}
                    </Text>
                    {count != null ? <Text style={{ fontSize: 12, color: colors.muted }}>{count}</Text> : null}
                    {active ? <MaterialIcons name="check" size={20} color={colors.primary} /> : null}
                    <Pressable
                      onPress={() => { setShowPlanPicker(false); removePlan(plan.id); }}
                      hitSlop={10}
                      style={({ pressed }) => [{ padding: 6, marginLeft: 2, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  moveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  planTabs: { maxHeight: 44, borderBottomWidth: 0, marginTop: 8 },
  planTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1,
    marginRight: 8,
  },
  planTabText: { fontSize: 13, fontWeight: "600" },
  planDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 0,
    borderWidth: 1,
  },
  planImageContainer: {
    borderRadius: 0,
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
    backgroundColor: "#061421",
  },
  planLoadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(2, 10, 19, 0.58)",
    zIndex: 30,
  },
  planLoadingText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  convertOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  convertText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  resetZoomButton: {
    position: "absolute",
    right: 10,
    top: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(4, 19, 32, 0.9)",
    borderWidth: 1,
    borderColor: "#58B7EF",
    zIndex: 40,
  },
  resetZoomText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  zoomControls: {
    position: "absolute",
    right: 10,
    top: 10,
    alignItems: "flex-end",
    gap: 8,
    zIndex: 40,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4, 19, 32, 0.9)",
    borderWidth: 1,
    borderColor: "#58B7EF",
    borderRadius: 8,
  },
  zoomBtnWide: {
    minHeight: 40,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(4, 19, 32, 0.9)",
    borderWidth: 1,
    borderColor: "#58B7EF",
    borderRadius: 8,
  },
  pin: {
    position: "absolute",
    alignItems: "center",
    zIndex: 10,
  },
  pinMarkerHighlight: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    transform: [{ scale: 1.4 }],
    // No shadow: a shadowed + transformed view is offscreen-rasterized on iOS,
    // which blurs when the canvas is zoomed and flickers while panning.
  },
  pinMarker: {
    width: 22,
    height: 22,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    // No shadow here (see pinMarkerHighlight): shadows force an offscreen pass
    // that upsamples a tiny rasterized bitmap when zoomed (blur) and recomposits
    // every frame while panning (flicker). The white border gives contrast.
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  instructionBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    marginTop: 12,
  },
  pinListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 6,
  },
  pinListDot: {
    width: 24,
    height: 24,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pinListItemFull: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 8,
  },
  pinListDotLarge: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  emptySubtext: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 0,
  },
  uploadBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalContent: {
    borderRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  typeBtn: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 0,
    borderWidth: 1.5,
  },
  typeBtnIcon: {
    width: 32,
    height: 32,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBtnText: { fontSize: 11, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 0, padding: 14, fontSize: 15, marginBottom: 12 },
  pinFieldLabel: { fontSize: 11, fontWeight: "700", color: "#8FA3B8", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 0, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  saveBtn: { flex: 1.5, paddingVertical: 14, borderRadius: 0, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  nameModalContent: {
    marginHorizontal: 24,
    borderRadius: 0,
    padding: 24,
  },
  detailModalContent: {
    borderRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  detailIcon: {
    width: 44,
    height: 44,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  detailDescBox: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 12,
  },
  protocolLinkStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
  },
  primaryDetailAction: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 0,
  },
  primaryDetailActionText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryDetailAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
  },
  protocolOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 8,
  },
  protocolOptionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 0,
  },
  protocolEmptyState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
  },
  cancelStandalone: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
    marginTop: 10,
  },
  detailCoords: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 0,
    marginBottom: 16,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 0,
    borderWidth: 1,
  },
});
