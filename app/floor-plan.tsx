import { useState, useCallback, useEffect, useRef } from "react";
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
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  ActivityIndicator,
  InteractionManager,
} from "react-native";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { FullscreenPhotoViewer } from "@/components/fullscreen-photo-viewer";
import { ZoomableCanvas } from "@/components/zoomable-canvas";
import { PhotoAnnotator, type Annotation } from "@/components/photo-annotator";
import { PdfRasterizer, type RasterResult } from "@/components/pdf-rasterizer";
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
import { decodeUnicodeEscapes } from "@/lib/display-text";
import { persistFloorPlanMedia } from "@/lib/floor-plan-media";
import {
  linkPlanPinToProtocol,
  parseProjectProtocolReferences,
  updatePlanPinText,
  type FloorPlanProtocolReference,
} from "@/lib/floor-plan-pin-actions";
import { useTranslation } from "@/lib/language-provider";
import type { Point } from "@/lib/zoom-transform";

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
  const { t } = useTranslation();
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
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [planInteractionActive, setPlanInteractionActive] = useState(false);
  const [zoomResetKey, setZoomResetKey] = useState(0);
  const [drawingPlan, setDrawingPlan] = useState(false);
  const [pdfToConvert, setPdfToConvert] = useState<string | null>(null);
  const [pdfConvertName, setPdfConvertName] = useState("");
  const [photoViewer, setPhotoViewer] = useState<{
    photos: string[];
    title: string;
    initialIndex: number;
  } | null>(null);
  const [editingPin, setEditingPin] = useState<PlanPin | null>(null);
  const [editPinLabel, setEditPinLabel] = useState("");
  const [editPinDescription, setEditPinDescription] = useState("");
  const [protocolPickerPin, setProtocolPickerPin] = useState<PlanPin | null>(null);
  const [protocolOptions, setProtocolOptions] = useState<FloorPlanProtocolReference[]>([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);
  const mountedRef = useRef(true);
  const plansLoadRequestRef = useRef(0);
  const loadRequestRef = useRef(0);
  const selectedPlanRef = useRef<FloorPlan | null>(null);

  useEffect(() => {
    selectedPlanRef.current = selectedPlan;
  }, [selectedPlan]);

  useEffect(() => () => {
    mountedRef.current = false;
    plansLoadRequestRef.current += 1;
    loadRequestRef.current += 1;
  }, []);

  const selectPlan = useCallback(async (plan: FloorPlan) => {
    const requestId = ++loadRequestRef.current;
    setLoadingPlanId(plan.id);
    try {
      const loadedPins = await getPlanPins(plan.id);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      selectedPlanRef.current = plan;
      setSelectedPlan(plan);
      setPins(loadedPins);
      setImageSize({ width: Math.max(1, plan.width), height: Math.max(1, plan.height) });
      setPendingPin(null);
      setZoomResetKey((value) => value + 1);
    } finally {
      if (mountedRef.current && requestId === loadRequestRef.current) setLoadingPlanId(null);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    const requestId = ++plansLoadRequestRef.current;
    const loaded = await getFloorPlans(projectId);
    if (!mountedRef.current || requestId !== plansLoadRequestRef.current) return;
    setPlans(loaded);
    const currentId = selectedPlanRef.current?.id;
    const nextPlan = loaded.find((plan) => plan.id === currentId) || loaded[0];
    if (nextPlan) {
      await selectPlan(nextPlan);
    } else {
      selectedPlanRef.current = null;
      setSelectedPlan(null);
      setPins([]);
    }
  }, [projectId, selectPlan]);

  useEffect(() => {
    mountedRef.current = true;
    void loadPlans();
  }, [loadPlans]);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadPlans();
      return () => {
        plansLoadRequestRef.current += 1;
        loadRequestRef.current += 1;
      };
    }, [loadPlans])
  );

  const addPlan = async () => {
    // Show options: Galerie or Cloud
    Alert.alert(t('alert_plan_hinzufuegen'), t('msg_woher_moechtest_du_den_plan'), [
      {
        text: t('btn_fotogalerie'),
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1,
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
          if (!file) return;
          const isPdf = file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);
          if (isPdf) {
            // PDFs can't be rendered/annotated directly → rasterize to an image first.
            setPdfConvertName(file.name.replace(/\.[^/.]+$/, ""));
            setPdfToConvert(file.uri);
            return;
          }
          setPendingPlanAsset({ uri: file.uri, width: 1000, height: 1000 });
          setNewPlanName(file.name.replace(/\.[^/.]+$/, ""));
          setShowPlanNameModal(true);
          // Try to get actual dimensions
          RNImage.getSize(file.uri, (w, h) => {
            setPendingPlanAsset((prev: any) => prev ? { ...prev, width: w, height: h } : prev);
          }, () => {});
        },
      },
      { text: t('btn_abbrechen'), style: "cancel" },
    ]);
  };

  // Receive the rasterized PDF (now a sharp JPG) and continue the normal flow.
  const handlePdfConverted = (result: RasterResult | null) => {
    const name = pdfConvertName;
    setPdfToConvert(null);
    if (!result) {
      Alert.alert(t('alert_fehler' as any), t('floor_plan_pdf_convert_failed' as any));
      return;
    }
    setPendingPlanAsset({ uri: result.uri, width: result.width, height: result.height });
    setNewPlanName(name || `Plan ${plans.length + 1}`);
    setShowPlanNameModal(true);
  };

  // Bake freehand drawings into the current plan image (pins stay intact).
  const handlePlanDrawSave = async (_annotations: Annotation[], flattenedUri?: string) => {
    setDrawingPlan(false);
    const plan = selectedPlan;
    if (!flattenedUri || !plan) return;
    try {
      const optimized = await persistFloorPlanMedia({
        sourceUri: flattenedUri,
        projectId,
        ownerId: plan.id,
        width: plan.width,
        height: plan.height,
        kind: "plan",
      });
      const updated: FloorPlan = {
        ...plan,
        imageUri: optimized.uri,
        width: optimized.width || plan.width,
        height: optimized.height || plan.height,
      };
      await saveFloorPlan(updated);
      setPlans((current) => current.map((p) => (p.id === updated.id ? updated : p)));
      setSelectedPlan(updated);
      selectedPlanRef.current = updated;
      setZoomResetKey((value) => value + 1);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t('alert_fehler' as any), t('floor_plan_draw_failed' as any));
    }
  };

  const savePlanWithName = async () => {
    if (!pendingPlanAsset) return;
    const asset = pendingPlanAsset;
    const planId = `plan-${Date.now()}`;
    const optimized = await persistFloorPlanMedia({
      sourceUri: asset.uri,
      projectId,
      ownerId: planId,
      width: asset.width,
      height: asset.height,
      kind: "plan",
    });
    const newPlan: FloorPlan = {
      id: planId,
      projectId,
      name: newPlanName.trim() || `Plan ${plans.length + 1}`,
      imageUri: optimized.uri,
      width: optimized.width || asset.width || 1000,
      height: optimized.height || asset.height || 1000,
      createdAt: new Date().toISOString(),
    };
    await saveFloorPlan(newPlan);
    setShowPlanNameModal(false);
    setPendingPlanAsset(null);
    setNewPlanName("");
    setPlans((current) => [...current.filter((plan) => plan.id !== newPlan.id), newPlan]);
    await selectPlan(newPlan);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handlePlanTap = (point: Point) => {
    if (!selectedPlan) return;
    const nearestPin = filteredPins.reduce<{ pin: PlanPin; distance: number } | null>((nearest, pin) => {
      const distance = Math.hypot(pin.x - point.x, pin.y - point.y);
      return !nearest || distance < nearest.distance ? { pin, distance } : nearest;
    }, null);
    if (nearestPin && nearestPin.distance <= 0.045) {
      setShowPinDetail(nearestPin.pin);
      return;
    }
    setPendingPin(point);
    setPinLabel("");
    setPinDescription("");
    setPinType("note");
    setShowPinModal(true);
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const savePin = async () => {
    if (!pendingPin || !selectedPlan || !pinLabel.trim()) {
      Alert.alert(t('hinweis'), t('msg_bitte_gib_eine_bezeichnung_ein'));
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
    setPins((current) => [...current, newPin]);
    setShowPinModal(false);
    setPendingPin(null);
    setPinLabel("");
    setPinDescription("");
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removePin = async (pinId: string) => {
    Alert.alert(t('alert_markierung_loeschen'), t('msg_diese_markierung_wirklich_entfernen'), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_loeschen'),
        style: "destructive",
        onPress: async () => {
          await deletePlanPin(pinId);
          setPins((current) => current.filter((p) => p.id !== pinId));
          setShowPinDetail(null);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const removePlan = async (planId: string) => {
    Alert.alert(t('alert_plan_loeschen'), t('msg_diesen_grundriss_und_alle_zugehoerigen'), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_loeschen'),
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

  const pinTypeOptions: { type: PlanPin["type"]; label: string; icon: string; color: string }[] = [
    { type: "chapter", label: t('floor_plan_typ_kapitel' as any), icon: "bookmark", color: PIN_COLORS.chapter },
    { type: "note", label: t('floor_plan_typ_notiz' as any), icon: "edit-note", color: PIN_COLORS.note },
    { type: "defect", label: t('floor_plan_typ_mangel' as any), icon: "report-problem", color: PIN_COLORS.defect },
    { type: "photo", label: t('floor_plan_typ_foto' as any), icon: "photo-camera", color: PIN_COLORS.photo },
    { type: "protocol", label: t('floor_plan_typ_protokoll' as any), icon: "description", color: PIN_COLORS.protocol },
  ];

  const beginPinEdit = async (pin: PlanPin) => {
    setShowPinDetail(null);
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    setEditPinLabel(decodeUnicodeEscapes(pin.label));
    setEditPinDescription(decodeUnicodeEscapes(pin.description || ""));
    setEditingPin(pin);
  };

  const cancelPinEdit = () => {
    const pin = editingPin;
    Keyboard.dismiss();
    setEditingPin(null);
    if (pin) setShowPinDetail(pin);
  };

  const saveEditedPin = async () => {
    if (!editingPin || !editPinLabel.trim()) {
      Alert.alert(t('hinweis'), t('msg_bitte_gib_eine_bezeichnung_ein'));
      return;
    }

    const updatedPin = updatePlanPinText(editingPin, editPinLabel, editPinDescription);
    await savePlanPin(updatedPin);
    setPins((current) => current.map((pin) => pin.id === updatedPin.id ? updatedPin : pin));
    Keyboard.dismiss();
    setEditingPin(null);
    setShowPinDetail(updatedPin);
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const showProtocolsForPin = async (pin: PlanPin) => {
    setShowPinDetail(null);
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    setProtocolPickerPin(pin);
    setLoadingProtocols(true);
    try {
      const stored = await AsyncStorage.getItem("protocols");
      setProtocolOptions(parseProjectProtocolReferences(stored, pin.projectId));
    } finally {
      setLoadingProtocols(false);
    }
  };

  const linkProtocolToPin = async (protocol: FloorPlanProtocolReference) => {
    if (!protocolPickerPin) return;
    const updatedPin = linkPlanPinToProtocol(protocolPickerPin, protocol);
    await savePlanPin(updatedPin);
    setPins((current) => current.map((pin) => pin.id === updatedPin.id ? updatedPin : pin));
    setProtocolPickerPin(null);
    setShowPinDetail(updatedPin);
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const createProtocolForPin = (pin: PlanPin) => {
    setShowPinDetail(null);
    setProtocolPickerPin(null);
    router.push(
      `/(tabs)/record?projectId=${encodeURIComponent(pin.projectId)}&planPinId=${encodeURIComponent(pin.id)}` as any,
    );
  };

  const openLinkedProtocol = (pin: PlanPin) => {
    if (!pin.protocolId) return;
    setShowPinDetail(null);
    router.push(`/protocol-detail?id=${encodeURIComponent(pin.protocolId)}` as any);
  };

  const addPhotoToPin = async (pin: PlanPin) => {
    setShowPinDetail(null);
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newPhotos: string[] = [];
      for (const [index, asset] of result.assets.entries()) {
        const persisted = await persistFloorPlanMedia({
          sourceUri: asset.uri,
          projectId,
          ownerId: `${pin.id}-${(pin.photos?.length || 0) + index}`,
          width: asset.width,
          height: asset.height,
          kind: "photo",
        });
        newPhotos.push(persisted.uri);
      }
      const updatedPin: PlanPin = {
        ...pin,
        photos: [...(pin.photos || []), ...newPhotos],
      };
      await savePlanPin(updatedPin);
      setPins((current) => current.map((item) => item.id === pin.id ? updatedPin : item));
      setShowPinDetail(updatedPin);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setShowPinDetail(pin);
    }
  };

  const viewPinPhotos = (pin: PlanPin, initialIndex = 0) => {
    const photos = pin.photos || (pin.photoUri ? [pin.photoUri] : []);
    if (photos.length === 0) {
      Alert.alert(t('gallery_no_photos'), t('msg_marker_keine_fotos'));
      return;
    }
    setShowPinDetail(null);
    InteractionManager.runAfterInteractions(() => {
      if (!mountedRef.current) return;
      setPhotoViewer({
        photos,
        title: decodeUnicodeEscapes(pin.label),
        initialIndex: Math.min(Math.max(0, initialIndex), photos.length - 1),
      });
    });
  };

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
          <MaterialIcons name="arrow-back-ios" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('grundrisse')}</Text>
          {selectedPlan && (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{decodeUnicodeEscapes(selectedPlan.name)}</Text>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {/* Draw / mark up the plan */}
          {selectedPlan && (
            <Pressable
              onPress={() => setDrawingPlan(true)}
              accessibilityLabel={t('floor_plan_draw' as any)}
              style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="gesture" size={20} color={colors.primary} />
            </Pressable>
          )}
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
                {decodeUnicodeEscapes(plan.name)}
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
              {t('floor_plan_alle' as any)} ({pins.length})
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
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16 }}
            scrollEnabled={!planInteractionActive}
          >
            {/* Plan Image with Pins */}
            <View style={[styles.planImageContainer, { borderColor: colors.border }]}>
              <ZoomableCanvas
                key={`${selectedPlan.id}-${zoomResetKey}`}
                width={containerWidth}
                height={containerHeight}
                maxScale={4}
                onSingleTap={handlePlanTap}
                onInteractionChange={setPlanInteractionActive}
                testID="floor-plan-zoom-stage"
              >
                <View style={{ width: containerWidth, height: containerHeight, backgroundColor: "#FFFFFF" }}>
                <Image
                  source={{ uri: selectedPlan.imageUri }}
                  style={{ width: containerWidth, height: containerHeight }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={`floor-plan-${selectedPlan.id}`}
                  onLoadStart={() => setLoadingPlanId(selectedPlan.id)}
                  onLoad={(e: any) => {
                    setLoadingPlanId(null);
                    // Use the image's real dimensions so the canvas aspect ratio
                    // matches the plan (no distortion) and pins stay aligned.
                    const src = e?.source;
                    if (src?.width > 0 && src?.height > 0) {
                      setImageSize((prev) => (prev.width === src.width && prev.height === src.height ? prev : { width: src.width, height: src.height }));
                    }
                  }}
                  onError={() => setLoadingPlanId(null)}
                />
                {/* Render Pins */}
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  {filteredPins.map((pin) => (
                    <View
                      key={pin.id}
                      style={[
                        styles.pin,
                        {
                          left: pin.x * containerWidth - 14,
                          top: pin.y * containerHeight - 32,
                        },
                      ]}
                    >
                      <View style={[styles.pinMarker, { backgroundColor: pin.color }]}>
                        <MaterialIcons name={PIN_ICONS[pin.type] as any} size={14} color="#FFF" />
                      </View>
                      <View style={[styles.pinTail, { borderTopColor: pin.color }]} />
                    </View>
                  ))}
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
                </View>
                </View>
              </ZoomableCanvas>
              {loadingPlanId === selectedPlan.id ? (
                <View pointerEvents="none" style={styles.planLoadingOverlay}>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.planLoadingText}>{t('floor_plan_wird_geladen' as any)}</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => setZoomResetKey((value) => value + 1)}
                accessibilityRole="button"
                accessibilityLabel={t('floor_plan_zoom_zuruecksetzen' as any)}
                style={({ pressed }) => [styles.resetZoomButton, pressed && { opacity: 0.65 }]}
              >
                <MaterialIcons name="fit-screen" size={18} color="#FFFFFF" />
                <Text style={styles.resetZoomText}>{t('floor_plan_ansicht' as any)}</Text>
              </Pressable>
            </View>

            {/* Instruction */}
            <View style={[styles.instructionBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="touch-app" size={18} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 8, flex: 1 }}>
                {t('floor_plan_gesten_hinweis' as any)}
              </Text>
            </View>

            {/* Pin Summary */}
            {filteredPins.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
                  {t('floor_plan_markierungen' as any)} ({filteredPins.length})
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
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{decodeUnicodeEscapes(pin.label)}</Text>
                      {pin.description && (
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{decodeUnicodeEscapes(pin.description)}</Text>
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
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}>{t('keine_markierungen')}</Text>
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
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{decodeUnicodeEscapes(pin.label)}</Text>
                  {pin.description && (
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }} numberOfLines={2}>{decodeUnicodeEscapes(pin.description)}</Text>
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
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('grundrisse_plaene')}</Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            {t('floor_plan_empty_subtext' as any)}
          </Text>
          <Pressable
            onPress={addPlan}
            style={({ pressed }) => [styles.uploadBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="cloud-upload" size={20} color="#FFF" />
            <Text style={styles.uploadBtnText}>{t('plan_hochladen')}</Text>
          </Pressable>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 12 }}>
            {t('floor_plan_unterstuetzt' as any)}
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
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('neue_markierung')}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>
              {t('floor_plan_typ_hinweis' as any)}
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
              placeholder={t('bezeichnung')}
              placeholderTextColor={colors.muted}
              value={pinLabel}
              onChangeText={setPinLabel}
              autoFocus={false}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <TextInput
              style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder={t('beschreibung_optional')}
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
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { Keyboard.dismiss(); savePin(); }}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: PIN_COLORS[pinType] }, pressed && { opacity: 0.85 }]}
              >
                <MaterialIcons name="check" size={18} color="#FFF" />
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF", marginLeft: 6 }}>{t('save')}</Text>
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
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('plan_benennen')}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder={t('floor_plan_name_placeholder' as any)}
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
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={savePlanWithName}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pin Detail Modal */}
      <Modal
        visible={!!showPinDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPinDetail(null)}
      >
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
                    <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{decodeUnicodeEscapes(showPinDetail.label)}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      {decodeUnicodeEscapes(`${pinTypeOptions.find((o) => o.type === showPinDetail.type)?.label || ""} • ${new Date(showPinDetail.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}`)}
                    </Text>
                  </View>
                </View>
                {showPinDetail.description && (
                  <View style={[styles.detailDescBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20 }}>{decodeUnicodeEscapes(showPinDetail.description)}</Text>
                  </View>
                )}

                {showPinDetail.type === "protocol" && (
                  <View style={{ marginBottom: 12, gap: 8 }}>
                    {showPinDetail.protocolId && (
                      <View style={[styles.protocolLinkStatus, { backgroundColor: PIN_COLORS.protocol + "12", borderColor: PIN_COLORS.protocol + "50" }]}>
                        <MaterialIcons name="description" size={18} color={PIN_COLORS.protocol} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted }}>{t('verknuepftes_protokoll')}</Text>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }} numberOfLines={2}>
                            {decodeUnicodeEscapes(showPinDetail.protocolTitle || showPinDetail.label)}
                          </Text>
                        </View>
                      </View>
                    )}
                    <Pressable
                      onPress={() => showPinDetail.protocolId ? openLinkedProtocol(showPinDetail) : showProtocolsForPin(showPinDetail)}
                      style={({ pressed }) => [styles.primaryDetailAction, { backgroundColor: PIN_COLORS.protocol, opacity: pressed ? 0.8 : 1 }]}
                    >
                      <MaterialIcons name={showPinDetail.protocolId ? "open-in-new" : "post-add"} size={19} color="#FFF" />
                      <Text style={styles.primaryDetailActionText}>
                        {showPinDetail.protocolId ? t('zum_protokoll') : t('protokoll_hinzufuegen')}
                      </Text>
                    </Pressable>
                    {showPinDetail.protocolId && (
                      <Pressable
                        onPress={() => showProtocolsForPin(showPinDetail)}
                        style={({ pressed }) => [styles.secondaryDetailAction, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                      >
                        <MaterialIcons name="swap-horiz" size={18} color={colors.primary} />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>{t('protokoll_zuordnen')}</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                <Pressable
                  onPress={() => beginPinEdit(showPinDetail)}
                  style={({ pressed }) => [styles.secondaryDetailAction, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12, opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name="edit" size={18} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>{t('markierung_bearbeiten')}</Text>
                </Pressable>

                {/* Photos linked to this pin */}
                {((showPinDetail.photos && showPinDetail.photos.length > 0) || showPinDetail.photoUri) && (
                  <View style={{ marginBottom: 12 }}>
                    <Pressable
                      onPress={() => viewPinPhotos(showPinDetail)}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 0, backgroundColor: colors.primary + "10", borderWidth: 1, borderColor: colors.primary + "30", opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name="photo-library" size={20} color={colors.primary} />
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary, flex: 1 }}>
                        {(showPinDetail.photos?.length || 1)} {(showPinDetail.photos?.length || 1) !== 1 ? t('floor_plan_fotos_anzeigen' as any) : t('floor_plan_foto_anzeigen' as any)}
                      </Text>
                      <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
                    </Pressable>
                    {/* Photo thumbnails */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {(showPinDetail.photos || (showPinDetail.photoUri ? [showPinDetail.photoUri] : [])).slice(0, 5).map((uri, idx) => (
                        <Pressable
                          key={`${uri}-${idx}`}
                          onPress={() => viewPinPhotos(showPinDetail, idx)}
                          accessibilityRole="button"
                          accessibilityLabel={t('floor_plan_foto_gross_anzeigen' as any).replace('{n}', String(idx + 1))}
                        >
                          <Image
                            source={{ uri }}
                            style={{ width: 60, height: 60, borderRadius: 0, marginRight: 6 }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            recyclingKey={`pin-photo-${showPinDetail.id}-${idx}`}
                          />
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
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{decodeUnicodeEscapes(t('fotos_hinzufuegen'))}</Text>
                </Pressable>

                <View style={[styles.detailCoords, { backgroundColor: colors.surface }]}>
                  <MaterialIcons name="my-location" size={14} color={colors.muted} />
                  <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>
                    {t('floor_plan_position' as any)}: {(showPinDetail.x * 100).toFixed(1)}% / {(showPinDetail.y * 100).toFixed(1)}%
                  </Text>
                </View>
                <Pressable
                  onPress={() => removePin(showPinDetail.id)}
                  style={({ pressed }) => [styles.deleteBtn, { borderColor: colors.error }, pressed && { opacity: 0.7 }]}
                >
                  <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.error, marginLeft: 8 }}>{decodeUnicodeEscapes(t('alert_markierung_loeschen'))}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Existing pin edit modal */}
      <Modal
        visible={!!editingPin}
        transparent
        animationType="slide"
        onRequestClose={cancelPinEdit}
      >
        <TouchableWithoutFeedback onPress={cancelPinEdit}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%", justifyContent: "flex-end" }}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                  <View style={styles.modalHandle} />
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('markierung_bearbeiten')}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>
                    {editingPin?.type === "protocol" ? t('protokolltext_bearbeiten') : t('markierungstext_bearbeiten')}
                  </Text>
                  <TextInput
                    style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder={t('bezeichnung')}
                    placeholderTextColor={colors.muted}
                    value={editPinLabel}
                    onChangeText={setEditPinLabel}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder={editingPin?.type === "protocol" ? t('protokolltext_optional') : t('beschreibung_optional')}
                    placeholderTextColor={colors.muted}
                    value={editPinDescription}
                    onChangeText={setEditPinDescription}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  <View style={styles.modalButtons}>
                    <Pressable
                      onPress={cancelPinEdit}
                      style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>{t('cancel')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={saveEditedPin}
                      style={({ pressed }) => [styles.saveBtn, { backgroundColor: editingPin?.color || colors.primary }, pressed && { opacity: 0.85 }]}
                    >
                      <MaterialIcons name="check" size={18} color="#FFF" />
                      <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF", marginLeft: 6 }}>{t('save')}</Text>
                    </Pressable>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Protocol selection modal */}
      <Modal
        visible={!!protocolPickerPin}
        transparent
        animationType="slide"
        onRequestClose={() => setProtocolPickerPin(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setProtocolPickerPin(null)}>
          <Pressable style={[styles.detailModalContent, { backgroundColor: colors.background, maxHeight: "82%" }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('protokoll_hinzufuegen')}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>{t('protokoll_aus_projekt_waehlen')}</Text>

            {loadingProtocols ? (
              <View style={{ minHeight: 120, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {protocolOptions.map((protocol) => (
                  <Pressable
                    key={protocol.id}
                    onPress={() => linkProtocolToPin(protocol)}
                    style={({ pressed }) => [styles.protocolOption, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={[styles.protocolOptionIcon, { backgroundColor: PIN_COLORS.protocol + "18" }]}>
                      <MaterialIcons name="description" size={20} color={PIN_COLORS.protocol} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={2}>
                        {decodeUnicodeEscapes(protocol.title)}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>
                        {[
                          protocol.protocolNumber,
                          protocol.createdAt ? new Date(protocol.createdAt).toLocaleDateString("de-DE") : null,
                        ].filter(Boolean).join(" • ")}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                  </Pressable>
                ))}
                {protocolOptions.length === 0 && (
                  <View style={[styles.protocolEmptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <MaterialIcons name="description" size={30} color={colors.muted} />
                    <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 19 }}>{t('keine_protokolle_im_projekt')}</Text>
                  </View>
                )}
              </ScrollView>
            )}

            {protocolPickerPin && (
              <Pressable
                onPress={() => createProtocolForPin(protocolPickerPin)}
                style={({ pressed }) => [styles.primaryDetailAction, { backgroundColor: PIN_COLORS.protocol, marginTop: 12, opacity: pressed ? 0.8 : 1 }]}
              >
                <MaterialIcons name="add" size={20} color="#FFF" />
                <Text style={styles.primaryDetailActionText}>{t('neues_protokoll_erstellen')}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setProtocolPickerPin(null)}
              style={({ pressed }) => [styles.cancelStandalone, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.muted }}>{t('cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {photoViewer ? (
        <FullscreenPhotoViewer
          key={`${photoViewer.title}-${photoViewer.initialIndex}-${photoViewer.photos.join("|")}`}
          visible
          photos={photoViewer.photos}
          initialIndex={photoViewer.initialIndex}
          title={photoViewer.title}
          onClose={() => setPhotoViewer(null)}
        />
      ) : null}

      {selectedPlan && (
        <PhotoAnnotator
          visible={drawingPlan}
          photoUri={selectedPlan.imageUri}
          onClose={() => setDrawingPlan(false)}
          onSave={handlePlanDrawSave}
        />
      )}

      <PdfRasterizer
        pdfUri={pdfToConvert}
        label={t('floor_plan_pdf_converting' as any)}
        onDone={handlePdfConverted}
      />
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
    position: "relative",
    backgroundColor: "#061421",
  },
  planLoadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(2, 10, 19, 0.58)",
    zIndex: 30,
  },
  planLoadingText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  resetZoomButton: {
    position: "absolute",
    right: 10,
    top: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(4, 19, 32, 0.9)",
    borderWidth: 1,
    borderColor: "#58B7EF",
    zIndex: 40,
  },
  resetZoomText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
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
  protocolLinkStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
  },
  primaryDetailAction: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 0,
  },
  primaryDetailActionText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryDetailAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
  },
  protocolOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 8,
  },
  protocolOptionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 0,
  },
  protocolEmptyState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
  },
  cancelStandalone: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
    marginTop: 10,
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
