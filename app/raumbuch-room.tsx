import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Line as SvgLine, Rect as SvgRect, Circle as SvgCircle, Text as SvgText, G as SvgG } from "react-native-svg";

import { ScreenContainer } from "@/components/screen-container";
import { ZoomableCanvas, type ZoomableCanvasHandle } from "@/components/zoomable-canvas";
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

export default function RaumbuchRoomScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
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

  // When marking (step 2) and a crop exists, zoom the plan into just that area so
  // the room fills the view and the walls are easy to place.
  useEffect(() => {
    if (planBox.w <= 0) return;
    const id = setTimeout(() => {
      if (planStep === 3 && tempCrop && tempCrop.w > 0.02 && tempCrop.h > 0.02) canvasRef.current?.zoomToRegion(tempCrop);
      else canvasRef.current?.reset();
    }, 80);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStep, planBox.w, planBox.h, modalPlan?.id]);

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
    setPlanModal(true);
  };

  const onPlanLayout = (e: LayoutChangeEvent) => setModalImgW(e.nativeEvent.layout.width);

  // Marker mode: a tap places the pin.
  const onPlanTap = (pt: { x: number; y: number }) => {
    if (planMode === "marker") setTempPos(pt);
  };

  // Crop & wall modes: DRAG to draw (like the Messen tool) — pull a line between
  // the two points, or a crop rectangle; drag an existing corner/endpoint to
  // adjust it. Live, so the line/box follows your finger exactly.
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const near = (a: { x: number; y: number }, b: { x: number; y: number }, r = 0.055) => Math.hypot(a.x - b.x, a.y - b.y) < r;
  const onPlanDrag = (phase: "start" | "move" | "end", raw: { x: number; y: number }) => {
    if (planMode === "marker" || planMode === "view") return; // no drawing in page-select/marker
    const pt = { x: clamp01(raw.x), y: clamp01(raw.y) };
    if (planMode === "crop") {
      if (phase === "start") {
        const c = tempCrop;
        if (c) {
          // Corners (resize two edges) first, then edge midpoints (move one edge).
          const corners: Record<string, { x: number; y: number }> = {
            tl: { x: c.x, y: c.y }, tr: { x: c.x + c.w, y: c.y }, bl: { x: c.x, y: c.y + c.h }, br: { x: c.x + c.w, y: c.y + c.h },
          };
          const hitC = (["tl", "tr", "bl", "br"] as const).find((k) => near(pt, corners[k], 0.08));
          if (hitC) { dragRef.current = { kind: "crop-corner", corner: hitC }; return; }
          const edges: Record<string, { x: number; y: number }> = {
            top: { x: c.x + c.w / 2, y: c.y }, bottom: { x: c.x + c.w / 2, y: c.y + c.h }, left: { x: c.x, y: c.y + c.h / 2 }, right: { x: c.x + c.w, y: c.y + c.h / 2 },
          };
          const hitE = (["top", "right", "bottom", "left"] as const).find((k) => near(pt, edges[k], 0.08));
          if (hitE) { dragRef.current = { kind: "crop-edge", edge: hitE }; return; }
          // Touch INSIDE the box (not on a handle) → move the whole box.
          if (pt.x > c.x && pt.x < c.x + c.w && pt.y > c.y && pt.y < c.y + c.h) {
            dragRef.current = { kind: "crop-move", start: pt, origin: { x: c.x, y: c.y } };
            return;
          }
        }
        dragRef.current = { kind: "crop-new", start: pt };
        setTempCrop({ x: pt.x, y: pt.y, w: 0, h: 0 });
      } else if (phase === "move") {
        const d = dragRef.current; if (!d) return;
        if (d.kind === "crop-move" && d.start && d.origin) {
          const dx = pt.x - d.start.x, dy = pt.y - d.start.y;
          setTempCrop((c) => {
            if (!c) return c;
            const nx = Math.max(0, Math.min(1 - c.w, d.origin!.x + dx));
            const ny = Math.max(0, Math.min(1 - c.h, d.origin!.y + dy));
            return { ...c, x: nx, y: ny };
          });
        } else if (d.kind === "crop-new" && d.start) {
          const a = d.start;
          setTempCrop({ x: Math.min(a.x, pt.x), y: Math.min(a.y, pt.y), w: Math.abs(a.x - pt.x), h: Math.abs(a.y - pt.y) });
        } else if (d.kind === "crop-corner") {
          setTempCrop((c) => {
            if (!c) return c;
            let x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h;
            if (d.corner === "tl") { x1 = pt.x; y1 = pt.y; } else if (d.corner === "tr") { x2 = pt.x; y1 = pt.y; } else if (d.corner === "bl") { x1 = pt.x; y2 = pt.y; } else { x2 = pt.x; y2 = pt.y; }
            return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
          });
        } else if (d.kind === "crop-edge") {
          setTempCrop((c) => {
            if (!c) return c;
            let x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h;
            if (d.edge === "top") y1 = pt.y; else if (d.edge === "bottom") y2 = pt.y; else if (d.edge === "left") x1 = pt.x; else x2 = pt.x;
            return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
          });
        }
      } else {
        dragRef.current = null;
        setTempCrop((c) => (c && c.w > 0.03 && c.h > 0.03 ? c : null));
      }
      return;
    }
    // Wall modes A/B/C/D.
    const key = planMode as RaumbuchWallKey;
    if (phase === "start") {
      const wl = tempWalls[key];
      if (wl) {
        if (near(pt, { x: wl.x1, y: wl.y1 })) { dragRef.current = { kind: "wall-start" }; return; }
        if (near(pt, { x: wl.x2, y: wl.y2 })) { dragRef.current = { kind: "wall-end" }; return; }
      }
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
        {entry?.planX != null && entry?.planId ? (
          <Pressable onPress={() => void openPlanMarker()} style={[styles.planCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <PlanWithMarker plan={plans.find((p) => p.id === entry.planId)} entryPlanId={entry.planId} planName={entry.planName} x={entry.planX} y={entry.planY} aspect={planPreviewAspect} projectId={projectId} crop={entry.planCrop} walls={entry.walls} />
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
                <Text style={[styles.slotLabel, { color: colors.foreground }]}>{label(pos)}</Text>
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
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>{`${t("raumbuch_step" as any)} ${planStep}: ${planStep === 1 ? t("raumbuch_step_plan" as any) : planStep === 2 ? t("raumbuch_mode_crop" as any) : t("raumbuch_step2_short" as any)}`}</Text>
              <Pressable onPress={() => setPlanModal(false)} hitSlop={8}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            {/* Step indicator: 1 = Plan/Seite wählen, 2 = Ausschnitt, 3 = Markieren */}
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
              {([1, 2, 3] as const).map((s) => (
                <Pressable key={s} onPress={() => { setPlanStep(s); setPlanMode(s === 1 ? "view" : s === 2 ? "crop" : "A"); dragRef.current = null; }} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: planStep === s ? colors.primary : colors.border, backgroundColor: planStep === s ? colors.primary + "18" : colors.surface }}>
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
                    <Pressable key={p.id} onPress={() => { setModalPlan(p); planAspect.current = p.width > 0 && p.height > 0 ? p.width / p.height : 1.4; setTempPos(null); setTempWalls({}); setTempCrop(null); dragRef.current = null; }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surface }}>
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
                  // Fit the plan into the available box (contain), as large as possible.
                  const aspect = planAspect.current || 1.4;
                  let pw = planBox.w, ph = pw / aspect;
                  if (ph > planBox.h) { ph = planBox.h; pw = ph * aspect; }
                  return (
                    <View style={{ width: pw, height: ph, borderRadius: 8, overflow: "hidden", backgroundColor: "#FFFFFF" }}>
                      <ZoomableCanvas
                        ref={canvasRef}
                        width={pw}
                        height={ph}
                        maxScale={6}
                        onSingleTap={onPlanTap}
                        onPinDrag={onPlanDrag}
                        dragImmediate={planMode !== "marker" && planMode !== "view"}
                      >
                        <View style={{ width: pw, height: ph }}>
                          <Image source={{ uri: modalPlan.imageUri }} style={{ width: "100%", height: "100%" }} contentFit="fill" allowDownscaling={false} />
                          <Svg pointerEvents="none" style={{ position: "absolute", left: 0, top: 0 }} width={pw} height={ph}>
                            {tempCrop && planStep !== 3 && (
                              <SvgG>
                                <SvgRect x={tempCrop.x * pw} y={tempCrop.y * ph} width={tempCrop.w * pw} height={tempCrop.h * ph} fill="rgba(37,99,235,0.10)" stroke={WALL_COLOR} strokeWidth={2} strokeDasharray="6,5" />
                                {planMode === "crop" && (
                                  <SvgG>
                                    {/* Corner handles (resize two sides). */}
                                    {([[tempCrop.x, tempCrop.y], [tempCrop.x + tempCrop.w, tempCrop.y], [tempCrop.x, tempCrop.y + tempCrop.h], [tempCrop.x + tempCrop.w, tempCrop.y + tempCrop.h]] as const).map(([cx, cy], i) => (
                                      <SvgCircle key={`c${i}`} cx={cx * pw} cy={cy * ph} r={8} fill="#ffffff" stroke={WALL_COLOR} strokeWidth={2.5} />
                                    ))}
                                    {/* Edge handles (move one side). */}
                                    {([[tempCrop.x + tempCrop.w / 2, tempCrop.y], [tempCrop.x + tempCrop.w, tempCrop.y + tempCrop.h / 2], [tempCrop.x + tempCrop.w / 2, tempCrop.y + tempCrop.h], [tempCrop.x, tempCrop.y + tempCrop.h / 2]] as const).map(([cx, cy], i) => (
                                      <SvgRect key={`e${i}`} x={cx * pw - 7} y={cy * ph - 7} width={14} height={14} rx={3} fill={WALL_COLOR} stroke="#ffffff" strokeWidth={2} />
                                    ))}
                                  </SvgG>
                                )}
                              </SvgG>
                            )}
                            {WALL_KEYS.map((k) => {
                              const wline = tempWalls[k]; if (!wline) return null;
                              const active = planMode === k;
                              // Each wall keeps its own colour; the active one is just drawn thicker.
                              const col = WALL_COLORS[k] || WALL_COLOR;
                              const mx = ((wline.x1 + wline.x2) / 2) * pw, my = ((wline.y1 + wline.y2) / 2) * ph;
                              return (
                                <SvgG key={k}>
                                  <SvgLine x1={wline.x1 * pw} y1={wline.y1 * ph} x2={wline.x2 * pw} y2={wline.y2 * ph} stroke={col} strokeWidth={active ? 4 : 3} strokeLinecap="round" />
                                  {active && (
                                    <SvgG>
                                      <SvgCircle cx={wline.x1 * pw} cy={wline.y1 * ph} r={7} fill="#ffffff" stroke={col} strokeWidth={2.5} />
                                      <SvgCircle cx={wline.x2 * pw} cy={wline.y2 * ph} r={7} fill="#ffffff" stroke={col} strokeWidth={2.5} />
                                    </SvgG>
                                  )}
                                  <SvgText x={mx} y={my - 8} fill="#FFFFFF" stroke="#0f1b2b" strokeWidth={0.8} fontSize={13} fontWeight="bold" textAnchor="middle">{k}</SvgText>
                                </SvgG>
                              );
                            })}
                          </Svg>
                          {tempPos && (
                            <>
                              {/* Pin tip sits exactly on the point; the small dot marks it precisely. */}
                              <View pointerEvents="none" style={{ position: "absolute", left: tempPos.x * pw - 15, top: tempPos.y * ph - 30 }}>
                                <MaterialIcons name="place" size={30} color="#DC2626" />
                              </View>
                              <View pointerEvents="none" style={{ position: "absolute", left: tempPos.x * pw - 3, top: tempPos.y * ph - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#DC2626" }} />
                            </>
                          )}
                        </View>
                      </ZoomableCanvas>
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
            {((planStep === 2 && tempCrop) || (planStep === 3 && Object.keys(tempWalls).length > 0)) && (
              <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
                {planStep === 2 && tempCrop && (
                  <Pressable onPress={() => setTempCrop(null)} hitSlop={6}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>{t("raumbuch_crop_reset" as any)}</Text></Pressable>
                )}
                {planStep === 3 && Object.keys(tempWalls).length > 0 && (
                  <Pressable onPress={() => { setTempWalls({}); dragRef.current = null; }} hitSlop={6}><Text style={{ fontSize: 12, fontWeight: "700", color: "#DC2626" }}>{t("raumbuch_walls_clear" as any)}</Text></Pressable>
                )}
              </View>
            )}
            {/* Step navigation: 1 Plan → 2 Ausschnitt → 3 Markieren */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => { if (planStep === 1) { setPlanModal(false); } else { const prev = (planStep - 1) as 1 | 2; setPlanStep(prev); setPlanMode(prev === 1 ? "view" : "crop"); dragRef.current = null; } }}
                style={({ pressed }) => [styles.modalBtnGhost, { borderColor: colors.border, opacity: pressed ? 0.7 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }]}
              >
                {planStep > 1 ? <MaterialIcons name="arrow-back" size={18} color={colors.muted} /> : null}
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{planStep === 1 ? t("btn_abbrechen" as any) : t("btn_zurueck" as any)}</Text>
              </Pressable>
              {planStep < 3 ? (
                <Pressable onPress={() => { const nx = (planStep + 1) as 2 | 3; setPlanStep(nx); setPlanMode(nx === 2 ? "crop" : "A"); dragRef.current = null; }} disabled={!modalPlan} style={({ pressed }) => [styles.modalBtnPrimary, { backgroundColor: colors.primary, opacity: !modalPlan ? 0.4 : pressed ? 0.85 : 1 }]}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFFFFF" }}>{planStep === 2 && !tempCrop ? t("raumbuch_crop_skip" as any) : t("btn_weiter" as any)}</Text>
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
                <SvgLine x1={toX(wl.x1)} y1={toY(wl.y1)} x2={toX(wl.x2)} y2={toY(wl.y2)} stroke={WALL_COLOR} strokeWidth={2.5} strokeLinecap="round" />
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
  // Near-fullscreen so the plan editor is large and easy to work on.
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, height: "96%" },
  modalBtnGhost: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  modalBtnPrimary: { flex: 2, paddingVertical: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
