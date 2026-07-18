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

// ─── AI Workbench Module Definition ──────────────────────────────────────────

interface WorkbenchModule {
  key: string;
  label: string;
  icon: string;
  color: string;
  route: string;
  description: string;
}

const AI_MODULES: WorkbenchModule[] = [
  { key: "neue_analyse", label: "Neue Analyse", icon: "auto-awesome", color: "#7C4DFF", route: "/photo-analysis", description: "Fotos analysieren" },
  { key: "analyse_historie", label: "Analyse-Historie", icon: "history", color: "#5C6BC0", route: "/analysis-history", description: "Vergangene Analysen" },
  { key: "batch_analyse", label: "Batch-Analyse", icon: "burst-mode", color: "#00BFA5", route: "/batch-analysis", description: "Mehrere Fotos gleichzeitig" },
  { key: "ai_assistant", label: "AI Site Assistant", icon: "smart-toy", color: "#0EA5E9", route: "/ai-assistant", description: "Fragen zum Projekt" },
  { key: "baufortschritt", label: "Baufortschritt", icon: "trending-up", color: "#66BB6A", route: "/dashboard-stats", description: "Fortschrittsübersicht" },
  { key: "berichte", label: "Berichte", icon: "summarize", color: "#FF7043", route: "/protocol-merge", description: "Berichte erstellen" },
  { key: "ki_einstellungen", label: "KI-Einstellungen", icon: "tune", color: "#78909C", route: "/(tabs)/settings", description: "KI konfigurieren" },
];

const TOOL_MODULES: WorkbenchModule[] = [
  { key: "maengel", label: "Mängel", icon: "warning", color: "#FF9800", route: "/defects", description: "Mängelverwaltung" },
  { key: "grundriss", label: "Grundriss", icon: "map", color: "#4FC3F7", route: "/floor-plan", description: "Grundriss-Ansicht" },
  { key: "tagebuch", label: "Tagebuch", icon: "menu-book", color: "#66BB6A", route: "/diary", description: "Bautagebuch" },
  { key: "checklisten", label: "Checklisten", icon: "checklist", color: "#AB47BC", route: "/checklists", description: "Prüflisten" },
  { key: "team", label: "Team", icon: "groups", color: "#5C6BC0", route: "/team", description: "Teamverwaltung" },
  { key: "fotos", label: "Fotos", icon: "photo-library", color: "#EC407A", route: "/photo-gallery", description: "Fotogalerie" },
  { key: "qr_scan", label: "QR-Scan", icon: "qr-code-scanner", color: "#00BCD4", route: "/qr-scanner", description: "QR-Codes scannen" },
  { key: "zeiterfassung", label: "Zeiten", icon: "timer", color: "#FF5722", route: "/time-tracking", description: "Zeiterfassung" },
  { key: "export", label: "Export", icon: "ios-share", color: "#43A047", route: "/export-center", description: "Daten exportieren" },
  { key: "kalender", label: "Kalender", icon: "calendar-today", color: "#EF6C00", route: "/calendar-view", description: "Termine" },
  { key: "matterport", label: "Matterport", icon: "view-in-ar", color: "#00B0FF", route: "/matterport", description: "3D-Scans" },
  { key: "cloud", label: "Cloud", icon: "cloud-download", color: "#607D8B", route: "/cloud-import", description: "Cloud-Import" },
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>AI Workbench</Text>
          <Text style={styles.subtitle}>Zentrale KI-Plattform</Text>
        </View>

        {/* Project Selector */}
        <Pressable
          onPress={() => setShowProjectPicker(!showProjectPicker)}
          style={({ pressed }) => [styles.projectSelector, { opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={styles.projectSelectorLeft}>
            <View style={[styles.projectDot, { backgroundColor: selectedProject?.color || '#5DADE2' }]} />
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

        {/* Quick Action: Recording */}
        <Pressable
          onPress={() => router.push('/(tabs)/' as any)}
          style={({ pressed }) => [styles.recordButton, { opacity: pressed ? 0.85 : 1 }]}
        >
          <MaterialIcons name="mic" size={20} color="#fff" />
          <Text style={styles.recordButtonText}>{t('neue_aufnahme_starten')}</Text>
          <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* AI MODULES Section */}
        <View style={styles.sectionHeader}>
          <MaterialIcons name="auto-awesome" size={16} color="#7C4DFF" />
          <Text style={styles.sectionTitle}>KI-MODULE</Text>
        </View>

        <View style={styles.aiGrid}>
          {AI_MODULES.map((mod) => (
            <Pressable
              key={mod.key}
              onPress={() => navigateModule(mod.route)}
              style={({ pressed }) => [styles.aiCard, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.aiIconWrap, { backgroundColor: mod.color + "20" }]}>
                <MaterialIcons name={mod.icon as any} size={22} color={mod.color} />
              </View>
              <View style={styles.aiCardContent}>
                <Text style={styles.aiCardLabel}>{mod.label}</Text>
                <Text style={styles.aiCardDesc}>{mod.description}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={18} color="#4A5568" />
            </Pressable>
          ))}
        </View>

        {/* TOOLS Section */}
        <Text style={styles.toolsSectionTitle}>WERKZEUGE</Text>

        <View style={styles.toolGrid}>
          {TOOL_MODULES.map((tool) => (
            <Pressable
              key={tool.key}
              onPress={() => navigateModule(tool.route)}
              style={({ pressed }) => [styles.toolCard, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name={tool.icon as any} size={22} color={tool.color} />
              <Text style={styles.toolLabel} numberOfLines={1}>{tool.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F0F4F8',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#8FA3B8',
    marginTop: 2,
  },
  projectSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 12,
    padding: 12,
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
    letterSpacing: 0.5,
  },
  projectSelectorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0F4F8',
    marginTop: 1,
  },
  projectDropdown: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 12,
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
    borderRadius: 8,
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
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#E53935',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  recordButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  // AI Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 22,
    marginBottom: 10,
    paddingLeft: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C4DFF',
    letterSpacing: 1,
  },
  aiGrid: {
    paddingHorizontal: 16,
    gap: 6,
  },
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  aiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCardContent: {
    flex: 1,
  },
  aiCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0F4F8',
  },
  aiCardDesc: {
    fontSize: 11,
    color: '#8FA3B8',
    marginTop: 1,
  },
  // Tools Section
  toolsSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8FA3B8',
    letterSpacing: 1,
    marginTop: 22,
    marginBottom: 8,
    paddingLeft: 20,
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    gap: 6,
  },
  toolCard: {
    width: '31.5%',
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 4,
  },
  toolLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#F0F4F8',
    textAlign: 'center',
  },
});
