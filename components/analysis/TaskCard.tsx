/**
 * TaskCard – Wiederverwendbare Aufgaben-Karte
 * 
 * Zeigt eine erkannte Aufgabe mit Priorität, Gewerk und Dauer.
 * Enthält optionalen "Übernehmen"-Button für den Bestätigungs-Flow.
 * Nutzbar für: Foto-Analyse, Matterport, IFC, AI Site Assistant
 */

import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, TextInput } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

export interface TaskData {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  trade: string;
  estimatedDuration: string;
  deadline: string | null;
}

interface TaskCardProps {
  task: TaskData;
  onAdopt?: (task: TaskData) => void;
  onDismiss?: (task: TaskData) => void;
  isAdopted?: boolean;
  isDismissed?: boolean;
  showActions?: boolean;
}

export function TaskCard({
  task,
  onAdopt,
  onDismiss,
  isAdopted = false,
  isDismissed = false,
  showActions = true,
}: TaskCardProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [checkOpacity] = useState(() => new Animated.Value(0));
  const prevAdopted = useRef(isAdopted);

  // Inline edit mode: adjust AI-detected task fields before adopting.
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description);
  const [editPriority, setEditPriority] = useState<TaskData["priority"]>(task.priority);
  const [editDuration, setEditDuration] = useState(task.estimatedDuration);
  const effectiveTask: TaskData = {
    ...task,
    title: editTitle.trim() || task.title,
    description: editDescription,
    priority: editPriority,
    estimatedDuration: editDuration.trim() || task.estimatedDuration,
  };

  useEffect(() => {
    if (isAdopted && !prevAdopted.current) {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.03, duration: 120, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]),
        Animated.timing(checkOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
    prevAdopted.current = isAdopted;
  }, [isAdopted]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return colors.error;
      case "medium": return colors.warning;
      case "low": return colors.success;
      default: return colors.muted;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "high": return t('TaskCard_priority_high' as any);
      case "medium": return t('TaskCard_priority_medium' as any);
      case "low": return t('TaskCard_priority_low' as any);
      default: return priority;
    }
  };

  const priorityColor = getPriorityColor(editPriority);

  return (
    <Animated.View style={[
      styles.card,
      { 
        backgroundColor: colors.surface, 
        borderColor: isAdopted ? colors.success + "50" : isDismissed ? colors.muted + "30" : colors.border,
        opacity: isDismissed ? 0.5 : 1,
        transform: [{ scale: scaleAnim }],
      },
    ]}>
      <View style={styles.header}>
        <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
        <Text style={[styles.title, { color: isEditing ? colors.muted : colors.foreground }]} numberOfLines={isEditing ? 1 : 2}>
          {isEditing ? t('edit') : editTitle}
        </Text>
        {isAdopted && (
          <Animated.View style={[styles.adoptedBadge, { backgroundColor: colors.success + "20", opacity: checkOpacity }]}>
            <MaterialIcons name="check-circle" size={14} color={colors.success} />
          </Animated.View>
        )}
      </View>

      {isEditing ? (
        <>
          <TextInput
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder={task.title}
            placeholderTextColor={colors.muted}
            style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <TextInput
            value={editDescription}
            onChangeText={setEditDescription}
            placeholder={task.description}
            placeholderTextColor={colors.muted}
            multiline
            style={[styles.editInput, styles.editInputMultiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <TextInput
            value={editDuration}
            onChangeText={setEditDuration}
            placeholder={task.estimatedDuration}
            placeholderTextColor={colors.muted}
            style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <View style={styles.priorityRow}>
            {(["high", "medium", "low"] as const).map((p) => (
              <Pressable
                key={p}
                onPress={() => setEditPriority(p)}
                style={[styles.priorityChip, { borderColor: editPriority === p ? getPriorityColor(p) : colors.border, backgroundColor: editPriority === p ? getPriorityColor(p) + "20" : "transparent" }]}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: editPriority === p ? getPriorityColor(p) : colors.muted }}>
                  {getPriorityLabel(p)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.description, { color: colors.muted }]}>{editDescription}</Text>

          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <MaterialIcons name="build" size={12} color={colors.muted} />
              <Text style={[styles.metaText, { color: colors.muted }]}>{task.trade}</Text>
            </View>
            <View style={styles.metaItem}>
              <MaterialIcons name="schedule" size={12} color={colors.muted} />
              <Text style={[styles.metaText, { color: colors.muted }]}>{editDuration}</Text>
            </View>
            <View style={[styles.priorityBadge, { backgroundColor: priorityColor + "15" }]}>
              <Text style={[styles.priorityText, { color: priorityColor }]}>
                {getPriorityLabel(editPriority)}
              </Text>
            </View>
          </View>
        </>
      )}

      {task.deadline && (
        <View style={styles.deadlineRow}>
          <MaterialIcons name="event" size={12} color={colors.warning} />
          <Text style={[styles.deadlineText, { color: colors.warning }]}>
            {t('TaskCard_due' as any)}{task.deadline}
          </Text>
        </View>
      )}

      {showActions && !isAdopted && !isDismissed && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onAdopt?.(effectiveTask)}
            style={({ pressed }) => [
              styles.adoptButton,
              { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <MaterialIcons name="playlist-add" size={16} color="#FFF" />
            <Text style={styles.adoptButtonText}>{t('TaskCard_add_as_task' as any)}</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsEditing((e) => !e)}
            accessibilityLabel={isEditing ? t('done') : t('edit')}
            style={({ pressed }) => [
              styles.dismissButton,
              { borderColor: isEditing ? colors.primary : colors.border, backgroundColor: isEditing ? colors.primary + "12" : "transparent", transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <MaterialIcons name={isEditing ? "check" : "edit"} size={16} color={isEditing ? colors.primary : colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => onDismiss?.(task)}
            style={({ pressed }) => [
              styles.dismissButton,
              { borderColor: colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <MaterialIcons name="close" size={16} color={colors.muted} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  adoptedBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    paddingLeft: 18,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  editInputMultiline: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  priorityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  priorityChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  meta: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 8,
    paddingLeft: 18,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 18,
    marginBottom: 10,
  },
  deadlineText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 4,
  },
  adoptButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  adoptButtonText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  dismissButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
