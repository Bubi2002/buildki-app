import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Protocol = {
  id: string;
  title: string;
  createdAt: string;
  templateName?: string;
  templateId?: string;
  projectId?: string;
  todos?: { task: string; done: boolean; priority: string }[];
  duration?: number;
  recordingMode?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
};

type StatCard = {
  icon: string;
  label: string;
  value: string | number;
  color: string;
};

export default function DashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    thisWeek: 0,
    thisMonth: 0,
    totalTodos: 0,
    openTodos: 0,
    doneTodos: 0,
    totalDuration: 0,
    audioPhotoCount: 0,
    audioCount: 0,
    avgPerWeek: 0,
  });
  const [templateStats, setTemplateStats] = useState<{ name: string; count: number; percentage: number }[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ label: string; count: number }[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  const loadStats = async () => {
    try {
      const data = await AsyncStorage.getItem("protocols");
      const allProtocols: Protocol[] = JSON.parse(data || "[]");
      const active = allProtocols.filter((p) => !p.isArchived);
      setProtocols(active);

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const thisWeek = active.filter((p) => new Date(p.createdAt) >= weekAgo).length;
      const thisMonth = active.filter((p) => new Date(p.createdAt) >= monthAgo).length;

      let totalTodos = 0;
      let openTodos = 0;
      let doneTodos = 0;
      let totalDuration = 0;
      let audioPhotoCount = 0;
      let audioCount = 0;

      for (const p of active) {
        if (p.todos) {
          totalTodos += p.todos.length;
          openTodos += p.todos.filter((t) => !t.done).length;
          doneTodos += p.todos.filter((t) => t.done).length;
        }
        totalDuration += p.duration || 0;
        if (p.recordingMode === "audio") audioCount++;
        else audioPhotoCount++;
      }

      // Calculate average per week (based on first protocol date)
      const firstDate = active.length > 0
        ? new Date(active[active.length - 1].createdAt)
        : now;
      const weeksSinceFirst = Math.max(1, Math.ceil((now.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));
      const avgPerWeek = Math.round((active.length / weeksSinceFirst) * 10) / 10;

      setStats({
        total: active.length,
        thisWeek,
        thisMonth,
        totalTodos,
        openTodos,
        doneTodos,
        totalDuration,
        audioPhotoCount,
        audioCount,
        avgPerWeek,
      });

      // Template statistics
      const templateCounts: Record<string, number> = {};
      for (const p of active) {
        const name = p.templateName || "Freies Protokoll";
        templateCounts[name] = (templateCounts[name] || 0) + 1;
      }
      const sorted = Object.entries(templateCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({
          name,
          count,
          percentage: active.length > 0 ? Math.round((count / active.length) * 100) : 0,
        }));
      setTemplateStats(sorted);

      // Weekly data (last 8 weeks)
      const weekly: { label: string; count: number }[] = [];
      for (let i = 7; i >= 0; i--) {
        const start = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const end = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const count = active.filter((p) => {
          const d = new Date(p.createdAt);
          return d >= start && d < end;
        }).length;
        const label = `KW${getWeekNumber(end)}`;
        weekly.push({ label, count });
      }
      setWeeklyData(weekly);
    } catch (e) {
      console.error("Error loading stats:", e);
    }
  };

  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const maxWeekly = Math.max(...weeklyData.map((w) => w.count), 1);

  const statCards: StatCard[] = [
    { icon: "description", label: "Gesamt", value: stats.total, color: colors.primary },
    { icon: "today", label: "Diese Woche", value: stats.thisWeek, color: "#4CAF50" },
    { icon: "calendar-month", label: "Dieser Monat", value: stats.thisMonth, color: "#FF9800" },
    { icon: "trending-up", label: "Ø pro Woche", value: stats.avgPerWeek, color: "#9C27B0" },
  ];

  return (
    <ScreenContainer edges={["top", "left", "right"]} className="flex-1">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Dashboard</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Stat Cards */}
          <View style={styles.cardGrid}>
            {statCards.map((card, i) => (
              <View key={i} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name={card.icon as any} size={22} color={card.color} />
                <Text style={[styles.statValue, { color: colors.foreground }]}>{card.value}</Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>{card.label}</Text>
              </View>
            ))}
          </View>

          {/* Aufgaben-Übersicht */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Aufgaben</Text>
            <View style={styles.todoRow}>
              <View style={styles.todoStat}>
                <Text style={[styles.todoNumber, { color: "#F44336" }]}>{stats.openTodos}</Text>
                <Text style={[styles.todoLabel, { color: colors.muted }]}>Offen</Text>
              </View>
              <View style={[styles.todoDivider, { backgroundColor: colors.border }]} />
              <View style={styles.todoStat}>
                <Text style={[styles.todoNumber, { color: "#4CAF50" }]}>{stats.doneTodos}</Text>
                <Text style={[styles.todoLabel, { color: colors.muted }]}>Erledigt</Text>
              </View>
              <View style={[styles.todoDivider, { backgroundColor: colors.border }]} />
              <View style={styles.todoStat}>
                <Text style={[styles.todoNumber, { color: colors.primary }]}>{stats.totalTodos}</Text>
                <Text style={[styles.todoLabel, { color: colors.muted }]}>Gesamt</Text>
              </View>
            </View>
            {stats.totalTodos > 0 && (
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(stats.doneTodos / stats.totalTodos) * 100}%`, backgroundColor: "#4CAF50" },
                  ]}
                />
              </View>
            )}
          </View>

          {/* Wöchentliche Aktivität */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Wöchentliche Aktivität</Text>
            <View style={styles.chartContainer}>
              {weeklyData.map((week, i) => (
                <View key={i} style={styles.chartBar}>
                  <View style={styles.barContainer}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${(week.count / maxWeekly) * 100}%`,
                          backgroundColor: i === weeklyData.length - 1 ? colors.primary : colors.primary + "60",
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barLabel, { color: colors.muted }]}>{week.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Aufnahme-Modus */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Aufnahme-Modus</Text>
            <View style={styles.modeRow}>
              <View style={styles.modeItem}>
                <MaterialIcons name="photo-camera" size={24} color="#4CAF50" />
                <Text style={[styles.modeValue, { color: colors.foreground }]}>{stats.audioPhotoCount}</Text>
                <Text style={[styles.modeLabel, { color: colors.muted }]}>Audio+Foto</Text>
              </View>
              <View style={styles.modeItem}>
                <MaterialIcons name="mic" size={24} color="#2196F3" />
                <Text style={[styles.modeValue, { color: colors.foreground }]}>{stats.audioCount}</Text>
                <Text style={[styles.modeLabel, { color: colors.muted }]}>Audio</Text>
              </View>
              <View style={styles.modeItem}>
                <MaterialIcons name="timer" size={24} color="#FF9800" />
                <Text style={[styles.modeValue, { color: colors.foreground }]}>{formatDuration(stats.totalDuration)}</Text>
                <Text style={[styles.modeLabel, { color: colors.muted }]}>Gesamtzeit</Text>
              </View>
            </View>
          </View>

          {/* Vorlagen-Nutzung */}
          {templateStats.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Vorlagen-Nutzung</Text>
              {templateStats.map((t, i) => (
                <View key={i} style={styles.templateRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.templateName, { color: colors.foreground }]}>{t.name}</Text>
                    <View style={[styles.templateBar, { backgroundColor: colors.border }]}>
                      <View style={[styles.templateBarFill, { width: `${t.percentage}%`, backgroundColor: colors.primary }]} />
                    </View>
                  </View>
                  <Text style={[styles.templateCount, { color: colors.muted }]}>{t.count} ({t.percentage}%)</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: { width: (SCREEN_WIDTH - 42) / 2, padding: 14, borderRadius: 12, borderWidth: 1, gap: 4 },
  statValue: { fontSize: 24, fontWeight: "700" },
  statLabel: { fontSize: 12 },
  section: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  todoRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 12 },
  todoStat: { alignItems: "center" },
  todoNumber: { fontSize: 22, fontWeight: "700" },
  todoLabel: { fontSize: 12, marginTop: 2 },
  todoDivider: { width: 1, alignSelf: "stretch" },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  chartContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 100 },
  chartBar: { alignItems: "center", flex: 1 },
  barContainer: { width: 20, height: 80, justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 9, marginTop: 4 },
  modeRow: { flexDirection: "row", justifyContent: "space-around" },
  modeItem: { alignItems: "center", gap: 4 },
  modeValue: { fontSize: 18, fontWeight: "600" },
  modeLabel: { fontSize: 12 },
  templateRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 12 },
  templateName: { fontSize: 13, fontWeight: "500", marginBottom: 4 },
  templateBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  templateBarFill: { height: "100%", borderRadius: 3 },
  templateCount: { fontSize: 12, minWidth: 60, textAlign: "right" },
});
