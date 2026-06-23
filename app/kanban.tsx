import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Dimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

type KanbanStatus = "offen" | "in_arbeit" | "erledigt";

type KanbanTask = {
  id: string;
  task: string;
  assignee: string;
  priority: "hoch" | "mittel" | "niedrig";
  deadline: string;
  status: KanbanStatus;
  protocolId: string;
  protocolTitle: string;
  protocolDate: string;
  todoIndex: number;
  movedAt?: string;
};

const COLUMNS: { key: KanbanStatus; title: string; icon: string; color: string }[] = [
  { key: "offen", title: "Offen", icon: "radio-button-unchecked", color: "#EF4444" },
  { key: "in_arbeit", title: "In Arbeit", icon: "autorenew", color: "#F59E0B" },
  { key: "erledigt", title: "Erledigt", icon: "check-circle", color: "#22C55E" },
];

export default function KanbanScreen() {
  const colors = useColors();
  const router = useRouter();
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [activeColumn, setActiveColumn] = useState<KanbanStatus>("offen");
  const screenWidth = Dimensions.get("window").width;

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [])
  );

  const loadTasks = async () => {
    try {
      const protocols = JSON.parse(await AsyncStorage.getItem("protocols") || "[]");
      const kanbanState = JSON.parse(await AsyncStorage.getItem("kanban-state") || "{}");
      
      const allTasks: KanbanTask[] = [];
      for (const protocol of protocols) {
        if (protocol.todos && protocol.todos.length > 0) {
          protocol.todos.forEach((todo: any, index: number) => {
            const taskId = `${protocol.id}-${index}`;
            const savedStatus = kanbanState[taskId];
            
            let status: KanbanStatus = "offen";
            if (savedStatus) {
              status = savedStatus;
            } else if (todo.done) {
              status = "erledigt";
            }
            
            allTasks.push({
              id: taskId,
              task: todo.task,
              assignee: todo.assignee || "",
              priority: todo.priority || "mittel",
              deadline: todo.deadline || "",
              status,
              protocolId: protocol.id,
              protocolTitle: protocol.templateName || "Protokoll",
              protocolDate: protocol.createdAt,
              todoIndex: index,
              movedAt: savedStatus ? new Date().toISOString() : undefined,
            });
          });
        }
      }
      
      // Sort by priority
      const priorityOrder = { hoch: 0, mittel: 1, niedrig: 2 };
      allTasks.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));
      
      setTasks(allTasks);
    } catch (error) {
      console.error("Error loading kanban tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const moveTask = async (task: KanbanTask, newStatus: KanbanStatus) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    const updated = tasks.map(t => 
      t.id === task.id ? { ...t, status: newStatus, movedAt: new Date().toISOString() } : t
    );
    setTasks(updated);
    
    // Save kanban state
    const kanbanState = JSON.parse(await AsyncStorage.getItem("kanban-state") || "{}");
    kanbanState[task.id] = newStatus;
    await AsyncStorage.setItem("kanban-state", JSON.stringify(kanbanState));
    
    // Also update the protocol's todo done state
    if (newStatus === "erledigt" || newStatus === "offen") {
      const protocols = JSON.parse(await AsyncStorage.getItem("protocols") || "[]");
      const protocolIdx = protocols.findIndex((p: any) => p.id === task.protocolId);
      if (protocolIdx >= 0 && protocols[protocolIdx].todos) {
        protocols[protocolIdx].todos[task.todoIndex].done = newStatus === "erledigt";
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      }
    }
  };

  const getColumnTasks = (status: KanbanStatus) => tasks.filter(t => t.status === status);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "hoch": return "#EF4444";
      case "mittel": return "#F59E0B";
      case "niedrig": return "#22C55E";
      default: return colors.muted;
    }
  };

  const renderTaskCard = (task: KanbanTask) => (
    <Pressable
      key={task.id}
      onPress={() => { setSelectedTask(task); setShowDetail(true); }}
      style={({ pressed }) => [
        styles.taskCard,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }
      ]}
    >
      <View style={styles.taskHeader}>
        <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
        <Text style={[styles.taskText, { color: colors.foreground }]} numberOfLines={2}>
          {task.task}
        </Text>
      </View>
      {task.assignee ? (
        <Text style={[styles.assigneeText, { color: colors.muted }]} numberOfLines={1}>
          <MaterialIcons name="person" size={12} color={colors.muted} /> {task.assignee}
        </Text>
      ) : null}
      {task.deadline ? (
        <Text style={[styles.deadlineText, { color: colors.muted }]}>
          <MaterialIcons name="event" size={12} color={colors.muted} /> {task.deadline}
        </Text>
      ) : null}
      <Text style={[styles.sourceText, { color: colors.muted }]} numberOfLines={1}>
        {task.protocolTitle}
      </Text>
    </Pressable>
  );

  const renderColumn = (column: typeof COLUMNS[0]) => {
    const columnTasks = getColumnTasks(column.key);
    return (
      <View key={column.key} style={[styles.column, { borderColor: colors.border }]}>
        <View style={[styles.columnHeader, { borderBottomColor: colors.border }]}>
          <MaterialIcons name={column.icon as any} size={18} color={column.color} />
          <Text style={[styles.columnTitle, { color: colors.foreground }]}>{column.title}</Text>
          <View style={[styles.badge, { backgroundColor: column.color + "20" }]}>
            <Text style={[styles.badgeText, { color: column.color }]}>{columnTasks.length}</Text>
          </View>
        </View>
        <ScrollView style={styles.columnContent} showsVerticalScrollIndicator={false}>
          {columnTasks.map(renderTaskCard)}
          {columnTasks.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.muted }]}>Keine Aufgaben</Text>
          )}
        </ScrollView>
      </View>
    );
  };

  // Mobile: Tab-based column view
  const renderMobileView = () => (
    <View style={styles.mobileContainer}>
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {COLUMNS.map(col => (
          <Pressable
            key={col.key}
            onPress={() => setActiveColumn(col.key)}
            style={[
              styles.tab,
              activeColumn === col.key && { borderBottomColor: col.color, borderBottomWidth: 2 }
            ]}
          >
            <MaterialIcons name={col.icon as any} size={16} color={activeColumn === col.key ? col.color : colors.muted} />
            <Text style={[styles.tabText, { color: activeColumn === col.key ? col.color : colors.muted }]}>
              {col.title} ({getColumnTasks(col.key).length})
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={getColumnTasks(activeColumn)}
        keyExtractor={item => item.id}
        renderItem={({ item }) => renderTaskCard(item)}
        contentContainerStyle={styles.mobileList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="inbox" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>Keine Aufgaben in dieser Spalte</Text>
          </View>
        }
      />
    </View>
  );

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Kanban Board</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Stats Bar */}
      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        {COLUMNS.map(col => (
          <View key={col.key} style={styles.statItem}>
            <Text style={[styles.statNumber, { color: col.color }]}>{getColumnTasks(col.key).length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{col.title}</Text>
          </View>
        ))}
      </View>

      {screenWidth > 768 ? (
        <View style={styles.desktopColumns}>
          {COLUMNS.map(renderColumn)}
        </View>
      ) : (
        renderMobileView()
      )}

      {/* Task Detail Modal */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={[styles.modalOverlay]}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {selectedTask && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Aufgabe</Text>
                  <Pressable onPress={() => setShowDetail(false)}>
                    <MaterialIcons name="close" size={24} color={colors.foreground} />
                  </Pressable>
                </View>
                
                <ScrollView style={styles.modalBody}>
                  <Text style={[styles.taskDetailText, { color: colors.foreground }]}>{selectedTask.task}</Text>
                  
                  <View style={styles.detailRow}>
                    <MaterialIcons name="person" size={18} color={colors.muted} />
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>Zuständig:</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>{selectedTask.assignee || "Nicht zugewiesen"}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <MaterialIcons name="flag" size={18} color={getPriorityColor(selectedTask.priority)} />
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>Priorität:</Text>
                    <Text style={[styles.detailValue, { color: getPriorityColor(selectedTask.priority) }]}>{selectedTask.priority}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <MaterialIcons name="event" size={18} color={colors.muted} />
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>Frist:</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>{selectedTask.deadline || "Keine Frist"}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <MaterialIcons name="description" size={18} color={colors.muted} />
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>Quelle:</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>{selectedTask.protocolTitle}</Text>
                  </View>
                  
                  <Text style={[styles.moveTitle, { color: colors.foreground }]}>Status ändern:</Text>
                  <View style={styles.moveButtons}>
                    {COLUMNS.map(col => (
                      <Pressable
                        key={col.key}
                        onPress={() => {
                          moveTask(selectedTask, col.key);
                          setSelectedTask({ ...selectedTask, status: col.key });
                        }}
                        style={[
                          styles.moveButton,
                          { 
                            borderColor: col.color,
                            backgroundColor: selectedTask.status === col.key ? col.color + "20" : "transparent"
                          }
                        ]}
                      >
                        <MaterialIcons name={col.icon as any} size={16} color={col.color} />
                        <Text style={[styles.moveButtonText, { color: col.color }]}>{col.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                
                <Pressable
                  onPress={() => router.push(`/protocol-detail?id=${selectedTask.protocolId}` as any)}
                  style={[styles.goToProtocol, { backgroundColor: colors.primary }]}
                >
                  <MaterialIcons name="open-in-new" size={16} color="#fff" />
                  <Text style={styles.goToProtocolText}>Zum Protokoll</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  title: { fontSize: 18, fontWeight: "700" },
  statsBar: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, marginHorizontal: 16, marginTop: 8, borderRadius: 0 },
  statItem: { alignItems: "center" },
  statNumber: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 11, marginTop: 2 },
  desktopColumns: { flex: 1, flexDirection: "row", padding: 16, gap: 12 },
  column: { flex: 1, borderWidth: 1, borderRadius: 0, overflow: "hidden" },
  columnHeader: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8, borderBottomWidth: 0.5 },
  columnTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 0 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  columnContent: { padding: 8, flex: 1 },
  mobileContainer: { flex: 1 },
  tabBar: { flexDirection: "row", borderBottomWidth: 0.5 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, gap: 4 },
  tabText: { fontSize: 12, fontWeight: "600" },
  mobileList: { padding: 16, gap: 8 },
  taskCard: { padding: 12, borderRadius: 0, borderWidth: 0.5, marginBottom: 8 },
  taskHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  priorityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  taskText: { fontSize: 13, fontWeight: "500", flex: 1, lineHeight: 18 },
  assigneeText: { fontSize: 11, marginTop: 6, marginLeft: 16 },
  deadlineText: { fontSize: 11, marginTop: 2, marginLeft: 16 },
  sourceText: { fontSize: 10, marginTop: 4, marginLeft: 16, fontStyle: "italic" },
  emptyContainer: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 13, textAlign: "center", marginTop: 8 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 0.5, maxHeight: "80%", paddingBottom: 30 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalBody: { padding: 16 },
  taskDetailText: { fontSize: 16, fontWeight: "600", lineHeight: 22, marginBottom: 16 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "500" },
  moveTitle: { fontSize: 14, fontWeight: "600", marginTop: 20, marginBottom: 12 },
  moveButtons: { flexDirection: "row", gap: 8 },
  moveButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: 0, borderWidth: 1.5 },
  moveButtonText: { fontSize: 12, fontWeight: "600" },
  goToProtocol: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, margin: 16, paddingVertical: 12, borderRadius: 0 },
  goToProtocolText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
