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
import { PROJECT_TEMPLATES, type ProjectTemplate } from "@/lib/project-templates";

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

const PROJECT_COLORS = ["#F87171", "#FBBF24", "#4ADE80", "#38BDF8", "#A78BFA", "#F472B6", "#2DD4BF", "#818CF8"];

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
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

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
    const favs = list.filter((p) => p.favorite);
    const rest = list.filter((p) => !p.favorite);
    const sortFn = (a: ProjectItem, b: ProjectItem) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Projekte</Text>
          <Text style={styles.headerSub}>
            {activeCount} aktiv{archivedCount > 0 ? ` \u2022 ${archivedCount} archiviert` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={({ pressed }) => [styles.newBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <MaterialIcons name="add" size={18} color="#FFF" />
          <Text style={styles.newBtnText}>Neu</Text>
        </Pressable>
      </View>

      {/* Search & Filter */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={18} color="#8FA3B8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Projekt suchen..."
            placeholderTextColor="#8FA3B8"
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <MaterialIcons name="close" size={16} color="#8FA3B8" />
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
                  borderRadius: 0,
                  borderWidth: 1,
                  borderColor: sortBy === s ? "#5DADE2" : "#1E3A5F",
                  backgroundColor: sortBy === s ? "#5DADE215" : "transparent",
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: sortBy === s ? "#5DADE2" : "#8FA3B8" }}>
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
              borderRadius: 0,
              borderWidth: 1,
              borderColor: showArchived ? "#FBBF24" : "#1E3A5F",
              backgroundColor: showArchived ? "#FBBF2415" : "transparent",
              opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: showArchived ? "#FBBF24" : "#8FA3B8" }}>
              Archiv
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
            <MaterialIcons name={showArchived ? "archive" : "folder-open"} size={48} color="#8FA3B8" />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#F0F4F8", marginTop: 12 }}>
              {showArchived ? "Kein archiviertes Projekt" : "Noch keine Projekte"}
            </Text>
            <Text style={{ fontSize: 13, color: "#8FA3B8", marginTop: 4, textAlign: "center" }}>
              {showArchived ? "Archivierte Projekte erscheinen hier." : "Erstelle dein erstes Projekt, um loszulegen."}
            </Text>
            {!showArchived && (
              <Pressable
                onPress={() => setShowCreate(true)}
                style={({ pressed }) => [{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 0, backgroundColor: "#5DADE2", opacity: pressed ? 0.8 : 1 }]}
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
            style={({ pressed }) => [styles.projectCard, { opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => toggleFavorite(item.id)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <MaterialIcons
                  name={item.favorite ? "star" : "star-outline"}
                  size={20}
                  color={item.favorite ? "#FBBF24" : "#8FA3B8"}
                />
              </Pressable>

              <View style={{ width: 4, height: 32, backgroundColor: item.color, borderRadius: 0 }} />

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#F0F4F8" }}>{item.name}</Text>
                {item.description ? (
                  <Text style={{ fontSize: 12, color: "#8FA3B8", marginTop: 2 }} numberOfLines={1}>{item.description}</Text>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                  {item.protocolPrefix && (
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#5DADE2", backgroundColor: "#5DADE215", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 0 }}>
                      {item.protocolPrefix}-{String((item.protocolCounter || 0) + 1).padStart(3, "0")}
                    </Text>
                  )}
                  <Text style={{ fontSize: 10, color: "#8FA3B8" }}>
                    {new Date(item.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => {
                  if (item.archived) {
                    archiveProject(item.id);
                  } else {
                    Alert.alert(
                      item.name,
                      "Was möchtest du tun?",
                      [
                        { text: "Archivieren", onPress: () => archiveProject(item.id) },
                        { text: "Teilen", onPress: () => Share.share({ message: `Projekt: ${item.name}${item.description ? '\n' + item.description : ''}` }) },
                        { text: "Löschen", style: "destructive", onPress: () => deleteProject(item.id) },
                        { text: "Abbrechen", style: "cancel" },
                      ]
                    );
                  }
                }}
                style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.5 : 1 }]}
              >
                <MaterialIcons name={item.archived ? "unarchive" : "more-vert"} size={20} color="#8FA3B8" />
              </Pressable>
              <MaterialIcons name="chevron-right" size={20} color="#8FA3B8" />
            </View>
          </Pressable>
        )}
      />

      {/* Create Project Modal */}
      <Modal visible={showCreate} animationType="fade" transparent={true}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.modalKeyboardView}
            >
              <View style={styles.modalCard}>
                {/* Modal Header */}
                <View style={styles.modalCardHeader}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#F0F4F8" }}>Neues Projekt</Text>
                  <Pressable onPress={() => { setShowCreate(false); Keyboard.dismiss(); }} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 4 }]}>
                    <MaterialIcons name="close" size={22} color="#8FA3B8" />
                  </Pressable>
                </View>

                {/* Modal Content */}
                <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
                  <View style={{ padding: 20, gap: 16 }}>
                    {/* Template Selection */}
                    <View>
                      <Text style={styles.fieldLabel}>Vorlage (optional)</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                        {PROJECT_TEMPLATES.map((t) => (
                          <Pressable
                            key={t.id}
                            onPress={() => {
                              if (selectedTemplate === t.id) {
                                setSelectedTemplate(null);
                              } else {
                                setSelectedTemplate(t.id);
                                setNewColor(t.color);
                                setNewPrefix(t.defaultPrefix);
                              }
                            }}
                            style={({ pressed }) => [{
                              paddingHorizontal: 14, paddingVertical: 10, borderRadius: 0, marginRight: 8,
                              borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6,
                              borderColor: selectedTemplate === t.id ? t.color : "#1E3A5F",
                              backgroundColor: selectedTemplate === t.id ? t.color + "15" : "transparent",
                              opacity: pressed ? 0.7 : 1,
                            }]}
                          >
                            <MaterialIcons name={t.icon as any} size={18} color={selectedTemplate === t.id ? t.color : "#8FA3B8"} />
                            <Text style={{ fontSize: 13, fontWeight: "600", color: selectedTemplate === t.id ? t.color : "#8FA3B8" }}>{t.name}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>

                    <View>
                      <Text style={styles.fieldLabel}>Projektname *</Text>
                      <TextInput
                        value={newName}
                        onChangeText={setNewName}
                        placeholder="z.B. Neubau Musterstraße 5"
                        placeholderTextColor="#8FA3B8"
                        returnKeyType="next"
                        style={styles.input}
                        autoFocus
                      />
                    </View>

                    <View>
                      <Text style={styles.fieldLabel}>Beschreibung (optional)</Text>
                      <TextInput
                        value={newDesc}
                        onChangeText={setNewDesc}
                        placeholder="Kurze Projektbeschreibung"
                        placeholderTextColor="#8FA3B8"
                        returnKeyType="done"
                        blurOnSubmit={true}
                        onSubmitEditing={() => Keyboard.dismiss()}
                        style={[styles.input, { minHeight: 50, textAlignVertical: "top" }]}
                      />
                    </View>

                    <View>
                      <Text style={styles.fieldLabel}>Protokoll-Präfix</Text>
                      <TextInput
                        value={newPrefix}
                        onChangeText={(t) => setNewPrefix(t.toUpperCase())}
                        placeholder="z.B. BST, MNG (auto: erste 3 Buchstaben)"
                        placeholderTextColor="#8FA3B8"
                        maxLength={5}
                        autoCapitalize="characters"
                        returnKeyType="done"
                        blurOnSubmit={true}
                        onSubmitEditing={() => Keyboard.dismiss()}
                        style={styles.input}
                      />
                      <Text style={{ fontSize: 11, color: "#8FA3B8", marginTop: 4 }}>
                        Optional: Automatische Nummerierung (z.B. BST-001)
                      </Text>
                    </View>

                    <View>
                      <Text style={styles.fieldLabel}>Farbe wählen</Text>
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                        {PROJECT_COLORS.map((c) => (
                          <Pressable
                            key={c}
                            onPress={() => setNewColor(c)}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 0,
                              backgroundColor: c,
                              borderWidth: newColor === c ? 3 : 0,
                              borderColor: "#FFF",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {newColor === c && <MaterialIcons name="check" size={16} color="#FFF" />}
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                </ScrollView>

                {/* Modal Footer */}
                <View style={styles.modalCardFooter}>
                  <Pressable
                    onPress={() => { setShowCreate(false); Keyboard.dismiss(); }}
                    style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#8FA3B8" }}>Abbrechen</Text>
                  </Pressable>
                  <Pressable
                    onPress={createProject}
                    style={({ pressed }) => [styles.createBtn, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF" }}>Erstellen</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
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
    borderBottomColor: "#1E3A5F",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#F0F4F8",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: "#8FA3B8",
    marginTop: 2,
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 0,
    backgroundColor: "#5DADE2",
  },
  newBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFF",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1E30",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#F0F4F8",
    marginLeft: 8,
  },
  projectCard: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1E30",
    marginBottom: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalKeyboardView: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1E30",
    overflow: "hidden",
  },
  modalCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3A5F",
  },
  modalCardFooter: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#1E3A5F",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    color: "#F0F4F8",
  },
  input: {
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    fontSize: 15,
    borderColor: "#1E3A5F",
    backgroundColor: "#0B1622",
    color: "#F0F4F8",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 0,
    alignItems: "center",
    backgroundColor: "#0B1622",
    borderWidth: 1,
    borderColor: "#1E3A5F",
  },
  createBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 0,
    alignItems: "center",
    backgroundColor: "#5DADE2",
  },
});
