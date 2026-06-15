import { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Dimensions } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

type Protocol = {
  id: string;
  projectId?: string;
  title: string;
  createdAt: string;
  weather?: { temp?: number; condition?: string };
  todos?: { id: string; text: string; done: boolean }[];
};

type Defect = {
  id: string;
  projectId: string;
  status: "open" | "in_progress" | "resolved";
  priority: "low" | "medium" | "high" | "critical";
  createdAt: string;
};

export default function ProjectStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const [project, setProject] = useState<any>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [timeRange, setTimeRange] = useState<"week" | "month" | "all">("month");

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [projectsData, protocolsData, defectsData] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("protocols"),
        AsyncStorage.getItem("defects"),
      ]);
      const allProjects = JSON.parse(projectsData || "[]");
      const proj = allProjects.find((p: any) => p.id === id);
      setProject(proj);

      const allProtocols: Protocol[] = JSON.parse(protocolsData || "[]");
      setProtocols(allProtocols.filter((p) => p.projectId === id));

      const allDefects: Defect[] = JSON.parse(defectsData || "[]");
      setDefects(allDefects.filter((d) => d.projectId === id));
    } catch {}
  };

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const filteredProtocols = protocols.filter((p) => {
      const d = new Date(p.createdAt);
      if (timeRange === "week") return d >= weekAgo;
      if (timeRange === "month") return d >= monthAgo;
      return true;
    });

    const filteredDefects = defects.filter((d) => {
      const date = new Date(d.createdAt);
      if (timeRange === "week") return date >= weekAgo;
      if (timeRange === "month") return date >= monthAgo;
      return true;
    });

    // Protocols per day (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });
    const protocolsByDay = last7Days.map((day) => ({
      day: new Date(day).toLocaleDateString("de-DE", { weekday: "short" }),
      count: protocols.filter((p) => p.createdAt.startsWith(day)).length,
    }));

    // Defect status breakdown
    const defectOpen = defects.filter((d) => d.status === "open").length;
    const defectInProgress = defects.filter((d) => d.status === "in_progress").length;
    const defectResolved = defects.filter((d) => d.status === "resolved").length;

    // Defect priority breakdown
    const defectCritical = defects.filter((d) => d.priority === "critical").length;
    const defectHigh = defects.filter((d) => d.priority === "high").length;
    const defectMedium = defects.filter((d) => d.priority === "medium").length;
    const defectLow = defects.filter((d) => d.priority === "low").length;

    // Todos completion
    const allTodos = protocols.flatMap((p) => p.todos || []);
    const todosDone = allTodos.filter((t) => t.done).length;
    const todosTotal = allTodos.length;

    // Activity timeline (last 30 days)
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().split("T")[0];
    });
    const activityHeatmap = last30Days.map((day) => ({
      day,
      hasActivity: protocols.some((p) => p.createdAt.startsWith(day)) || defects.some((d) => d.createdAt.startsWith(day)),
    }));

    return {
      totalProtocols: protocols.length,
      filteredProtocols: filteredProtocols.length,
      totalDefects: defects.length,
      filteredDefects: filteredDefects.length,
      protocolsByDay,
      defectOpen,
      defectInProgress,
      defectResolved,
      defectCritical,
      defectHigh,
      defectMedium,
      defectLow,
      todosDone,
      todosTotal,
      activityHeatmap,
      avgProtocolsPerWeek: protocols.length > 0 ? (protocols.length / Math.max(1, Math.ceil((now.getTime() - new Date(protocols[protocols.length - 1]?.createdAt || now).getTime()) / (7 * 24 * 60 * 60 * 1000)))).toFixed(1) : "0",
    };
  }, [protocols, defects, timeRange]);

  const maxBarValue = Math.max(...stats.protocolsByDay.map((d) => d.count), 1);

  if (!project) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text style={{ color: colors.muted }}>Projekt nicht gefunden</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: project.color + "20", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: project.color }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Statistik</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{project.name}</Text>
          </View>
        </View>

        {/* Time Range Selector */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          {(["week", "month", "all"] as const).map((range) => (
            <Pressable
              key={range}
              onPress={() => setTimeRange(range)}
              style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: timeRange === range ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: timeRange === range ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: timeRange === range ? colors.primary : colors.muted }}>
                {range === "week" ? "7 Tage" : range === "month" ? "30 Tage" : "Gesamt"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Key Metrics */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 28, fontWeight: "800", color: colors.primary }}>{stats.totalProtocols}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Protokolle</Text>
            <Text style={{ fontSize: 11, color: colors.primary, marginTop: 4 }}>{stats.avgProtocolsPerWeek}/Woche</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 28, fontWeight: "800", color: stats.defectOpen > 0 ? colors.error : colors.success }}>{stats.totalDefects}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Mängel</Text>
            <Text style={{ fontSize: 11, color: stats.defectOpen > 0 ? colors.error : colors.success, marginTop: 4 }}>{stats.defectOpen} offen</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground }}>{stats.todosTotal > 0 ? Math.round((stats.todosDone / stats.todosTotal) * 100) : 0}%</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Aufgaben</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{stats.todosDone}/{stats.todosTotal}</Text>
          </View>
        </View>

        {/* Protocols Bar Chart */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>Protokolle (letzte 7 Tage)</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 100 }}>
            {stats.protocolsByDay.map((day, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <View style={{ width: "80%", height: Math.max(4, (day.count / maxBarValue) * 80), borderRadius: 4, backgroundColor: day.count > 0 ? colors.primary : colors.border + "60" }} />
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 6 }}>{day.day}</Text>
                {day.count > 0 && <Text style={{ fontSize: 10, fontWeight: "600", color: colors.primary }}>{day.count}</Text>}
              </View>
            ))}
          </View>
        </View>

        {/* Defect Status */}
        {stats.totalDefects > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>Mängel-Status</Text>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error }} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }}>Offen</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.error }}>{stats.defectOpen}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning }} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }}>In Bearbeitung</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.warning }}>{stats.defectInProgress}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success }} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }}>Erledigt</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.success }}>{stats.defectResolved}</Text>
              </View>
            </View>
            {/* Progress Bar */}
            <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 12, backgroundColor: colors.border }}>
              {stats.defectResolved > 0 && <View style={{ flex: stats.defectResolved, backgroundColor: colors.success }} />}
              {stats.defectInProgress > 0 && <View style={{ flex: stats.defectInProgress, backgroundColor: colors.warning }} />}
              {stats.defectOpen > 0 && <View style={{ flex: stats.defectOpen, backgroundColor: colors.error }} />}
            </View>
          </View>
        )}

        {/* Priority Breakdown */}
        {stats.totalDefects > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>Mängel nach Priorität</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, alignItems: "center", padding: 10, borderRadius: 8, backgroundColor: "#EF4444" + "15" }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#EF4444" }}>{stats.defectCritical}</Text>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>Kritisch</Text>
              </View>
              <View style={{ flex: 1, alignItems: "center", padding: 10, borderRadius: 8, backgroundColor: "#F59E0B" + "15" }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#F59E0B" }}>{stats.defectHigh}</Text>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>Hoch</Text>
              </View>
              <View style={{ flex: 1, alignItems: "center", padding: 10, borderRadius: 8, backgroundColor: "#3B82F6" + "15" }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#3B82F6" }}>{stats.defectMedium}</Text>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>Mittel</Text>
              </View>
              <View style={{ flex: 1, alignItems: "center", padding: 10, borderRadius: 8, backgroundColor: "#6B7280" + "15" }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#6B7280" }}>{stats.defectLow}</Text>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>Niedrig</Text>
              </View>
            </View>
          </View>
        )}

        {/* Activity Heatmap */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>Aktivität (30 Tage)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {stats.activityHeatmap.map((day, i) => (
              <View
                key={i}
                style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: day.hasActivity ? colors.primary : colors.border + "40" }}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.primary }} />
              <Text style={{ fontSize: 11, color: colors.muted }}>Aktiv</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.border + "40" }} />
              <Text style={{ fontSize: 11, color: colors.muted }}>Keine Aktivität</Text>
            </View>
          </View>
        </View>

        {/* Project Info */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>Projektinfo</Text>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>Erstellt am</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{new Date(project.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}</Text>
            </View>
            {project.protocolPrefix && (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>Präfix</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{project.protocolPrefix}</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>Protokoll-Nr.</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{project.protocolCounter || 0}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>Laufzeit</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{Math.ceil((new Date().getTime() - new Date(project.createdAt).getTime()) / (24 * 60 * 60 * 1000))} Tage</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
