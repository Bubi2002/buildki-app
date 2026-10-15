import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line as SvgLine, Rect as SvgRect, Circle as SvgCircle, Text as SvgText, G as SvgG } from "react-native-svg";

import { ScreenContainer } from "@/components/screen-container";
import { ZoomableCanvas, type ZoomableCanvasHandle } from "@/components/zoomable-canvas";
import { screenPointToNormalized } from "@/lib/zoom-transform";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { pickImagesWithSource } from "@/lib/import-picker";
import { getFloorPlans, type FloorPlan } from "@/lib/floor-plan-store";
import {
  getRaumbuchEntry,
  saveRaumbuchEntry,
  RAUMBUCH_POSITIONS,
  RAUMBUCH_POSITION_LABEL_KEY,
  RAUMBUCH_SURVEY,
  type RaumbuchEntry,
  type RaumbuchPosition,
  type RaumbuchWallKey,
  type RaumbuchWall,
} from "@/lib/raumbuch-store";

const WALL_KEYS: RaumbuchWallKey[] = ["A", "B", "C", "D"];
const WALL_COLOR = "#2563EB";
// Distinct colour per wall, matching the Raumbuch PDF (A=Blau, B=Grün, C=Rot, D=Orange).
const WALL_COLORS: Record<RaumbuchWallKey, string> = { A: "#2563EB", B: "#16A34A", C: "#DC2626", D: "#EA580C" };
type PlanMode = "marker" | "crop" | "view" | RaumbuchWallKey;
// A sensible starting crop so the user ADJUSTS a frame instead of drawing one
// freehand on a small plan. Centred, covering most of the plan.
const DEFAULT_CROP = { x: 0.14, y: 0.14, w: 0.72, h: 0.72 };
// Apple-style crop (step 2): a crop FRAME that stays fixed in the viewport while
// the plan pans/zooms underneath it. Stored as a fraction of the plan box.
const DEFAULT_FRAME = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
const FRAME_MIN_PX = 64; // smallest the frame can be dragged to
const FRAME_CORNER_PX = 38; // touch radius to grab a corner
const FRAME_EDGE_PX = 26; // touch distance to grab an edge anywhere along its line

