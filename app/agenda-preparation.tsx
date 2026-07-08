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
  ScrollView,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { useTranslation } from "@/lib/language-provider";
import {
  generateAgendaSuggestions,
  saveAgenda,
  getSavedAgendas,
  deleteAgenda,
  formatAgendaAsText,
  type AgendaItem,
  type PreparedAgenda,
} from "@/lib/agenda-preparation";

export default function AgendaPreparationScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<AgendaItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<AgendaItem[]>([]);
  const [savedAgendas, setSavedAgendas] = useState<PreparedAgenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(new Date().toLocaleDateString("de-DE"));
  const [showSaved, setShowSaved] = useState(false);
  const [manualItem, setManualItem] = useState("");
  const [showAddManual, setShowAddManual] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const projectsData = JSON.parse(await AsyncStorage.getItem("projects") || "[]");
      setProjects(projectsData);
      const agendaSuggestions = await generateAgendaSuggestions(selectedProject || undefined);
      setSuggestions(agendaSuggestions);
      const saved = await getSavedAgendas();
      setSavedAgendas(saved);
    } catch (error) {
      console.error("Error loading agenda data:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (item: AgendaItem) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const exists = selectedItems.find(i => i.id === item.id);
    if (exists) {
      setSelectedItems(selectedItems.filter(i => i.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };

  const addManualItem = () => {
    if (!manualItem.trim()) return;
    const item: AgendaItem = {
      id: `manual-${Date.now()}`,
      title: manualItem.trim(),
      source: "manual",
      priority: "mittel",
      estimatedMinutes: 10,
    };
    setSelectedItems([...selectedItems, item]);
    setManualItem("");
    setShowAddManual(false);
  };

  const handleSaveAgenda = async () => {
    if (!meetingTitle.trim()) {
      Alert.alert(t('alert_titel_fehlt'), t('msg_bitte_gib_einen_meetingtitel_ein'));
      return;
    }
    if (selectedItems.length === 0) {
      Alert.alert(t('alert_keine_punkte'), t('msg_bitte_waehle_mindestens_einen_agendapunkt'));
      return;
    }
    
    const agenda: PreparedAgenda = {
      id: `agenda-${Date.now()}`,
      meetingTitle: meetingTitle.trim(),
      meetingDate,
      items: selectedItems,
      createdAt: new Date().toISOString(),
    };
    
    await saveAgenda(agenda);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(t('alert_gespeichert_ex'), t('msg_agenda_wurde_erfolgreich_erstellt'));
    setSelectedItems([]);
    setMeetingTitle("");
    loadData();
  };

  const handleShareAgenda = async (agenda: PreparedAgenda) => {
    const text = formatAgendaAsText(agenda);
    if (Platform.OS !== "web" && await Sharing.isAvailableAsync()) {
      const { FileSystem } = require("expo-file-system/legacy");
      const path = FileSystem.cacheDirectory + "agenda.txt";
      await FileSystem.writeAsStringAsync(path, text);
      await Sharing.shareAsync(path, { mimeType: "text/plain" });
    } else {
      Alert.alert(t('alert_agenda'), text);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "hoch": return "#EF4444";
      case "mittel": return "#F59E0B";
      case "niedrig": return "#22C55E";
      default: return colors.muted;
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "open_task": return "assignment-late";
      case "previous_protocol": return "history";
      case "recurring": return "loop";
      case "manual": return "edit";
      default: return "lightbulb";
    }
  };

  const renderSuggestion = ({ item }: { item: AgendaItem }) => {
    const isSelected = selectedItems.some(i => i.id === item.id);
    return (
      <Pressable
        onPress={() => toggleItem(item)}
        style={({ pressed }) => [
          styles.suggestionCard,
          { 
            backgroundColor: isSelected ? colors.primary + "10" : colors.surface,
            borderColor: isSelected ? colors.primary : colors.border,
            opacity: pressed ? 0.7 : 1,
          }
        ]}
      >
        <View style={styles.suggestionLeft}>
          <MaterialIcons 
            name={isSelected ? "check-circle" : "radio-button-unchecked"} 
            size={22} 
            color={isSelected ? colors.primary : colors.muted} 
          />
        </View>
        <View style={styles.suggestionContent}>
          <Text style={[styles.suggestionTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
          <View style={styles.suggestionMeta}>
            <MaterialIcons name={getSourceIcon(item.source) as any} size={12} color={colors.muted} />
            <Text style={[styles.suggestionSource, { color: colors.muted }]}>
              {item.sourceProtocolTitle || item.source}
            </Text>
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) + "20" }]}>
              <Text style={[styles.priorityText, { color: getPriorityColor(item.priority) }]}>{item.priority}</Text>
            </View>
            <Text style={[styles.timeEstimate, { color: colors.muted }]}>{item.estimatedMinutes} Min.</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('agendavorbereitung')}</Text>
        <Pressable onPress={() => setShowSaved(true)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="folder" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Meeting Info */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('meetingdetails')}</Text>
          <TextInput
            value={meetingTitle}
            onChangeText={setMeetingTitle}
            placeholder={t('meetingtitel')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          />
          <TextInput
            value={meetingDate}
            onChangeText={setMeetingDate}
            placeholder={t('datum')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          />
        </View>

        {/* Selected Items */}
        {selectedItems.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Ausgewählt ({selectedItems.length})
              </Text>
              <Text style={[styles.totalTime, { color: colors.primary }]}>
                {selectedItems.reduce((sum, i) => sum + i.estimatedMinutes, 0)} Min. gesamt
              </Text>
            </View>
            {selectedItems.map((item, idx) => (
              <View key={item.id} style={styles.selectedItem}>
                <Text style={[styles.selectedNumber, { color: colors.primary }]}>{idx + 1}.</Text>
                <Text style={[styles.selectedText, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                <Pressable onPress={() => toggleItem(item)}>
                  <MaterialIcons name="remove-circle-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* KI Suggestions */}
        <View style={styles.suggestionsHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('kivorschlaege')}</Text>
          <Pressable onPress={() => setShowAddManual(true)} style={[styles.addButton, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="add" size={16} color="#fff" />
            <Text style={styles.addButtonText}>{t('manuell')}</Text>
          </Pressable>
        </View>

        {suggestions.length > 0 ? (
          <FlatList
            data={suggestions}
            keyExtractor={item => item.id}
            renderItem={renderSuggestion}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 8 }}
          />
        ) : (
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="lightbulb-outline" size={32} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Keine Vorschläge verfügbar. Erstelle mehr Protokolle für bessere Empfehlungen.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Save Button */}
      {selectedItems.length > 0 && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Pressable onPress={handleSaveAgenda} style={[styles.saveButton, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="save" size={18} color="#fff" />
            <Text style={styles.saveButtonText}>{t('agenda_speichern')}</Text>
          </Pressable>
        </View>
      )}

      {/* Add Manual Item Modal */}
      <Modal visible={showAddManual} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.addModal, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('agendapunkt_hinzufuegen')}</Text>
            <TextInput
              value={manualItem}
              onChangeText={setManualItem}
              placeholder={t('agendapunkt')}
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Pressable onPress={() => setShowAddManual(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground }}>{t('cancel')}</Text>
              </Pressable>
              <Pressable onPress={addManualItem} style={[styles.confirmBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>{t('hinzufuegen')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Saved Agendas Modal */}
      <Modal visible={showSaved} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.savedModal, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.savedHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('gespeicherte_agenden')}</Text>
              <Pressable onPress={() => setShowSaved(false)}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            <FlatList
              data={savedAgendas}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={[styles.savedCard, { borderColor: colors.border }]}>
                  <View style={styles.savedInfo}>
                    <Text style={[styles.savedTitle, { color: colors.foreground }]}>{item.meetingTitle}</Text>
                    <Text style={[styles.savedDate, { color: colors.muted }]}>{item.meetingDate} - {item.items.length} Punkte</Text>
                  </View>
                  <Pressable onPress={() => handleShareAgenda(item)}>
                    <MaterialIcons name="share" size={20} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => { deleteAgenda(item.id); loadData(); }}>
                    <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                  </Pressable>
                </View>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.muted, textAlign: "center", marginTop: 40 }]}>{t('keine_gespeicherten_agenden')}</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { flex: 1, padding: 16 },
  section: { padding: 14, borderRadius: 0, borderWidth: 0.5, marginBottom: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 8 },
  totalTime: { fontSize: 12, fontWeight: "600" },
  input: { borderWidth: 0.5, borderRadius: 0, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  selectedItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  selectedNumber: { fontSize: 13, fontWeight: "700", width: 20 },
  selectedText: { flex: 1, fontSize: 13 },
  suggestionsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0 },
  addButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  suggestionCard: { flexDirection: "row", padding: 12, borderRadius: 0, borderWidth: 0.5, gap: 10 },
  suggestionLeft: { justifyContent: "center" },
  suggestionContent: { flex: 1 },
  suggestionTitle: { fontSize: 13, fontWeight: "500", lineHeight: 18 },
  suggestionMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  suggestionSource: { fontSize: 11 },
  priorityBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  priorityText: { fontSize: 10, fontWeight: "600" },
  timeEstimate: { fontSize: 10 },
  emptyBox: { alignItems: "center", padding: 24, borderRadius: 0, borderWidth: 0.5, gap: 8 },
  emptyText: { fontSize: 13, textAlign: "center" },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, borderTopWidth: 0.5 },
  saveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 0 },
  saveButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  modalOverlay: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", padding: 24 },
  addModal: { borderRadius: 0, padding: 20, borderWidth: 0.5 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 0, borderWidth: 1 },
  confirmBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 0 },
  savedModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 0.5, maxHeight: "80%", position: "absolute", bottom: 0, left: 0, right: 0 },
  savedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  savedCard: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 0.5, gap: 12 },
  savedInfo: { flex: 1 },
  savedTitle: { fontSize: 14, fontWeight: "600" },
  savedDate: { fontSize: 12, marginTop: 2 },
});
