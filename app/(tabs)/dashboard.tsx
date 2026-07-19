import { useState, useEffect, useCallback } from "react";
import { ScrollView, Text, View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "@/lib/language-provider";

type Project = {
  id: string;
  name: string;
  color: string;
  description?: string;
};

// ─── Tool Grid (matching screenshot layout) ─────────────────────────────────

interface ToolItem {
  key: string;
  label: string;
  icon: string;
  color: string;
  route: string;
}

const TOOLS: ToolItem[] = [
  { key: "ki_analyse", label: "KI-Analyse", icon: "auto-awesome", color: "#7C4DFF", route: "/photo-analysis" },
  { key: "maengel", label: "M\u00e4ngel", icon: "warning", color: "#FF9800", route: "/defects" },
  { key: "aufgaben", label: "Aufgaben", icon: "task-alt", color: "#1976D2", route: "/tasks" },
  { key: "raeume", label: "R\u00e4ume", icon: "layers", color: "#5C6BC0", route: "/rooms" },
  { key: "grundriss", label: "Grundriss", icon: "map", color: "#4FC3F7", route: "/floor-plan" },
  { key: "tagebuch", label: "Tagebuch", icon: "menu-book", color: "#66BB6A", route: "/diary" },
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

  useEffect(() => { loadProjects(); }, [loadProjects]);

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

  return (
    <ScreenContainer className="p-0">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>

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

        {/* ─── Neue Aufnahme starten ───────────────────────────────────── */}
        <Pressable
          onPress={() => router.push('/(tabs)/' as any)}
          style={({ pressed }) => [styles.recordButton, { opacity: pressed ? 0.85 : 1 }]}
        >
          <MaterialIcons name="mic" size={20} color="#fff" />
          <Text style={styles.recordButtonText}>{t('neue_aufnahme_starten')}</Text>
          <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* ─── TOOLS Grid (3 columns, matching screenshot) ─────────────── */}
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 6,
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
  // ─── Record Button ─────────────────────────────────────────────────────────
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#E53935',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  recordButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
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
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    gap: 6,
  },
  toolLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F0F4F8',
    textAlign: 'center',
  },
});
