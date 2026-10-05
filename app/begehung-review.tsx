import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Modal, TextInput } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "@/lib/language-provider";
import { getDefects, saveDefect, updateDefectStatus, deleteDefect, type DefectStatus } from "@/lib/defect-store";
import { syncStoredProtocolDefects } from "@/lib/protocol-defect-sync";
import { AssigneeInput } from "@/components/assignee-input";
import { DateOnlyPicker } from "@/components/date-only-picker";

type Protocol = {
  id: string;
  title?: string;
  status?: string;
  photos?: string[];
  todos?: any[];
  markers?: { label: string }[];
  duration?: number;
  projectId?: string;
  projectName?: string;
};

/**
 * "Begehung prüfen" — shown right after a recording is stopped. Summarises what
 * was captured (rooms, photos, tasks, duration) and lets the user open the
 * protocol/report. Tasks & defects are extracted asynchronously, so this screen
 * refreshes on focus and its counts fill in as processing completes.
 */
export default function BegehungReviewScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const { protocolId } = useLocalSearchParams<{ protocolId: string }>();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [defects, setDefects] = useState<any[]>([]);
  // Inline Mangel edit popup.
  const [editDefect, setEditDefect] = useState<any | null>(null);
  const [edTitle, setEdTitle] = useState("");
  const [edAssignee, setEdAssignee] = useState("");
  const [edDue, setEdDue] = useState("");

  const load = useCallback(async () => {
    try {
      const all = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      const p = all.find((x: Protocol) => x.id === protocolId) || null;
      setProtocol(p);
      if (p?.projectId) {
        // Extract any Maengel from the (freshly generated) protocol text into the
        // defect store first, then load them. Idempotent, so safe to call on
        // every poll while processing finishes.
        try { await syncStoredProtocolDefects(p.projectId); } catch {}
        setDefects(await getDefects(p.projectId));
      } else setDefects([]);
      return p;
    } catch { return null; }
  }, [protocolId]);

  // Refresh on focus, and keep polling while the protocol is still being
  // processed so the Maengel/Aufgaben counts fill in without leaving the screen.
  useFocusEffect(useCallback(() => {
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const p: any = await load();
      if (!active) return;
      const st = p?.status;
      const stillProcessing = st !== "draft" && st !== "ready" && st !== "sent";
      // Poll up to ~2.5 min while processing, then stop (focus re-triggers it).
      if (stillProcessing && attempts++ < 60) timer = setTimeout(tick, 2500);
    };
    tick();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [load]));

  // Edit the extracted Aufgaben/Mängel right here, before the report goes out.
  const toggleTodo = async (index: number) => {
    try {
      const all = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      const idx = all.findIndex((x: any) => x.id === protocolId);
      if (idx !== -1 && all[idx].todos?.[index]) {
        all[idx].todos[index].done = !all[idx].todos[index].done;
        await AsyncStorage.setItem("protocols", JSON.stringify(all));
        load();
      }
    } catch {}
  };

  const editTodo = (index: number, current: string) => {
    if (!(Alert as any).prompt) return;
    (Alert as any).prompt(t("tasks_edit" as any), undefined, async (val?: string) => {
      const v = (val || "").trim();
      if (!v) return;
      try {
        const all = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
        const idx = all.findIndex((x: any) => x.id === protocolId);
        if (idx !== -1 && all[idx].todos?.[index]) {
          all[idx].todos[index].task = v;
          await AsyncStorage.setItem("protocols", JSON.stringify(all));
          load();
        }
      } catch {}
    }, "plain-text", current);
  };

  const toggleDefect = async (d: any) => {
    try {
      const done = d.status === "erledigt" || d.status === "geschlossen";
      await updateDefectStatus(d.id, done ? "offen" : "erledigt");
      load();
    } catch {}
  };

  // ── Inline Mangel edit popup (like the main room overview) ────────────────
  const openDefectEdit = (d: any) => {
    setEdTitle(d.title || "");
    setEdAssignee(d.assignee || "");
    setEdDue(d.dueDate || "");
    setEditDefect(d);
  };
  const setDefectStatusNow = async (status: DefectStatus) => {
    if (!editDefect) return;
    setEditDefect({ ...editDefect, status });
    try { await updateDefectStatus(editDefect.id, status); } catch {}
    load();
  };
  const saveDefectEdit = async () => {
    const d = editDefect;
    if (!d) return;
    const updated = { ...d, title: edTitle.trim() || d.title, assignee: edAssignee.trim() || undefined, dueDate: edDue.trim() || undefined, updatedAt: new Date().toISOString() };
    try { await saveDefect(updated as any); } catch {}
    setEditDefect(null);
    load();
  };
  const deleteDefectEdit = () => {
    const d = editDefect;
    if (!d) return;
    Alert.alert(d.title || t("review_defects" as any), "", [
      { text: t("btn_abbrechen" as any), style: "cancel" },
      { text: t("btn_loeschen" as any), style: "destructive", onPress: async () => { try { await deleteDefect(d.id); } catch {} setEditDefect(null); load(); } },
    ]);
  };

  // Group the project's defects by Geschoss · Raum, like the main overview.
  const defectGroups = (() => {
    const groups: { key: string; items: any[] }[] = [];
    const map = new Map<string, any[]>();
    for (const d of defects) {
      const key = [d.floor, d.room || d.location].filter(Boolean).join(" · ") || t("review_defects_nolocation" as any);
      if (!map.has(key)) { map.set(key, []); groups.push({ key, items: map.get(key)! }); }
      map.get(key)!.push(d);
    }
    return groups;
  })();

  const rooms = (protocol?.markers || [])
    .filter((m) => typeof m?.label === "string" && m.label.startsWith("KAPITEL:"))
    .map((m) => m.label.replace(/^KAPITEL:\s*/, "").trim())
    .filter(Boolean);
  const photoCount = protocol?.photos?.length || 0;
  const taskCount = protocol?.todos?.length || 0;
  const duration = protocol?.duration || 0;
  const mm = Math.floor(duration / 60);
  const ss = Math.round(duration % 60);
  const durationLabel = duration > 0 ? `${mm}:${ss.toString().padStart(2, "0")}` : "–";

  const status = protocol?.status;
  const statusInfo =
    status === "draft"
      ? { icon: "pause-circle-filled", color: "#F59E0B", text: t("review_status_draft" as any) }
      : status === "ready" || status === "sent"
      ? { icon: "check-circle", color: "#5E8B6F", text: t("review_status_ready" as any) }
      : { icon: "autorenew", color: colors.primary, text: t("review_status_processing" as any) };

  const stats: { label: string; value: string | number; icon: string }[] = [
    { label: t("review_rooms" as any), value: rooms.length, icon: "meeting-room" },
    { label: t("review_photos" as any), value: photoCount, icon: "photo-camera" },
    { label: t("nav_aufgaben" as any), value: taskCount, icon: "checklist" },
    { label: t("review_duration" as any), value: durationLabel, icon: "schedule" },
  ];

  return (
    <ScreenContainer edges={["top", "left", "right"]} className="flex-1">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{t("review_title" as any)}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {protocol?.projectName ? (
          <Text style={[styles.project, { color: colors.muted }]}>{protocol.projectName}</Text>
        ) : null}

        {/* Status */}
        <View style={[styles.statusRow, { backgroundColor: statusInfo.color + "18", borderColor: statusInfo.color + "44" }]}>
          <MaterialIcons name={statusInfo.icon as any} size={20} color={statusInfo.color} />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
        </View>

        {/* Stat band */}
        <View style={[styles.statBand, { borderColor: colors.border }]}>
          {stats.map((s, i) => (
            <View key={s.label} style={[styles.statCell, i < stats.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
              <MaterialIcons name={s.icon as any} size={18} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]} numberOfLines={1}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Rooms */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>{t("review_rooms" as any)}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {rooms.length === 0 ? (
            <Text style={[styles.emptyRow, { color: colors.muted }]}>{t("review_rooms_none" as any)}</Text>
          ) : (
            rooms.map((r, i) => (
              <View key={`${r}-${i}`} style={[styles.roomRow, { borderTopColor: colors.border, borderTopWidth: i === 0 ? 0 : 1 }]}>
                <View style={[styles.roomNum, { backgroundColor: colors.primary + "1A" }]}>
                  <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>{i + 1}</Text>
                </View>
                <Text style={[styles.roomLabel, { color: colors.foreground }]}>{r}</Text>
              </View>
            ))
          )}
        </View>

        {/* Aufgaben — editable before the report goes out */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>{t("nav_aufgaben" as any)}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(protocol?.todos || []).length === 0 ? (
            <Text style={[styles.emptyRow, { color: colors.muted }]}>{t("review_tasks_none" as any)}</Text>
          ) : (
            (protocol?.todos || []).map((todo: any, i: number) => {
              const title = todo?.task || todo?.title || todo?.text || "";
              const done = !!todo?.done;
              return (
                <View key={`todo-${i}`} style={[styles.editRow, { borderTopColor: colors.border, borderTopWidth: i === 0 ? 0 : 1 }]}>
                  <Pressable onPress={() => toggleTodo(i)} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name={done ? "check-box" : "check-box-outline-blank"} size={22} color={done ? "#5E8B6F" : colors.muted} />
                  </Pressable>
                  <Pressable onPress={() => editTodo(i, title)} style={{ flex: 1 }}>
                    <Text style={[styles.editLabel, { color: colors.foreground, textDecorationLine: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }]}>{title}</Text>
                  </Pressable>
                  <Pressable onPress={() => editTodo(i, title)} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="edit" size={18} color={colors.muted} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {/* Mängel — grouped by Geschoss/Raum, tap to edit in a popup */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>{t("review_defects" as any)}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {defects.length === 0 ? (
            <Text style={[styles.emptyRow, { color: colors.muted }]}>{t("review_defects_none" as any)}</Text>
          ) : (
            defectGroups.map((g, gi) => (
              <View key={g.key}>
                <Text style={[styles.groupHead, { color: colors.muted, backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: gi === 0 ? 0 : 1 }]}>{g.key}</Text>
                {g.items.map((d: any, i: number) => {
                  const done = d?.status === "erledigt" || d?.status === "geschlossen";
                  return (
                    <View key={d?.id || `def-${gi}-${i}`} style={[styles.editRow, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                      <Pressable onPress={() => toggleDefect(d)} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                        <MaterialIcons name={done ? "check-circle" : "radio-button-unchecked"} size={22} color={done ? "#5E8B6F" : "#E67E22"} />
                      </Pressable>
                      <Pressable onPress={() => openDefectEdit(d)} style={{ flex: 1 }}>
                        <Text style={[styles.editLabel, { color: colors.foreground, opacity: done ? 0.6 : 1 }]} numberOfLines={2}>{d?.title || d?.description || "–"}</Text>
                      </Pressable>
                      <MaterialIcons name="edit" size={18} color={colors.muted} />
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>

        {/* CTAs */}
        <Pressable
          onPress={() => router.replace(`/protocol-detail?id=${protocolId}` as any)}
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
        >
          <MaterialIcons name="description" size={20} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>{t("review_open_protocol" as any)}</Text>
        </Pressable>
      </ScrollView>

      {/* Mangel edit popup */}
      <Modal visible={!!editDefect} transparent animationType="fade" onRequestClose={() => setEditDefect(null)}>
        <Pressable style={styles.popOverlay} onPress={() => setEditDefect(null)}>
          <Pressable style={[styles.popCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            {editDefect && (
              <>
                {(editDefect.floor || editDefect.room || editDefect.location) ? (
                  <Text style={[styles.editSub, { color: colors.muted, marginBottom: 6 }]}>{[editDefect.floor, editDefect.room || editDefect.location].filter(Boolean).join(" · ")}</Text>
                ) : null}
                <TextInput value={edTitle} onChangeText={setEdTitle} placeholder={t("titel" as any)} placeholderTextColor={colors.muted} style={[styles.popInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, fontWeight: "700", fontSize: 16 }]} />
                <View style={styles.statusRowPop}>
                  {([["offen", "index_offen", "#F97316"], ["in_bearbeitung", "index_in_arbeit", "#F59E0B"], ["erledigt", "index_erledigt", "#10B981"]] as const).map(([s, lbl, col]) => {
                    const active = editDefect.status === s;
                    return (
                      <Pressable key={s} onPress={() => setDefectStatusNow(s as DefectStatus)} style={[styles.statusChip, { borderColor: active ? col : colors.border, backgroundColor: active ? col + "22" : "transparent" }]}>
                        <Text style={{ fontSize: 12, fontWeight: active ? "800" : "600", color: active ? col : colors.muted }}>{t(lbl as any)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.popLabel, { color: colors.muted }]}>{t("zustaendig" as any)}</Text>
                <AssigneeInput value={edAssignee} onChange={setEdAssignee} placeholder={t("zustaendig" as any)} style={[styles.popInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
                <View style={{ marginTop: 12 }}>
                  <DateOnlyPicker value={edDue} onChange={setEdDue} label={t("frist" as any)} withTime />
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <Pressable onPress={deleteDefectEdit} style={[styles.popBtn, { borderWidth: 1, borderColor: "#7F1D1D" }]}><Text style={{ color: "#F87171", fontWeight: "700" }}>{t("btn_loeschen" as any)}</Text></Pressable>
                  <Pressable onPress={saveDefectEdit} style={[styles.popBtn, { flex: 2, backgroundColor: colors.primary }]}><Text style={{ color: "#fff", fontWeight: "700" }}>{t("save" as any)}</Text></Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: "800", flex: 1, textAlign: "center", marginHorizontal: 8 },
  project: { fontSize: 14, marginBottom: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 16 },
  statusText: { fontSize: 13, fontWeight: "700" },
  statBand: { flexDirection: "row", borderWidth: 1, borderRadius: 12, overflow: "hidden", marginBottom: 20 },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 3 },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11 },
  sectionTitle: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginBottom: 24 },
  emptyRow: { padding: 14, fontSize: 14 },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  roomNum: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  roomLabel: { fontSize: 15, fontWeight: "600", flex: 1 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  editLabel: { fontSize: 15, fontWeight: "500" },
  editSub: { fontSize: 12, marginTop: 2 },
  groupHead: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4, paddingHorizontal: 14, paddingVertical: 8 },
  popOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  popCard: { borderWidth: 1, borderRadius: 16, padding: 20 },
  popInput: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, marginTop: 4 },
  statusRowPop: { flexDirection: "row", gap: 8, marginTop: 12 },
  statusChip: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
  popLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 14, marginBottom: 2 },
  popBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: 10 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 15 },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  secondaryBtn: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 12, paddingVertical: 13, marginTop: 10 },
  secondaryBtnText: { fontSize: 14, fontWeight: "600" },
});
