import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "@/lib/language-provider";

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

  const load = useCallback(async () => {
    try {
      const all = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      setProtocol(all.find((p: Protocol) => p.id === protocolId) || null);
    } catch {}
  }, [protocolId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

        {/* CTAs */}
        <Pressable
          onPress={() => router.replace(`/protocol-detail?id=${protocolId}` as any)}
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
        >
          <MaterialIcons name="description" size={20} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>{t("review_open_protocol" as any)}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace("/(tabs)/protocols" as any)}
          style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.muted }]}>{t("review_to_list" as any)}</Text>
        </Pressable>
      </ScrollView>
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
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 15 },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  secondaryBtn: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 12, paddingVertical: 13, marginTop: 10 },
  secondaryBtnText: { fontSize: 14, fontWeight: "600" },
});
