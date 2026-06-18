import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import {
  Checklist,
  ChecklistItem,
  ChecklistResult,
  ChecklistItemResult,
  BUILT_IN_CHECKLISTS,
  getChecklists,
  saveCustomChecklist,
  deleteCustomChecklist,
  getChecklistResults,
  saveChecklistResult,
  deleteChecklistResult,
  getChecklistCompletionRate,
  saveModifiedBuiltInChecklist,
  getModifiedChecklistItems,
} from "@/lib/checklist-store";

export default function ChecklistsScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = params.projectId || "";

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [results, setResults] = useState<ChecklistResult[]>([]);
  const [selectedChecklist, setSelectedChecklist] = useState<Checklist | null>(null);
  const [activeResult, setActiveResult] = useState<ChecklistResult | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newItems, setNewItems] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [projectId])
  );

  const loadData = async () => {
    const allChecklists = await getChecklists();
    setChecklists(allChecklists);
    const allResults = await getChecklistResults(projectId || undefined);
    setResults(allResults);
  };

  const startChecklist = (checklist: Checklist) => {
    const result: ChecklistResult = {
      id: `result-${Date.now()}`,
      checklistId: checklist.id,
      checklistName: checklist.name,
      projectId: projectId || undefined,
      results: checklist.items.map((item) => ({
        itemId: item.id,
        checked: false,
      })),
      createdAt: new Date().toISOString(),
      inspector: inspectorName || "Prüfer",
    };
    setActiveResult(result);
    setSelectedChecklist(checklist);
  };

  const toggleItem = async (itemId: string) => {
    if (!activeResult) return;
    const updatedResults = activeResult.results.map((r) =>
      r.itemId === itemId ? { ...r, checked: !r.checked } : r
    );
    const updated = { ...activeResult, results: updatedResults };
    setActiveResult(updated);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveCurrentResult = async () => {
    if (!activeResult) return;
    const completed = { ...activeResult, completedAt: new Date().toISOString() };
    await saveChecklistResult(completed);
    await loadData();
    setActiveResult(null);
    setSelectedChecklist(null);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const addItemToChecklist = async () => {
    if (!newItemText.trim() || !selectedChecklist) return;
    const newItem: ChecklistItem = {
      id: `item-${Date.now()}`,
      text: newItemText.trim(),
      required: false,
    };
    const updatedItems = [...selectedChecklist.items, newItem];
    const updatedChecklist = { ...selectedChecklist, items: updatedItems };
    setSelectedChecklist(updatedChecklist);
    // Also add to activeResult
    if (activeResult) {
      setActiveResult({
        ...activeResult,
        results: [...activeResult.results, { itemId: newItem.id, checked: false }],
      });
    }
    // Persist the modification
    if (updatedChecklist.isBuiltIn) {
      await saveModifiedBuiltInChecklist(updatedChecklist);
    } else {
      await saveCustomChecklist(updatedChecklist);
    }
    setNewItemText("");
    setShowAddItem(false);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const deleteItemFromChecklist = async (itemId: string) => {
    if (!selectedChecklist) return;
    Alert.alert("Pr\u00fcfpunkt l\u00f6schen", "Diesen Pr\u00fcfpunkt wirklich entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "L\u00f6schen",
        style: "destructive",
        onPress: async () => {
          const updatedItems = selectedChecklist.items.filter((i) => i.id !== itemId);
          const updatedChecklist = { ...selectedChecklist, items: updatedItems };
          setSelectedChecklist(updatedChecklist);
          if (activeResult) {
            setActiveResult({
              ...activeResult,
              results: activeResult.results.filter((r) => r.itemId !== itemId),
            });
          }
          if (updatedChecklist.isBuiltIn) {
            await saveModifiedBuiltInChecklist(updatedChecklist);
          } else {
            await saveCustomChecklist(updatedChecklist);
          }
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const createCustomChecklist = async () => {
    if (!newName.trim()) return;

    const items: ChecklistItem[] = newItems
      .split("\n")
      .filter((line) => line.trim())
      .map((line, i) => ({
        id: `custom-item-${Date.now()}-${i}`,
        text: line.trim(),
        required: true,
      }));

    const checklist: Checklist = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      description: newDescription.trim() || "Benutzerdefinierte Checkliste",
      category: newCategory.trim() || "Benutzerdefiniert",
      items,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
    };

    await saveCustomChecklist(checklist);
    await loadData();
    setShowCreateModal(false);
    setNewName("");
    setNewDescription("");
    setNewCategory("");
    setNewItems("");
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removeResult = (resultId: string) => {
    Alert.alert("Ergebnis löschen", "Dieses Prüfergebnis wirklich entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          await deleteChecklistResult(resultId);
          await loadData();
        },
      },
    ]);
  };

  const renderChecklist = ({ item }: { item: Checklist }) => (
    <Pressable
      onPress={() => startChecklist(item)}
      style={({ pressed }) => [
        styles.checklistCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.checklistHeader}>
        <MaterialIcons name="playlist-add-check" size={22} color={colors.primary} />
        <View style={styles.checklistInfo}>
          <Text style={[styles.checklistName, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.checklistCategory, { color: colors.muted }]}>{item.category}</Text>
        </View>
        <View style={[styles.itemCountBadge, { backgroundColor: colors.primary + "15" }]}>
          <Text style={[styles.itemCountText, { color: colors.primary }]}>{item.items.length}</Text>
        </View>
      </View>
      {item.description ? (
        <Text style={[styles.checklistDesc, { color: colors.muted }]} numberOfLines={1}>
          {item.description}
        </Text>
      ) : null}
    </Pressable>
  );

  const renderResult = ({ item }: { item: ChecklistResult }) => {
    const rate = getChecklistCompletionRate(item);
    return (
      <Pressable
        onLongPress={() => removeResult(item.id)}
        style={({ pressed }) => [
          styles.resultCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.resultHeader}>
          <MaterialIcons
            name={rate === 100 ? "check-circle" : "pending"}
            size={20}
            color={rate === 100 ? colors.success : colors.warning}
          />
          <Text style={[styles.resultName, { color: colors.foreground }]} numberOfLines={1}>
            {item.checklistName}
          </Text>
        </View>
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: rate === 100 ? colors.success : colors.primary, width: `${rate}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.muted }]}>{rate}%</Text>
        </View>
        <Text style={[styles.resultMeta, { color: colors.muted }]}>
          {item.inspector} • {new Date(item.createdAt).toLocaleDateString("de-DE")}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScreenContainer className="p-4">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Checklisten</Text>
        <Pressable onPress={() => setShowTemplateModal(true)} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="add" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Results Section */}
      {results.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Letzte Prüfungen</Text>
          <FlatList
            data={results.slice(0, 5)}
            keyExtractor={(item) => item.id}
            renderItem={renderResult}
            scrollEnabled={false}
          />
        </View>
      )}

      {/* Checklists Section */}
      <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 16 }]}>Verfügbare Checklisten</Text>
      <FlatList
        data={checklists}
        keyExtractor={(item) => item.id}
        renderItem={renderChecklist}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="checklist" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>Keine Checklisten</Text>
          </View>
        }
      />

      {/* Active Checklist Modal */}
      <Modal visible={!!selectedChecklist && !!activeResult} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {selectedChecklist && activeResult && (
              <>
                <View style={styles.detailHeader}>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>{selectedChecklist.name}</Text>
                  <Text style={[styles.detailProgress, { color: colors.muted }]}>
                    {activeResult.results.filter((r) => r.checked).length}/{activeResult.results.length} geprüft
                  </Text>
                </View>
                <FlatList
                  data={selectedChecklist.items}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const result = activeResult.results.find((r) => r.itemId === item.id);
                    const isChecked = result?.checked ?? false;
                    return (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Pressable
                          onPress={() => toggleItem(item.id)}
                          style={({ pressed }) => [
                            styles.itemRow,
                            { borderBottomColor: colors.border, flex: 1 },
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <MaterialIcons
                            name={isChecked ? "check-box" : "check-box-outline-blank"}
                            size={22}
                            color={isChecked ? colors.success : colors.muted}
                          />
                          <View style={styles.itemContent}>
                            <Text
                              style={[
                                styles.itemText,
                                { color: isChecked ? colors.muted : colors.foreground },
                                isChecked && styles.itemChecked,
                              ]}
                            >
                              {item.text}
                            </Text>
                            {item.required && (
                              <Text style={[styles.requiredBadge, { color: colors.error }]}>Pflicht</Text>
                            )}
                          </View>
                        </Pressable>
                        <Pressable
                          onPress={() => deleteItemFromChecklist(item.id)}
                          style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}
                        >
                          <MaterialIcons name="delete-outline" size={18} color={colors.error + "80"} />
                        </Pressable>
                      </View>
                    );
                  }}
                  style={styles.itemList}
                />
                {/* Add item section */}
                {showAddItem ? (
                  <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <TextInput
                      style={{ flex: 1, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, color: colors.foreground, backgroundColor: colors.background }}
                      placeholder="Neuen Prüfpunkt eingeben..."
                      placeholderTextColor={colors.muted}
                      value={newItemText}
                      onChangeText={setNewItemText}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={addItemToChecklist}
                    />
                    <Pressable onPress={addItemToChecklist} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.6 : 1 }]}>
                      <MaterialIcons name="check" size={24} color={colors.success} />
                    </Pressable>
                    <Pressable onPress={() => { setShowAddItem(false); setNewItemText(""); }} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.6 : 1 }]}>
                      <MaterialIcons name="close" size={24} color={colors.muted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setShowAddItem(true)}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>{"Prüfpunkt hinzufügen"}</Text>
                  </Pressable>
                )}
                <View style={styles.modalButtons}>
                  <Pressable
                    onPress={() => { setActiveResult(null); setSelectedChecklist(null); Keyboard.dismiss(); }}
                    style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Abbrechen</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveCurrentResult}
                    style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.saveBtnText}>Speichern</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Template Selection Modal */}
      <Modal visible={showTemplateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Checkliste starten</Text>

            <Text style={[styles.formLabel, { color: colors.muted }]}>Prüfer-Name</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Ihr Name"
              placeholderTextColor={colors.muted}
              value={inspectorName}
              onChangeText={setInspectorName}
            />

            <Text style={[styles.sectionLabel, { color: colors.muted }]}>Vorlage wählen</Text>
            <ScrollView style={styles.templateList}>
              {checklists.map((checklist) => (
                <Pressable
                  key={checklist.id}
                  onPress={() => { startChecklist(checklist); setShowTemplateModal(false); }}
                  style={({ pressed }) => [
                    styles.templateCard,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <MaterialIcons name="description" size={20} color={colors.primary} />
                  <View style={styles.templateInfo}>
                    <Text style={[styles.templateTitle, { color: colors.foreground }]}>{checklist.name}</Text>
                    <Text style={[styles.templateCount, { color: colors.muted }]}>{checklist.items.length} Prüfpunkte • {checklist.category}</Text>
                  </View>
                  <MaterialIcons name="play-arrow" size={20} color={colors.primary} />
                </Pressable>
              ))}
            </ScrollView>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Pressable
              onPress={() => { setShowTemplateModal(false); setShowCreateModal(true); }}
              style={({ pressed }) => [
                styles.customBtn,
                { borderColor: colors.primary },
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons name="edit" size={18} color={colors.primary} />
              <Text style={[styles.customBtnText, { color: colors.primary }]}>Eigene Checkliste erstellen</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowTemplateModal(false)}
              style={({ pressed }) => [styles.cancelFullBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Custom Create Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalContent, { backgroundColor: colors.surface }]} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Eigene Checkliste</Text>

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Name der Checkliste *"
              placeholderTextColor={colors.muted}
              value={newName}
              onChangeText={setNewName}
            />

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Beschreibung"
              placeholderTextColor={colors.muted}
              value={newDescription}
              onChangeText={setNewDescription}
            />

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Kategorie (z.B. Abnahme, Sicherheit)"
              placeholderTextColor={colors.muted}
              value={newCategory}
              onChangeText={setNewCategory}
            />

            <Text style={[styles.formLabel, { color: colors.muted }]}>Prüfpunkte (einer pro Zeile)</Text>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={"Punkt 1\nPunkt 2\nPunkt 3"}
              placeholderTextColor={colors.muted}
              value={newItems}
              onChangeText={setNewItems}
              multiline
              numberOfLines={8}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setShowCreateModal(false); setNewName(""); setNewDescription(""); setNewCategory(""); setNewItems(""); }}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={createCustomChecklist}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.saveBtnText}>Erstellen</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  addBtn: { padding: 8 },
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 10 },
  list: { paddingBottom: 20 },
  checklistCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  checklistHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  checklistInfo: { flex: 1 },
  checklistName: { fontSize: 15, fontWeight: "600" },
  checklistCategory: { fontSize: 12, marginTop: 2 },
  checklistDesc: { fontSize: 13, marginTop: 6 },
  itemCountBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  itemCountText: { fontSize: 12, fontWeight: "600" },
  resultCard: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultName: { fontSize: 14, fontWeight: "600", flex: 1 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  progressBar: { flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: "500", minWidth: 35 },
  resultMeta: { fontSize: 12, marginTop: 6 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: "500" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: "85%" },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  detailHeader: { marginBottom: 12 },
  detailProgress: { fontSize: 14, marginTop: 4 },
  itemList: { maxHeight: 400 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  itemContent: { flex: 1 },
  itemText: { fontSize: 15 },
  itemChecked: { textDecorationLine: "line-through" },
  requiredBadge: { fontSize: 11, marginTop: 2 },
  formLabel: { fontSize: 13, fontWeight: "500", marginBottom: 6, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: "500", marginBottom: 10, marginTop: 12 },
  templateList: { maxHeight: 280 },
  templateCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  templateInfo: { flex: 1 },
  templateTitle: { fontSize: 14, fontWeight: "600" },
  templateCount: { fontSize: 12, marginTop: 2 },
  divider: { height: 1, marginVertical: 16 },
  customBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed" },
  customBtnText: { fontSize: 15, fontWeight: "600" },
  cancelFullBtn: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  textArea: { minHeight: 150, textAlignVertical: "top" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  cancelBtnText: { fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
