/**
 * SwipeableRow – wraps a list row so swiping left reveals a red delete action.
 * Replaces the hard-to-discover "long-press to delete" pattern app-wide.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export function SwipeableRow({
  children,
  onDelete,
  deleteLabel,
}: {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel: string;
}) {
  return (
    <Swipeable
      renderRightActions={() => (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.85 : 1 }]}
        >
          <MaterialIcons name="delete" size={24} color="#FFFFFF" />
          <Text style={styles.label}>{deleteLabel}</Text>
        </Pressable>
      )}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    width: 88,
    gap: 4,
  },
  label: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});
