import { Modal, View, ActivityIndicator, Text, StyleSheet } from "react-native";

/**
 * A lightweight full-screen busy overlay for slow async actions (PDF export,
 * sharing, generation …). Blocks input so the user can't fire the action
 * twice, and gives clear "something is happening" feedback.
 */
export function BusyOverlay({ visible, label }: { visible: boolean; label?: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <ActivityIndicator size="large" color="#5DADE2" />
          {label ? <Text style={styles.label}>{label}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  box: {
    minWidth: 180,
    paddingHorizontal: 28,
    paddingVertical: 26,
    borderRadius: 16,
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    alignItems: "center",
    gap: 14,
  },
  label: { color: "#F0F4F8", fontSize: 15, fontWeight: "600", textAlign: "center" },
});
