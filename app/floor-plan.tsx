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
  Image as RNImage,
  Platform,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
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
import { importPlanFromCloud } from "@/lib/cloud-import-service";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const PIN_COLORS: Record<PlanPin["type"], string> = {
  photo: "#2196F3",
  defect: "#F44336",
  note: "#FF9800",
  protocol: "#4CAF50",
  chapter: "#9C27B0",
};

const PIN_ICONS: Record<PlanPin["type"], string> = {
  photo: "photo-camera",
  defect: "report-problem",
  note: "edit-note",
  protocol: "description",
  chapter: "bookmark",
};

export default function FloorPlanScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = params.projectId || "";

  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<FloorPlan | null>(null);
  const [pins, setPins] = useState<PlanPin[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showPlanNameModal, setShowPlanNameModal] = useState(false);
  const [showPinDetail, setShowPinDetail] = useState<PlanPin | null>(null);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pinLabel, setPinLabel] = useState("");
  const [pinType, setPinType] = useState<PlanPin["type"]>("note");
  const [pinDescription, setPinDescription] = useState("");
  const [newPlanName, setNewPlanName] = useState("");
  const [pendingPlanAsset, setPendingPlanAsset] = useState<any>(null);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [viewMode, setViewMode] = useState<"plan" | "list">("plan");
  const [filterType, setFilterType] = useState<PlanPin["type"] | "all">("all");

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
    // Show options: Galerie or Cloud
    Alert.alert("Plan hinzufügen", "Woher möchtest du den Plan laden?", [
      {
        text: "Fotogalerie",
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.9,
          });
          if (!result.canceled && result.assets[0]) {
            setPendingPlanAsset(result.assets[0]);
            setNewPlanName(`Plan ${plans.length + 1}`);
            setShowPlanNameModal(true);
          }
        },
      },
      {
        text: "Cloud (Dropbox, Drive...)",
        onPress: async () => {
          const file = await importPlanFromCloud();
          if (file) {
            setPendingPlanAsset({ uri: file.uri, width: 1000, height: 1000 });
            setNewPlanName(file.name.replace(/\.[^/.]+$/, ""));
            setShowPlanNameModal(true);
            // Try to get actual dimensions
            RNImage.getSize(file.uri, (w, h) => {
              setPendingPlanAsset((prev: any) => prev ? { ...prev, width: w, height: h } : prev);
            }, () => {});
          }
        },
      },
      { text: "Abbrechen", style: "cancel" },
    ]);
  };

  const savePlanWithName = async () => {
    if (!pendingPlanAsset) return;
    const asset = pendingPlanAsset;
    const newPlan: FloorPlan = {
      id: `plan-${Date.now()}`,
      projectId,
      name: newPlanName.trim() || `Plan ${plans.length + 1}`,
      imageUri: asset.uri,
      width: asset.width || 1000,
      height: asset.height || 1000,
      createdAt: new Date().toISOString(),
    };
    await saveFloorPlan(newPlan);
    setShowPlanNameModal(false);
    setPendingPlanAsset(null);
    setNewPlanName("");
    await loadPlans();
    selectPlan(newPlan);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handlePlanPress = (event: any) => {
    if (!selectedPlan) return;
    const { locationX, locationY } = event.nativeEvent;
    const cw = SCREEN_WIDTH - 32;
    const ar = imageSize.width / imageSize.height;
    const ch = Math.min(cw / ar, SCREEN_HEIGHT * 0.5);

    const x = locationX / cw;
    const y = locationY / ch;

    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      setPendingPin({ x, y });
      setPinLabel("");
      setPinDescription("");
      setPinType("note");
      setShowPinModal(true);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const savePin = async () => {
    if (!pendingPin || !selectedPlan || !pinLabel.trim()) {
      Alert.alert("Hinweis", "Bitte gib eine Bezeichnung ein.");
      return;
    }

    const newPin: PlanPin = {
      id: `pin-${Date.now()}`,
      planId: selectedPlan.id,
      projectId,
      x: pendingPin.x,
      y: pendingPin.y,
      type: pinType,
      label: pinLabel.trim(),
      description: pinDescription.trim() || undefined,
      color: PIN_COLORS[pinType],
      createdAt: new Date().toISOString(),
    };

    await savePlanPin(newPin);
    setPins([...pins, newPin]);
    setShowPinModal(false);
    setPendingPin(null);
    setPinLabel("");
    setPinDescription("");
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removePin = async (pinId: string) => {
    Alert.alert("Markierung löschen", "Diese Markierung wirklich entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          await deletePlanPin(pinId);
          setPins(pins.filter((p) => p.id !== pinId));
          setShowPinDetail(null);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const removePlan = async (planId: string) => {
    Alert.alert("Plan löschen", "Diesen Grundriss und alle zugehörigen Markierungen löschen?", [
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
  const containerHeight = Math.min(containerWidth / aspectRatio, SCREEN_HEIGHT * 0.5);

  const filteredPins = filterType === "all" ? pins : pins.filter((p) => p.type === filterType);

  const pinTypeOptions: Array<{ type: PlanPin["type"]; label: string; icon: string; color: string }> = [
    { type: "chapter", label: "Kapitel", icon: "bookmark", color: PIN_COLORS.chapter },
    { type: "note", label: "Notiz", icon: "edit-note", color: PIN_COLORS.note },
    { type: "defect", label: "Mangel", icon: "report-problem", color: PIN_COLORS.defect },
    { type: "photo", label: "Foto", icon: "photo-camera", color: PIN_COLORS.photo },
    { type: "protocol", label: "Protokoll", icon: "description", color: PIN_COLORS.protocol },
  ];

  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [galleryTitle, setGalleryTitle] = useState("");

  const addPhotoToPin = async (pin: PlanPin) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newPhotos = result.assets.map(a => a.uri);
      const updatedPin: PlanPin = {
        ...pin,
        photos: [...(pin.photos || []), ...newPhotos],
      };
      await savePlanPin(updatedPin);
      setPins(pins.map(p => p.id === pin.id ? updatedPin : p));
      setShowPinDetail(updatedPin);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const viewPinPhotos = (pin: PlanPin) => {
    const photos = pin.photos || (pin.photoUri ? [pin.photoUri] : []);
    if (photos.length === 0) {
      Alert.alert("Keine Fotos", "Diesem Marker sind noch keine Fotos zugeordnet. Tippe auf 'Fotos hinzuf\u00fcgen' um Bilder zu verlinken.");
      return;
    }
    setGalleryPhotos(photos);
    setGalleryTitle(pin.label);
    setShowPhotoGallery(true);
  };

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
          <MaterialIcons name="arrow-back-ios" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Grundrisse</Text>
          {selectedPlan && (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{selectedPlan.name}</Text>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {/* View mode toggle */}
          <Pressable
            onPress={() => setViewMode(viewMode === "plan" ? "list" : "plan")}
            style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name={viewMode === "plan" ? "list" : "map"} size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={addPlan}
            style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="add" size={20} color="#FFF" />
          </Pressable>
        </View>
      </View>

      {/* Plan Tabs */}
      {plans.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.planTabs} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {plans.map((plan) => (
            <Pressable
              key={plan.id}
              onPress={() => selectPlan(plan)}
              onLongPress={() => removePlan(plan.id)}
              style={({ pressed }) => [
                styles.planTab,
                {
                  borderColor: selectedPlan?.id === plan.id ? colors.primary : colors.border,
                  backgroundColor: selectedPlan?.id === plan.id ? colors.primary + "12" : colors.surface,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons name="layers" size={14} color={selectedPlan?.id === plan.id ? colors.primary : colors.muted} />
              <Text style={[styles.planTabText, { color: selectedPlan?.id === plan.id ? colors.primary : colors.foreground }]}>
                {plan.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Filter Bar */}
      {selectedPlan && pins.length > 0 && (
        <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => setFilterType("all")}
            style={[styles.filterChip, { backgroundColor: filterType === "all" ? colors.primary + "15" : "transparent", borderColor: filterType === "all" ? colors.primary : colors.border }]}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: filterType === "all" ? colors.primary : colors.muted }}>
              Alle ({pins.length})
            </Text>
          </Pressable>
          {pinTypeOptions.map((opt) => {
            const count = pins.filter((p) => p.type === opt.type).length;
            if (count === 0) return null;
            return (
              <Pressable
                key={opt.type}
                onPress={() => setFilterType(filterType === opt.type ? "all" : opt.type)}
                style={[styles.filterChip, { backgroundColor: filterType === opt.type ? opt.color + "15" : "transparent", borderColor: filterType === opt.type ? opt.color : colors.border }]}
              >
                <MaterialIcons name={opt.icon as any} size={12} color={filterType === opt.type ? opt.color : colors.muted} />
                <Text style={{ fontSize: 11, fontWeight: "500", color: filterType === opt.type ? opt.color : colors.muted }}>
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Main Content */}
      {selectedPlan ? (
        viewMode === "plan" ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {/* Plan Image with Pins */}
            <View style={[styles.planImageContainer, { borderColor: colors.border }]}>
              <Pressable onPress={handlePlanPress}>
                <RNImage
                  source={{ uri: selectedPlan.imageUri }}
                  style={{ width: containerWidth, height: containerHeight }}
                  resizeMode="stretch"
                />
                {/* Render Pins */}
                {filteredPins.map((pin) => (
                  <Pressable
                    key={pin.id}
                    onPress={() => setShowPinDetail(pin)}
                    onLongPress={() => removePin(pin.id)}
                    style={[
                      styles.pin,
                      {
                        left: pin.x * containerWidth - 14,
                        top: pin.y * containerHeight - 32,
                      },
                    ]}
                  >
                    {/* Pin marker SVG-style */}
                    <View style={[styles.pinMarker, { backgroundColor: pin.color }]}>
                      <MaterialIcons name={PIN_ICONS[pin.type] as any} size={14} color="#FFF" />
                    </View>
                    <View style={[styles.pinTail, { borderTopColor: pin.color }]} />
                  </Pressable>
                ))}
                {/* Pending Pin */}
                {pendingPin && (
                  <View
                    style={[
                      styles.pin,
                      {
                        left: pendingPin.x * containerWidth - 14,
                        top: pendingPin.y * containerHeight - 32,
                      },
                    ]}
                  >
                    <View style={[styles.pinMarker, { backgroundColor: "#9E9E9E" }]}>
                      <MaterialIcons name="add" size={14} color="#FFF" />
                    </View>
                    <View style={[styles.pinTail, { borderTopColor: "#9E9E9E" }]} />
                  </View>
                )}
              </Pressable>
            </View>

            {/* Instruction */}
            <View style={[styles.instructionBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="touch-app" size={18} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 8, flex: 1 }}>
                Tippe auf den Plan um eine Markierung zu setzen. Tippe auf einen Pin für Details.
              </Text>
            </View>

            {/* Pin Summary */}
            {filteredPins.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
                  Markierungen ({filteredPins.length})
                </Text>
                {filteredPins.slice(0, 5).map((pin) => (
                  <Pressable
                    key={pin.id}
                    onPress={() => setShowPinDetail(pin)}
                    style={({ pressed }) => [styles.pinListItem, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={[styles.pinListDot, { backgroundColor: pin.color }]}>
                      <MaterialIcons name={PIN_ICONS[pin.type] as any} size={12} color="#FFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{pin.label}</Text>
                      {pin.description && (
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{pin.description}</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 10, color: colors.muted }}>
                      {new Date(pin.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        ) : (
          /* List View */
          <FlatList
            data={filteredPins}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <MaterialIcons name="pin-drop" size={40} color={colors.muted} />
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}>Keine Markierungen</Text>
              </View>
            }
            renderItem={({ item: pin }) => (
              <Pressable
                onPress={() => setShowPinDetail(pin)}
                onLongPress={() => removePin(pin.id)}
                style={({ pressed }) => [styles.pinListItemFull, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={[styles.pinListDotLarge, { backgroundColor: pin.color }]}>
                  <MaterialIcons name={PIN_ICONS[pin.type] as any} size={18} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{pin.label}</Text>
                  {pin.description && (
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }} numberOfLines={2}>{pin.description}</Text>
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <Text style={{ fontSize: 10, color: colors.muted, backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      {pinTypeOptions.find((o) => o.type === pin.type)?.label}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>
                      {new Date(pin.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            )}
          />
        )
      ) : (
        /* Empty State */
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "10" }]}>
            <MaterialIcons name="map" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Grundrisse & Pläne</Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            Lade Grundrisse, Lagepläne oder technische Zeichnungen hoch und markiere Stellen direkt auf dem Plan.
          </Text>
          <Pressable
            onPress={addPlan}
            style={({ pressed }) => [styles.uploadBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="cloud-upload" size={20} color="#FFF" />
            <Text style={styles.uploadBtnText}>Plan hochladen</Text>
          </Pressable>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 12 }}>
            Unterstützt: JPG, PNG, PDF-Scans
          </Text>
        </View>
      )}

      {/* Pin Creation Modal (Bottom Sheet Style) */}
      <Modal visible={showPinModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowPinModal(false); setPendingPin(null); }}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%", justifyContent: "flex-end" }}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Neue Markierung</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>
              Wähle einen Typ und gib eine Bezeichnung ein
            </Text>

            {/* Pin Type Selection */}
            <View style={styles.typeRow}>
              {pinTypeOptions.map((opt) => (
                <Pressable
                  key={opt.type}
                  onPress={() => setPinType(opt.type)}
                  style={({ pressed }) => [
                    styles.typeBtn,
                    {
                      borderColor: pinType === opt.type ? opt.color : colors.border,
                      backgroundColor: pinType === opt.type ? opt.color + "12" : colors.surface,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.typeBtnIcon, { backgroundColor: pinType === opt.type ? opt.color : colors.muted + "30" }]}>
                    <MaterialIcons name={opt.icon as any} size={18} color={pinType === opt.type ? "#FFF" : colors.muted} />
                  </View>
                  <Text style={[styles.typeBtnText, { color: pinType === opt.type ? opt.color : colors.muted }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Bezeichnung *"
              placeholderTextColor={colors.muted}
              value={pinLabel}
              onChangeText={setPinLabel}
              autoFocus={false}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <TextInput
              style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Beschreibung (optional)"
              placeholderTextColor={colors.muted}
              value={pinDescription}
              onChangeText={setPinDescription}
              multiline
              numberOfLines={3}
              blurOnSubmit={true}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { Keyboard.dismiss(); setShowPinModal(false); setPendingPin(null); }}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={() => { Keyboard.dismiss(); savePin(); }}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: PIN_COLORS[pinType] }, pressed && { opacity: 0.85 }]}
              >
                <MaterialIcons name="check" size={18} color="#FFF" />
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF", marginLeft: 6 }}>Speichern</Text>
              </Pressable>
            </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Plan Name Modal */}
      <Modal visible={showPlanNameModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { justifyContent: "center" }]}>
          <View style={[styles.nameModalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Plan benennen</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="z.B. EG Grundriss, OG1 Elektro..."
              placeholderTextColor={colors.muted}
              value={newPlanName}
              onChangeText={setNewPlanName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={savePlanWithName}
            />
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setShowPlanNameModal(false); setPendingPlanAsset(null); }}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={savePlanWithName}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF" }}>Speichern</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pin Detail Modal */}
      <Modal visible={!!showPinDetail} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowPinDetail(null)}>
          <Pressable style={[styles.detailModalContent, { backgroundColor: colors.background }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            {showPinDetail && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <View style={[styles.detailIcon, { backgroundColor: showPinDetail.color }]}>
                    <MaterialIcons name={PIN_ICONS[showPinDetail.type] as any} size={22} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{showPinDetail.label}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      {pinTypeOptions.find((o) => o.type === showPinDetail.type)?.label} \u2022 {new Date(showPinDetail.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
                    </Text>
                  </View>
                </View>
                {showPinDetail.description && (
                  <View style={[styles.detailDescBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20 }}>{showPinDetail.description}</Text>
                  </View>
                )}

                {/* Photos linked to this pin */}
                {((showPinDetail.photos && showPinDetail.photos.length > 0) || showPinDetail.photoUri) && (
                  <View style={{ marginBottom: 12 }}>
                    <Pressable
                      onPress={() => viewPinPhotos(showPinDetail)}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 0, backgroundColor: colors.primary + "10", borderWidth: 1, borderColor: colors.primary + "30", opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name="photo-library" size={20} color={colors.primary} />
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary, flex: 1 }}>
                        {(showPinDetail.photos?.length || 1)} Foto{(showPinDetail.photos?.length || 1) !== 1 ? "s" : ""} anzeigen
                      </Text>
                      <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
                    </Pressable>
                    {/* Photo thumbnails */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {(showPinDetail.photos || (showPinDetail.photoUri ? [showPinDetail.photoUri] : [])).slice(0, 5).map((uri, idx) => (
                        <Pressable key={idx} onPress={() => viewPinPhotos(showPinDetail)}>
                          <RNImage source={{ uri }} style={{ width: 60, height: 60, borderRadius: 0, marginRight: 6 }} />
                        </Pressable>
                      ))}
                      {(showPinDetail.photos?.length || 0) > 5 && (
                        <View style={{ width: 60, height: 60, borderRadius: 0, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>+{(showPinDetail.photos?.length || 0) - 5}</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}

                {/* Add photos button */}
                <Pressable
                  onPress={() => addPhotoToPin(showPinDetail)}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 12, opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name="add-a-photo" size={18} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>Fotos hinzuf\u00fcgen</Text>
                </Pressable>

                <View style={[styles.detailCoords, { backgroundColor: colors.surface }]}>
                  <MaterialIcons name="my-location" size={14} color={colors.muted} />
                  <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>
                    Position: {(showPinDetail.x * 100).toFixed(1)}% / {(showPinDetail.y * 100).toFixed(1)}%
                  </Text>
                </View>
                <Pressable
                  onPress={() => removePin(showPinDetail.id)}
                  style={({ pressed }) => [styles.deleteBtn, { borderColor: colors.error }, pressed && { opacity: 0.7 }]}
                >
                  <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.error, marginLeft: 8 }}>Markierung l\u00f6schen</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Photo Gallery Modal - shows photos linked to a pin */}
      <Modal visible={showPhotoGallery} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 }}>
            <Pressable onPress={() => setShowPhotoGallery(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.6 : 1 }]}>
              <MaterialIcons name="close" size={24} color="#FFF" />
            </Pressable>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: "#FFF", textAlign: "center" }}>{galleryTitle}</Text>
            <View style={{ width: 40 }} />
          </View>
          <FlatList
            data={galleryPhotos}
            keyExtractor={(_, idx) => `photo-${idx}`}
            numColumns={2}
            contentContainerStyle={{ padding: 8 }}
            renderItem={({ item: uri, index }) => (
              <View style={{ flex: 1, padding: 4 }}>
                <RNImage source={{ uri }} style={{ width: "100%", aspectRatio: 1, borderRadius: 0 }} resizeMode="cover" />
                <Text style={{ fontSize: 10, color: "#AAA", textAlign: "center", marginTop: 4 }}>Foto {index + 1}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 80 }}>
                <MaterialIcons name="photo-library" size={48} color="#666" />
                <Text style={{ fontSize: 14, color: "#888", marginTop: 12 }}>Keine Fotos vorhanden</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6, marginRight: 8 },
  title: { fontSize: 20, fontWeight: "800" },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  planTabs: { maxHeight: 44, borderBottomWidth: 0, marginTop: 8 },
  planTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1,
    marginRight: 8,
  },
  planTabText: { fontSize: 13, fontWeight: "600" },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 0,
    borderWidth: 1,
  },
  planImageContainer: {
    borderRadius: 0,
    overflow: "hidden",
    borderWidth: 1,
  },
  pin: {
    position: "absolute",
    alignItems: "center",
    zIndex: 10,
  },
  pinMarker: {
    width: 28,
    height: 28,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  instructionBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    marginTop: 12,
  },
  pinListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 6,
  },
  pinListDot: {
    width: 24,
    height: 24,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pinListItemFull: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 8,
  },
  pinListDotLarge: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  emptySubtext: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 0,
  },
  uploadBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  typeBtn: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 0,
    borderWidth: 1.5,
  },
  typeBtnIcon: {
    width: 32,
    height: 32,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBtnText: { fontSize: 11, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 0, padding: 14, fontSize: 15, marginBottom: 12 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 0, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  saveBtn: { flex: 1.5, paddingVertical: 14, borderRadius: 0, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  nameModalContent: {
    marginHorizontal: 24,
    borderRadius: 0,
    padding: 24,
  },
  detailModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  detailIcon: {
    width: 44,
    height: 44,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  detailDescBox: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 12,
  },
  detailCoords: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 0,
    marginBottom: 16,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 0,
    borderWidth: 1,
  },
});
