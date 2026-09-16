/**
 * Projekt-Übersicht – a scrollable, view-only overview of everything captured
 * with the tools: floor plans WITH their markers, timesheet/cost, checklists,
 * defects (with photos) and protocols. Read-only; export lives in /project-export.
 */
import { useCallback, useState, type ReactNode } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { PlanWithPins } from "@/components/plan-with-pins";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { getFloorPlans, getPlanPins, type FloorPlan, type PlanPin } from "@/lib/floor-plan-store";
import { getDefects, type Defect } from "@/lib/defect-store";
import { getChecklistResults, getChecklistCompletionRate, type ChecklistResult } from "@/lib/checklist-store";
import { getTimeEntries, getTimeTrackingSettings, type TimeEntry } from "@/lib/time-tracking-store";

const SCREEN_WIDTH = Dimensions.get("window").width;

type ProtocolLite = { id: string; title?: string; createdAt: string; projectId?: string };

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function ProjectOverviewScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const { projectId = "", projectName } = useLocalSearchParams<{ projectId: string; projectName?: string }>();

  const [plans, setPlans] = useState<{ plan: FloorPlan; pins: PlanPin[] }[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [checklists, setChecklists] = useState<ChecklistResult[]>([]);
  const [time, setTime] = useState<TimeEntry[]>([]);
  const [rate, setRate] = useState(0);
  const [protocols, setProtocols] = useState<ProtocolLite[]>([]);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const [fp, def, cl, te, settings, protoRaw] = await Promise.all([
        getFloorPlans(projectId),
        getDefects(projectId),
        getChecklistResults(projectId),
        getTimeEntries(projectId),
        getTimeTrackingSettings(),
        AsyncStorage.getItem("protocols"),
      ]);
      const withPins = await Promise.all(fp.map(async (p) => ({ plan: p, pins: await getPlanPins(p.id) })));
      setPlans(withPins);
      setDefects(def);
      setChecklists(cl);
      setTime(te);
      setRate(parseFloat(String(settings.hourlyRate || "").replace(",", ".")) || 0);
      const proto: ProtocolLite[] = (protoRaw ? JSON.parse(protoRaw) : []).filter((p: ProtocolLite) => p.projectId === projectId);
      setProtocols(proto);
    } catch {}
  }, [projectId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const contentWidth = SCREEN_WIDTH - 32;
  const totalSeconds = time.reduce((s, e) => s + (e.duration || 0), 0);
  const totalCost = (totalSeconds / 3600) * rate;
  const isEmpty = plans.length === 0 && defects.length === 0 && checklists.length === 0 && time.length === 0 && protocols.length === 0;

  const Section = ({ icon, title, count, children }: { icon: string; title: string; count?: number; children: ReactNode }) => (
    <View style={{ marginBottom: 22 }}>
      <View style={styles.secHead}>
        <MaterialIcons name={icon as any} size={18} color={colors.primary} />
        <Text style={[styles.secTitle, { color: colors.foreground }]}>{title}{typeof count === "number" ? ` (${count})` : ""}</Text>
      </View>
      {children}
    </View>
  );

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{t('project_overview_title' as any)}</Text>
          {projectName ? <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>{projectName}</Text> : null}
        </View>
        <Pressable
          onPress={() => router.push(`/project-export?projectId=${projectId}&projectName=${encodeURIComponent(projectName || "")}` as any)}
          hitSlop={8}
          style={({ pressed }) => [styles.headerExport, { opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name="picture-as-pdf" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {isEmpty && (
          <View style={{ alignItems: "center", paddingTop: 60, gap: 10 }}>
            <MaterialIcons name="folder-open" size={44} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>{t('project_overview_empty' as any)}</Text>
          </View>
        )}

        {/* Grundrisse mit Markierungen */}
        {plans.length > 0 && (
          <Section icon="map" title={t('index_tool_grundriss' as any)} count={plans.length}>
            {plans.map(({ plan, pins }) => (
              <Pressable
                key={plan.id}
                onPress={() => router.push(`/floor-plan?projectId=${projectId}` as any)}
                style={{ marginBottom: 12 }}
              >
                <Text style={[styles.itemName, { color: colors.foreground, marginBottom: 6 }]}>{plan.name}{pins.length ? `  ·  ${pins.length}` : ""}</Text>
                <PlanWithPins plan={plan} pins={pins} width={contentWidth} />
              </Pressable>
            ))}
          </Section>
        )}

        {/* Stundenzettel */}
        {time.length > 0 && (
          <Section icon="timer" title={t('index_tool_zeiterfassung' as any)} count={time.length}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.muted }]}>{t('project_export_total_hours' as any)}</Text>
                <Text style={[styles.kvValue, { color: colors.foreground }]}>{fmtDuration(totalSeconds)}</Text>
              </View>
              {rate > 0 && (
                <View style={styles.kv}>
                  <Text style={[styles.kvLabel, { color: colors.muted }]}>{t('project_export_total_cost' as any)}</Text>
                  <Text style={[styles.kvValue, { color: colors.foreground }]}>{totalCost.toFixed(2).replace(".", ",")} € ({rate.toFixed(2).replace(".", ",")} €/h)</Text>
                </View>
              )}
              {time.slice(0, 6).map((e) => (
                <View key={e.id} style={styles.kv}>
                  <Text style={[styles.kvLabel, { color: colors.muted }]} numberOfLines={1}>{new Date(e.startTime).toLocaleDateString("de-DE")}{e.category ? ` · ${e.category}` : ""}</Text>
                  <Text style={[styles.kvValue, { color: colors.foreground }]}>{fmtDuration(e.duration || 0)}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Checklisten */}
        {checklists.length > 0 && (
          <Section icon="checklist" title={t('checklist_title' as any)} count={checklists.length}>
            {checklists.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/checklists?projectId=${projectId}` as any)}
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <MaterialIcons name="checklist" size={18} color="#34D399" />
                <Text style={[styles.itemName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{c.checklistName}</Text>
                <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 13 }}>{getChecklistCompletionRate(c)}%</Text>
              </Pressable>
            ))}
          </Section>
        )}

        {/* Mängel mit Fotos */}
        {defects.length > 0 && (
          <Section icon="warning" title={t('maengel' as any)} count={defects.length}>
            {defects.slice(0, 20).map((d) => (
              <Pressable
                key={d.id}
                onPress={() => router.push(`/defects?projectId=${projectId}&defectId=${d.id}` as any)}
                style={[styles.defectRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.dot, { backgroundColor: d.status === "erledigt" || d.status === "geschlossen" ? "#10B981" : "#F97316" }]} />
                  <Text style={[styles.itemName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{d.title || d.description || t('maengel' as any)}</Text>
                  {d.room ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{d.room}</Text> : null}
                </View>
                {(d.photos && d.photos.length > 0) && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {d.photos.slice(0, 6).map((uri, i) => (
                      <Image key={`${d.id}-${i}`} source={{ uri }} style={{ width: 72, height: 72, borderRadius: 6, marginRight: 6 }} contentFit="cover" cachePolicy="memory-disk" />
                    ))}
                  </ScrollView>
                )}
              </Pressable>
            ))}
          </Section>
        )}

        {/* Protokolle */}
        {protocols.length > 0 && (
          <Section icon="description" title={t('project_export_protocols' as any)} count={protocols.length}>
            {protocols.slice(0, 20).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/protocol-detail?id=${p.id}` as any)}
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <MaterialIcons name="description" size={18} color="#5DADE2" />
                <Text style={[styles.itemName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{p.title || t('protokoll' as any)}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(p.createdAt).toLocaleDateString("de-DE")}</Text>
              </Pressable>
            ))}
          </Section>
        )}

        {!isEmpty && (
          <Pressable
            onPress={() => router.push(`/project-export?projectId=${projectId}&projectName=${encodeURIComponent(projectName || "")}` as any)}
            style={({ pressed }) => [styles.exportBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="picture-as-pdf" size={20} color="#FFFFFF" />
            <Text style={styles.exportBtnText}>{t('home_dossier_export' as any)}</Text>
          </Pressable>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  title: { fontSize: 17, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 1 },
  headerExport: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  secHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  secTitle: { fontSize: 15, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 8 },
  kv: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  kvLabel: { fontSize: 13, flex: 1 },
  kvValue: { fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderRadius: 10, marginBottom: 8 },
  defectRow: { padding: 12, borderWidth: 1, borderRadius: 10, marginBottom: 8 },
  itemName: { fontSize: 14, fontWeight: "600" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 15, marginTop: 8 },
  exportBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
