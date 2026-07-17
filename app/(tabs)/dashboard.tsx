import { useState, useCallback } from "react";
import { ScrollView, Text, View, Pressable, StyleSheet, FlatList } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "@/lib/language-provider";

type Project = {
  id: string;
  name: string;
  color: string;
  description?: string;
  isArchived?: boolean;
  isFavorite?: boolean;
  protocolPrefix?: string;
  protocolCounter?: number;
  _protocolCount?: number;
  _lastDate?: string | null;
};

export default function ToolsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const [data, lastId, protocolsData] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("last-selected-project-id"),
        AsyncStorage.getItem("protocols"),
      ]);
      const allProjects: Project[] = data ? JSON.parse(data) : [];
      const allProtocols: any[] = protocolsData ? JSON.parse(protocolsData) : [];
      // Enrich with protocol count and last date
      const enriched = allProjects.map((p) => {
        const projectProtocols = allProtocols.filter((pr: any) => pr.projectId === p.id);
        const lastProtocol = projectProtocols.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        return { ...p, _protocolCount: projectProtocols.length, _lastDate: lastProtocol?.createdAt || null };
      });
      setProjects(enriched);
      if (lastId) {
        const found = enriched.find(p => p.id === lastId);
        if (found) { setSelectedProject(found); return; }
      }
      // Select first non-archived project
      const active = enriched.filter(p => !p.isArchived);
      if (active.length > 0) setSelectedProject(active[0]);
    } catch {}
  }, []);

  // Reload projects every time the tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects])
  );

  const selectProject = async (project: Project) => {
    setSelectedProject(project);
    setShowProjectPicker(false);
    await AsyncStorage.setItem("last-selected-project-id", project.id);
  };

  const navigateTool = (route: string) => {
    if (selectedProject) {
      router.push(`${route}?projectId=${selectedProject.id}&projectName=${encodeURIComponent(selectedProject.name)}` as any);
    } else {
      router.push(route as any);
    }
  };

  // Only show active (non-archived) projects, favorites first
  const activeProjects = projects
    .filter(p => !p.isArchived)
    .sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return 0;
    });

  const tools = [
    { key: 'grundriss', icon: 'map', color: '#4FC3F7', route: '/floor-plan' },
    { key: 'maengel', icon: 'warning', color: '#FF9800', route: '/defects' },
    { key: 'tagebuch', icon: 'menu-book', color: '#66BB6A', route: '/diary' },
    { key: 'checklist_title', icon: 'checklist', color: '#AB47BC', route: '/checklists' },
    { key: 'team_title', icon: 'groups', color: '#5C6BC0', route: '/team' },
    { key: 'statistik', icon: 'bar-chart', color: '#26A69A', route: '/dashboard-stats' },
    { key: 'gallery_photos', icon: 'photo-library', color: '#EC407A', route: '/photo-gallery' },
    { key: 'qrscan', icon: 'qr-code-scanner', color: '#00BCD4', route: '/qr-scanner' },
    { key: 'zeiterfassung', icon: 'timer', color: '#FF5722', route: '/time-tracking' },
    { key: 'cloud', icon: 'cloud-download', color: '#607D8B', route: '/cloud-import' },
    { key: 'export', icon: 'ios-share', color: '#43A047', route: '/project-export' },
    { key: 'excel', icon: 'table-chart', color: '#2E7D32', route: '/project-export' },
    { key: 'maengelxls', icon: 'assignment-late', color: '#FF6D00', route: '/defects' },
    { key: 'bericht', icon: 'merge-type', color: '#7C3AED', route: '/protocol-merge' },
    { key: 'vergleich', icon: 'compare', color: '#5C6BC0', route: '/photo-compare' },
    { key: 'kalender', icon: 'calendar-today', color: '#EF6C00', route: '/calendar-view' },
  ];

  return (
    <ScreenContainer className="p-0">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('werkzeuge')}</Text>
        </View>

        {/* Project Selector - Prominent Card */}
        <Pressable
          onPress={() => setShowProjectPicker(!showProjectPicker)}
          style={({ pressed }) => [styles.projectSelector, { opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={styles.projectSelectorInner}>
            <View style={[styles.projectIcon, { backgroundColor: selectedProject?.color || '#5DADE2' }]}>
              <MaterialIcons name="business" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.projectSelectorHeading}>{t('projekt_waehlen')}</Text>
              <Text style={styles.projectSelectorName} numberOfLines={1}>
                {selectedProject?.name || t('kein_projekt')}
              </Text>
            </View>
            <MaterialIcons name={showProjectPicker ? "expand-less" : "expand-more"} size={28} color="#8FA3B8" />
          </View>
        </Pressable>

        {/* Project Picker Dropdown - Shows ALL active projects */}
        {showProjectPicker && (
          <View style={styles.projectDropdown}>
            {activeProjects.length === 0 ? (
              <View style={styles.emptyProjects}>
                <MaterialIcons name="folder-open" size={32} color="#4A5568" />
                <Text style={styles.emptyProjectsText}>{t('keine_projekte' as any)}</Text>
                <Text style={styles.emptyProjectsHint}>{t('erstes_projekt_erstellen' as any)}</Text>
              </View>
            ) : (
              activeProjects.map((project) => (
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
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      styles.projectItemText,
                      selectedProject?.id === project.id && styles.projectItemTextActive,
                    ]} numberOfLines={1}>{project.name}</Text>
                    {project._protocolCount != null && (
                      <Text style={styles.projectItemMeta}>
                        {project._protocolCount} {t('nav_protocols')}
                        {project._lastDate ? ` · ${new Date(project._lastDate).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}` : ''}
                      </Text>
                    )}
                  </View>
                  {project.isFavorite && (
                    <MaterialIcons name="star" size={16} color="#FDD835" style={{ marginRight: 4 }} />
                  )}
                  {selectedProject?.id === project.id && (
                    <MaterialIcons name="check-circle" size={18} color="#5DADE2" />
                  )}
                </Pressable>
              ))
            )}
            {/* New Project Button */}
            <Pressable
              onPress={() => { setShowProjectPicker(false); router.push("/projects" as any); }}
              style={({ pressed }) => [styles.newProjectButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="add-circle-outline" size={20} color="#5DADE2" />
              <Text style={styles.newProjectButtonText}>{t('neues_projekt_anlegen' as any)}</Text>
            </Pressable>
          </View>
        )}

        {/* Recording Button */}
        <Pressable
          onPress={() => router.push('/(tabs)/index' as any)}
          style={({ pressed }) => [styles.recordButton, { opacity: pressed ? 0.85 : 1 }]}
        >
          <MaterialIcons name="mic" size={20} color="#fff" />
          <Text style={styles.recordButtonText}>{t('neue_aufnahme_starten')}</Text>
          <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Tools Label */}
        <Text style={styles.toolsLabel}>TOOLS</Text>

        {/* Compact Tool Grid */}
        <View style={styles.toolGrid}>
          {tools.map((tool) => (
            <Pressable
              key={tool.key}
              onPress={() => navigateTool(tool.route)}
              style={({ pressed }) => [styles.toolCard, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name={tool.icon as any} size={24} color={tool.color} />
              <Text style={styles.toolLabel} numberOfLines={1}>
                {t(tool.key as any)}
              </Text>
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
  projectSelector: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#0F1E30',
    borderWidth: 1.5,
    borderColor: '#1E3A5F',
    borderRadius: 14,
    padding: 16,
  },
  projectSelectorInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  projectIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectSelectorHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8FA3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  projectSelectorName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F0F4F8',
  },
  projectDropdown: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: '#0F1E30',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 14,
    padding: 8,
    maxHeight: 320,
  },
  emptyProjects: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyProjectsText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F0F4F8',
  },
  emptyProjectsHint: {
    fontSize: 12,
    color: '#8FA3B8',
    textAlign: 'center',
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  projectItemActive: {
    backgroundColor: '#1E3A5F40',
  },
  projectItemDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  projectItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#F0F4F8',
  },
  projectItemTextActive: {
    fontWeight: '700',
    color: '#5DADE2',
  },
  projectItemMeta: {
    fontSize: 11,
    color: '#8FA3B8',
    marginTop: 2,
  },
  newProjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E3A5F',
    marginTop: 4,
  },
  newProjectButtonText: {
    fontSize: 14,
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
  toolsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8FA3B8',
    letterSpacing: 1,
    marginTop: 18,
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
