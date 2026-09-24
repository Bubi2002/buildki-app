import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "@/lib/language-provider";
import { getDefects, type Defect } from "@/lib/defect-store";

const DATE_LOCALE: Record<string, string> = {
  de: "de-DE", en: "en-GB", fr: "fr-FR", es: "es-ES", uk: "uk-UA",
  pl: "pl-PL", ru: "ru-RU", ro: "ro-RO", bg: "bg-BG", tr: "tr-TR",
};

// A defect still counts as "open" unless it is resolved, rejected or closed.
const OPEN_DEFECT = (d: Defect) => d.status !== "erledigt" && d.status !== "geschlossen" && d.status !== "abgelehnt";

type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  protocolPrefix?: string;
  protocolCounter?: number;
};

type Protocol = {
  id: string;
  title: string;
  projectId?: string;
  createdAt: string;
};

const PROJECT_COLORS = [
  "#E53935", "#D81B60", "#8E24AA", "#5C6BC0",
  "#1E88E5", "#00ACC1", "#00897B", "#43A047",
  "#7CB342", "#FDD835", "#FB8C00", "#6D4C41",
];

export default function ProjectsScreen() {
  const { t, language } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newPrefix, setNewPrefix] = useState("");

  async function loadData() {
    try {
      const [projectsData, protocolsData, defectsData] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("protocols"),
        getDefects(),
      ]);
      setProjects(JSON.parse(projectsData || "[]"));
      setProtocols(JSON.parse(protocolsData || "[]"));
      setDefects(defectsData);
    } catch (e) {
      console.error("Error loading projects:", e);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const saveProject = async () => {
    if (!newName.trim()) {
      Alert.alert(t('alert_fehler'), t('msg_bitte_gib_einen_projektnamen_ein'));
      return;
    }

    try {
      const existing = JSON.parse((await AsyncStorage.getItem("projects")) || "[]");

      if (editingProject) {
        const updated = existing.map((p: Project) =>
          p.id === editingProject.id
            ? { ...p, name: newName.trim(), description: newDescription.trim(), color: selectedColor, protocolPrefix: newPrefix.trim().toUpperCase() || undefined }
            : p
        );
        await AsyncStorage.setItem("projects", JSON.stringify(updated));
        setProjects(updated);
      } else {
        const newProject: Project = {
          id: Date.now().toString(),
          name: newName.trim(),
          description: newDescription.trim(),
          color: selectedColor,
          createdAt: new Date().toISOString(),
          protocolPrefix: newPrefix.trim().toUpperCase() || undefined,
          protocolCounter: 0,
        };
        const updated = [newProject, ...existing];
        await AsyncStorage.setItem("projects", JSON.stringify(updated));
        setProjects(updated);
      }

      setShowCreateModal(false);
      setNewName("");
      setNewDescription("");
      setNewPrefix("");
      setSelectedColor(PROJECT_COLORS[0]);
      setEditingProject(null);
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_projekt_konnte_nicht_gespeichert_werden'));
    }
  };

  const deleteProject = (project: Project) => {
    Alert.alert(
      t('projekt_loeschen'),
      t('projekt_loeschen_bestaetigung').replace('{name}', project.name),
      [
        { text: t('btn_abbrechen'), style: "cancel" },
        {
          text: t('btn_loeschen'),
          style: "destructive",
          onPress: async () => {
            const updated = projects.filter((p) => p.id !== project.id);
            await AsyncStorage.setItem("projects", JSON.stringify(updated));
            // Remove project assignment from protocols
            const updatedProtocols = protocols.map((p) =>
              p.projectId === project.id ? { ...p, projectId: undefined } : p
            );
            await AsyncStorage.setItem("protocols", JSON.stringify(updatedProtocols));
            setProjects(updated);
            setProtocols(updatedProtocols);
          },
        },
      ]
    );
  };

  const getProtocolCount = (projectId: string) => {
    return protocols.filter((p) => p.projectId === projectId).length;
  };

  const getUnassignedCount = () => {
    return protocols.filter((p) => !p.projectId).length;
  };

  const getOpenDefectCount = (projectId: string) =>
    defects.filter((d) => d.projectId === projectId && OPEN_DEFECT(d)).length;

  const getLastInspection = (projectId: string): string | null => {
    const dates = protocols
      .filter((p) => p.projectId === projectId && p.createdAt)
      .map((p) => p.createdAt as string)
      .sort((a, b) => b.localeCompare(a));
    if (dates.length === 0) return null;
    const d = new Date(dates[0]);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(DATE_LOCALE[language] || "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const query = search.trim().toLowerCase();
  const filteredProjects = query
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(query) || (p.description || "").toLowerCase().includes(query))
    : projects;

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setNewName(project.name);
    setNewDescription(project.description);
    setSelectedColor(project.color);
    setNewPrefix(project.protocolPrefix || "");
    setShowCreateModal(true);
  };

  const renderProject = ({ item }: { item: Project }) => {
    const count = getProtocolCount(item.id);
    const openDefects = getOpenDefectCount(item.id);
    const lastInspection = getLastInspection(item.id);
    return (
      <Pressable
        onPress={() => router.push(`/project-detail?id=${item.id}` as any)}
        onLongPress={() => openEdit(item)}
        style={({ pressed }) => [
          styles.projectCard,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={[styles.projectColorBar, { backgroundColor: item.color }]} />
        <View style={styles.projectContent}>
          <Text style={[styles.projectName, { color: colors.foreground }]}>{item.name}</Text>
          {item.description ? (
            <Text style={[styles.projectDesc, { color: colors.muted }]} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
          <View style={styles.projectMeta}>
            <MaterialIcons name="description" size={14} color={colors.muted} />
            <Text style={[styles.projectMetaText, { color: colors.muted }]}>
              {count} Protokoll{count !== 1 ? "e" : ""}
            </Text>
            {openDefects > 0 && (
              <>
                <MaterialIcons name="report-problem" size={14} color="#E53935" style={{ marginLeft: 10 }} />
                <Text style={[styles.projectMetaText, { color: "#E53935" }]}>
                  {openDefects} {t('projects_open_defects' as any)}
                </Text>
              </>
            )}
          </View>
          {lastInspection && (
            <View style={[styles.projectMeta, { marginTop: 2 }]}>
              <MaterialIcons name="event-available" size={14} color={colors.muted} />
              <Text style={[styles.projectMetaText, { color: colors.muted }]}>
                {t('projects_last_visit' as any)}: {lastInspection}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={() => deleteProject(item)}
          style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}
        >
          <MaterialIcons name="delete-outline" size={20} color={colors.muted} />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} className="flex-1">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('nav_projects')}</Text>
          <Pressable
            onPress={() => { setEditingProject(null); setNewName(""); setNewDescription(""); setNewPrefix(""); setSelectedColor(PROJECT_COLORS[0]); setShowCreateModal(true); }}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="add" size={28} color={colors.primary} />
          </Pressable>
        </View>

        {/* Unassigned protocols info */}
        {getUnassignedCount() > 0 && (
          <View style={[styles.unassignedBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="info-outline" size={18} color={colors.muted} />
            <Text style={[styles.unassignedText, { color: colors.muted }]}>
              {getUnassignedCount()} Protokoll{getUnassignedCount() !== 1 ? "e" : ""} ohne Projektzuordnung
            </Text>
          </View>
        )}

        {/* Search */}
        {projects.length > 3 && (
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="search" size={18} color={colors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('projects_search_placeholder' as any)}
              placeholderTextColor={colors.muted}
              style={{ flex: 1, color: colors.foreground, fontSize: 15, paddingVertical: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <MaterialIcons name="close" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>
        )}

        {/* Projects list */}
        <FlatList
          data={filteredProjects}
          keyExtractor={(item) => item.id}
          renderItem={renderProject}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="folder-open" size={64} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('project_no_projects')}</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                Erstelle ein Projekt, um deine Protokolle zu organisieren.
              </Text>
            </View>
          }
        />

        {/* Create/Edit Modal */}
        <Modal visible={showCreateModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {editingProject ? t('projekt_bearbeiten') : t('neues_projekt')}
                </Text>
                <Pressable onPress={() => { setShowCreateModal(false); setEditingProject(null); }}>
                  <MaterialIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>

              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder={t('projektname_zb_baustelle_muehlenstrasse')}
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              />

              <TextInput
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder={t('beschreibung_optional')}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={2}
                style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              />

              <TextInput
                value={newPrefix}
                onChangeText={(v) => setNewPrefix(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                placeholder={t('protokollpraefix_zb_bst_mng')}
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                autoCapitalize="characters"
                maxLength={5}
              />
              <Text style={[styles.prefixHint, { color: colors.muted }]}>
                {newPrefix ? `Nummerierung: ${newPrefix}-001, ${newPrefix}-002, ...` : 'Optional: Automatische Nummerierung (z.B. BST-001)'}
              </Text>

              <Text style={[styles.colorLabel, { color: colors.muted }]}>{t('farbe_waehlen')}</Text>
              <View style={styles.colorGrid}>
                {PROJECT_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    style={[
                      styles.colorDot,
                      { backgroundColor: color },
                      selectedColor === color && styles.colorDotSelected,
                    ]}
                  >
                    {selectedColor === color && (
                      <MaterialIcons name="check" size={16} color="#FFFFFF" />
                    )}
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={saveProject}
                style={({ pressed }) => [
                  styles.saveButton,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={styles.saveButtonText}>
                  {editingProject ? t('btn_speichern') : t('projekt_erstellen_btn')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  projectCard: { flexDirection: "row", alignItems: "center", borderRadius: 0, borderWidth: 1, marginBottom: 10, overflow: "hidden" },
  projectColorBar: { width: 5, alignSelf: "stretch" },
  projectContent: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  projectName: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  projectDesc: { fontSize: 13, marginBottom: 6 },
  projectMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  projectMetaText: { fontSize: 12 },
  unassignedBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 0, borderWidth: 1 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, height: 44, borderRadius: 10, borderWidth: 1 },
  unassignedText: { fontSize: 13 },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptySubtitle: { fontSize: 14, textAlign: "center", paddingHorizontal: 40 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  textArea: { minHeight: 60, textAlignVertical: "top" },
  colorLabel: { fontSize: 13, marginBottom: 8 },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  colorDot: { width: 32, height: 32, borderRadius: 0, alignItems: "center", justifyContent: "center" },
  colorDotSelected: { borderWidth: 3, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  saveButton: { paddingVertical: 14, borderRadius: 0, alignItems: "center" },
  saveButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  prefixHint: { fontSize: 12, marginBottom: 14, marginTop: -6 },
});
