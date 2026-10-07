import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { ZoomableCanvas } from "@/components/zoomable-canvas";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { pickImagesWithSource } from "@/lib/import-picker";
import { getFloorPlans, type FloorPlan } from "@/lib/floor-plan-store";
import {
  getRaumbuchEntry,
  saveRaumbuchEntry,
  RAUMBUCH_POSITIONS,
  RAUMBUCH_POSITION_LABEL_KEY,
  type RaumbuchEntry,
  type RaumbuchPosition,
} from "@/lib/raumbuch-store";

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
  const planAspect = useRef(1.4);

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
      const picked = await pickImagesWithSource({ t, multiple: false } as any);
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
    setTempPos(entry?.planId === start.id && entry?.planX != null ? { x: entry.planX!, y: entry.planY! } : null);
    setPlanModal(true);
  };

  const onPlanLayout = (e: LayoutChangeEvent) => setModalImgW(e.nativeEvent.layout.width);

  const confirmPlanMarker = async () => {
    if (modalPlan && tempPos) {
      const cur = entry || blankEntry();
      await persist({ ...cur, planId: modalPlan.id, planName: modalPlan.name, planX: tempPos.x, planY: tempPos.y });
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
            <PlanWithMarker plan={plans.find((p) => p.id === entry.planId)} entryPlanId={entry.planId} planName={entry.planName} x={entry.planX} y={entry.planY} aspect={planPreviewAspect} projectId={projectId} />
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
      </ScrollView>

      {/* Plan marker modal */}
      <Modal visible={planModal} transparent animationType="slide" onRequestClose={() => setPlanModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>{t("raumbuch_set_plan" as any)}</Text>
              <Pressable onPress={() => setPlanModal(false)} hitSlop={8}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            {plans.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
                {plans.map((p) => {
                  const active = modalPlan?.id === p.id;
                  return (
                    <Pressable key={p.id} onPress={() => { setModalPlan(p); planAspect.current = p.width > 0 && p.height > 0 ? p.width / p.height : 1.4; setTempPos(null); }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surface }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: active ? colors.primary : colors.muted }} numberOfLines={1}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {modalPlan && (
              <View onLayout={onPlanLayout} style={{ width: "100%", aspectRatio: planAspect.current, borderRadius: 8, overflow: "hidden", backgroundColor: "#0f1b2b" }}>
                {modalImgW > 0 ? (
                  <ZoomableCanvas
                    width={modalImgW}
                    height={modalImgW / (planAspect.current || 1.4)}
                    maxScale={5}
                    onSingleTap={(pt) => setTempPos({ x: pt.x, y: pt.y })}
                  >
                    <View style={{ width: modalImgW, height: modalImgW / (planAspect.current || 1.4) }}>
                      <Image source={{ uri: modalPlan.imageUri }} style={{ width: "100%", height: "100%" }} contentFit="fill" allowDownscaling={false} />
                      {tempPos && (
                        <View pointerEvents="none" style={{ position: "absolute", left: tempPos.x * modalImgW - 14, top: tempPos.y * (modalImgW / (planAspect.current || 1.4)) - 28 }}>
                          <MaterialIcons name="place" size={30} color="#DC2626" />
                        </View>
                      )}
                    </View>
                  </ZoomableCanvas>
                ) : (
                  <Image source={{ uri: modalPlan.imageUri }} style={{ width: "100%", height: "100%" }} contentFit="fill" allowDownscaling={false} />
                )}
              </View>
            )}
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>{t("raumbuch_tap_to_mark" as any)} · {t("fullscreen_photo_viewer_zoom_hint" as any)}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setPlanModal(false)} style={({ pressed }) => [styles.modalBtnGhost, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{t("btn_abbrechen" as any)}</Text>
              </Pressable>
              <Pressable onPress={() => void confirmPlanMarker()} disabled={!tempPos} style={({ pressed }) => [styles.modalBtnPrimary, { backgroundColor: colors.primary, opacity: !tempPos ? 0.4 : pressed ? 0.85 : 1 }]}>
                <MaterialIcons name="check" size={20} color="#FFFFFF" />
                <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFFFFF" }}>{t("save" as any)}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function PlanWithMarker({ plan, entryPlanId, planName, x, y, aspect, projectId }: { plan?: FloorPlan; entryPlanId?: string; planName?: string; x?: number; y?: number; aspect: number; projectId: string }) {
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
  const h = w / (aspect || 1.6);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: "100%", aspectRatio: aspect || 1.6, backgroundColor: "#0f1b2b" }}>
      <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="fill" allowDownscaling={false} />
      {x != null && y != null && w > 0 && (
        <View style={{ position: "absolute", left: x * w - 13, top: y * h - 26 }}>
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
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "90%" },
  modalBtnGhost: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  modalBtnPrimary: { flex: 2, paddingVertical: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
