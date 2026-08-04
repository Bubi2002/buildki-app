/**
 * protoKI – Baufortschritt Screen
 * Visualisiert den automatisch berechneten Baufortschritt.
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import {
  LAST_SELECTED_PROJECT_KEY,
  PROJECTS_STORAGE_KEY,
  resolveSelectedProject,
  type ProjectContextItem,
} from "@/lib/project-context";
import { progressEngine, type ProgressSnapshot, type RoomProgress, type TradeProgress } from "@/lib/progress-engine";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ViewTab = "overview" | "rooms" | "trades";

export default function ProgressScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string | string[] }>();
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");

  const calculate = useCallback(async (pid: string) => {
    setLoading(true);
    try { setSnapshot(await progressEngine.calculateProgress(pid)); }
    catch (e) {
      console.error(e);
      setSnapshot(null);
    }
    finally { setLoading(false); }
  }, []);

  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsRaw, lastSelectedId] = await Promise.all([
        AsyncStorage.getItem(PROJECTS_STORAGE_KEY),
        AsyncStorage.getItem(LAST_SELECTED_PROJECT_KEY),
      ]);
      const projects: ProjectContextItem[] = projectsRaw ? JSON.parse(projectsRaw) : [];
      const routeProjectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
      const selectedProject = resolveSelectedProject(projects, routeProjectId || lastSelectedId);

      if (!selectedProject) {
        setProjectId("");
        setProjectName("");
        setSnapshot(null);
        setLoading(false);
        return;
      }

      setProjectId(selectedProject.id);
      setProjectName(selectedProject.name);
      if (selectedProject.id !== lastSelectedId) {
        await AsyncStorage.setItem(LAST_SELECTED_PROJECT_KEY, selectedProject.id);
      }
      await calculate(selectedProject.id);
    } catch (error) {
      console.error("Fortschrittsprojekt konnte nicht geladen werden:", error);
      setProjectId("");
      setProjectName("");
      setSnapshot(null);
      setLoading(false);
    }
  }, [calculate, params.projectId]);

  useFocusEffect(
    useCallback(() => {
      void loadProject();
    }, [loadProject]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (projectId) await calculate(projectId);
    setRefreshing(false);
  }, [calculate, projectId]);

  const statusColor = (s: string) => s === "completed" ? colors.success : s === "in_progress" ? colors.primary : s === "blocked" ? colors.error : colors.muted;
  const statusLabel = (s: string) => s === "completed" ? t('progress_status_completed' as any) : s === "in_progress" ? t('progress_status_in_progress' as any) : s === "blocked" ? t('progress_status_blocked' as any) : t('progress_status_open' as any);
  const phaseLabel = (p: string) => ({ rohbau: t('progress_phase_rohbau' as any), ausbau_1: t('progress_phase_ausbau_1' as any), ausbau_2: t('progress_phase_ausbau_2' as any), ausbau_3: t('progress_phase_ausbau_3' as any), fertigstellung: t('progress_phase_fertigstellung' as any), abnahme: t('progress_phase_abnahme' as any), unknown: "–" }[p] || p);

  if (loading) return (
    <ScreenContainer className="p-6">
      <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /><Text style={[styles.loadingText, { color: colors.muted }]}>{t('progress_calculating' as any)}</Text></View>
    </ScreenContainer>
  );

  if (!projectId) return (
    <ScreenContainer className="p-6">
      <View style={styles.centered}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('progress_no_project_title' as any)}</Text>
        <Text style={[styles.emptyText, { color: colors.muted }]}>{t('progress_no_project_text' as any)}</Text>
        <TouchableOpacity style={[styles.emptyAction, { borderColor: colors.primary }]} onPress={() => router.push("/(tabs)/projects" as any)}>
          <Text style={[styles.emptyActionText, { color: colors.primary }]}>{t('progress_open_projects' as any)}</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );

  const renderRoom = ({ item }: { item: RoomProgress }) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.room}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor(item.status) + "20" }]}>
          <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
        </View>
      </View>
      <View style={[styles.bar, { backgroundColor: colors.border }]}>
        <View style={[styles.barFill, { width: `${item.percent}%`, backgroundColor: statusColor(item.status) }]} />
      </View>
      <View style={styles.cardRow}>
        <Text style={[styles.meta, { color: colors.muted }]}>{item.openDefects} {t('progress_defects_word' as any)} · {item.openTasks} {t('progress_tasks_word' as any)}</Text>
        <Text style={[styles.percent, { color: colors.foreground }]}>{item.percent}%</Text>
      </View>
    </View>
  );

  const renderTrade = ({ item }: { item: TradeProgress }) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.trade}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor(item.status) + "20" }]}>
          <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
        </View>
      </View>
      <View style={[styles.bar, { backgroundColor: colors.border }]}>
        <View style={[styles.barFill, { width: `${item.percent}%`, backgroundColor: statusColor(item.status) }]} />
      </View>
      <View style={styles.cardRow}>
        <Text style={[styles.meta, { color: colors.muted }]}>{item.completedTasks}/{item.totalTasks} {t('progress_tasks_word' as any)} · {item.openDefects} {t('progress_defects_word' as any)}</Text>
        <Text style={[styles.percent, { color: colors.foreground }]}>{item.percent}%</Text>
      </View>
    </View>
  );

  return (
    <ScreenContainer className="p-4">
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={{ color: colors.primary }}>{t('progress_back' as any)}</Text></TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.foreground }]}>{t('progress_title' as any)}</Text>
            <Text style={[styles.projectName, { color: colors.muted }]} numberOfLines={1}>{projectName}</Text>
          </View>
        </View>

        {/* Overall */}
        {snapshot && (
          <View style={[styles.overallCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.overallPercent, { color: colors.primary }]}>{snapshot.overallPercent}%</Text>
            <Text style={[styles.overallPhase, { color: colors.foreground }]}>{phaseLabel(snapshot.phase)}</Text>
            <Text style={[styles.overallMeta, { color: colors.muted }]}>{t('progress_confidence' as any)}: {snapshot.confidence}% · {snapshot.dataPoints} {t('progress_datapoints' as any)}</Text>
          </View>
        )}

        {/* Tabs */}
        <View style={[styles.tabBar, { borderColor: colors.border }]}>
          {(["overview", "rooms", "trades"] as ViewTab[]).map(tab => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
                {tab === "overview" ? t('progress_tab_overview' as any) : tab === "rooms" ? t('progress_tab_rooms' as any) : t('progress_tab_trades' as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {snapshot && activeTab === "overview" && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('progress_floors' as any)}</Text>
            {snapshot.floorProgress.map((fp, i) => (
              <View key={i} style={[styles.floorRow, { borderColor: colors.border }]}>
                <Text style={[styles.floorName, { color: colors.foreground }]}>{fp.floor}</Text>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <View style={[styles.bar, { backgroundColor: colors.border }]}>
                    <View style={[styles.barFill, { width: `${fp.percent}%`, backgroundColor: colors.primary }]} />
                  </View>
                </View>
                <Text style={[styles.floorPercent, { color: colors.foreground }]}>{fp.percent}%</Text>
              </View>
            ))}
            <View style={styles.statsRow}>
              {[
                { n: snapshot.roomProgress.length, l: t('progress_tab_rooms' as any), c: colors.primary },
                { n: snapshot.roomProgress.filter(r => r.status === "completed").length, l: t('progress_status_completed' as any), c: colors.success },
                { n: snapshot.roomProgress.filter(r => r.status === "blocked").length, l: t('progress_status_blocked' as any), c: colors.error },
              ].map((s, i) => (
                <View key={i} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.statNum, { color: s.c }]}>{s.n}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>{s.l}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {snapshot && activeTab === "rooms" && (
          <View>{snapshot.roomProgress.sort((a, b) => b.percent - a.percent).map((r, i) => <View key={i}>{renderRoom({ item: r })}</View>)}</View>
        )}
        {snapshot && activeTab === "trades" && (
          <View>{snapshot.tradeProgress.sort((a, b) => b.percent - a.percent).map((t, i) => <View key={i}>{renderTrade({ item: t })}</View>)}</View>
        )}

        <TouchableOpacity style={[styles.recalcBtn, { backgroundColor: colors.primary }]} onPress={onRefresh}>
          <Text style={[styles.recalcText, { color: colors.background }]}>{t('progress_recalculate' as any)}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyText: { maxWidth: 300, marginTop: 8, fontSize: 13, lineHeight: 19, textAlign: "center" },
  emptyAction: { marginTop: 18, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 12 },
  emptyActionText: { fontSize: 14, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: "700" },
  projectName: { marginTop: 2, fontSize: 12 },
  overallCard: { borderRadius: 0, borderWidth: 1, padding: 20, alignItems: "center", marginBottom: 16 },
  overallPercent: { fontSize: 40, fontWeight: "800" },
  overallPhase: { fontSize: 14, fontWeight: "600", marginTop: 4 },
  overallMeta: { fontSize: 12, marginTop: 4 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabText: { fontSize: 13, fontWeight: "600" },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  floorRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5 },
  floorName: { fontSize: 13, fontWeight: "600", width: 50 },
  floorPercent: { fontSize: 13, fontWeight: "700", width: 40, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  stat: { flex: 1, borderRadius: 0, borderWidth: 1, padding: 12, alignItems: "center" },
  statNum: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 2 },
  card: { borderRadius: 0, borderWidth: 1, padding: 12, marginBottom: 8 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "600" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 0 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  bar: { height: 5, borderRadius: 0, marginVertical: 6 },
  barFill: { height: 5, borderRadius: 0 },
  meta: { fontSize: 11 },
  percent: { fontSize: 13, fontWeight: "700" },
  recalcBtn: { borderRadius: 0, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  recalcText: { fontSize: 15, fontWeight: "700" },
});
