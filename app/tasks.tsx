import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
 Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { exportTasksAsCSV } from "@/lib/csv-export";
import { useTranslation } from "@/lib/language-provider";
import { timelineEngine } from "@/lib/timeline-engine";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { ExportDetailsBox, EMPTY_EXPORT_DETAILS, type ExportDetails } from "@/components/export-details-box";
import { buildExportDetailsHeaderHtml } from "@/lib/pdf-meta-header";

type TodoItem = {
  task: string;
  assignee: string;
  priority: "hoch" | "mittel" | "niedrig";
  deadline: string;
  done: boolean;
};

type ProtocolTodo = TodoItem & {
  protocolId: string;
  protocolTitle: string;
  protocolDate: string;
  todoIndex: number;
  source?: "protocol" | "project-task";
  taskId?: string;
};

type FilterType = "all" | "open" | "done";

export default function TasksScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [allTodos, setAllTodos] = useState<ProtocolTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("open");
  const [csvEnabled, setCsvEnabled] = useState(true);
  const [exportDetails, setExportDetails] = useState<ExportDetails>(EMPTY_EXPORT_DETAILS);

  async function loadAllTodos() {
    try {
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );

      const todos: ProtocolTodo[] = [];
      for (const protocol of protocols) {
        if (protocol.todos && protocol.todos.length > 0) {
          protocol.todos.forEach((todo: TodoItem, index: number) => {
            todos.push({
              ...todo,
              protocolId: protocol.id,
              protocolTitle: protocol.templateName || t('protokoll'),
              protocolDate: protocol.createdAt,
              todoIndex: index,
              source: "protocol",
            });
          });
        }
      }

      // Auch eigenstaendige Projekt-Tasks laden (z. B. aus KI-Analyse "Add as task")
      try {
        const projectTasks = JSON.parse(
          (await AsyncStorage.getItem("project-tasks")) || "[]"
        );
        for (const pt of projectTasks) {
          todos.push({
            task: pt.title || pt.task || "",
            assignee: pt.trade || pt.assignee || "",
            priority: (pt.priority as any) || "mittel",
            deadline: pt.deadline || "",
            done: pt.status === "erledigt" || pt.done === true,
            protocolId: pt.id,
            protocolTitle: "KI-Analyse",
            protocolDate: pt.createdAt || new Date().toISOString(),
            todoIndex: 0,
            source: "project-task",
            taskId: pt.id,
          });
        }
      } catch {}

      // Sort: open first, then by priority (hoch > mittel > niedrig)
      const priorityOrder = { hoch: 0, mittel: 1, niedrig: 2 };
      todos.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
      });

      setAllTodos(todos);
    } catch (error) {
      console.error("Error loading todos:", error);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadAllTodos();
      (async () => {
        const { isFeatureEnabled } = require("@/lib/feature-toggles");
        setCsvEnabled(await isFeatureEnabled("csvExport"));
      })();
    }, [])
  );

  const toggleTodo = async (item: ProtocolTodo) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Eigenstaendige Projekt-Tasks im eigenen Speicher abhaken
    if (item.source === "project-task") {
      try {
        const tasks = JSON.parse(
          (await AsyncStorage.getItem("project-tasks")) || "[]"
        );
        const idx = tasks.findIndex((x: any) => x.id === item.taskId);
        if (idx !== -1) {
          const nowDone = !item.done;
          tasks[idx].status = nowDone ? "erledigt" : "offen";
          tasks[idx].done = nowDone;
          await AsyncStorage.setItem("project-tasks", JSON.stringify(tasks));
        }
      } catch (error) {
        console.error("Error toggling project task:", error);
      }
      setAllTodos((prev) =>
        prev.map((t) =>
          t.source === "project-task" && t.taskId === item.taskId
            ? { ...t, done: !t.done }
            : t
        )
      );
      return;
    }

    try {
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );
      const protocolIdx = protocols.findIndex(
        (p: any) => p.id === item.protocolId
      );
      if (protocolIdx !== -1 && protocols[protocolIdx].todos) {
        protocols[protocolIdx].todos[item.todoIndex].done = !item.done;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));

        // Timeline event
        try {
          const projectId = protocols[protocolIdx].projectId || "default";
          await timelineEngine.emit({
            projectId,
            eventType: !item.done ? "task_completed" : "task_updated",
            source: "user",
            title: !item.done ? t('tasks_event_aufgabe_erledigt' as any) : t('tasks_event_aufgabe_geoeffnet' as any),
            description: item.task,
            entityId: item.protocolId,
            entityType: "task",
            tags: ["task", !item.done ? "completed" : "reopened"],
          });
        } catch {}
      }

      // Update local state
      setAllTodos((prev) =>
        prev.map((t) =>
          t.protocolId === item.protocolId && t.todoIndex === item.todoIndex
            ? { ...t, done: !t.done }
            : t
        )
      );
    } catch (error) {
      console.error("Error toggling todo:", error);
    }
  };

  const filteredTodos = allTodos.filter((t) => {
    if (filter === "open") return !t.done;
    if (filter === "done") return t.done;
    return true;
  });

  const openCount = allTodos.filter((t) => !t.done).length;
  const doneCount = allTodos.filter((t) => t.done).length;

  const exportPdf = async () => {
    // Respect the currently active filter (open / done / all)
    if (filteredTodos.length === 0) {
      Alert.alert(t('alert_fehler'), t('tasks_keine_aufgaben' as any));
      return;
    }

    const esc = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const priorityLabel = (p: ProtocolTodo["priority"]) =>
      p === "hoch"
        ? t('tasks_prioritaet_hoch' as any)
        : p === "niedrig"
        ? t('prioritaet_niedrig')
        : t('prioritaet_mittel');

    try {
      const rows = filteredTodos
        .map((item) => {
          const assignee =
            item.assignee && item.assignee !== t('nicht_zugewiesen')
              ? item.assignee
              : "—";
          const deadline =
            item.deadline && item.deadline !== t('frist_offen')
              ? item.deadline
              : "—";
          const status = item.done ? t('status_erledigt') : t('status_offen');
          return `<tr>
            <td>${esc(item.task)}</td>
            <td>${esc(assignee)}</td>
            <td>${esc(priorityLabel(item.priority))}</td>
            <td>${esc(deadline)}</td>
            <td>${esc(status)}</td>
          </tr>`;
        })
        .join("");

      const generated = new Date().toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const metaHeader = buildExportDetailsHeaderHtml(exportDetails, {
        bauvorhaben: t('export_bauvorhaben'), adresse: t('export_adresse'),
        etage: t('export_etage'), raum: t('export_raum'), notizen: t('export_notizen'),
      });

      const html = `<html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Arial,sans-serif; padding:24px; color:#1F2937;">
        <h1 style="font-size:22px; margin:0 0 4px;">${esc(t('tasks_aufgaben' as any))}</h1>
        ${metaHeader}
        <p style="font-size:12px; color:#6B7280; margin:0 0 20px;">${esc(generated)}</p>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="background:#F3F4F6; text-align:left;">
              <th style="padding:8px; border:1px solid #E5E7EB;">Aufgabe</th>
              <th style="padding:8px; border:1px solid #E5E7EB;">Zuständig</th>
              <th style="padding:8px; border:1px solid #E5E7EB;">Priorität</th>
              <th style="padding:8px; border:1px solid #E5E7EB;">Fällig</th>
              <th style="padding:8px; border:1px solid #E5E7EB;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>`.replace(
        /<td>/g,
        '<td style="padding:8px; border:1px solid #E5E7EB;">'
      );

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      }
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), e?.message || t('pdf_teilen'));
    }
  };

  const renderTodo = ({ item }: { item: ProtocolTodo }) => {
    const date = new Date(item.protocolDate).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
    });

    return (
      <Pressable
        onPress={() => toggleTodo(item)}
        onLongPress={() =>
          router.push(`/protocol-detail?id=${item.protocolId}` as any)
        }
        style={({ pressed }) => [
          styles.todoItem,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: item.done ? colors.primary : colors.muted,
              backgroundColor: item.done ? colors.primary : "transparent",
            },
          ]}
        >
          {item.done && (
            <MaterialIcons name="check" size={14} color="#FFFFFF" />
          )}
        </View>
        <View style={styles.todoContent}>
          <Text
            style={[
              styles.todoTask,
              {
                color: colors.foreground,
                textDecorationLine: item.done ? "line-through" : "none",
                opacity: item.done ? 0.6 : 1,
              },
            ]}
          >
            {item.task}
          </Text>
          <View style={styles.todoMeta}>
            {item.assignee !== t('nicht_zugewiesen') && (
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="person" size={11} color={colors.muted} />
                <Text style={[styles.badgeText, { color: colors.muted }]}>
                  {item.assignee}
                </Text>
              </View>
            )}
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    item.priority === "hoch"
                      ? "#E5393515"
                      : item.priority === "mittel"
                      ? "#FF980015"
                      : colors.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color:
                      item.priority === "hoch"
                        ? "#E53935"
                        : item.priority === "mittel"
                        ? "#FF9800"
                        : colors.muted,
                  },
                ]}
              >
                {item.priority === "hoch"
                  ? t('tasks_prioritaet_hoch' as any)
                  : item.priority === "mittel"
                  ? t('prioritaet_mittel')
                  : t('prioritaet_niedrig')}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="description" size={11} color={colors.muted} />
              <Text style={[styles.badgeText, { color: colors.muted }]}>
                {item.protocolTitle} ({date})
              </Text>
            </View>
            {item.deadline !== t('frist_offen') && (
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="schedule" size={11} color={colors.muted} />
                <Text style={[styles.badgeText, { color: colors.muted }]}>
                  {item.deadline}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t('tasks_aufgaben' as any)}
        </Text>
        {csvEnabled && <Pressable onPress={exportTasksAsCSV} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <MaterialIcons name="file-download" size={22} color={colors.primary} />
        </Pressable>}
        <Pressable
          onPress={exportPdf}
          accessibilityLabel={t('pdf_teilen')}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="picture-as-pdf" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.primary }]}>
            {openCount}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>{t('checklist_incomplete')}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.success }]}>
            {doneCount}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>
            {t('tasks_erledigt' as any)}
          </Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.foreground }]}>
            {allTodos.length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>{t('gesamt')}</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[styles.filterRow, { borderColor: colors.border }]}>
        {(["open", "all", "done"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterTab,
              filter === f && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? colors.primary : colors.muted },
              ]}
            >
              {f === "open" ? t('status_offen') : f === "done" ? t('status_erledigt') : t('filter_alle')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Todo list */}
      {filteredTodos.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons
            name="check-circle-outline"
            size={48}
            color={colors.muted}
          />
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {filter === "open"
              ? t('tasks_keine_offenen' as any)
              : filter === "done"
              ? t('tasks_keine_erledigten' as any)
              : t('tasks_keine_aufgaben' as any)}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.muted }]}>
            {t('tasks_extrahiert_hinweis' as any)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTodos}
          renderItem={renderTodo}
          keyExtractor={(item, index) =>
            `${item.protocolId}-${item.todoIndex}-${index}`
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <ExportDetailsBox value={exportDetails} onChange={setExportDetails} />
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 0,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  filterTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  todoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  todoContent: {
    flex: 1,
    gap: 6,
  },
  todoTask: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  todoMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 0,
    gap: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
  },
});
