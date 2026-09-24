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
import { Image } from "expo-image";

const DATE_LOCALE: Record<string, string> = {
  de: "de-DE", en: "en-GB", fr: "fr-FR", es: "es-ES", uk: "uk-UA",
  pl: "pl-PL", ru: "ru-RU", ro: "ro-RO", bg: "bg-BG", tr: "tr-TR",
};

// A defect still counts as "open" unless it is resolved, rejected or closed.
const OPEN_DEFECT = (d: Defect) => d.status !== "erledigt" && d.status !== "geschlossen" && d.status !== "abgelehnt";

type ProjectStatus = "aktiv" | "pausiert" | "abgeschlossen";
const PROJECT_STATUSES: ProjectStatus[] = ["aktiv", "pausiert", "abgeschlossen"];
const STATUS_COLOR: Record<ProjectStatus, string> = {
  aktiv: "#43A047",
  pausiert: "#FB8C00",
  abgeschlossen: "#78909C",
};

type SortKey = "name" | "recent" | "defects" | "status";
const SORT_KEYS: SortKey[] = ["name", "recent", "defects", "status"];
const STATUS_SORT: Record<ProjectStatus, number> = { aktiv: 0, pausiert: 1, abgeschlossen: 2 };

type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  protocolPrefix?: string;
  protocolCounter?: number;
  address?: string;
  status?: ProjectStatus;
  favorite?: boolean;
  archived?: boolean;
  imageUri?: string;
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
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [showSortPicker, setShowSortPicker] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newStatus, setNewStatus] = useState<ProjectStatus>("aktiv");
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
            ? { ...p, name: newName.trim(), description: newDescription.trim(), address: newAddress.trim() || undefined, status: newStatus, color: selectedColor, protocolPrefix: newPrefix.trim().toUpperCase() || undefined }
            : p
        );
        await AsyncStorage.setItem("projects", JSON.stringify(updated));
        setProjects(updated);
      } else {
        const newProject: Project = {
          id: Date.now().toString(),
          name: newName.trim(),
          description: newDescription.trim(),
          address: newAddress.trim() || undefined,
          status: newStatus,
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
      setNewAddress("");
      setNewStatus("aktiv");
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

  const lastInspectionISO = (projectId: string): string | null => {
    const dates = protocols
      .filter((p) => p.projectId === projectId && p.createdAt)
      .map((p) => p.createdAt as string)
      .sort((a, b) => b.localeCompare(a));
    return dates[0] || null;
  };

  const getLastInspection = (projectId: string): string | null => {
    const iso = lastInspectionISO(projectId);
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(DATE_LOCALE[language] || "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setNewName(project.name);
    setNewDescription(project.description);
    setNewAddress(project.address || "");
    setNewStatus(project.status || "aktiv");
    setSelectedColor(project.color);
    setNewPrefix(project.protocolPrefix || "");
    setShowCreateModal(true);
  };

  const patchProject = async (projectId: string, patch: Partial<Project>) => {
    const updated = projects.map((p) => (p.id === projectId ? { ...p, ...patch } : p));
    setProjects(updated);
    await AsyncStorage.setItem("projects", JSON.stringify(updated));
  };

  const toggleFavorite = (project: Project) => patchProject(project.id, { favorite: !project.favorite });
  const toggleArchive = (project: Project) => patchProject(project.id, { archived: !project.archived });

  const archivedCount = projects.filter((p) => p.archived).length;

  const visibleProjects = (() => {
    const q = search.trim().toLowerCase();
    let list = projects.filter((p) => (showArchived ? p.archived : !p.archived));
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q) || (p.address || "").toLowerCase().includes(q));
    const byRecent = (a: Project, b: Project) => {
      const la = lastInspectionISO(a.id) || a.createdAt || "";
      const lb = lastInspectionISO(b.id) || b.createdAt || "";
      return lb.localeCompare(la);
    };
    list.sort((a, b) => {
      // Favorites always float to the top within the current sort.
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
      switch (sortBy) {
        case "name": return a.name.localeCompare(b.name);
        case "defects": {
          const d = getOpenDefectCount(b.id) - getOpenDefectCount(a.id);
          return d !== 0 ? d : byRecent(a, b);
        }
        case "status": {
          const d = (STATUS_SORT[a.status || "aktiv"]) - (STATUS_SORT[b.status || "aktiv"]);
          return d !== 0 ? d : byRecent(a, b);
        }
        case "recent":
        default: return byRecent(a, b);
      }
    });
    return list;
  })();

  const sortLabels: Record<SortKey, string> = {
    name: t('projects_sort_name' as any),
    recent: t('projects_sort_recent' as any),
    defects: t('projects_sort_defects' as any),
    status: t('projects_sort_status' as any),
  };
  const statusLabel = (s?: ProjectStatus) =>
    t((s === "pausiert" ? "projects_status_paused" : s === "abgeschlossen" ? "projects_status_done" : "projects_status_active") as any);

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
        {item.imageUri ? (
          <Image source={{ uri: item.imageUri }} style={styles.projectThumb} contentFit="cover" />
        ) : (
          <View style={[styles.projectColorBar, { backgroundColor: item.color }]} />
        )}
        <View style={styles.projectContent}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[styles.projectName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[item.status || "aktiv"] + "22" }]}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.status || "aktiv"] }]} />
              <Text style={{ fontSize: 10, fontWeight: "700", color: STATUS_COLOR[item.status || "aktiv"] }}>{statusLabel(item.status)}</Text>
            </View>
          </View>
          {item.address ? (
            <View style={[styles.projectMeta, { marginTop: 2 }]}>
              <MaterialIcons name="place" size={13} color={colors.muted} />
              <Text style={[styles.projectMetaText, { color: colors.muted }]} numberOfLines={1}>{item.address}</Text>
            </View>
          ) : item.description ? (
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
        <View style={{ alignItems: "center", gap: 2 }}>
          <Pressable
            onPress={() => toggleFavorite(item)}
            hitSlop={6}
            style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.5 : 1 }]}
          >
            <MaterialIcons name={item.favorite ? "star" : "star-border"} size={20} color={item.favorite ? "#FDD835" : colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => toggleArchive(item)}
            hitSlop={6}
            style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.5 : 1 }]}
          >
            <MaterialIcons name={item.archived ? "unarchive" : "archive"} size={19} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => deleteProject(item)}
            hitSlop={6}
            style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.5 : 1 }]}
          >
            <MaterialIcons name="delete-outline" size={19} color={colors.muted} />
          </Pressable>
        </View>
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

        {/* Sort + archive bar */}
        {(projects.length > 1 || archivedCount > 0) && (
          <View style={styles.toolbar}>
            <Pressable
              onPress={() => setShowSortPicker(true)}
              style={({ pressed }) => [styles.toolBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="swap-vert" size={16} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{sortLabels[sortBy]}</Text>
            </Pressable>
            {archivedCount > 0 && (
              <Pressable
                onPress={() => setShowArchived((v) => !v)}
                style={({ pressed }) => [styles.toolBtn, { borderColor: showArchived ? colors.primary : colors.border, backgroundColor: showArchived ? colors.primary + "15" : colors.surface, opacity: pressed ? 0.8 : 1 }]}
              >
                <MaterialIcons name={showArchived ? "unarchive" : "archive"} size={16} color={showArchived ? colors.primary : colors.muted} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: showArchived ? colors.primary : colors.muted }}>
                  {t('projects_archive' as any)} ({archivedCount})
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Projects list */}
        <FlatList
          data={visibleProjects}
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
                value={newAddress}
                onChangeText={setNewAddress}
                placeholder={t('projects_address_placeholder' as any)}
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

              <Text style={[styles.colorLabel, { color: colors.muted }]}>{t('projects_status_label' as any)}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
                {PROJECT_STATUSES.map((s) => {
                  const active = newStatus === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setNewStatus(s)}
                      style={({ pressed }) => [styles.statusChoice, { borderColor: active ? STATUS_COLOR[s] : colors.border, backgroundColor: active ? STATUS_COLOR[s] + "1A" : colors.surface, opacity: pressed ? 0.85 : 1 }]}
                    >
                      <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[s] }]} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: active ? STATUS_COLOR[s] : colors.muted }}>{statusLabel(s)}</Text>
                    </Pressable>
                  );
                })}
              </View>

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

        {/* Sort picker */}
        <Modal visible={showSortPicker} transparent animationType="fade" onRequestClose={() => setShowSortPicker(false)}>
          <Pressable style={styles.sortBackdrop} onPress={() => setShowSortPicker(false)}>
            <Pressable style={[styles.sortSheet, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.sortSheetTitle, { color: colors.foreground }]}>{t('defects_sort_label' as any)}</Text>
              {SORT_KEYS.map((key) => {
                const active = sortBy === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => { setSortBy(key); setShowSortPicker(false); }}
                    style={({ pressed }) => [styles.sortOption, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "15" : colors.surface, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={{ fontSize: 15, fontWeight: active ? "700" : "500", color: active ? colors.primary : colors.foreground }}>{sortLabels[key]}</Text>
                    {active && <MaterialIcons name="check" size={20} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
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
  projectThumb: { width: 52, alignSelf: "stretch", backgroundColor: "#00000010" },
  projectContent: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  projectName: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  projectDesc: { fontSize: 13, marginBottom: 6 },
  projectMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  projectMetaText: { fontSize: 12 },
  unassignedBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 0, borderWidth: 1 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, height: 44, borderRadius: 10, borderWidth: 1 },
  toolbar: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginBottom: 12 },
  toolBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChoice: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  sortBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  sortSheet: { borderWidth: 1, borderRadius: 14, padding: 16 },
  sortSheetTitle: { fontSize: 17, fontWeight: "800", marginBottom: 12 },
  sortOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
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
