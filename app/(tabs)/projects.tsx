import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
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
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { PROJECT_TEMPLATES } from "@/lib/project-templates";
import { useTranslation } from "@/lib/language-provider";

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

type ProtocolItem = {
  id: string;
  title: string;
  createdAt: string;
  projectId?: string;
  projectName?: string;
};

type DefectItem = {
  id: string;
  title: string;
  status: string;
};

const PROJECT_COLORS = ["#F87171", "#FBBF24", "#4ADE80", "#38BDF8", "#A78BFA", "#F472B6", "#2DD4BF", "#818CF8"];

export default function OverviewTab() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [protocols, setProtocols] = useState<ProtocolItem[]>([]);
  const [defects, setDefects] = useState<DefectItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const [projData, protoData, defData] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("protocols"),
        AsyncStorage.getItem("defects"),
      ]);
      setProjects(projData ? JSON.parse(projData) : []);
      setProtocols(protoData ? JSON.parse(protoData) : []);
      setDefects(defData ? JSON.parse(defData) : []);
    } catch {}
  };

  const favorites = useMemo(() => projects.filter(p => p.favorite && !p.archived), [projects]);
  const activeProjects = useMemo(() => projects.filter(p => !p.archived), [projects]);
  const recentProtocols = useMemo(() =>
    [...protocols].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [protocols]
  );
  const openDefects = useMemo(() => defects.filter(d => d.status !== 'erledigt' && d.status !== 'done'), [defects]);
  const weekProtocols = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return protocols.filter(p => new Date(p.createdAt) >= weekAgo);
  }, [protocols]);

  const createProject = async () => {
    if (!newName.trim()) {
      Alert.alert(t('alert_fehler'), t('msg_bitte_gib_einen_projektnamen_ein'));
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
    setSelectedTemplate(null);
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

  const selectProject = async (project: ProjectItem) => {
    await AsyncStorage.setItem("last-selected-project-id", project.id);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/project-detail?id=${project.id}` as any);
  };

  return (
    <ScreenContainer className="flex-1">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('uebersicht')}</Text>
          <Pressable
            onPress={() => setShowCreate(true)}
            style={({ pressed }) => [styles.newBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="add" size={18} color="#FFF" />
            <Text style={styles.newBtnText}>{t('neu')}</Text>
          </Pressable>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <Pressable
            onPress={() => router.push("/(tabs)/protocols" as any)}
            style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.statNumber}>{protocols.length}</Text>
            <Text style={styles.statLabel}>{t('nav_protocols')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/protocols" as any)}
            style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.statNumber, { color: '#5DADE2' }]}>{weekProtocols.length}</Text>
            <Text style={styles.statLabel}>{t('diese_woche')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/defects" as any)}
            style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.statNumber, { color: '#FF9800' }]}>{openDefects.length}</Text>
            <Text style={styles.statLabel}>{t('offene_maengel')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/dashboard-stats" as any)}
            style={({ pressed }) => [styles.statCard, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.statNumber, { color: '#4ADE80' }]}>{activeProjects.length}</Text>
            <Text style={styles.statLabel}>{t('nav_projects')}</Text>
          </Pressable>
        </View>

        {/* Favorites Section */}
        {favorites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('favoriten')}</Text>
            {favorites.map((project) => (
              <Pressable
                key={project.id}
                onPress={() => selectProject(project)}
                style={({ pressed }) => [styles.projectCard, { opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 4, height: 28, backgroundColor: project.color }} />
                  <MaterialIcons name="star" size={16} color="#FBBF24" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                    {project.description ? (
                      <Text style={styles.projectDesc} numberOfLines={1}>{project.description}</Text>
                    ) : null}
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color="#8FA3B8" />
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Recent Protocols */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('letzte_protokolle')}</Text>
            <Pressable
              onPress={() => router.push("/(tabs)/protocols" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 12, color: '#5DADE2', fontWeight: '600' }}>{t('alle_anzeigen')}</Text>
            </Pressable>
          </View>
          {recentProtocols.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="description" size={24} color="#8FA3B8" />
              <Text style={styles.emptyText}>{t('keine_protokolle_vorhanden')}</Text>
            </View>
          ) : (
            recentProtocols.map((proto) => (
              <Pressable
                key={proto.id}
                onPress={() => router.push(`/protocol-detail?id=${proto.id}` as any)}
                style={({ pressed }) => [styles.listItem, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="description" size={18} color="#5DADE2" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.listItemTitle} numberOfLines={1}>{proto.title || t('kein_titel')}</Text>
                  <Text style={styles.listItemSub}>
                    {new Date(proto.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
                    {proto.projectName ? ` \u2022 ${proto.projectName}` : ''}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={16} color="#8FA3B8" />
              </Pressable>
            ))
          )}
        </View>

        {/* All Projects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('nav_projects')}</Text>
            <Pressable
              onPress={() => setShowCreate(true)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="add-circle-outline" size={20} color="#5DADE2" />
            </Pressable>
          </View>
          {activeProjects.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="folder-open" size={24} color="#8FA3B8" />
              <Text style={styles.emptyText}>{t('keine_projekte' as any)}</Text>
              <Pressable
                onPress={() => setShowCreate(true)}
                style={({ pressed }) => [styles.emptyBtn, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{t('erstes_projekt_anlegen')}</Text>
              </Pressable>
            </View>
          ) : (
            activeProjects.map((project) => (
              <Pressable
                key={project.id}
                onPress={() => selectProject(project)}
                style={({ pressed }) => [styles.projectCard, { opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Pressable onPress={() => toggleFavorite(project.id)} style={({ pressed: p }) => [{ opacity: p ? 0.5 : 1 }]}>
                    <MaterialIcons
                      name={project.favorite ? "star" : "star-outline"}
                      size={18}
                      color={project.favorite ? "#FBBF24" : "#8FA3B8"}
                    />
                  </Pressable>
                  <View style={{ width: 4, height: 28, backgroundColor: project.color }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                    {project.description ? (
                      <Text style={styles.projectDesc} numberOfLines={1}>{project.description}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
                      {project.protocolPrefix && (
                        <Text style={styles.prefixBadge}>
                          {project.protocolPrefix}-{String((project.protocolCounter || 0) + 1).padStart(3, "0")}
                        </Text>
                      )}
                      <Text style={{ fontSize: 10, color: "#8FA3B8" }}>
                        {new Date(project.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color="#8FA3B8" />
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* Create Project Modal */}
      <Modal visible={showCreate} animationType="fade" transparent={true}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.modalKeyboardView}
            >
              <View style={styles.modalCard}>
                <View style={styles.modalCardHeader}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#F0F4F8" }}>{t('project_new')}</Text>
                  <Pressable onPress={() => { setShowCreate(false); Keyboard.dismiss(); }} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 4 }]}>
                    <MaterialIcons name="close" size={22} color="#8FA3B8" />
                  </Pressable>
                </View>
                <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
                  <View>
                    <Text style={styles.fieldLabel}>{t('vorlage_optional')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {PROJECT_TEMPLATES.map((tmpl) => (
                        <Pressable
                          key={tmpl.id}
                          onPress={() => {
                            if (selectedTemplate === tmpl.id) {
                              setSelectedTemplate(null);
                            } else {
                              setSelectedTemplate(tmpl.id);
                              setNewColor(tmpl.color);
                              setNewPrefix(tmpl.defaultPrefix);
                            }
                          }}
                          style={({ pressed }) => [{
                            paddingHorizontal: 14, paddingVertical: 10, marginRight: 8,
                            borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6,
                            borderColor: selectedTemplate === tmpl.id ? tmpl.color : "#1E3A5F",
                            backgroundColor: selectedTemplate === tmpl.id ? tmpl.color + "15" : "transparent",
                            opacity: pressed ? 0.7 : 1,
                          }]}
                        >
                          <MaterialIcons name={tmpl.icon as any} size={18} color={selectedTemplate === tmpl.id ? tmpl.color : "#8FA3B8"} />
                          <Text style={{ fontSize: 13, fontWeight: "600", color: selectedTemplate === tmpl.id ? tmpl.color : "#8FA3B8" }}>{tmpl.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>{t('projektname')}</Text>
                    <TextInput
                      value={newName}
                      onChangeText={setNewName}
                      placeholder={t('placeholder_zb_neubau')}
                      placeholderTextColor="#8FA3B8"
                      returnKeyType="next"
                      style={styles.input}
                      autoFocus
                    />
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>{t('beschreibung_optional')}</Text>
                    <TextInput
                      value={newDesc}
                      onChangeText={setNewDesc}
                      placeholder={t('kurze_projektbeschreibung')}
                      placeholderTextColor="#8FA3B8"
                      returnKeyType="done"
                      blurOnSubmit={true}
                      onSubmitEditing={() => Keyboard.dismiss()}
                      style={[styles.input, { minHeight: 50, textAlignVertical: "top" }]}
                    />
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>{t('protokollpraefix')}</Text>
                    <TextInput
                      value={newPrefix}
                      onChangeText={(val) => setNewPrefix(val.toUpperCase())}
                      placeholder="z.B. BST, MNG"
                      placeholderTextColor="#8FA3B8"
                      maxLength={5}
                      autoCapitalize="characters"
                      returnKeyType="done"
                      blurOnSubmit={true}
                      onSubmitEditing={() => Keyboard.dismiss()}
                      style={styles.input}
                    />
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>{t('farbe_waehlen')}</Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                      {PROJECT_COLORS.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => setNewColor(c)}
                          style={{
                            width: 32, height: 32,
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
                </ScrollView>
                <View style={styles.modalCardFooter}>
                  <Pressable
                    onPress={() => { setShowCreate(false); Keyboard.dismiss(); }}
                    style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#8FA3B8" }}>{t('cancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={createProject}
                    style={({ pressed }) => [styles.createBtn, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF" }}>{t('erstellen')}</Text>
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
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#5DADE2",
  },
  newBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFF",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 14,
    gap: 6,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#F0F4F8",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: "#8FA3B8",
    marginTop: 2,
    textAlign: "center",
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8FA3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  projectCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1E30",
    marginBottom: 8,
  },
  projectName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#F0F4F8",
  },
  projectDesc: {
    fontSize: 11,
    color: "#8FA3B8",
    marginTop: 1,
  },
  prefixBadge: {
    fontSize: 10,
    fontWeight: "600",
    color: "#5DADE2",
    backgroundColor: "#5DADE215",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1E30",
    marginBottom: 6,
  },
  listItemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#F0F4F8",
  },
  listItemSub: {
    fontSize: 11,
    color: "#8FA3B8",
    marginTop: 1,
  },
  emptyCard: {
    alignItems: "center",
    padding: 24,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#0F1E30",
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "#8FA3B8",
  },
  emptyBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#5DADE2",
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
    borderWidth: 1,
    fontSize: 15,
    borderColor: "#1E3A5F",
    backgroundColor: "#0B1622",
    color: "#F0F4F8",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#0B1622",
    borderWidth: 1,
    borderColor: "#1E3A5F",
  },
  createBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#5DADE2",
  },
});
