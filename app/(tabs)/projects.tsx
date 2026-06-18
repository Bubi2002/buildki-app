import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Share,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

type ProjectItem = {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  protocolPrefix?: string;
  protocolCounter?: number;
  archived?: boolean;
  favorite?: boolean;
};

const PROJECT_COLORS = ["#EF4444", "#F59E0B", "#22C55E", "#0EA5E9", "#8B5CF6", "#EC4899", "#14B8A6", "#6366F1"];

export default function ProjectsTab() {
  const colors = useColors();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"activity" | "name" | "created">("activity");
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [])
  );

  const loadProjects = async () => {
    try {
      const stored = await AsyncStorage.getItem("projects");
      setProjects(stored ? JSON.parse(stored) : []);
    } catch {}
  };

  const filteredProjects = useMemo(() => {
    let list = projects.filter((p) => (showArchived ? p.archived : !p.archived));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.protocolPrefix || "").toLowerCase().includes(q)
      );
    }
    // Favorites first
    const favs = list.filter((p) => p.favorite);
    const rest = list.filter((p) => !p.favorite);
    const sortFn = (a: ProjectItem, b: ProjectItem) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // activity = created for now
    };
    return [...favs.sort(sortFn), ...rest.sort(sortFn)];
  }, [projects, search, sortBy, showArchived]);

  const createProject = async () => {
    if (!newName.trim()) {
      Alert.alert("Fehler", "Bitte gib einen Projektnamen ein.");
      return;
    }
    const prefix = newPrefix.trim() || newName.trim().substring(0, 3).toUpperCase();
    const np: ProjectItem = {
      id: `proj_${Date.now()}`,
      name: newName.trim(),
      description: newDesc.trim(),
      color: newColor,
      createdAt: new Date().toISOString(),
      protocolPrefix: prefix,
      protocolCounter: 0,
    };
    const updated = [...projects, np];
    setProjects(updated);
    await AsyncStorage.setItem("projects", JSON.stringify(updated));
    setShowCreate(false);
    setNewName("");
    setNewDesc("");
    setNewPrefix("");
    setNewColor(PROJECT_COLORS[0]);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Set as active project
    await AsyncStorage.setItem("last-selected-project-id", np.id);
    router.push(`/project-detail?id=${np.id}` as any);
  };

  const toggleFavorite = async (id: string) => {
    const updated = projects.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p));
    setProjects(updated);
    await AsyncStorage.setItem("projects", JSON.stringify(updated));
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const archiveProject = async (id: string) => {
    const project = projects.find((p) => p.id === id);
    Alert.alert(
      project?.archived ? "Wiederherstellen" : "Archivieren",
      project?.archived
        ? `"${project.name}" wiederherstellen?`
        : `"${project?.name}" archivieren? Es bleibt erhalten, wird aber ausgeblendet.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: project?.archived ? "Wiederherstellen" : "Archivieren",
          onPress: async () => {
            const updated = projects.map((p) => (p.id === id ? { ...p, archived: !p.archived } : p));
            setProjects(updated);
            await AsyncStorage.setItem("projects", JSON.stringify(updated));
          },
        },
      ]
    );
  };

  const deleteProject = async (id: string) => {
    const project = projects.find((p) => p.id === id);
    Alert.alert("Projekt löschen", `"${project?.name}" endgültig löschen? Alle Protokolle bleiben erhalten.`, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          const updated = projects.filter((p) => p.id !== id);
          setProjects(updated);
          await AsyncStorage.setItem("projects", JSON.stringify(updated));
        },
      },
    ]);
  };

  const selectProject = async (project: ProjectItem) => {
    await AsyncStorage.setItem("last-selected-project-id", project.id);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/project-detail?id=${project.id}` as any);
  };

  const activeCount = projects.filter((p) => !p.archived).length;
  const archivedCount = projects.filter((p) => p.archived).length;

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Projekte</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {activeCount} aktiv{archivedCount > 0 ? ` • ${archivedCount} archiviert` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={({ pressed }) => [{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: colors.primary,
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <MaterialIcons name="add" size={18} color="#FFF" />
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFF" }}>Neu</Text>
        </Pressable>
      </View>

      {/* Search & Filter */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="search" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Projekt suchen..."
            placeholderTextColor={colors.muted}
            style={{ flex: 1, fontSize: 14, color: colors.foreground, marginLeft: 8 }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <MaterialIcons name="close" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Sort & Archive Toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["activity", "name", "created"] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setSortBy(s)}
                style={({ pressed }) => [{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: sortBy === s ? colors.primary : colors.border,
                  backgroundColor: sortBy === s ? colors.primary + "10" : "transparent",
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: sortBy === s ? colors.primary : colors.muted }}>
                  {s === "activity" ? "Aktivität" : s === "name" ? "Name" : "Erstellt"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => setShowArchived(!showArchived)}
            style={({ pressed }) => [{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: showArchived ? colors.warning : colors.border,
              backgroundColor: showArchived ? colors.warning + "10" : "transparent",
              opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: showArchived ? colors.warning : colors.muted }}>
              {showArchived ? "Archiv" : "Archiv"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Project List */}
      <FlatList
        data={filteredProjects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <MaterialIcons name={showArchived ? "archive" : "folder-open"} size={48} color={colors.muted} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>
              {showArchived ? "Kein archiviertes Projekt" : "Noch keine Projekte"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, textAlign: "center" }}>
              {showArchived ? "Archivierte Projekte erscheinen hier." : "Erstelle dein erstes Projekt, um loszulegen."}
            </Text>
            {!showArchived && (
              <Pressable
                onPress={() => setShowCreate(true)}
                style={({ pressed }) => [{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFF" }}>Erstes Projekt anlegen</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => selectProject(item)}
            onLongPress={() => archiveProject(item.id)}
            style={({ pressed }) => [styles.projectCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {/* Favorite */}
              <Pressable onPress={() => toggleFavorite(item.id)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <MaterialIcons
                  name={item.favorite ? "star" : "star-outline"}
                  size={20}
                  color={item.favorite ? "#F59E0B" : colors.muted}
                />
              </Pressable>

              {/* Color dot */}
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: item.color }} />

              {/* Info */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{item.name}</Text>
                {item.description ? (
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{item.description}</Text>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                  {item.protocolPrefix && (
                    <Text style={{ fontSize: 10, fontWeight: "600", color: colors.primary, backgroundColor: colors.primary + "10", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      {item.protocolPrefix}-{String((item.protocolCounter || 0) + 1).padStart(3, "0")}
                    </Text>
                  )}
                  <Text style={{ fontSize: 10, color: colors.muted }}>
                    {new Date(item.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
              </View>

              {/* Actions */}
              <Pressable
                onPress={() => {
                  if (item.archived) {
                    archiveProject(item.id);
                  } else {
                    Alert.alert(
                      item.name,
                      "Was m\u00f6chtest du tun?",
                      [
                        { text: "Archivieren", onPress: () => archiveProject(item.id) },
                        { text: "Teilen", onPress: () => Share.share({ message: `Projekt: ${item.name}${item.description ? '\n' + item.description : ''}` }) },
                        { text: "L\u00f6schen", style: "destructive", onPress: () => deleteProject(item.id) },
                        { text: "Abbrechen", style: "cancel" },
                      ]
                    );
                  }
                }}
                style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.5 : 1 }]}
              >
                <MaterialIcons name={item.archived ? "unarchive" : "more-vert"} size={20} color={colors.muted} />
              </Pressable>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </View>
          </Pressable>
        )}
      />

      {/* Create Project Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowCreate(false)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <Text style={{ fontSize: 16, color: colors.muted }}>Abbrechen</Text>
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>Neues Projekt</Text>
            <Pressable onPress={createProject} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>Erstellen</Text>
            </Pressable>
          </View>

          <View style={{ padding: 20, gap: 16 }}>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Projektname *</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="z.B. Neubau Musterstraße 5"
                placeholderTextColor={colors.muted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                autoFocus
              />
            </View>

            <View>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Beschreibung</Text>
              <TextInput
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="Kurze Projektbeschreibung"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={2}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, minHeight: 60, textAlignVertical: "top" }]}
              />
            </View>

            <View>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Protokoll-Präfix</Text>
              <TextInput
                value={newPrefix}
                onChangeText={(t) => setNewPrefix(t.toUpperCase())}
                placeholder="z.B. BST (auto: erste 3 Buchstaben)"
                placeholderTextColor={colors.muted}
                maxLength={5}
                autoCapitalize="characters"
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>

            <View>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Farbe</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                {PROJECT_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setNewColor(c)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: c,
                      borderWidth: newColor === c ? 3 : 0,
                      borderColor: "#FFF",
                      shadowColor: newColor === c ? c : "transparent",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.4,
                      shadowRadius: 4,
                      elevation: newColor === c ? 4 : 0,
                    }}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  projectCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
  },
});
