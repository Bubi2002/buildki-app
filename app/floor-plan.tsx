import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Platform, Image as RNImage } from "react-native";
import {
  FloorPlan,
  PlanPin,
  getFloorPlans,
  saveFloorPlan,
  deleteFloorPlan,
  getPlanPins,
  savePlanPin,
  deletePlanPin,
} from "@/lib/floor-plan-store";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function FloorPlanScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = params.projectId || "";

  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<FloorPlan | null>(null);
  const [pins, setPins] = useState<PlanPin[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pinLabel, setPinLabel] = useState("");
  const [pinType, setPinType] = useState<PlanPin["type"]>("note");
  const [pinDescription, setPinDescription] = useState("");
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });

  useFocusEffect(
    useCallback(() => {
      loadPlans();
    }, [projectId])
  );

  const loadPlans = async () => {
    const loaded = await getFloorPlans(projectId);
    setPlans(loaded);
    if (loaded.length > 0 && !selectedPlan) {
      selectPlan(loaded[0]);
    }
  };

  const selectPlan = async (plan: FloorPlan) => {
    setSelectedPlan(plan);
    const loadedPins = await getPlanPins(plan.id);
    setPins(loadedPins);
    setImageSize({ width: plan.width, height: plan.height });
  };

  const addPlan = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const newPlan: FloorPlan = {
        id: `plan-${Date.now()}`,
        projectId,
        name: `Plan ${plans.length + 1}`,
        imageUri: asset.uri,
        width: asset.width || 1000,
        height: asset.height || 1000,
        createdAt: new Date().toISOString(),
      };

      // Ask for name
      Alert.prompt
        ? Alert.prompt("Plan benennen", "Name für diesen Grundriss:", [
            { text: "Abbrechen", style: "cancel" },
            {
              text: "Speichern",
              onPress: async (name?: string) => {
                newPlan.name = name || newPlan.name;
                await saveFloorPlan(newPlan);
                await loadPlans();
                selectPlan(newPlan);
              },
            },
          ], "plain-text", `Plan ${plans.length + 1}`)
        : (async () => {
            newPlan.name = `Plan ${plans.length + 1}`;
            await saveFloorPlan(newPlan);
            await loadPlans();
            selectPlan(newPlan);
          })();
    }
  };

  const handlePlanPress = (event: any) => {
    if (!selectedPlan) return;
    const { locationX, locationY } = event.nativeEvent;
    const containerWidth = SCREEN_WIDTH - 32;
    const aspectRatio = imageSize.width / imageSize.height;
    const containerHeight = containerWidth / aspectRatio;

    const x = locationX / containerWidth;
    const y = locationY / containerHeight;

    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      setPendingPin({ x, y });
      setShowPinModal(true);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const savePin = async () => {
    if (!pendingPin || !selectedPlan || !pinLabel.trim()) return;

    const pinColors: Record<PlanPin["type"], string> = {
      photo: "#1E88E5",
      defect: "#E53935",
      note: "#FB8C00",
      protocol: "#43A047",
    };

    const newPin: PlanPin = {
      id: `pin-${Date.now()}`,
      planId: selectedPlan.id,
      projectId,
      x: pendingPin.x,
      y: pendingPin.y,
      type: pinType,
      label: pinLabel.trim(),
      description: pinDescription.trim() || undefined,
      color: pinColors[pinType],
      createdAt: new Date().toISOString(),
    };

    await savePlanPin(newPin);
    setPins([...pins, newPin]);
    setShowPinModal(false);
    setPendingPin(null);
    setPinLabel("");
    setPinDescription("");
    setPinType("note");
  };

  const removePin = async (pinId: string) => {
    Alert.alert("Pin löschen", "Diesen Pin wirklich entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          await deletePlanPin(pinId);
          setPins(pins.filter((p) => p.id !== pinId));
        },
      },
    ]);
  };

  const removePlan = async (planId: string) => {
    Alert.alert("Plan löschen", "Diesen Grundriss und alle Pins wirklich löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          await deleteFloorPlan(planId);
          if (selectedPlan?.id === planId) {
            setSelectedPlan(null);
            setPins([]);
          }
          await loadPlans();
        },
      },
    ]);
  };

  const containerWidth = SCREEN_WIDTH - 32;
  const aspectRatio = imageSize.width / imageSize.height;
  const containerHeight = containerWidth / aspectRatio;

  const pinTypeOptions: Array<{ type: PlanPin["type"]; label: string; icon: string }> = [
    { type: "note", label: "Notiz", icon: "sticky-note-2" },
    { type: "defect", label: "Mangel", icon: "warning" },
    { type: "photo", label: "Foto", icon: "photo-camera" },
    { type: "protocol", label: "Protokoll", icon: "description" },
  ];

  return (
    <ScreenContainer className="p-4">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Grundrisse</Text>
        <Pressable onPress={addPlan} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="add" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Plan Tabs */}
      {plans.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.planTabs}>
          {plans.map((plan) => (
            <Pressable
              key={plan.id}
              onPress={() => selectPlan(plan)}
              onLongPress={() => removePlan(plan.id)}
              style={({ pressed }) => [
                styles.planTab,
                { borderColor: selectedPlan?.id === plan.id ? colors.primary : colors.border },
                selectedPlan?.id === plan.id && { backgroundColor: colors.primary + "15" },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.planTabText, { color: selectedPlan?.id === plan.id ? colors.primary : colors.muted }]}>
                {plan.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Plan View with Pins */}
      {selectedPlan ? (
        <View style={styles.planContainer}>
          <Pressable onPress={handlePlanPress}>
            <RNImage
              source={{ uri: selectedPlan.imageUri }}
              style={{ width: containerWidth, height: containerHeight }}
              resizeMode="contain"
            />
            {/* Render Pins */}
            {pins.map((pin) => (
              <Pressable
                key={pin.id}
                onLongPress={() => removePin(pin.id)}
                style={[
                  styles.pin,
                  {
                    left: pin.x * containerWidth - 12,
                    top: pin.y * containerHeight - 24,
                    backgroundColor: pin.color,
                  },
                ]}
              >
                <MaterialIcons
                  name={
                    pin.type === "defect" ? "warning" :
                    pin.type === "photo" ? "photo-camera" :
                    pin.type === "protocol" ? "description" : "place"
                  }
                  size={16}
                  color="#fff"
                />
              </Pressable>
            ))}
            {/* Pending Pin */}
            {pendingPin && (
              <View
                style={[
                  styles.pin,
                  styles.pendingPin,
                  {
                    left: pendingPin.x * containerWidth - 12,
                    top: pendingPin.y * containerHeight - 24,
                  },
                ]}
              >
                <MaterialIcons name="add-location" size={16} color="#fff" />
              </View>
            )}
          </Pressable>

          {/* Pin Legend */}
          <View style={[styles.legend, { borderColor: colors.border }]}>
            <Text style={[styles.legendTitle, { color: colors.muted }]}>
              {pins.length} Markierung{pins.length !== 1 ? "en" : ""} – Tippen zum Hinzufügen
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="map" size={64} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Noch keine Grundrisse
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            Lade einen Grundriss oder Lageplan hoch um Markierungen zu setzen
          </Text>
          <Pressable
            onPress={addPlan}
            style={({ pressed }) => [styles.uploadBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="upload-file" size={20} color="#fff" />
            <Text style={styles.uploadBtnText}>Grundriss hochladen</Text>
          </Pressable>
        </View>
      )}

      {/* Pin Creation Modal */}
      <Modal visible={showPinModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Markierung hinzufügen</Text>

            {/* Pin Type Selection */}
            <View style={styles.typeRow}>
              {pinTypeOptions.map((opt) => (
                <Pressable
                  key={opt.type}
                  onPress={() => setPinType(opt.type)}
                  style={[
                    styles.typeBtn,
                    { borderColor: pinType === opt.type ? colors.primary : colors.border },
                    pinType === opt.type && { backgroundColor: colors.primary + "15" },
                  ]}
                >
                  <MaterialIcons
                    name={opt.icon as any}
                    size={20}
                    color={pinType === opt.type ? colors.primary : colors.muted}
                  />
                  <Text style={[styles.typeBtnText, { color: pinType === opt.type ? colors.primary : colors.muted }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Bezeichnung"
              placeholderTextColor={colors.muted}
              value={pinLabel}
              onChangeText={setPinLabel}
            />

            <TextInput
              style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Beschreibung (optional)"
              placeholderTextColor={colors.muted}
              value={pinDescription}
              onChangeText={setPinDescription}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setShowPinModal(false); setPendingPin(null); setPinLabel(""); setPinDescription(""); }}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={savePin}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.saveBtnText}>Speichern</Text>
              </Pressable>
            </View>
          </View>
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
  planTabs: { marginBottom: 12, maxHeight: 40 },
  planTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  planTabText: { fontSize: 14, fontWeight: "500" },
  planContainer: { flex: 1 },
  pin: { position: "absolute", width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  pendingPin: { backgroundColor: "#9E9E9E", opacity: 0.8 },
  legend: { marginTop: 12, paddingTop: 8, borderTopWidth: 1 },
  legendTitle: { fontSize: 13, textAlign: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 18, fontWeight: "600" },
  emptySubtext: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  uploadBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  typeBtn: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  typeBtnText: { fontSize: 11, fontWeight: "500" },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  cancelBtnText: { fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
