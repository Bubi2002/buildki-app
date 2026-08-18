import { useState, useEffect, useCallback } from "react";
import { ScrollView, Text, View, Pressable, StyleSheet, RefreshControl, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "@/lib/language-provider";
import { getDefects, getDefectStats } from "@/lib/defect-store";
import { getOverdueDefects } from "@/lib/defect-pdf-export";
import { progressEngine } from "@/lib/progress-engine";
import { timelineEngine, type TimelineEvent } from "@/lib/timeline-engine";
import { getProjectStructure } from "@/lib/room-store";
import { deleteProjectLocally, resolveSelectedProject } from "@/lib/project-context";
import { filterDashboardItemsByProject, normalizeDashboardProjectId } from "@/lib/dashboard-project-context";
import { syncStoredProtocolDefects } from "@/lib/protocol-defect-sync";

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
  todos?: { task: string; done: boolean }[];
  projectId?: string;
};

type AttendanceRecord = {
  id: string;
  projectId: string;
  date: string;
  workers: { id: string; name: string; firma: string; gewerk: string }[];
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

const createEmptyLiveStats = (): LiveStats => ({
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

// ─── Tool Grid ──────────────────────────────────────────────────────────────

interface ToolItem {
  key: string;
  labelKey: string;
  icon: string;
  color: string;
  route: string;
}

interface ToolGroup {
  titleKey: string;
  tools: ToolItem[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    titleKey: "tools_group_erfassen",
    tools: [
      { key: "fotos", labelKey: "index_tool_fotos", icon: "photo-library", color: "#EC407A", route: "/photo-gallery" },
      { key: "vergleich", labelKey: "index_tool_vergleich", icon: "compare", color: "#5C6BC0", route: "/photo-compare" },
      { key: "notizen", labelKey: "index_tool_notizen", icon: "edit-note", color: "#78909C", route: "/quick-note" },
      { key: "tagebuch", labelKey: "index_tool_bautagebuch", icon: "menu-book", color: "#66BB6A", route: "/bautagebuch" },
      { key: "raeume", labelKey: "index_tool_raeume", icon: "layers", color: "#5C6BC0", route: "/rooms" },
      { key: "grundriss", labelKey: "index_tool_grundriss", icon: "map", color: "#4FC3F7", route: "/floor-plan" },
      { key: "messen", labelKey: "index_tool_messen", icon: "straighten", color: "#00ACC1", route: "/measure" },
      { key: "matterport", labelKey: "index_tool_matterport", icon: "view-in-ar", color: "#00B0FF", route: "/matterport" },
    ],
  },
  {
    titleKey: "tools_group_maengel",
    tools: [
      { key: "maengel", labelKey: "index_tool_maengel", icon: "warning", color: "#FF9800", route: "/defects" },
      { key: "nachpruefung", labelKey: "index_tool_nachpruefung", icon: "event-repeat", color: "#A78BFA", route: "/follow-up" },
      { key: "checklisten", labelKey: "index_tool_checklisten", icon: "checklist", color: "#AB47BC", route: "/checklists" },
    ],
  },
  {
    titleKey: "tools_group_ki",
    tools: [
      { key: "ki_analyse", labelKey: "index_tool_ki_analyse", icon: "auto-awesome", color: "#7C4DFF", route: "/photo-analysis" },
      { key: "dokument_ai", labelKey: "index_tool_dokument_ki", icon: "smart-toy", color: "#FF6F00", route: "/document-ai" },
      { key: "ki_bericht", labelKey: "index_tool_ki_bericht", icon: "auto-awesome", color: "#7B1FA2", route: "/report-generator" },
      { key: "brain", labelKey: "index_tool_brain", icon: "psychology", color: "#E040FB", route: "/ai-assistant" },
    ],
  },
  {
    titleKey: "tools_group_planung",
    tools: [
      { key: "aufgaben", labelKey: "index_tool_aufgaben", icon: "task-alt", color: "#1976D2", route: "/tasks" },
      { key: "kalender", labelKey: "index_tool_kalender", icon: "calendar-today", color: "#EF6C00", route: "/calendar-view" },
      { key: "fortschritt", labelKey: "index_tool_fortschritt", icon: "trending-up", color: "#4CAF50", route: "/progress" },
    ],
  },
  {
    titleKey: "tools_group_team",
    tools: [
      { key: "team", labelKey: "index_tool_team", icon: "groups", color: "#5C6BC0", route: "/team" },
      { key: "anwesenheit", labelKey: "index_tool_anwesenheit", icon: "how-to-reg", color: "#00897B", route: "/attendance" },
      { key: "zeiterfassung", labelKey: "index_tool_zeiterfassung", icon: "timer", color: "#FF5722", route: "/time-tracking" },
    ],
  },
  {
    titleKey: "tools_group_berichte",
    tools: [
      { key: "bericht", labelKey: "index_tool_bericht", icon: "summarize", color: "#795548", route: "/protocol-merge" },
      { key: "projekt_export", labelKey: "index_tool_projekt_export", icon: "picture-as-pdf", color: "#2563EB", route: "/project-export" },
    ],
  },
];

export default function AIWorkbenchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<LiveStats>(createEmptyLiveStats);
  const [roomSummaries, setRoomSummaries] = useState<{ id: string; name: string; floorId: string; floorName: string; floorNumber: number; open: number }[]>([]);
  const [expandedHomeFloors, setExpandedHomeFloors] = useState<Set<string>>(new Set());

  const loadProjects = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem("projects");
      const parsed: Project[] = data ? JSON.parse(data) : [];
      const lastId = await AsyncStorage.getItem("last-selected-project-id");
      const nextProject = resolveSelectedProject(parsed, lastId);
      setProjects(parsed);
      setSelectedProject(nextProject);
      if (nextProject && nextProject.id !== lastId) {
        await AsyncStorage.setItem("last-selected-project-id", nextProject.id);
      } else if (!nextProject && lastId) {
        await AsyncStorage.removeItem("last-selected-project-id");
      }
    } catch {
      setProjects([]);
      setSelectedProject(null);
    }
  }, []);

  const loadLiveStats = useCallback(async (projectId?: string) => {
    const activeProjectId = normalizeDashboardProjectId(projectId);
    if (!activeProjectId) {
      setStats(createEmptyLiveStats());
      setRoomSummaries([]);
      return;
    }

    try {
      // 1. Projects
      const projectsData = await AsyncStorage.getItem("projects");
      const allProjects: Project[] = projectsData ? JSON.parse(projectsData) : [];

      // 2. Protocols
      const protocolsData = await AsyncStorage.getItem("protocols");
      const allProtocols: Protocol[] = protocolsData ? JSON.parse(protocolsData) : [];
      const projectProtocols = filterDashboardItemsByProject(allProtocols, activeProjectId);
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
      await syncStoredProtocolDefects(activeProjectId);
      const allDefects = await getDefects(activeProjectId);
      const defectStats = getDefectStats(allDefects);
      const overdueDefects = getOverdueDefects(allDefects);
      const highPriority = allDefects.filter(d => d.priority === "hoch" && d.status !== "erledigt" && d.status !== "geschlossen").length;
      const pendingFollowUps = allDefects.filter(d => d.followUpDate && d.status !== "erledigt" && d.status !== "geschlossen").length;

      // 4. Progress
      let overallProgress = 0;
      let progressPhase = "";
      try {
        const snapshot = await progressEngine.calculateProgress(activeProjectId);
        overallProgress = snapshot.overallPercent;
        progressPhase = snapshot.phase;
      } catch {}

      // 5. Rooms
      let roomsTotal = 0;
      let roomsCompleted = 0;
      try {
        const structure = await getProjectStructure(activeProjectId);
        roomsTotal = structure.rooms.length;
        roomsCompleted = structure.rooms.filter(r => r.status === "fertig" || r.status === "abgenommen").length;
        const OPEN = new Set(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
        setRoomSummaries(structure.rooms.map(r => {
          const fl = structure.floors.find(f => f.id === r.floorId);
          return {
            id: r.id,
            name: r.name,
            floorId: r.floorId,
            floorName: fl?.name || "",
            floorNumber: fl?.number ?? 0,
            open: allDefects.filter(d => (d.room || "").trim().toLowerCase() === r.name.trim().toLowerCase() && OPEN.has(d.status)).length,
          };
        }));
        // Expand all floors that have rooms by default.
        setExpandedHomeFloors(new Set(structure.rooms.map(r => r.floorId)));
      } catch {}

      // 6. Attendance (today)
      let todayAttendance = 0;
      try {
        const attendanceData = await AsyncStorage.getItem("attendance_records");
        const records: AttendanceRecord[] = attendanceData ? JSON.parse(attendanceData) : [];
        const today = new Date().toISOString().split("T")[0];
        const todayRecords = records.filter(r =>
          r.date === today && r.projectId === activeProjectId
        );
        todayAttendance = todayRecords.reduce((sum, r) => sum + (r.workers?.length || 0), 0);
      } catch {}

      // 7. Timeline (recent events)
      let recentEvents: TimelineEvent[] = [];
      try {
        const events = await timelineEngine.query({
          projectId: activeProjectId,
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
    void Promise.resolve().then(() => {
      loadLiveStats(selectedProject?.id);
    });
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

  const confirmDeleteProject = (project: Project) => {
    Alert.alert(
      t('index_projekt_loeschen' as any),
      `„${project.name}” ${t('index_projekt_entfernen_body' as any)}`,
      [
        { text: t('index_abbrechen' as any), style: "cancel" },
        {
          text: t('index_projekt_loeschen' as any),
          style: "destructive",
          onPress: async () => {
            try {
              const result = await deleteProjectLocally<Project>(project.id);
              setProjects(result.remainingProjects);
              setSelectedProject(result.nextProject);
              setShowProjectPicker(false);
              await loadLiveStats(result.nextProject?.id);
              Alert.alert(
                t('index_projekt_geloescht' as any),
                result.detachedProtocolCount > 0
                  ? `${result.detachedProtocolCount} ${result.detachedProtocolCount === 1 ? t('index_protokoll_erhalten_sg' as any) : t('index_protokoll_erhalten_pl' as any)}`
                  : t('index_projekteintrag_entfernt' as any),
              );
            } catch {
              Alert.alert(t('index_fehler' as any), t('index_projekt_nicht_geloescht' as any));
            }
          },
        },
      ],
    );
  };

  const navigateModule = (route: string) => {
    if (!selectedProject) {
      setShowProjectPicker(true);
      Alert.alert(t('index_projekt_auswaehlen' as any), t('index_bitte_projekt_erstellen' as any));
      return;
    }
    router.push(`${route}?projectId=${selectedProject.id}&projectName=${encodeURIComponent(selectedProject.name)}` as any);
  };

  // ─── Phase Label ────────────────────────────────────────────────────────────
  const phaseLabels: Record<string, string> = {
    rohbau: t('index_phase_rohbau' as any),
    ausbau_1: t('index_phase_ausbau_1' as any),
    ausbau_2: t('index_phase_ausbau_2' as any),
    ausbau_3: t('index_phase_ausbau_3' as any),
    fertigstellung: t('index_phase_fertigstellung' as any),
    abnahme: t('index_phase_abnahme' as any),
  };

  return (
    <ScreenContainer className="p-0">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5DADE2" />}
      >

        {/* ─── Project Selector ─────────────────────────────────────────── */}
        <View style={styles.projectSelector}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('index_projekt_auswaehlen' as any)}
            onPress={() => setShowProjectPicker(!showProjectPicker)}
            style={({ pressed }) => [styles.projectSelectorToggle, { opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={styles.projectSelectorLeft}>
              <View style={[styles.projectIconBox, { backgroundColor: (selectedProject?.color || '#5DADE2') + '22', borderColor: (selectedProject?.color || '#5DADE2') + '55' }]}>
                <MaterialIcons name={selectedProject ? 'folder' : 'create-new-folder'} size={36} color={selectedProject?.color || '#5DADE2'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.projectSelectorLabel}>{t('projekt_waehlen')}</Text>
                <Text style={styles.projectSelectorName} numberOfLines={1}>
                  {selectedProject?.name || t('kein_projekt')}
                </Text>
              </View>
            </View>
            <View style={styles.projectSelectorChevron}>
              <MaterialIcons name={showProjectPicker ? "expand-less" : "expand-more"} size={28} color="#5DADE2" />
            </View>
          </Pressable>
          {selectedProject ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('index_a11y_aktives_projekt_prefix' as any)}${selectedProject.name}${t('index_a11y_loeschen_suffix' as any)}`}
              accessibilityHint={t('index_a11y_delete_hint' as any)}
              hitSlop={8}
              onPress={() => confirmDeleteProject(selectedProject)}
              style={({ pressed }) => [styles.activeProjectDeleteButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <MaterialIcons name="delete-outline" size={22} color="#F87171" />
            </Pressable>
          ) : null}
        </View>

        {/* Project Picker Dropdown */}
        {showProjectPicker && (
          <View style={styles.projectDropdown}>
            {projects.length === 0 ? (
              <Text style={styles.noProjects}>{t('keine_projekte' as any)}</Text>
            ) : (
              projects.map((project) => (
                <View
                  key={project.id}
                  style={[
                    styles.projectItemRow,
                    selectedProject?.id === project.id && styles.projectItemActive,
                  ]}
                >
                  <Pressable
                    onPress={() => selectProject(project)}
                    style={({ pressed }) => [styles.projectItemSelection, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={[styles.projectItemDot, { backgroundColor: project.color }]} />
                    <Text style={[
                      styles.projectItemText,
                      selectedProject?.id === project.id && styles.projectItemTextActive,
                    ]} numberOfLines={1}>{project.name}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('index_a11y_projekt_prefix' as any)}${project.name}${t('index_a11y_loeschen_suffix' as any)}`}
                    onPress={() => confirmDeleteProject(project)}
                    style={({ pressed }) => [styles.projectDeleteButton, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <MaterialIcons name="delete-outline" size={20} color="#F87171" />
                  </Pressable>
                </View>
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
          <Text style={styles.statsSectionTitle}>{t('index_uebersicht' as any)}</Text>

          {selectedProject ? (
            <>
              {/* Progress Bar */}
              <Pressable
              onPress={() => navigateModule("/progress")}
              style={({ pressed }) => [styles.progressCard, { opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={styles.progressHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialIcons name="trending-up" size={18} color="#4CAF50" />
                  <Text style={styles.progressLabel}>{t('index_baufortschritt' as any)}</Text>
                </View>
                <Text style={styles.progressPercent}>{stats.overallProgress}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(stats.overallProgress, 100)}%` }]} />
              </View>
              {stats.progressPhase ? (
                <Text style={styles.progressPhase}>{t('index_phase_label' as any)} {phaseLabels[stats.progressPhase] || stats.progressPhase}</Text>
              ) : null}
              </Pressable>

              {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <Pressable onPress={() => navigateModule("/defects")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="warning" size={20} color="#F87171" />
              <Text style={styles.statValue}>{stats.openDefects}</Text>
              <Text style={styles.statLabel}>{t('index_offen' as any)}</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/defects")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="build" size={20} color="#FBBF24" />
              <Text style={styles.statValue}>{stats.inProgressDefects}</Text>
              <Text style={styles.statLabel}>{t('index_in_arbeit' as any)}</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/defects")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="schedule" size={20} color="#FB7185" />
              <Text style={styles.statValue}>{stats.overdueDefects}</Text>
              <Text style={styles.statLabel}>{t('index_ueberfaellig' as any)}</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/defects")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="check-circle" size={20} color="#4ADE80" />
              <Text style={styles.statValue}>{stats.resolvedDefects}</Text>
              <Text style={styles.statLabel}>{t('index_erledigt' as any)}</Text>
            </Pressable>
          </View>

          {/* Secondary Stats Row */}
          <View style={styles.statsGrid}>
            <Pressable onPress={() => router.push("/(tabs)/protocols" as any)} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="description" size={20} color="#5DADE2" />
              <Text style={styles.statValue}>{stats.totalProtocols}</Text>
              <Text style={styles.statLabel}>{t('index_protokolle' as any)}</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/(tabs)/protocols" as any)} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="trending-up" size={20} color="#A78BFA" />
              <Text style={styles.statValue}>{stats.thisWeekProtocols}</Text>
              <Text style={styles.statLabel}>{t('index_diese_woche' as any)}</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/attendance")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="groups" size={20} color="#00897B" />
              <Text style={styles.statValue}>{stats.todayAttendance}</Text>
              <Text style={styles.statLabel}>{t('index_heute_vor_ort' as any)}</Text>
            </Pressable>
            <Pressable onPress={() => navigateModule("/rooms")} style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="layers" size={20} color="#5C6BC0" />
              <Text style={styles.statValue}>{stats.roomsCompleted}/{stats.roomsTotal}</Text>
              <Text style={styles.statLabel}>{t('index_raeume_fertig' as any)}</Text>
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
                    {stats.highPriorityDefects} {stats.highPriorityDefects === 1 ? t('index_mangel' as any) : t('index_maengel' as any)} {t('index_mit_hoher_prioritaet' as any)}
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
                    {stats.overdueDefects} {stats.overdueDefects === 1 ? t('index_mangel' as any) : t('index_maengel' as any)} {t('index_ueberfaellig_lc' as any)}
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
                    {stats.pendingFollowUps} {stats.pendingFollowUps === 1 ? t('index_nachpruefung_ausstehend_sg' as any) : t('index_nachpruefung_ausstehend_pl' as any)}
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
                    <Text style={styles.tasksTitle}>{t('index_aufgaben' as any)}</Text>
                  </View>
                  <View style={styles.tasksBar}>
                    <View style={[styles.tasksBarFill, { width: `${stats.openTasks + stats.completedTasks > 0 ? (stats.completedTasks / (stats.openTasks + stats.completedTasks)) * 100 : 0}%` }]} />
                  </View>
                  <Text style={styles.tasksText}>
                    {stats.completedTasks} {t('index_tasks_erledigt' as any)} / {stats.openTasks} {t('index_tasks_offen' as any)}
                  </Text>
                </View>
              )}

              {/* Rooms — cross-tool hub: defects / tasks / checklists / follow-ups per room */}
              <View style={styles.roomsHome}>
                <View style={styles.roomsHomeHead}>
                  <View style={styles.tasksHeader}>
                    <MaterialIcons name="meeting-room" size={16} color="#5DADE2" />
                    <Text style={styles.tasksTitle}>{t('index_tool_raeume')}</Text>
                  </View>
                  <Pressable onPress={() => navigateModule("/rooms")} hitSlop={6}>
                    <Text style={styles.roomsHomeAll}>{roomSummaries.length > 0 ? t('rooms_open_all' as any) : t('rooms_add_room' as any)}</Text>
                  </Pressable>
                </View>
                <Text style={styles.roomsHomeHint}>{t('rooms_home_hint' as any)}</Text>
                {roomSummaries.length === 0 ? (
                  <Pressable onPress={() => navigateModule("/rooms")} style={({ pressed }) => [styles.roomsHomeRow, { opacity: pressed ? 0.7 : 1 }]}>
                    <MaterialIcons name="add" size={18} color="#5DADE2" />
                    <Text style={[styles.roomsHomeName, { color: "#5DADE2" }]}>{t('rooms_add_room' as any)}</Text>
                  </Pressable>
                ) : (() => {
                  const byFloor = new Map<string, typeof roomSummaries>();
                  for (const r of roomSummaries) {
                    if (!byFloor.has(r.floorId)) byFloor.set(r.floorId, []);
                    byFloor.get(r.floorId)!.push(r);
                  }
                  const floorGroups = [...byFloor.values()]
                    .map((rms) => ({ floorId: rms[0].floorId, floorName: rms[0].floorName, floorNumber: rms[0].floorNumber, rooms: rms }))
                    .sort((a, b) => a.floorNumber - b.floorNumber);
                  return floorGroups.map((g) => {
                    const expanded = expandedHomeFloors.has(g.floorId);
                    const openSum = g.rooms.reduce((s, r) => s + r.open, 0);
                    return (
                      <View key={g.floorId}>
                        <Pressable
                          onPress={() => setExpandedHomeFloors((prev) => {
                            const n = new Set(prev);
                            if (n.has(g.floorId)) n.delete(g.floorId); else n.add(g.floorId);
                            return n;
                          })}
                          style={({ pressed }) => [styles.roomsHomeFloorHead, { opacity: pressed ? 0.7 : 1 }]}
                        >
                          <MaterialIcons name={expanded ? "expand-more" : "chevron-right"} size={18} color="#8FA3B8" />
                          <Text style={styles.roomsHomeFloorName}>{g.floorName || "—"}</Text>
                          <Text style={styles.roomsHomeFloorCount}>{g.rooms.length}</Text>
                          {openSum > 0 && (
                            <View style={styles.roomsHomeBadge}>
                              <MaterialIcons name="warning" size={11} color="#F97316" />
                              <Text style={styles.roomsHomeBadgeText}>{openSum}</Text>
                            </View>
                          )}
                        </Pressable>
                        {expanded && g.rooms.map((r) => (
                          <Pressable
                            key={r.id}
                            onPress={() => selectedProject && router.push(`/rooms?projectId=${selectedProject.id}&projectName=${encodeURIComponent(selectedProject.name)}&openRoom=${r.id}` as any)}
                            style={({ pressed }) => [styles.roomsHomeRow, styles.roomsHomeRoomIndent, { opacity: pressed ? 0.7 : 1 }]}
                          >
                            <MaterialIcons name="meeting-room" size={16} color="#8FA3B8" />
                            <Text style={styles.roomsHomeName} numberOfLines={1}>{r.name}</Text>
                            {r.open > 0 && (
                              <View style={styles.roomsHomeBadge}>
                                <MaterialIcons name="warning" size={11} color="#F97316" />
                                <Text style={styles.roomsHomeBadgeText}>{r.open}</Text>
                              </View>
                            )}
                            <MaterialIcons name="chevron-right" size={16} color="#5F7590" />
                          </Pressable>
                        ))}
                      </View>
                    );
                  });
                })()}
              </View>
            </>
          ) : (
            <View style={styles.noProjectOverview} accessibilityRole="summary">
              <MaterialIcons name="folder-off" size={30} color="#8FA3B8" />
              <Text style={styles.noProjectOverviewTitle}>{t('index_keine_projektdaten' as any)}</Text>
              <Text style={styles.noProjectOverviewText}>
                {t('index_keine_projektdaten_text' as any)}
              </Text>
            </View>
          )}
        </View>

        {/* ─── Neue Aufnahme ───────────────────────────────────────────── */}
        <View style={styles.quickActionsRow}>
          <Pressable
            onPress={() => navigateModule('/(tabs)/record')}
            style={({ pressed }) => [styles.quickActionBtn, styles.quickActionPrimary, { opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="mic" size={22} color="#fff" />
            <Text
              style={styles.quickActionPrimaryText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {t('neue_aufnahme')}
            </Text>
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
                  Alert.alert(t('index_keine_protokolle' as any), t('index_keine_protokolle_text' as any));
                }
              } catch { }
            }}
            style={({ pressed }) => [styles.quickActionBtn, styles.quickActionSecondary, { opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="history" size={22} color="#5DADE2" />
            <Text style={styles.quickActionSecondaryText}>{t('letzte_protokolle')}</Text>
          </Pressable>
        </View>

        {/* ─── Hilfe & Abo ───────────────────────────────────────────── */}
        <View style={styles.helpRow}>
          <Pressable
            onPress={() => router.push('/tutorial' as any)}
            style={({ pressed }) => [styles.helpBtn, { backgroundColor: '#1A2A3F', borderColor: '#1E3A5F', opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="menu-book" size={20} color="#5DADE2" />
            <Text style={styles.helpBtnText}>{t('index_anleitung' as any)}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/support-chat' as any)}
            style={({ pressed }) => [styles.helpBtn, { backgroundColor: '#1A2A3F', borderColor: '#1E3A5F', opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="support-agent" size={20} color="#A78BFA" />
            <Text style={styles.helpBtnText}>{t('index_ki_support' as any)}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/subscription' as any)}
            style={({ pressed }) => [styles.helpBtn, { backgroundColor: '#1A2A3F', borderColor: '#1E3A5F', opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="credit-card" size={20} color="#4ADE80" />
            <Text style={styles.helpBtnText}>{t('index_abo' as any)}</Text>
          </Pressable>
        </View>

        {/* ─── TOOLS (grouped, 3 columns) ─────────────────────────────────── */}
        <Text style={styles.toolsSectionTitle}>{t('index_tools' as any)}</Text>

        {TOOL_GROUPS.map((group) => (
          <View key={group.titleKey}>
            <Text style={styles.toolGroupTitle}>{t(group.titleKey as any)}</Text>
            <View style={styles.toolGrid}>
              {group.tools.map((tool) => (
                <Pressable
                  key={tool.key}
                  onPress={() => navigateModule(tool.route)}
                  style={({ pressed }) => [styles.toolCard, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name={tool.icon as any} size={24} color={tool.color} />
                  <Text style={styles.toolLabel} numberOfLines={1}>{t(tool.labelKey as any)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ─── Project Selector ──────────────────────────────────────────────────────
  projectSelector: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#12263E',
    borderWidth: 1.5,
    borderColor: '#2E5A86',
    borderRadius: 12,
    overflow: 'hidden',
  },
  projectSelectorToggle: {
    flex: 1,
    minHeight: 128,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  activeProjectDeleteButton: {
    width: 64,
    minHeight: 128,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#1E3A5F',
    backgroundColor: '#F871710D',
  },
  projectSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    flex: 1,
  },
  projectIconBox: {
    width: 68,
    height: 68,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectSelectorChevron: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#5DADE21A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectSelectorLabel: {
    fontSize: 13,
    color: '#7FB3DE',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  projectSelectorName: {
    fontSize: 27,
    fontWeight: '800',
    color: '#F0F4F8',
    marginTop: 5,
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
  projectItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
  },
  projectItemSelection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
  },
  projectDeleteButton: {
    padding: 10,
    marginRight: 2,
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
  noProjectOverview: {
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 0,
    paddingVertical: 28,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 8,
  },
  noProjectOverviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F0F4F8',
  },
  noProjectOverviewText: {
    maxWidth: 310,
    fontSize: 12,
    lineHeight: 18,
    color: '#8FA3B8',
    textAlign: 'center',
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
  roomsHome: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 12,
    padding: 14,
  },
  roomsHomeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomsHomeAll: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5DADE2',
  },
  roomsHomeHint: {
    fontSize: 11,
    color: '#5F7590',
    marginTop: 2,
    marginBottom: 8,
  },
  roomsHomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#12263E',
  },
  roomsHomeFloorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#12263E',
  },
  roomsHomeFloorName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#C7D5E5',
    flex: 1,
  },
  roomsHomeFloorCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5F7590',
  },
  roomsHomeRoomIndent: {
    paddingLeft: 24,
  },
  roomsHomeName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#F0F4F8',
  },
  roomsHomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F9731622',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roomsHomeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F97316',
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
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
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
  // ─── Help Row ──────────────────────────────────────────────────────────────
  helpRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  helpBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
  },
  helpBtnText: {
    color: '#E8F0FE',
    fontSize: 12,
    fontWeight: '600',
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
  toolGroupTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5F7590',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
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
