import { useState, useEffect, useCallback } from "react";
import { ScrollView, Text, View, Pressable, StyleSheet, RefreshControl, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "@/lib/language-provider";
import { getDefects, getDefectStats, type Defect } from "@/lib/defect-store";
import { getOverdueDefects } from "@/lib/defect-pdf-export";
import { progressEngine, type ProgressSnapshot } from "@/lib/progress-engine";
import { timelineEngine, type TimelineEvent, getEventTypeLabel, getEventTypeIcon, getEventTypeColor } from "@/lib/timeline-engine";
import { getProjectStructure } from "@/lib/room-store";

type Project = {
  id: string;
  name: string;
  color: string;
  description?: string;
};

type Protocol = {
  id: string;
  title: string;
  createdAt: string;
  status: "processing" | "ready" | "sent";
  todos?: Array<{ task: string; done: boolean }>;
  projectId?: string;
};

type AttendanceRecord = {
  id: string;
  projectId: string;
  date: string;
  workers: Array<{ id: string; name: string; firma: string; gewerk: string }>;
};

// ─── Live Stats Type ────────────────────────────────────────────────────────
type LiveStats = {
  totalProjects: number;
  totalProtocols: number;
  thisWeekProtocols: number;
  openDefects: number;
  inProgressDefects: number;
  overdueDefects: number;
  resolvedDefects: number;
  totalDefects: number;
  highPriorityDefects: number;
  overallProgress: number;
  progressPhase: string;
  openTasks: number;
  completedTasks: number;
  todayAttendance: number;
  roomsTotal: number;
  roomsCompleted: number;
  recentEvents: TimelineEvent[];
  pendingFollowUps: number;
};

// ─── Tool Grid ──────────────────────────────────────────────────────────────

interface ToolItem {
  key: string;
  label: string;
  icon: string;
  color: string;
  route: string;
}

const TOOLS: ToolItem[] = [
  { key: "ki_analyse", label: "KI-Analyse", icon: "auto-awesome", color: "#7C4DFF", route: "/photo-analysis" },
  { key: "maengel", label: "Mängel", icon: "warning", color: "#FF9800", route: "/defects" },
  { key: "nachpruefung", label: "Nachprüfung", icon: "event-repeat", color: "#A78BFA", route: "/follow-up" },
  { key: "aufgaben", label: "Aufgaben", icon: "task-alt", color: "#1976D2", route: "/tasks" },
  { key: "raeume", label: "Räume", icon: "layers", color: "#5C6BC0", route: "/rooms" },
  { key: "grundriss", label: "Grundriss", icon: "map", color: "#4FC3F7", route: "/floor-plan" },
  { key: "tagebuch", label: "Bautagebuch", icon: "menu-book", color: "#66BB6A", route: "/bautagebuch" },
  { key: "checklisten", label: "Checklisten", icon: "checklist", color: "#AB47BC", route: "/checklists" },
  { key: "fotos", label: "Fotos", icon: "photo-library", color: "#EC407A", route: "/photo-gallery" },
  { key: "notizen", label: "Notizen", icon: "edit-note", color: "#78909C", route: "/quick-note" },
  { key: "timeline", label: "Timeline", icon: "timeline", color: "#009688", route: "/smart-timeline" },
  { key: "zeiterfassung", label: "Zeiterfassung", icon: "timer", color: "#FF5722", route: "/time-tracking" },
  { key: "team", label: "Team", icon: "groups", color: "#5C6BC0", route: "/team" },
  { key: "anwesenheit", label: "Anwesenheit", icon: "how-to-reg", color: "#00897B", route: "/attendance" },
  { key: "kalender", label: "Kalender", icon: "calendar-today", color: "#EF6C00", route: "/calendar-view" },
  { key: "fortschritt", label: "Fortschritt", icon: "trending-up", color: "#4CAF50", route: "/progress" },
  { key: "export", label: "Export", icon: "ios-share", color: "#43A047", route: "/export-center" },
  { key: "ki_bericht", label: "KI-Bericht", icon: "auto-awesome", color: "#7B1FA2", route: "/report-generator" },
  { key: "maengel_export", label: "Mängel-PDF", icon: "picture-as-pdf", color: "#EF4444", route: "/defect-export" },
  { key: "vergleich", label: "Vergleich", icon: "compare", color: "#5C6BC0", route: "/comparison" },
  { key: "bericht", label: "Bericht", icon: "summarize", color: "#795548", route: "/protocol-merge" },
  { key: "cloud", label: "Cloud", icon: "cloud-download", color: "#607D8B", route: "/cloud-import" },
  { key: "matterport", label: "Matterport", icon: "view-in-ar", color: "#00B0FF", route: "/matterport" },
  { key: "dokument_ai", label: "Dokument-KI", icon: "smart-toy", color: "#FF6F00", route: "/document-ai" },
  { key: "brain", label: "Brain", icon: "psychology", color: "#E040FB", route: "/ai-assistant" },
  { key: "statistik", label: "Statistik", icon: "bar-chart", color: "#26A69A", route: "/dashboard-stats" },
];

export default function AIWorkbenchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<LiveStats>({
    totalProjects: 0,
    totalProtocols: 0,
    thisWeekProtocols: 0,
    openDefects: 0,
    inProgressDefects: 0,
    overdueDefects: 0,
    resolvedDefects: 0,
    totalDefects: 0,
    highPriorityDefects: 0,
    overallProgress: 0,
    progressPhase: "",
    openTasks: 0,
    completedTasks: 0,
    todayAttendance: 0,
    roomsTotal: 0,
    roomsCompleted: 0,
    recentEvents: [],
    pendingFollowUps: 0,
  });

  const loadProjects = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem("projects");
      const parsed: Project[] = data ? JSON.parse(data) : [];
      setProjects(parsed);
      const lastId = await AsyncStorage.getItem("last-selected-project-id");
      if (lastId) {
        const found = parsed.find(p => p.id === lastId);
        if (found) { setSelectedProject(found); return; }
      }
      if (parsed.length > 0) setSelectedProject(parsed[0]);
    } catch {}
  }, []);

  const loadLiveStats = useCallback(async (projectId?: string) => {
    try {
      // 1. Projects
      const projectsData = await AsyncStorage.getItem("projects");
      const allProjects: Project[] = projectsData ? JSON.parse(projectsData) : [];

      // 2. Protocols
      const protocolsData = await AsyncStorage.getItem("protocols");
      const allProtocols: Protocol[] = protocolsData ? JSON.parse(protocolsData) : [];
      const projectProtocols = projectId
        ? allProtocols.filter(p => p.projectId === projectId)
        : allProtocols;
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thisWeek = projectProtocols.filter(p => new Date(p.createdAt) > weekAgo);

      // Tasks from protocols
      let openTasks = 0;
      let completedTasks = 0;
      projectProtocols.forEach(p => {
        if (p.todos && Array.isArray(p.todos)) {
          openTasks += p.todos.filter(td => !td.done).length;
          completedTasks += p.todos.filter(td => td.done).length;
        }
      });

      // 3. Defects
      const allDefects = await getDefects(projectId || undefined);
      const defectStats = getDefectStats(allDefects);
      const overdueDefects = getOverdueDefects(allDefects);
      const highPriority = allDefects.filter(d => d.priority === "hoch" && d.status !== "erledigt" && d.status !== "geschlossen").length;
      const pendingFollowUps = allDefects.filter(d => d.followUpDate && d.status !== "erledigt" && d.status !== "geschlossen").length;

      // 4. Progress
      let overallProgress = 0;
      let progressPhase = "";
      if (projectId) {
        try {
          const snapshot = await progressEngine.calculateProgress(projectId);
          overallProgress = snapshot.overallPercent;
          progressPhase = snapshot.phase;
        } catch {}
      }

      // 5. Rooms
      let roomsTotal = 0;
      let roomsCompleted = 0;
      if (projectId) {
        try {
          const structure = await getProjectStructure(projectId);
          roomsTotal = structure.rooms.length;
          roomsCompleted = structure.rooms.filter(r => r.status === "fertig" || r.status === "abgenommen").length;
        } catch {}
      }

      // 6. Attendance (today)
      let todayAttendance = 0;
      try {
        const attendanceData = await AsyncStorage.getItem("attendance_records");
        const records: AttendanceRecord[] = attendanceData ? JSON.parse(attendanceData) : [];
        const today = new Date().toISOString().split("T")[0];
        const todayRecords = records.filter(r =>
          r.date === today && (!projectId || r.projectId === projectId)
        );
        todayAttendance = todayRecords.reduce((sum, r) => sum + (r.workers?.length || 0), 0);
      } catch {}

      // 7. Timeline (recent events)
      let recentEvents: TimelineEvent[] = [];
      try {
        const events = await timelineEngine.query({
          projectId: projectId || undefined,
          limit: 5,
        });
        recentEvents = events;
      } catch {}

      setStats({
        totalProjects: allProjects.length,
        totalProtocols: projectProtocols.length,
        thisWeekProtocols: thisWeek.length,
        openDefects: defectStats.offen,
        inProgressDefects: defectStats.inBearbeitung,
        overdueDefects: overdueDefects.length,
        resolvedDefects: defectStats.erledigt,
        totalDefects: defectStats.total,
        highPriorityDefects: highPriority,
        overallProgress,
        progressPhase,
        openTasks,
        completedTasks,
        todayAttendance,
        roomsTotal,
        roomsCompleted,
        recentEvents,
        pendingFollowUps,
      });
    } catch (e) {
      console.error("Dashboard live stats error:", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects])
  );

  useEffect(() => {
    loadLiveStats(selectedProject?.id);
  }, [selectedProject, loadLiveStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProjects();
    await loadLiveStats(selectedProject?.id);
    setRefreshing(false);
  };

  const selectProject = async (project: Project) => {
    setSelectedProject(project);
    setShowProjectPicker(false);
    await AsyncStorage.setItem("last-selected-project-id", project.id);
  };

  const navigateModule = (route: string) => {
    if (selectedProject) {
      router.push(`${route}?projectId=${selectedProject.id}&projectName=${encodeURIComponent(selectedProject.name)}` as any);
    } else {
      router.push(route as any);
    }
  };

  // ─── Phase Label ────────────────────────────────────────────────────────────
  const phaseLabels: Record<string, string> = {
    rohbau: "Rohbau",
    ausbau_1: "Ausbau 1",
    ausbau_2: "Ausbau 2",
    ausbau_3: "Ausbau 3",
    fertigstellung: "Fertigstellung",
    abnahme: "Abnahme",
  };

  return (
    <ScreenContainer className="p-0">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5DADE2" />}
      >

        {/* ─── Project Selector ─────────────────────────────────────────── */}
        <Pressable
          onPress={() => setShowProjectPicker(!showProjectPicker)}
          style={({ pressed }) => [styles.projectSelector, { opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={styles.projectSelectorLeft}>
            <View style={[styles.projectDot, { backgroundColor: selectedProject?.color || '#E53935' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.projectSelectorLabel}>{t('projekt_waehlen')}</Text>
              <Text style={styles.projectSelectorName} numberOfLines={1}>
                {selectedProject?.name || t('kein_projekt')}
              </Text>
            </View>
          </View>
          <MaterialIcons name={showProjectPicker ? "expand-less" : "expand-more"} size={24} color="#8FA3B8" />
        </Pressable>

        {/* Project Picker Dropdown */}
        {showProjectPicker && (
          <View style={styles.projectDropdown}>
            {projects.length === 0 ? (
              <Text style={styles.noProjects}>{t('keine_projekte' as any)}</Text>
            ) : (
              projects.map((project) => (
                <Pressable
                  key={project.id}
                  onPress={() => selectProject(project)}
                  style={({ pressed }) => [
                    styles.projectItem,
                    selectedProject?.id === project.id && styles.projectItemActive,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View style={[styles.projectItemDot, { backgroundColor: project.color }]} />
                  <Text style={[
                    styles.projectItemText,
                    selectedProject?.id === project.id && styles.projectItemTextActive,
                  ]} numberOfLines={1}>{project.name}</Text>
                </Pressable>
              ))
            )}
            <Pressable
              onPress={() => { setShowProjectPicker(false); router.push("/(tabs)/projects" as any); }}
              style={({ pressed }) => [styles.projectItem, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="add" size={16} color="#5DADE2" />
              <Text style={[styles.projectItemText, { color: '#5DADE2' }]}>{t('neues_projekt')}</Text>
            </Pressable>
          </View>
        )}

        {/* ─── Live Stats Overview ────────────────────────────────────────── */}
        <View style={styles.statsSection}>
          <Text style={styles.statsSectionTitle}>ÜBERSICHT</Text>

          {/* Progress Bar */}
          {selectedProject && (
            <Pressable
              onPress={() => navigateModule("/progress")}
              style={({ pressed }) => [styles.progressCard, { opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={styles.progressHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialIcons name="trending-up" size={18} color="#4CAF50" />
                  <Text style={styles.progressLabel}>Baufortschritt</Text>
                </View>
                <Text style={styles.progressPercent}>{stats.overallProgress}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(stats.overallProgress, 100)}%` }]} />
              </View>
              {stats.progressPhase ? (
                <Text style={styles.progressPhase}>Phase: {phaseLabels[stats.progressPhase] || stats.progressPhase}</Text>
              ) : null}
            </Pressable>
          )}

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <Pressable onPress={() => navigateModule("/defects")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="warning" size={20} color="#F87171" />
              <Text style={styles.statValue}>{stats.openDefects}</Text>
              <Text style={styles.statLabel}>Offen</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/defects")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="build" size={20} color="#FBBF24" />
              <Text style={styles.statValue}>{stats.inProgressDefects}</Text>
              <Text style={styles.statLabel}>In Arbeit</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/defects")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="schedule" size={20} color="#FB7185" />
              <Text style={styles.statValue}>{stats.overdueDefects}</Text>
              <Text style={styles.statLabel}>Überfällig</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/defects")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="check-circle" size={20} color="#4ADE80" />
              <Text style={styles.statValue}>{stats.resolvedDefects}</Text>
              <Text style={styles.statLabel}>Erledigt</Text>
            </Pressable>
          </View>

          {/* Secondary Stats Row */}
          <View style={styles.statsGrid}>
            <Pressable onPress={() => router.push("/(tabs)/protocols" as any)} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="description" size={20} color="#5DADE2" />
              <Text style={styles.statValue}>{stats.totalProtocols}</Text>
              <Text style={styles.statLabel}>Protokolle</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/(tabs)/protocols" as any)} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="trending-up" size={20} color="#A78BFA" />
              <Text style={styles.statValue}>{stats.thisWeekProtocols}</Text>
              <Text style={styles.statLabel}>Diese Woche</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/attendance")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="groups" size={20} color="#00897B" />
              <Text style={styles.statValue}>{stats.todayAttendance}</Text>
              <Text style={styles.statLabel}>Heute vor Ort</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/rooms")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="layers" size={20} color="#5C6BC0" />
              <Text style={styles.statValue}>{stats.roomsCompleted}/{stats.roomsTotal}</Text>
              <Text style={styles.statLabel}>Räume fertig</Text>
            </Pressable>
          </View>

          {/* Critical Alerts */}
          {(stats.highPriorityDefects > 0 || stats.overdueDefects > 0 || stats.pendingFollowUps > 0) && (
            <View style={styles.alertsContainer}>
              {stats.highPriorityDefects > 0 && (
                <Pressable
                  onPress={() => navigateModule("/defects")}
                  style={({ pressed }) => [styles.alertRow, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="priority-high" size={16} color="#F87171" />
                  <Text style={styles.alertText}>
                    {stats.highPriorityDefects} {stats.highPriorityDefects === 1 ? "Mangel" : "Mängel"} mit hoher Priorität
                  </Text>
                  <MaterialIcons name="chevron-right" size={16} color="#8FA3B8" />
                </Pressable>
              )}
              {stats.overdueDefects > 0 && (
                <Pressable
                  onPress={() => navigateModule("/defects")}
                  style={({ pressed }) => [styles.alertRow, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="event-busy" size={16} color="#FB7185" />
                  <Text style={styles.alertText}>
                    {stats.overdueDefects} {stats.overdueDefects === 1 ? "Mangel" : "Mängel"} überfällig
                  </Text>
                  <MaterialIcons name="chevron-right" size={16} color="#8FA3B8" />
                </Pressable>
              )}
              {stats.pendingFollowUps > 0 && (
                <Pressable
                  onPress={() => navigateModule("/defects")}
                  style={({ pressed }) => [styles.alertRow, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="event-repeat" size={16} color="#A78BFA" />
                  <Text style={styles.alertText}>
                    {stats.pendingFollowUps} Nachprüfung{stats.pendingFollowUps !== 1 ? "en" : ""} ausstehend
                  </Text>
                  <MaterialIcons name="chevron-right" size={16} color="#8FA3B8" />
                </Pressable>
              )}
            </View>
          )}

          {/* Tasks Summary */}
          {(stats.openTasks > 0 || stats.completedTasks > 0) && (
            <View style={styles.tasksSummary}>
              <View style={styles.tasksHeader}>
                <MaterialIcons name="task-alt" size={16} color="#5DADE2" />
                <Text style={styles.tasksTitle}>Aufgaben</Text>
              </View>
              <View style={styles.tasksBar}>
                <View style={[styles.tasksBarFill, { width: `${stats.openTasks + stats.completedTasks > 0 ? (stats.completedTasks / (stats.openTasks + stats.completedTasks)) * 100 : 0}%` }]} />
              </View>
              <Text style={styles.tasksText}>
                {stats.completedTasks} erledigt / {stats.openTasks} offen
              </Text>
            </View>
          )}
        </View>

        {/* ─── Recent Activity ────────────────────────────────────────────── */}
        {stats.recentEvents.length > 0 && (
          <View style={styles.activitySection}>
            <View style={styles.activityHeader}>
              <Text style={styles.activityTitle}>LETZTE AKTIVITÄTEN</Text>
              <Pressable onPress={() => navigateModule("/smart-timeline")} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.activityMore}>Alle anzeigen</Text>
              </Pressable>
            </View>
            {stats.recentEvents.map((event) => (
              <View key={event.id} style={styles.activityItem}>
                <View style={[styles.activityDot, { backgroundColor: getEventTypeColor(event.eventType) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityItemTitle} numberOfLines={1}>{event.title}</Text>
                  <Text style={styles.activityItemMeta}>
                    {getEventTypeLabel(event.eventType)} {event.roomName ? `• ${event.roomName}` : ""}
                  </Text>
                </View>
                <Text style={styles.activityTime}>
                  {formatRelativeTime(event.timestamp)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ─── Neue Aufnahme starten ───────────────────────────────────── */}
        <View style={styles.quickActionsRow}>
          <Pressable
            onPress={() => router.push('/(tabs)/record' as any)}
            style={({ pressed }) => [styles.quickActionBtn, styles.quickActionPrimary, { opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="mic" size={22} color="#fff" />
            <Text style={styles.quickActionPrimaryText}>{t('neue_aufnahme_starten')}</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              try {
                const data = await AsyncStorage.getItem("protocols");
                const protocols: Protocol[] = data ? JSON.parse(data) : [];
                if (protocols.length > 0) {
                  const sorted = [...protocols].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  router.push(`/protocol-detail?id=${sorted[0].id}` as any);
                } else {
                  Alert.alert("Keine Protokolle", "Es gibt noch keine Protokolle.");
                }
              } catch { }
            }}
            style={({ pressed }) => [styles.quickActionBtn, styles.quickActionSecondary, { opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="history" size={22} color="#5DADE2" />
            <Text style={styles.quickActionSecondaryText}>{t('letzte_protokolle')}</Text>
          </Pressable>
        </View>

        {/* ─── TOOLS Grid (3 columns) ─────────────────────────────────────── */}
        <Text style={styles.toolsSectionTitle}>TOOLS</Text>

        <View style={styles.toolGrid}>
          {TOOLS.map((tool) => (
            <Pressable
              key={tool.key}
              onPress={() => navigateModule(tool.route)}
              style={({ pressed }) => [styles.toolCard, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name={tool.icon as any} size={24} color={tool.color} />
              <Text style={styles.toolLabel} numberOfLines={1}>{tool.label}</Text>
            </Pressable>
          ))}
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Jetzt";
  if (minutes < 60) return `${minutes} Min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Std`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} T`;
  return new Date(timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

const styles = StyleSheet.create({
  // ─── Project Selector ──────────────────────────────────────────────────────
  projectSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 0,
    padding: 14,
  },
  projectSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  projectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  projectSelectorLabel: {
    fontSize: 10,
    color: '#8FA3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  projectSelectorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F0F4F8',
    marginTop: 2,
  },
  projectDropdown: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 0,
    padding: 6,
  },
  noProjects: {
    fontSize: 13,
    color: '#8FA3B8',
    textAlign: 'center',
    padding: 12,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 0,
  },
  projectItemActive: {
    backgroundColor: '#1E3A5F40',
  },
  projectItemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  projectItemText: {
    fontSize: 14,
    color: '#F0F4F8',
    flex: 1,
  },
  projectItemTextActive: {
    fontWeight: '600',
    color: '#5DADE2',
  },
  // ─── Stats Section ─────────────────────────────────────────────────────────
  statsSection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  statsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8FA3B8',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  // Progress Card
  progressCard: {
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 0,
    padding: 14,
    marginBottom: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0F4F8',
  },
  progressPercent: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4CAF50',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#1E3A5F',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  progressPhase: {
    fontSize: 11,
    color: '#8FA3B8',
    marginTop: 6,
  },
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 0,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F0F4F8',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#8FA3B8',
    textAlign: 'center',
  },
  // Alerts
  alertsContainer: {
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#F8717130',
    borderRadius: 0,
    marginBottom: 10,
    overflow: 'hidden',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E3A5F',
  },
  alertText: {
    fontSize: 13,
    color: '#F0F4F8',
    flex: 1,
    fontWeight: '500',
  },
  // Tasks Summary
  tasksSummary: {
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 0,
    padding: 12,
    marginBottom: 10,
  },
  tasksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  tasksTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F0F4F8',
  },
  tasksBar: {
    height: 4,
    backgroundColor: '#1E3A5F',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  tasksBarFill: {
    height: 4,
    backgroundColor: '#4ADE80',
    borderRadius: 2,
  },
  tasksText: {
    fontSize: 11,
    color: '#8FA3B8',
  },
  // ─── Activity Section ──────────────────────────────────────────────────────
  activitySection: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  activityTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8FA3B8',
    letterSpacing: 1.5,
  },
  activityMore: {
    fontSize: 12,
    color: '#5DADE2',
    fontWeight: '500',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E3A5F',
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activityItemTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#F0F4F8',
  },
  activityItemMeta: {
    fontSize: 11,
    color: '#8FA3B8',
    marginTop: 1,
  },
  activityTime: {
    fontSize: 11,
    color: '#8FA3B8',
    fontWeight: '500',
  },
  // ─── Record Button ─────────────────────────────────────────────────────────
  quickActionsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    gap: 10,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 8,
    borderRadius: 0,
  },
  quickActionPrimary: {
    backgroundColor: '#E53935',
  },
  quickActionPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  quickActionSecondary: {
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
  },
  quickActionSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5DADE2',
  },
  // ─── Tools Grid ────────────────────────────────────────────────────────────
  toolsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8FA3B8',
    letterSpacing: 1.5,
    marginTop: 20,
    marginBottom: 10,
    paddingLeft: 20,
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    gap: 8,
  },
  toolCard: {
    width: '31%',
    minHeight: 72,
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    gap: 6,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F0F4F8',
    textAlign: 'center',
  },
});