export default function RaumbuchRoomScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ projectId?: string; roomId?: string; floor?: string; room?: string }>();
  const projectId = params.projectId || "";
  const roomId = params.roomId || "";
  const floorName = params.floor || "";
  const roomName = params.room || "";

  const [entry, setEntry] = useState<RaumbuchEntry | null>(null);
  const [planModal, setPlanModal] = useState(false);
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [modalPlan, setModalPlan] = useState<FloorPlan | null>(null);
  const [tempPos, setTempPos] = useState<{ x: number; y: number } | null>(null);
  const [modalImgW, setModalImgW] = useState(0);
  // Available area for the plan in the (now near-fullscreen) editor.
  const [planBox, setPlanBox] = useState({ w: 0, h: 0 });
  const planAspect = useRef(1.4);
  // Guided flow: step 1 = Ausschnitt (crop), step 2 = Markieren (pin / walls).
  const [planStep, setPlanStep] = useState<1 | 2 | 3>(1);
  // Plan editing modes: place marker, draw a crop rectangle, or draw wall lines.
  const [planMode, setPlanMode] = useState<PlanMode>("crop");
  const [tempWalls, setTempWalls] = useState<Partial<Record<RaumbuchWallKey, RaumbuchWall>>>({});
  const [tempCrop, setTempCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Which element is being dragged (new line/box, a wall endpoint, a crop corner,
  // or a single crop edge).
  const dragRef = useRef<{ kind: "crop-new" | "crop-corner" | "crop-edge" | "crop-move" | "wall-new" | "wall-start" | "wall-end"; corner?: "tl" | "tr" | "bl" | "br"; edge?: "top" | "right" | "bottom" | "left"; start?: { x: number; y: number }; origin?: { x: number; y: number } } | null>(null);
  const canvasRef = useRef<ZoomableCanvasHandle | null>(null);
  // Apple-style crop frame (step 2), as a fraction of the plan box. Fixed in the
  // viewport; the plan moves/zooms behind it.
  const [cropFrame, setCropFrame] = useState(DEFAULT_FRAME);
  // Live gesture state for the frame: resize a corner/edge, or pan the image.
  const frameDragRef = useRef<
    | { mode: "pan"; last: { x: number; y: number } }
    | { mode: "moveframe"; startFrame: { x: number; y: number; w: number; h: number }; startPx: { x: number; y: number } }
    | { mode: "corner"; corner: "tl" | "tr" | "bl" | "br"; startFrame: { x: number; y: number; w: number; h: number } }
    | { mode: "edge"; edge: "top" | "right" | "bottom" | "left"; startFrame: { x: number; y: number; w: number; h: number } }
    | null
  >(null);
  // The plan box pixel size of the current render, so gesture callbacks can map
  // stage pixels ↔ frame fractions and inverse-transform the frame to a crop.
  const planPxRef = useRef({ pw: 0, ph: 0 });
  // Current zoom of the plan canvas, so overlay handles/lines can be drawn at a
  // CONSTANT screen size (counter-scaled by 1/zoom) instead of blowing up when
  // the user zooms in.
  const [canvasScale, setCanvasScale] = useState(1);
  // True once the user picked "Ganzer Plan" → don't re-seed the default crop.
  const clearedCropRef = useRef(false);

  // When marking (step 2) and a crop exists, zoom the plan into just that area so
  // the room fills the view and the walls are easy to place.
  // Step 3 renders ONLY the cropped region (scale 1, no pan) — like the Messen
  // tool — so walls draw as a clean line with draggable handles. Reset any pinch
  // zoom when the step/plan changes so we always start fitted.
  useEffect(() => {
    if (planBox.w <= 0) return;
    setCanvasScale(1);
    const id = setTimeout(() => canvasRef.current?.reset(), 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStep, planBox.w, planBox.h, modalPlan?.id]);

  // Map a view-normalised point (0..1 over what's shown) to FULL-plan coords.
  // In step 3 we show just the crop, so touches must be translated back.
  const viewToFull = (pt: { x: number; y: number }) => {
    const c = tempCrop;
    if (planStep === 3 && c && c.w > 0.02 && c.h > 0.02) {
      return { x: c.x + pt.x * c.w, y: c.y + pt.y * c.h };
    }
    return pt;
  };

  const blankEntry = (): RaumbuchEntry => ({
    projectId, roomId, floorName, roomName, photos: {}, notes: {}, updatedAt: new Date().toISOString(),
  });

  const load = useCallback(async () => {
    const e = await getRaumbuchEntry(projectId, roomId);
    setEntry(e || blankEntry());
    try { setPlans(await getFloorPlans(projectId)); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, roomId]);

  useEffect(() => { void load(); }, [load]);

  const persist = async (next: RaumbuchEntry) => {
    setEntry(next);
    try { await saveRaumbuchEntry(next); } catch {}
  };

  // ── Fragenkatalog (digital room survey) ──
  const survey = entry?.survey || {};
  const toggleSurvey = async (groupKey: string, option: string) => {
    const cur = entry || blankEntry();
    const checked = new Set(cur.survey?.checked?.[groupKey] || []);
    if (checked.has(option)) checked.delete(option); else checked.add(option);
    await persist({ ...cur, survey: { ...(cur.survey || {}), checked: { ...(cur.survey?.checked || {}), [groupKey]: Array.from(checked) } } });
  };
  const setSurveyOther = async (groupKey: string, text: string) => {
    const cur = entry || blankEntry();
    await persist({ ...cur, survey: { ...(cur.survey || {}), other: { ...(cur.survey?.other || {}), [groupKey]: text } } });
  };
  // User-added custom points per group. The point's EXISTENCE lives in `custom`
  // (so it stays in the list even when unchecked); whether it is ticked lives in
  // `checked` just like a predefined option. A new point starts ticked.
  const addSurveyCustom = async (groupKey: string, label: string) => {
    const txt = (label || "").trim();
    if (!txt) return;
    const cur = entry || blankEntry();
    const list = cur.survey?.custom?.[groupKey] || [];
    if (list.some((l) => l.toLowerCase() === txt.toLowerCase())) return; // no duplicates
    const checked = new Set(cur.survey?.checked?.[groupKey] || []);
    checked.add(txt);
    await persist({ ...cur, survey: { ...(cur.survey || {}),
      custom: { ...(cur.survey?.custom || {}), [groupKey]: [...list, txt] },
      checked: { ...(cur.survey?.checked || {}), [groupKey]: Array.from(checked) },
    } });
  };
  const removeSurveyCustom = async (groupKey: string, label: string) => {
    const cur = entry || blankEntry();
    const list = (cur.survey?.custom?.[groupKey] || []).filter((l) => l !== label);
    const checked = (cur.survey?.checked?.[groupKey] || []).filter((l) => l !== label);
    await persist({ ...cur, survey: { ...(cur.survey || {}),
      custom: { ...(cur.survey?.custom || {}), [groupKey]: list },
      checked: { ...(cur.survey?.checked || {}), [groupKey]: checked },
    } });
  };
  const promptCustomPoint = (groupKey: string) => {
    if (typeof Alert.prompt !== "function") return; // Alert.prompt is iOS-only
    Alert.prompt(
      t("raumbuch_survey_custom_title" as any),
      t("raumbuch_survey_custom_msg" as any),
      [
        { text: t("btn_abbrechen" as any), style: "cancel" },
        { text: t("hinzufuegen" as any), onPress: (val?: string) => void addSurveyCustom(groupKey, val || "") },
      ],
      "plain-text",
    );
  };
  const setSurveyDecision = async (decision: "freigabe" | "aenderung") => {
    const cur = entry || blankEntry();
    const next = cur.survey?.decision === decision ? undefined : decision;
    await persist({ ...cur, survey: { ...(cur.survey || {}), decision: next } });
  };
  const setSurveyNote = async (text: string) => {
    const cur = entry || blankEntry();
    await persist({ ...cur, survey: { ...(cur.survey || {}), decisionNote: text } });
  };

  const persistPhotoFile = async (uri: string, pos: RaumbuchPosition): Promise<string> => {
    try {
      const dir = `${FileSystem.documentDirectory}raumbuch/${projectId}/`;
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const dest = `${dir}${roomId}-${pos}-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      return dest;
    } catch { return uri; }
  };

  const addPhoto = async (pos: RaumbuchPosition) => {
    try {
      const picked = await pickImagesWithSource({ t, multiple: false, withCamera: true } as any);
      if (!picked || picked.length === 0) return;
      const saved = await persistPhotoFile(picked[0].uri, pos);
      const cur = entry || blankEntry();
      await persist({ ...cur, photos: { ...cur.photos, [pos]: saved } });
    } catch {}
  };

  const removePhoto = (pos: RaumbuchPosition) => {
    Alert.alert(t("alert_foto_entfernen" as any), t("msg_dieses_foto_vom_mangel_entfernen" as any), [
      { text: t("btn_abbrechen" as any), style: "cancel" },
      { text: t("btn_entfernen" as any), style: "destructive", onPress: async () => {
        const cur = entry || blankEntry();
        const photos = { ...cur.photos }; delete photos[pos];
        await persist({ ...cur, photos });
      } },
    ]);
  };

  // ── Grundriss-Markierung ───────────────────────────────────────────────────
  const openPlanMarker = async () => {
    const pl = await getFloorPlans(projectId);
    setPlans(pl);
    if (pl.length === 0) {
      Alert.alert(t("raumbuch_title" as any), t("raumbuch_no_plan_hint" as any));
      return;
    }
    const start = (entry?.planId && pl.find((p) => p.id === entry.planId)) || pl[0];
    setModalPlan(start);
    planAspect.current = start.width > 0 && start.height > 0 ? start.width / start.height : 1.4;
    const onStart = entry?.planId === start.id;
    setTempPos(onStart && entry?.planX != null ? { x: entry.planX!, y: entry.planY! } : null);
    setTempWalls(onStart && entry?.walls ? { ...entry.walls } : {});
    setTempCrop(onStart && entry?.planCrop ? { ...entry.planCrop } : null);
    setPlanStep(1);
    setPlanMode("view");
    dragRef.current = null;
    clearedCropRef.current = false;
    setPlanModal(true);
  };

  const onPlanLayout = (e: LayoutChangeEvent) => setModalImgW(e.nativeEvent.layout.width);

  // Marker mode: a tap places the pin.
  const onPlanTap = (pt: { x: number; y: number }) => {
    if (planMode === "marker") setTempPos(viewToFull(pt));
  };

  // Crop & wall modes: DRAG to draw (like the Messen tool) — pull a line between
  // the two points, or a crop rectangle; drag an existing corner/endpoint to
  // adjust it. Live, so the line/box follows your finger exactly.
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const near = (a: { x: number; y: number }, b: { x: number; y: number }, r = 0.055) => Math.hypot(a.x - b.x, a.y - b.y) < r;
  const onPlanDrag = (phase: "start" | "move" | "end", raw: { x: number; y: number }, scaleValue?: number, rawPx?: { x: number; y: number }) => {
    if (planMode === "marker" || planMode === "view") return; // no drawing in page-select/marker
    // ── Apple-style crop (step 2): the frame is FIXED in the viewport; dragging a
    // corner/edge resizes it, dragging anywhere else pans the plan underneath. We
    // work in stage pixels (rawPx) because the frame lives outside the zoom. ──
    if (planMode === "crop") {
      const { pw, ph } = planPxRef.current;
      if (!rawPx || pw <= 0 || ph <= 0) return;
      // The gesture's raw coords come from the ZOOMED canvas; map them to the
      // FIXED viewport (stage) pixels that the crop frame overlay uses, so the
      // hit-test/move keep working when the plan is zoomed in. (Identity at
      // scale 1 → unchanged behaviour there.)
      const tf = canvasRef.current?.getTransform?.() || { scale: 1, tx: 0, ty: 0 };
      const sc = Math.max(1, tf.scale);
      const px = (rawPx.x - pw / 2) * sc + pw / 2 + tf.tx;
      const py = (rawPx.y - ph / 2) * sc + ph / 2 + tf.ty;
      if (phase === "start") {
        const fx = cropFrame.x * pw, fy = cropFrame.y * ph, fw = cropFrame.w * pw, fh = cropFrame.h * ph;
        // Corners win first (grab anywhere near the corner point); otherwise grab
        // an EDGE anywhere along its line (not just the midpoint), so pulling a
        // side in/out works no matter where on the line you touch.
        let best: { kind: "corner" | "edge"; id: string } | null = null;
        let bestD = FRAME_CORNER_PX;
        const corners = [
          { id: "tl" as const, x: fx, y: fy },
          { id: "tr" as const, x: fx + fw, y: fy },
          { id: "bl" as const, x: fx, y: fy + fh },
          { id: "br" as const, x: fx + fw, y: fy + fh },
        ];
        for (const c of corners) { const d = Math.hypot(px - c.x, py - c.y); if (d < bestD) { bestD = d; best = { kind: "corner", id: c.id }; } }
        if (!best) {
          // Perpendicular distance to each side, but only within that side's span
          // (+ a little slack so the ends are reachable).
          const m = FRAME_EDGE_PX;
          const inX = px >= fx - m && px <= fx + fw + m;
          const inY = py >= fy - m && py <= fy + fh + m;
          let eBest: string | null = null, eBestD = FRAME_EDGE_PX;
          if (inX) { const d = Math.abs(py - fy); if (d < eBestD) { eBestD = d; eBest = "top"; } }
          if (inX) { const d = Math.abs(py - (fy + fh)); if (d < eBestD) { eBestD = d; eBest = "bottom"; } }
          if (inY) { const d = Math.abs(px - fx); if (d < eBestD) { eBestD = d; eBest = "left"; } }
          if (inY) { const d = Math.abs(px - (fx + fw)); if (d < eBestD) { eBestD = d; eBest = "right"; } }
          if (eBest) best = { kind: "edge", id: eBest };
        }
        if (best) {
          frameDragRef.current = best.kind === "corner"
            ? { mode: "corner", corner: best.id as any, startFrame: { ...cropFrame } }
            : { mode: "edge", edge: best.id as any, startFrame: { ...cropFrame } };
        } else if (px >= fx && px <= fx + fw && py >= fy && py <= fy + fh) {
          // Inside the frame (not on a handle) → move the WHOLE frame.
          frameDragRef.current = { mode: "moveframe", startFrame: { ...cropFrame }, startPx: { x: px, y: py } };
        } else {
          // Outside the frame (dim area) → pan the plan underneath.
          frameDragRef.current = { mode: "pan", last: { x: px, y: py } };
        }
      } else if (phase === "move") {
        const d = frameDragRef.current; if (!d) return;
        if (d.mode === "pan") {
          canvasRef.current?.panByPx(px - d.last.x, py - d.last.y);
          d.last = { x: px, y: py };
          return;
        }
        if (d.mode === "moveframe") {
          const dxF = (px - d.startPx.x) / pw, dyF = (py - d.startPx.y) / ph;
          const nx = Math.min(Math.max(0, d.startFrame.x + dxF), 1 - d.startFrame.w);
          const ny = Math.min(Math.max(0, d.startFrame.y + dyF), 1 - d.startFrame.h);
          setCropFrame({ x: nx, y: ny, w: d.startFrame.w, h: d.startFrame.h });
          return;
        }
        // Resize: edges move in stage px, the opposite side stays anchored.
        const sf = d.startFrame;
        let L = sf.x * pw, T = sf.y * ph, R = (sf.x + sf.w) * pw, B = (sf.y + sf.h) * ph;
        const nx = Math.min(pw, Math.max(0, px)), ny = Math.min(ph, Math.max(0, py));
        if (d.mode === "corner") {
          if (d.corner === "tl") { L = nx; T = ny; } else if (d.corner === "tr") { R = nx; T = ny; } else if (d.corner === "bl") { L = nx; B = ny; } else { R = nx; B = ny; }
        } else {
          if (d.edge === "top") T = ny; else if (d.edge === "bottom") B = ny; else if (d.edge === "left") L = nx; else R = nx;
        }
        // Normalise + enforce a minimum size, clamped to the plan box.
        let x1 = Math.min(L, R), x2 = Math.max(L, R), y1 = Math.min(T, B), y2 = Math.max(T, B);
        x1 = Math.min(x1, pw - FRAME_MIN_PX); x2 = Math.max(x2, x1 + FRAME_MIN_PX);
        y1 = Math.min(y1, ph - FRAME_MIN_PX); y2 = Math.max(y2, y1 + FRAME_MIN_PX);
        x1 = Math.max(0, x1); y1 = Math.max(0, y1); x2 = Math.min(pw, x2); y2 = Math.min(ph, y2);
        setCropFrame({ x: x1 / pw, y: y1 / ph, w: (x2 - x1) / pw, h: (y2 - y1) / ph });
      } else {
        frameDragRef.current = null;
      }
      return;
    }
    const full = viewToFull(raw);
    const pt = { x: clamp01(full.x), y: clamp01(full.y) };
    // Touch target in plan-space, kept roughly constant on screen: it shrinks as
    // you zoom in, so handles stay grabbable without overlapping each other.
    const sc = Math.max(1, scaleValue || 1);
    const grabR = Math.max(0.018, 0.06 / sc);
    // Wall modes A/B/C/D — draw like the Messen tool: DRAG a line from start to
    // end. If the drag begins on an existing endpoint, that endpoint is moved
    // instead (fine-tuning). One finger draws, two fingers zoom/pan.
    const key = planMode as RaumbuchWallKey;
    if (phase === "start") {
      const wl = tempWalls[key];
      if (wl) {
        if (near(pt, { x: wl.x1, y: wl.y1 }, grabR + 0.02)) { dragRef.current = { kind: "wall-start" }; return; }
        if (near(pt, { x: wl.x2, y: wl.y2 }, grabR + 0.02)) { dragRef.current = { kind: "wall-end" }; return; }
      }
      // Start a fresh line at the touch point; the end follows the finger.
      dragRef.current = { kind: "wall-new", start: pt };
      setTempWalls((prev) => ({ ...prev, [key]: { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y } }));
    } else if (phase === "move") {
      const d = dragRef.current; if (!d) return;
      setTempWalls((prev) => {
        const w = prev[key]; if (!w) return prev;
        if (d.kind === "wall-start") return { ...prev, [key]: { ...w, x1: pt.x, y1: pt.y } };
        return { ...prev, [key]: { ...w, x2: pt.x, y2: pt.y } }; // wall-end or wall-new
      });
    } else {
      dragRef.current = null;
      // No auto-straighten — the user draws the line exactly as dragged (so
      // diagonal walls like a Dachschräge stay diagonal).
      setTempWalls((prev) => {
        const w = prev[key]; if (!w) return prev;
        if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 0.02) { const n = { ...prev }; delete n[key]; return n; }
        return prev;
      });
    }
  };

  const selectMode = (m: PlanMode) => { setPlanMode(m); dragRef.current = null; };
  // Inverse-map the fixed crop frame (viewport) back to a normalised plan region,
  // accounting for the current pan/zoom of the plan underneath. Returns the crop
  // that step 3 and the saved entry use.
  const cropFromFrame = () => {
    const { pw, ph } = planPxRef.current;
    if (pw <= 0 || ph <= 0) return null;
    const tf = canvasRef.current?.getTransform?.() || { scale: 1, tx: 0, ty: 0 };
    const fx = cropFrame.x * pw, fy = cropFrame.y * ph, fw = cropFrame.w * pw, fh = cropFrame.h * ph;
    const tl = screenPointToNormalized({ x: fx, y: fy }, { width: pw, height: ph }, tf.scale, { x: tf.tx, y: tf.ty });
    const br = screenPointToNormalized({ x: fx + fw, y: fy + fh }, { width: pw, height: ph }, tf.scale, { x: tf.tx, y: tf.ty });
    const x = Math.min(tl.x, br.x), y = Math.min(tl.y, br.y), w = Math.abs(br.x - tl.x), h = Math.abs(br.y - tl.y);
    return w > 0.02 && h > 0.02 ? { x, y, w, h } : null;
  };
  const commitCropFromFrame = () => { setTempCrop(cropFromFrame()); };
  // Enter the crop step. The frame starts from an existing crop (returning to the
  // step) or a centred default, and the plan is reset to fit (so frame fractions
  // map 1:1 to plan coordinates at that moment).
  const enterStep2 = () => {
    setPlanStep(2);
    setPlanMode("crop");
    setCropFrame(tempCrop && tempCrop.w > 0.02 && tempCrop.h > 0.02
      ? { x: tempCrop.x, y: tempCrop.y, w: tempCrop.w, h: tempCrop.h }
      : DEFAULT_FRAME);
    frameDragRef.current = null;
    dragRef.current = null;
  };
  const placeMarkerCenter = () => {
    const c = tempCrop;
    setTempPos(c ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : { x: 0.5, y: 0.5 });
  };

  const confirmPlanMarker = async () => {
    if (modalPlan) {
      const cur = entry || blankEntry();
      await persist({
        ...cur,
        planId: modalPlan.id,
        planName: modalPlan.name,
        ...(tempPos ? { planX: tempPos.x, planY: tempPos.y } : {}),
        walls: Object.keys(tempWalls).length ? tempWalls : undefined,
        planCrop: tempCrop || undefined,
      });
    }
    setPlanModal(false);
  };

  const label = (pos: RaumbuchPosition) => t(RAUMBUCH_POSITION_LABEL_KEY[pos] as any);
  const planPreviewAspect = (() => {
    const p = plans.find((x) => x.id === entry?.planId);
    return p && p.width > 0 && p.height > 0 ? p.width / p.height : 1.6;
  })();

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{roomName}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>{floorName}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* Grundriss-Markierung */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("raumbuch_plan_section" as any)}</Text>
        {entry?.planId && (entry?.planX != null || entry?.planCrop || (entry?.walls && Object.keys(entry.walls).length > 0)) ? (
          <Pressable onPress={() => void openPlanMarker()} style={[styles.planCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <PlanWithMarker plan={plans.find((p) => p.id === entry.planId)} entryPlanId={entry.planId} planName={entry.planName} x={entry.planX} y={entry.planY} aspect={planPreviewAspect} projectId={projectId} crop={entry.planCrop} walls={entry.walls} />
            {/* Legend so the A/B/C/D lines on the plan map to the wall cards below. */}
            {entry.walls && Object.keys(entry.walls).length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 12, paddingTop: 10 }}>
                {WALL_KEYS.filter((k) => entry.walls?.[k]).map((k) => (
                  <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: WALL_COLORS[k] }} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>{t(RAUMBUCH_POSITION_LABEL_KEY[k] as any)}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={{ color: colors.primary, fontWeight: "700", textAlign: "center", paddingVertical: 10 }}>{t("raumbuch_edit_location" as any)}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => void openPlanMarker()} style={({ pressed }) => [styles.addPlanBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}>
            <MaterialIcons name="add-location-alt" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{t("raumbuch_set_plan" as any)}</Text>
          </Pressable>
        )}

        {/* Positionen */}
        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>{t("raumbuch_positions_section" as any)}</Text>
        <View style={styles.grid}>
          {RAUMBUCH_POSITIONS.map((pos) => {
            const photo = entry?.photos?.[pos];
            return (
              <View key={pos} style={[styles.slot, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  {(WALL_COLORS as Record<string, string>)[pos] && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: (WALL_COLORS as Record<string, string>)[pos] }} />
                  )}
                  <Text style={[styles.slotLabel, { color: colors.foreground, marginBottom: 0 }]}>{label(pos)}</Text>
                </View>
                {photo ? (
                  <Pressable onPress={() => void addPhoto(pos)} onLongPress={() => removePhoto(pos)}>
                    <Image source={{ uri: photo }} style={styles.slotPhoto} contentFit="cover" cachePolicy="memory-disk" />
                    <View style={styles.slotEdit}><MaterialIcons name="edit" size={14} color="#FFFFFF" /></View>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => void addPhoto(pos)} style={({ pressed }) => [styles.slotEmpty, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                    <MaterialIcons name="add-a-photo" size={26} color={colors.muted} />
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{t("measure_take_photo" as any)}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 10 }}>{t("raumbuch_longpress_remove" as any)}</Text>

        {/* ── Fragenkatalog (digital survey; shows up in the Fragenkatalog PDF) ── */}
        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 24 }]}>{t("raumbuch_survey_section" as any)}</Text>
        {RAUMBUCH_SURVEY.map((g) => {
          const checked = new Set(survey.checked?.[g.key] || []);
          return (
            <View key={g.key} style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>{g.label}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {g.options.map((o) => {
                  const on = checked.has(o);
                  return (
                    <Pressable key={o} onPress={() => void toggleSurvey(g.key, o)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "18" : colors.surface, opacity: pressed ? 0.7 : 1 }]}>
                      <MaterialIcons name={on ? "check-box" : "check-box-outline-blank"} size={16} color={on ? colors.primary : colors.muted} />
                      <Text style={{ fontSize: 12.5, fontWeight: on ? "700" : "600", color: on ? colors.primary : colors.foreground }}>{o}</Text>
                    </Pressable>
                  );
                })}
                {/* User-added custom points: tap to check/uncheck (stays in the
                    list either way); tap the ✕ to remove it completely. */}
                {(survey.custom?.[g.key] || []).map((c) => {
                  const on = checked.has(c);
                  return (
                    <Pressable key={`cust-${c}`} onPress={() => void toggleSurvey(g.key, c)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "18" : colors.surface, opacity: pressed ? 0.7 : 1 }]}>
                      <MaterialIcons name={on ? "check-box" : "check-box-outline-blank"} size={16} color={on ? colors.primary : colors.muted} />
                      <Text style={{ fontSize: 12.5, fontWeight: on ? "700" : "600", color: on ? colors.primary : colors.foreground }}>{c}</Text>
                      <Pressable onPress={() => void removeSurveyCustom(g.key, c)} hitSlop={8} style={{ marginLeft: 2 }}>
                        <MaterialIcons name="close" size={15} color={colors.muted} />
                      </Pressable>
                    </Pressable>
                  );
                })}
                {/* Add your own point instead of only "Sonstiges". */}
                <Pressable onPress={() => promptCustomPoint(g.key)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: colors.muted, backgroundColor: "transparent", opacity: pressed ? 0.6 : 1 }]}>
                  <MaterialIcons name="add" size={16} color={colors.muted} />
                  <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.muted }}>{t("raumbuch_survey_add_point" as any)}</Text>
                </Pressable>
              </View>
              {checked.has("Sonstiges") && (
                <TextInput
                  key={`other-${g.key}-${entry ? "l" : "e"}`}
                  defaultValue={survey.other?.[g.key] || ""}
                  onEndEditing={(e) => void setSurveyOther(g.key, e.nativeEvent.text)}
                  placeholder={t("raumbuch_survey_other_ph" as any)}
                  placeholderTextColor={colors.muted}
                  style={{ marginTop: 8, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface }}
                />
              )}
            </View>
          );
        })}

        {/* Freigabe / Änderung */}
        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 20, marginBottom: 8 }}>{t("raumbuch_survey_decision" as any)}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([
            { key: "freigabe" as const, label: t("raumbuch_survey_freigabe" as any), col: "#16A34A" },
            { key: "aenderung" as const, label: t("raumbuch_survey_aenderung" as any), col: "#DC2626" },
          ]).map((d) => {
            const on = survey.decision === d.key;
            return (
              <Pressable key={d.key} onPress={() => void setSurveyDecision(d.key)} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: on ? d.col : colors.border, backgroundColor: on ? d.col + "18" : colors.surface, opacity: pressed ? 0.7 : 1 }]}>
                <MaterialIcons name={on ? "radio-button-checked" : "radio-button-unchecked"} size={18} color={on ? d.col : colors.muted} />
                <Text style={{ fontSize: 13, fontWeight: on ? "800" : "600", color: on ? d.col : colors.muted }}>{d.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {survey.decision === "aenderung" && (
          <TextInput
            key={`note-${entry ? "l" : "e"}`}
            defaultValue={survey.decisionNote || ""}
            onEndEditing={(e) => void setSurveyNote(e.nativeEvent.text)}
            placeholder={t("raumbuch_survey_change_ph" as any)}
            placeholderTextColor={colors.muted}
            multiline
            style={{ marginTop: 8, minHeight: 70, textAlignVertical: "top", fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface }}
          />
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Plan marker modal */}
      <Modal visible={planModal} transparent animationType="slide" onRequestClose={() => setPlanModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12) + 4 }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }} numberOfLines={1}>{`${t("raumbuch_step" as any)} ${planStep}: ${planStep === 1 ? t("raumbuch_step_plan" as any) : planStep === 2 ? t("raumbuch_mode_crop" as any) : t("raumbuch_step2_short" as any)}`}</Text>
                {!!roomName && (
                  <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                    <MaterialIcons name="meeting-room" size={13} color={colors.muted} /> {roomName}{floorName ? ` · ${floorName}` : ""}
                  </Text>
                )}
              </View>
              <Pressable onPress={() => setPlanModal(false)} hitSlop={8} style={{ paddingTop: 2 }}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            {/* Step indicator: 1 = Plan/Seite wählen, 2 = Ausschnitt, 3 = Markieren */}
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
              {([1, 2, 3] as const).map((s) => (
                <Pressable key={s} onPress={() => { if (s === 2) { enterStep2(); } else { setPlanStep(s); setPlanMode(s === 1 ? "view" : "A"); dragRef.current = null; } }} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: planStep === s ? colors.primary : colors.border, backgroundColor: planStep === s ? colors.primary + "18" : colors.surface }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: planStep === s ? colors.primary : colors.muted + "40", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: planStep === s ? "#fff" : colors.muted }}>{s}</Text>
                  </View>
                  <Text style={{ fontSize: 11.5, fontWeight: "700", color: planStep === s ? colors.primary : colors.muted }} numberOfLines={1}>{s === 1 ? t("raumbuch_step_plan" as any) : s === 2 ? t("raumbuch_mode_crop" as any) : t("raumbuch_step2_short" as any)}</Text>
                </Pressable>
              ))}
            </View>
            {plans.length > 1 && planStep === 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: "center", paddingBottom: 6 }}>
                {plans.map((p) => {
                  const active = modalPlan?.id === p.id;
                  return (
                    <Pressable key={p.id} onPress={() => { setModalPlan(p); planAspect.current = p.width > 0 && p.height > 0 ? p.width / p.height : 1.4; setTempPos(null); setTempWalls({}); setTempCrop(null); dragRef.current = null; clearedCropRef.current = false; }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surface }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: active ? colors.primary : colors.muted }} numberOfLines={1}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {/* Step 3 mode toolbar: centre pin or draw wall lines A–D. */}
            {modalPlan && planStep === 3 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: "center", paddingBottom: 6 }}>
                {/* "Markierung" (manual pin) removed on request — only walls + a
                    quick centre pin remain. */}
                <Pressable onPress={() => { placeMarkerCenter(); }} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: tempPos ? colors.primary : colors.border, backgroundColor: tempPos ? colors.primary + "18" : colors.surface }}>
                  <MaterialIcons name="center-focus-strong" size={15} color={tempPos ? colors.primary : colors.muted} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: tempPos ? colors.primary : colors.muted }}>{t("raumbuch_marker_center" as any)}</Text>
                  {tempPos ? <MaterialIcons name="check-circle" size={13} color="#16A34A" /> : null}
                </Pressable>
                {WALL_KEYS.map((k) => {
                  const active = planMode === k;
                  return (
                    <Pressable key={k} onPress={() => selectMode(k)} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surface }}>
                      <MaterialIcons name="straighten" size={15} color={active ? colors.primary : colors.muted} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: active ? colors.primary : colors.muted }}>{t(RAUMBUCH_POSITION_LABEL_KEY[k] as any)}</Text>
                      {tempWalls[k] ? <MaterialIcons name="check-circle" size={13} color="#16A34A" /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {modalPlan && (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", marginVertical: 6 }} onLayout={(e) => setPlanBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
                {planBox.w > 0 && planBox.h > 0 && (() => {
                  // In step 3 show ONLY the cropped region (so walls are drawn big,
                  // like the Messen tool). Elsewhere show the full plan.
                  const fullAspect = planAspect.current || 1.4;
                  const useCrop = planStep === 3 && !!tempCrop && tempCrop.w > 0.02 && tempCrop.h > 0.02;
                  const cw = useCrop ? tempCrop!.w : 1, ch = useCrop ? tempCrop!.h : 1, cxN = useCrop ? tempCrop!.x : 0, cyN = useCrop ? tempCrop!.y : 0;
                  const viewAspect = (cw * fullAspect) / ch;
                  let pw = planBox.w, ph = pw / viewAspect;
                  if (ph > planBox.h) { ph = planBox.h; pw = ph * viewAspect; }
                  // Remember the plan box pixel size so the crop gesture can map
                  // stage pixels ↔ frame fractions (step 2 shows the full plan).
                  planPxRef.current = { pw, ph };
                  // Apple-style crop frame in stage pixels (step 2).
                  const fx = cropFrame.x * pw, fy = cropFrame.y * ph, fw = cropFrame.w * pw, fh = cropFrame.h * ph;
                  // Full-plan normalised → view pixels.
                  const toVX = (nx: number) => ((nx - cxN) / cw) * pw;
                  const toVY = (ny: number) => ((ny - cyN) / ch) * ph;
                  const imgStyle = useCrop
                    ? { position: "absolute" as const, width: pw / cw, height: ph / ch, left: -cxN * (pw / cw), top: -cyN * (ph / ch) }
                    : { width: "100%" as const, height: "100%" as const };
                  // The whole SVG overlay is scaled by the pinch zoom, so divide
                  // every handle/line size by the zoom to keep it a CONSTANT size
                  // on screen (no more giant dots when zoomed in).
                  const hs = 1 / Math.max(1, canvasScale);
                  return (
                    <View style={{ width: pw, height: ph, borderRadius: 8, overflow: "hidden", backgroundColor: "#FFFFFF" }}>
                      <ZoomableCanvas
                        ref={canvasRef}
                        width={pw}
                        height={ph}
                        maxScale={6}
                        onSingleTap={onPlanTap}
                        onPinDrag={onPlanDrag}
                        onZoomChange={setCanvasScale}
                        dragImmediate={planMode !== "marker" && planMode !== "view"}
                      >
                        <View style={{ width: pw, height: ph }}>
                          <Image source={{ uri: modalPlan.imageUri }} style={imgStyle} contentFit="fill" allowDownscaling={false} />
                          <Svg pointerEvents="none" style={{ position: "absolute", left: 0, top: 0 }} width={pw} height={ph}>
                            {WALL_KEYS.map((k) => {
                              const wline = tempWalls[k]; if (!wline) return null;
                              const active = planMode === k;
                              // Each wall keeps its own colour; the active one is just drawn thicker.
                              const col = WALL_COLORS[k] || WALL_COLOR;
                              const x1 = toVX(wline.x1), y1 = toVY(wline.y1), x2 = toVX(wline.x2), y2 = toVY(wline.y2);
                              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                              return (
                                <SvgG key={k}>
                                  <SvgLine x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={(active ? 4.5 : 3.5) * hs} strokeLinecap="round" />
                                  {active && (
                                    <SvgG>
                                      <SvgCircle cx={x1} cy={y1} r={7 * hs} fill="#ffffff" stroke={col} strokeWidth={2.5 * hs} />
                                      <SvgCircle cx={x2} cy={y2} r={7 * hs} fill="#ffffff" stroke={col} strokeWidth={2.5 * hs} />
                                    </SvgG>
                                  )}
                                  <SvgText x={mx} y={my - 9 * hs} fill="#FFFFFF" stroke="#0f1b2b" strokeWidth={0.7 * hs} fontSize={12 * hs} fontWeight="bold" textAnchor="middle">{k}</SvgText>
                                </SvgG>
                              );
                            })}
                          </Svg>
                          {tempPos && (
                            <>
                              {/* Pin tip sits exactly on the point; the small dot marks it precisely. */}
                              <View pointerEvents="none" style={{ position: "absolute", left: toVX(tempPos.x) - 15, top: toVY(tempPos.y) - 30 }}>
                                <MaterialIcons name="place" size={30} color="#DC2626" />
                              </View>
                              <View pointerEvents="none" style={{ position: "absolute", left: toVX(tempPos.x) - 3, top: toVY(tempPos.y) - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#DC2626" }} />
                            </>
                          )}
                        </View>
                      </ZoomableCanvas>
                      {/* Apple-style crop frame — FIXED over the viewport (outside
                          the zoom transform), so the plan pans/zooms underneath
                          while the frame stays put. Purely visual; the gesture is
                          handled by onPlanDrag via raw stage pixels. */}
                      {planStep === 2 && (
                        <Svg pointerEvents="none" style={{ position: "absolute", left: 0, top: 0 }} width={pw} height={ph}>
                          {/* Dim everything outside the frame. */}
                          <SvgRect x={0} y={0} width={pw} height={fy} fill="rgba(10,15,25,0.5)" />
                          <SvgRect x={0} y={fy + fh} width={pw} height={Math.max(0, ph - (fy + fh))} fill="rgba(10,15,25,0.5)" />
                          <SvgRect x={0} y={fy} width={fx} height={fh} fill="rgba(10,15,25,0.5)" />
                          <SvgRect x={fx + fw} y={fy} width={Math.max(0, pw - (fx + fw))} height={fh} fill="rgba(10,15,25,0.5)" />
                          {/* Rule-of-thirds grid. */}
                          <SvgLine x1={fx + fw / 3} y1={fy} x2={fx + fw / 3} y2={fy + fh} stroke="rgba(255,255,255,0.45)" strokeWidth={0.75} />
                          <SvgLine x1={fx + (2 * fw) / 3} y1={fy} x2={fx + (2 * fw) / 3} y2={fy + fh} stroke="rgba(255,255,255,0.45)" strokeWidth={0.75} />
                          <SvgLine x1={fx} y1={fy + fh / 3} x2={fx + fw} y2={fy + fh / 3} stroke="rgba(255,255,255,0.45)" strokeWidth={0.75} />
                          <SvgLine x1={fx} y1={fy + (2 * fh) / 3} x2={fx + fw} y2={fy + (2 * fh) / 3} stroke="rgba(255,255,255,0.45)" strokeWidth={0.75} />
                          {/* Frame border. */}
                          <SvgRect x={fx} y={fy} width={fw} height={fh} fill="none" stroke="#FFFFFF" strokeWidth={1.5} />
                          {/* Corner brackets (L-shapes) — the grab targets. */}
                          {([[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]] as const).map(([cx, cy, sx, sy], i) => (
                            <SvgG key={`cb${i}`}>
                              <SvgLine x1={cx} y1={cy} x2={cx + sx * 20} y2={cy} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
                              <SvgLine x1={cx} y1={cy} x2={cx} y2={cy + sy * 20} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
                            </SvgG>
                          ))}
                          {/* Edge handles (short bars). */}
                          <SvgLine x1={fx + fw / 2 - 14} y1={fy} x2={fx + fw / 2 + 14} y2={fy} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
                          <SvgLine x1={fx + fw / 2 - 14} y1={fy + fh} x2={fx + fw / 2 + 14} y2={fy + fh} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
                          <SvgLine x1={fx} y1={fy + fh / 2 - 14} x2={fx} y2={fy + fh / 2 + 14} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
                          <SvgLine x1={fx + fw} y1={fy + fh / 2 - 14} x2={fx + fw} y2={fy + fh / 2 + 14} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
                        </Svg>
                      )}
                    </View>
                  );
                })()}
              </View>
            )}
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
              {planStep === 1
                ? t("raumbuch_plan_hint" as any)
                : planStep === 2
                ? t("raumbuch_crop_hint" as any)
                : t("raumbuch_wall_hint" as any)}
              {" · "}{t("fullscreen_photo_viewer_zoom_hint" as any)}
            </Text>
            {((planStep === 2) || (planStep === 3 && Object.keys(tempWalls).length > 0)) && (
              <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
                {planStep === 2 && (
                  <Pressable onPress={() => { setCropFrame({ x: 0, y: 0, w: 1, h: 1 }); canvasRef.current?.reset(); }} hitSlop={6}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>{t("raumbuch_crop_reset" as any)}</Text></Pressable>
                )}
                {planStep === 3 && Object.keys(tempWalls).length > 0 && (
                  <Pressable onPress={() => { setTempWalls({}); dragRef.current = null; }} hitSlop={6}><Text style={{ fontSize: 12, fontWeight: "700", color: "#DC2626" }}>{t("raumbuch_walls_clear" as any)}</Text></Pressable>
                )}
              </View>
            )}
            {/* Step navigation: 1 Plan → 2 Ausschnitt → 3 Markieren */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => { if (planStep === 1) { setPlanModal(false); } else if (planStep === 3) { enterStep2(); } else { setPlanStep(1); setPlanMode("view"); dragRef.current = null; } }}
                style={({ pressed }) => [styles.modalBtnGhost, { borderColor: colors.border, opacity: pressed ? 0.7 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }]}
              >
                {planStep > 1 ? <MaterialIcons name="arrow-back" size={18} color={colors.muted} /> : null}
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{planStep === 1 ? t("btn_abbrechen" as any) : t("btn_zurueck" as any)}</Text>
              </Pressable>
              {planStep < 3 ? (
                <Pressable onPress={() => { if (planStep === 1) { enterStep2(); } else { commitCropFromFrame(); setPlanStep(3); setPlanMode("A"); dragRef.current = null; } }} disabled={!modalPlan} style={({ pressed }) => [styles.modalBtnPrimary, { backgroundColor: colors.primary, opacity: !modalPlan ? 0.4 : pressed ? 0.85 : 1 }]}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFFFFF" }}>{t("btn_weiter" as any)}</Text>
                  <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
                </Pressable>
              ) : (
                <Pressable onPress={() => void confirmPlanMarker()} disabled={!modalPlan} style={({ pressed }) => [styles.modalBtnPrimary, { backgroundColor: colors.primary, opacity: !modalPlan ? 0.4 : pressed ? 0.85 : 1 }]}>
                  <MaterialIcons name="check" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFFFFF" }}>{t("save" as any)}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function PlanWithMarker({ plan, entryPlanId, planName, x, y, aspect, projectId, crop, walls }: { plan?: FloorPlan; entryPlanId?: string; planName?: string; x?: number; y?: number; aspect: number; projectId: string; crop?: { x: number; y: number; w: number; h: number }; walls?: Partial<Record<RaumbuchWallKey, RaumbuchWall>> }) {
  const colors = useColors();
  const [w, setW] = useState(0);
  const [uri, setUri] = useState<string | null>(plan?.imageUri || null);
  // If the plan list hasn't loaded (plan undefined), fetch the image uri by id.
  useEffect(() => {
    let active = true;
    if (plan?.imageUri) { setUri(plan.imageUri); return; }
    if (entryPlanId) {
      (async () => { const pl = await getFloorPlans(projectId); const p = pl.find((x2) => x2.id === entryPlanId); if (active && p) setUri(p.imageUri); })();
    }
    return () => { active = false; };
  }, [plan?.imageUri, entryPlanId, projectId]);
  if (!uri) return <View style={{ height: 140, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.muted }}>{planName || ""}</Text></View>;
  const A = aspect || 1.6;
  const cx = crop?.x ?? 0, cy = crop?.y ?? 0, cw = crop?.w ?? 1, ch = crop?.h ?? 1;
  const contAspect = (cw * A) / ch;
  const contH = w > 0 ? w / contAspect : 0;
  const imgW = w / cw, imgH = imgW / A;
  const toX = (px: number) => ((px - cx) / cw) * w;
  const toY = (py: number) => ((py - cy) / ch) * contH;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: "100%", aspectRatio: contAspect, backgroundColor: "#FFFFFF", overflow: "hidden" }}>
      {w > 0 && (
        <Image source={{ uri }} style={{ position: "absolute", width: imgW, height: imgH, left: -cx * imgW, top: -cy * imgH }} contentFit="fill" allowDownscaling={false} />
      )}
      {w > 0 && walls && (
        <Svg pointerEvents="none" style={{ position: "absolute", left: 0, top: 0 }} width={w} height={contH}>
          {WALL_KEYS.map((k) => {
            const wl = walls[k]; if (!wl) return null;
            const mx = (toX(wl.x1) + toX(wl.x2)) / 2, my = (toY(wl.y1) + toY(wl.y2)) / 2;
            return (
              <SvgG key={k}>
                <SvgLine x1={toX(wl.x1)} y1={toY(wl.y1)} x2={toX(wl.x2)} y2={toY(wl.y2)} stroke={WALL_COLORS[k] || WALL_COLOR} strokeWidth={3.5} strokeLinecap="round" />
                <SvgText x={mx} y={my - 4} fill="#FFFFFF" stroke="#0f1b2b" strokeWidth={0.7} fontSize={11} fontWeight="bold" textAnchor="middle">{k}</SvgText>
              </SvgG>
            );
          })}
        </Svg>
      )}
      {x != null && y != null && w > 0 && (
        <View style={{ position: "absolute", left: toX(x) - 13, top: toY(y) - 26 }}>
          <MaterialIcons name="place" size={28} color="#DC2626" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 74, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: 1 },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  planCard: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  addPlanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderWidth: 1, borderRadius: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  slot: { width: "47.5%", borderWidth: 1, borderRadius: 12, padding: 10 },
  slotLabel: { fontSize: 13, fontWeight: "800", marginBottom: 8 },
  slotPhoto: { width: "100%", height: 110, borderRadius: 8, backgroundColor: "#00000010" },
  slotEdit: { position: "absolute", right: 6, bottom: 6, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, padding: 4 },
  slotEmpty: { width: "100%", height: 110, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  // Full height so the plan editor is as large as possible on the phone
  // (paddingTop is set inline from the safe-area inset so nothing hides under
  // the status bar / notch).
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingBottom: 16, height: "100%" },
  modalBtnGhost: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  modalBtnPrimary: { flex: 2, paddingVertical: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
