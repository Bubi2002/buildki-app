/**
 * protoKI – Baufortschritt Screen
 * Visualisiert den automatisch berechneten Baufortschritt.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { progressEngine, type ProgressSnapshot, type RoomProgress, type TradeProgress } from "@/lib/progress-engine";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ViewTab = "overview" | "rooms" | "trades";

export default function ProgressScreen() {
  const colors = useColors();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  const [projectId, setProjectId] = useState("");

  useEffect(() => { loadProject(); }, []);

  const loadProject = async () => {
    const pid = await AsyncStorage.getItem("protoki_active_project");
    if (pid) { setProjectId(pid); await calculate(pid); }
    else setLoading(false);
  };

  const calculate = async (pid: string) => {
    setLoading(true);
    try { setSnapshot(await progressEngine.calculateProgress(pid)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (projectId) await calculate(projectId);
    setRefreshing(false);
  }, [projectId]);

  const statusColor = (s: string) => s === "completed" ? colors.success : s === "in_progress" ? colors.primary : s === "blocked" ? colors.error : colors.muted;
  const statusLabel = (s: string) => s === "completed" ? "Fertig" : s === "in_progress" ? "In Arbeit" : s === "blocked" ? "Blockiert" : "Offen";
  const phaseLabel = (p: string) => ({ rohbau: "Rohbau", ausbau_1: "Ausbau 1", ausbau_2: "Ausbau 2", ausbau_3: "Ausbau 3", fertigstellung: "Fertigstellung", abnahme: "Abnahme", unknown: "–" }[p] || p);

  if (loading) return (
    <ScreenContainer className="p-6">
      <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /><Text style={[styles.loadingText, { color: colors.muted }]}>Fortschritt wird berechnet...</Text></View>
    </ScreenContainer>
  );

  if (!projectId) return (
    <ScreenContainer className="p-6">
      <View style={styles.centered}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Kein Projekt aktiv</Text></View>
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
        <Text style={[styles.meta, { color: colors.muted }]}>{item.openDefects} Mängel · {item.openTasks} Aufgaben</Text>
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
        <Text style={[styles.meta, { color: colors.muted }]}>{item.completedTasks}/{item.totalTasks} Aufgaben · {item.openDefects} Mängel</Text>
        <Text style={[styles.percent, { color: colors.foreground }]}>{item.percent}%</Text>
      </View>
    </View>
  );

  return (
    <ScreenContainer className="p-4">
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={{ color: colors.primary }}>← Zurück</Text></TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Baufortschritt</Text>
        </View>

        {/* Overall */}
        {snapshot && (
          <View style={[styles.overallCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.overallPercent, { color: colors.primary }]}>{snapshot.overallPercent}%</Text>
            <Text style={[styles.overallPhase, { color: colors.foreground }]}>{phaseLabel(snapshot.phase)}</Text>
            <Text style={[styles.overallMeta, { color: colors.muted }]}>Konfidenz: {snapshot.confidence}% · {snapshot.dataPoints} Datenpunkte</Text>
          </View>
        )}

        {/* Tabs */}
        <View style={[styles.tabBar, { borderColor: colors.border }]}>
          {(["overview", "rooms", "trades"] as ViewTab[]).map(t => (
            <TouchableOpacity key={t} style={[styles.tab, activeTab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setActiveTab(t)}>
              <Text style={[styles.tabText, { color: activeTab === t ? colors.primary : colors.muted }]}>
                {t === "overview" ? "Übersicht" : t === "rooms" ? "Räume" : "Gewerke"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {snapshot && activeTab === "overview" && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Geschosse</Text>
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
                { n: snapshot.roomProgress.length, l: "Räume", c: colors.primary },
                { n: snapshot.roomProgress.filter(r => r.status === "completed").length, l: "Fertig", c: colors.success },
                { n: snapshot.roomProgress.filter(r => r.status === "blocked").length, l: "Blockiert", c: colors.error },
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
          <Text style={[styles.recalcText, { color: colors.background }]}>Neu berechnen</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  overallCard: { borderRadius: 12, borderWidth: 1, padding: 20, alignItems: "center", marginBottom: 16 },
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
  stat: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: "center" },
  statNum: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 2 },
  card: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "600" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  bar: { height: 5, borderRadius: 3, marginVertical: 6 },
  barFill: { height: 5, borderRadius: 3 },
  meta: { fontSize: 11 },
  percent: { fontSize: 13, fontWeight: "700" },
  recalcBtn: { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  recalcText: { fontSize: 15, fontWeight: "700" },
});
