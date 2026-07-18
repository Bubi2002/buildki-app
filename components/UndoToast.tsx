/**
 * UndoToast – A floating toast/snackbar with "Rückgängig" (Undo) button.
 * Auto-dismisses after 4 seconds unless the user taps Undo.
 */

import { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Platform } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export interface UndoToastProps {
  visible: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

export function UndoToast({ visible, message, onUndo, onDismiss, duration = 4000 }: UndoToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      // Auto-dismiss after duration
      timerRef.current = setTimeout(() => {
        dismiss();
      }, duration);
    } else {
      opacity.setValue(0);
      translateY.setValue(20);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 20, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      onDismiss();
    });
  };

  const handleUndo = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onUndo();
    dismiss();
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.content}>
        <MaterialIcons name="check-circle" size={18} color="#4ADE80" />
        <Text style={styles.message} numberOfLines={1}>
          {message}
        </Text>
      </View>
      <Pressable
        onPress={handleUndo}
        style={({ pressed }) => [
          styles.undoButton,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={styles.undoText}>Rückgängig</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 24 : 100,
    left: 20,
    right: 20,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  message: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  undoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#334155",
    marginLeft: 12,
  },
  undoText: {
    color: "#60A5FA",
    fontSize: 13,
    fontWeight: "700",
  },
});
