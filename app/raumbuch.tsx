import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { getProjectStructure, type Floor, type Room } from "@/lib/room-store";
import { getRaumbuch, raumbuchPhotoCount, RAUMBUCH_POSITIONS, type RaumbuchEntry } from "@/lib/raumbuch-store";
import { generateRaumbuchPdf } from "@/lib/raumbuch-pdf";

type ProjectRef = { id: string; name: string };

export default function RaumbuchScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();

  const [project, setProject] = useState<ProjectRef | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [entries, setEntries] = useState<Record<string, RaumbuchEntry>>({});
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [projectsJson, lastId] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("last-selected-project-id"),
      ]);
      const projects: ProjectRef[] = projectsJson ? JSON.parse(projectsJson) : [];
      const pid = params.projectId || lastId || "";
      const active = projects.find((p) => p.id === pid) || null;
      setProject(active);
      if (active) {
        const structure = await getProjectStructure(active.id);
        setFloors(structure.floors);
        setRooms(structure.rooms);
        const list = await getRaumbuch(active.id);
        const map: Record<string, RaumbuchEntry> = {};
        for (const e of list) map[e.roomId] = e;
        setEntries(map);
      } else {
        setFloors([]); setRooms([]); setEntries({});
      }
    } catch {
      setProject(null); setFloors([]); setRooms([]); setEntries({});
    }
  }, [params.projectId]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openRoom = (floor: Floor, room: Room) => {
    router.push(`/raumbuch-room?projectId=${project?.id || ""}&roomId=${room.id}&floor=${encodeURIComponent(floor.name)}&room=${encodeURIComponent(room.name)}` as any);
  };

  const runExport = async (tmpl: "standard" | "fragenkatalog") => {
    if (!project || exporting) return;
    const documented = Object.values(entries).filter((e) => raumbuchPhotoCount(e) > 0 || (e.planX != null));
    if (documented.length === 0) {
      Alert.alert(t("raumbuch_title" as any), t("raumbuch_export_empty" as any));
      return;
    }
    setExporting(true);
    try {
      const html = await generateRaumbuchPdf(project.name, documented, t, tmpl);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch (e) {
      Alert.alert(t("alert_fehler" as any), t("floor_plan_export_error" as any));
    } finally {
      setExporting(false);
    }
  };

  // Let the user pick which Raumbuch layout to export.
  const exportPdf = () => {
    if (!project || exporting) return;
    Alert.alert(
      t("raumbuch_export_template_title" as any),
      t("raumbuch_export_template_msg" as any),
      [
        { text: t("raumbuch_export_tmpl_standard" as any), onPress: () => void runExport("standard") },
        { text: t("raumbuch_export_tmpl_fragenkatalog" as any), onPress: () => void runExport("fragenkatalog") },
        { text: t("cancel" as any), style: "cancel" },
      ],
    );
  };

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{t("raumbuch_title" as any)}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>{project?.name || t("measure_project_placeholder" as any)}</Text>
        </View>
        <Pressable onPress={() => void exportPdf()} disabled={exporting} hitSlop={8} style={{ padding: 4 }}>
          {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="picture-as-pdf" size={24} color={colors.primary} />}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {!project ? (
          <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>{t("measure_no_project_text" as any)}</Text>
        ) : rooms.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <MaterialIcons name="meeting-room" size={48} color={colors.muted} />
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16, marginTop: 12 }}>{t("rooms_empty_title" as any)}</Text>
            <Text style={{ color: colors.muted, textAlign: "center", marginTop: 6 }}>{t("raumbuch_no_rooms_hint" as any)}</Text>
          </View>
        ) : (
          floors.map((floor) => {
            const floorRooms = rooms.filter((r) => r.floorId === floor.id);
            if (floorRooms.length === 0) return null;
            return (
              <View key={floor.id} style={{ marginBottom: 18 }}>
                <Text style={[styles.floorLabel, { color: colors.muted }]}>{floor.name}</Text>
                {floorRooms.map((room) => {
                  const entry = entries[room.id];
                  const count = raumbuchPhotoCount(entry);
                  const total = RAUMBUCH_POSITIONS.length;
                  const done = count === total;
                  return (
                    <Pressable
                      key={room.id}
                      onPress={() => openRoom(floor, room)}
                      style={({ pressed }) => [styles.roomRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                    >
                      <MaterialIcons name="meeting-room" size={20} color="#5DADE2" />
                      <Text style={[styles.roomName, { color: colors.foreground }]} numberOfLines={1}>{room.name}</Text>
                      {entry?.planX != null ? <MaterialIcons name="place" size={16} color={colors.muted} /> : null}
                      <View style={[styles.countPill, { backgroundColor: done ? "#16A34A22" : colors.primary + "18" }]}>
                        <Text style={{ fontSize: 12, fontWeight: "800", color: done ? "#16A34A" : colors.primary }}>{count}/{total}</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { height: 74, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: 1 },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
  floorLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12, marginBottom: 8 },
  roomName: { flex: 1, fontSize: 15, fontWeight: "700" },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
});
