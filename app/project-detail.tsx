import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
};

type Protocol = {
  id: string;
  title: string;
  projectId?: string;
  createdAt: string;
  templateName?: string;
  status: string;
};

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const loadData = async () => {
    try {
      const [projectsData, protocolsData] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("protocols"),
      ]);
      const projectsList: Project[] = JSON.parse(projectsData || "[]");
      const protocolsList: Protocol[] = JSON.parse(protocolsData || "[]");

      const found = projectsList.find((p) => p.id === id);
      setProject(found || null);
      setAllProtocols(protocolsList);
      setProtocols(protocolsList.filter((p) => p.projectId === id));
    } catch (e) {
      console.error("Error loading project detail:", e);
    }
  };

  const assignProtocol = async (protocolId: string) => {
    try {
      const updated = allProtocols.map((p) =>
        p.id === protocolId ? { ...p, projectId: id } : p
      );
      await AsyncStorage.setItem("protocols", JSON.stringify(updated));
      setAllProtocols(updated);
      setProtocols(updated.filter((p) => p.projectId === id));
      setShowAssignModal(false);
    } catch (e) {
      Alert.alert("Fehler", "Zuordnung fehlgeschlagen.");
    }
  };

  const removeFromProject = async (protocolId: string) => {
    Alert.alert("Entfernen", "Protokoll aus diesem Projekt entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Entfernen",
        onPress: async () => {
          const updated = allProtocols.map((p) =>
            p.id === protocolId ? { ...p, projectId: undefined } : p
          );
          await AsyncStorage.setItem("protocols", JSON.stringify(updated));
          setAllProtocols(updated);
          setProtocols(updated.filter((p) => p.projectId === id));
        },
      },
    ]);
  };

  const unassignedProtocols = allProtocols.filter((p) => !p.projectId);

  if (!project) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text style={{ color: colors.muted }}>Projekt nicht gefunden</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} className="flex-1">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={[styles.headerDot, { backgroundColor: project.color }]} />
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              {project.name}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowAssignModal(true)}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="add" size={28} color={colors.primary} />
          </Pressable>
        </View>

        {project.description ? (
          <Text style={[styles.description, { color: colors.muted }]}>{project.description}</Text>
        ) : null}

        {/* Stats */}
        <View style={[styles.statsRow, { borderColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{protocols.length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Protokolle</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>
              {new Date(project.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
            </Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Erstellt</Text>
          </View>
        </View>

        {/* Protocols list */}
        <FlatList
          data={protocols}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/protocol-detail?id=${item.id}` as any)}
              onLongPress={() => removeFromProject(item.id)}
              style={({ pressed }) => [
                styles.protocolItem,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.protocolInfo}>
                <Text style={[styles.protocolTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.protocolDate, { color: colors.muted }]}>
                  {new Date(item.createdAt).toLocaleDateString("de-DE")} • {item.templateName || "Freies Protokoll"}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="note-add" size={48} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Noch keine Protokolle zugeordnet.{"\n"}Tippe + um Protokolle hinzuzufügen.
              </Text>
            </View>
          }
        />

        {/* Assign Modal */}
        {showAssignModal && (
          <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAssignModal(false)} />
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Protokoll zuordnen</Text>
                <Pressable onPress={() => setShowAssignModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>
              {unassignedProtocols.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted, paddingVertical: 30 }]}>
                  Alle Protokolle sind bereits zugeordnet.
                </Text>
              ) : (
                <FlatList
                  data={unassignedProtocols}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 300 }}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => assignProtocol(item.id)}
                      style={({ pressed }) => [
                        styles.assignItem,
                        { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.assignTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.assignDate, { color: colors.muted }]}>
                          {new Date(item.createdAt).toLocaleDateString("de-DE")}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                />
              )}
            </View>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginHorizontal: 16 },
  headerDot: { width: 12, height: 12, borderRadius: 6 },
  headerTitle: { fontSize: 18, fontWeight: "700", flex: 1 },
  description: { fontSize: 14, paddingHorizontal: 16, marginBottom: 12 },
  statsRow: { flexDirection: "row", marginHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, marginBottom: 16 },
  stat: { flex: 1, alignItems: "center" },
  statNumber: { fontSize: 18, fontWeight: "700" },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, alignSelf: "stretch" },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  protocolItem: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  protocolInfo: { flex: 1 },
  protocolTitle: { fontSize: 15, fontWeight: "500", marginBottom: 2 },
  protocolDate: { fontSize: 12 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalOverlay: { justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  assignItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  assignTitle: { fontSize: 15, fontWeight: "500" },
  assignDate: { fontSize: 12 },
});
