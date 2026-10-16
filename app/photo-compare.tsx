import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  Platform,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { useTranslation } from "@/lib/language-provider";
import { pickImagesWithSource } from "@/lib/import-picker";
import { Swipeable, Gesture, GestureDetector } from "react-native-gesture-handler";
import { buildExportDetailsHeaderHtml } from "@/lib/pdf-meta-header";
import { getProjectStructure, type Room as ProjectRoom, type Floor as ProjectFloor } from "@/lib/room-store";
import { buildPremiumHtml, resolveBrandingLogo } from "@/lib/pdf-premium";
import { generateAndSharePdf, type PdfCard, type PdfImage } from "@/lib/pdf-professional";
import { getPdfBranding } from "@/lib/pdf-branding-store";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

type ComparisonPair = {
  id: string;
  label: string;
  beforeUri: string;
  afterUri: string | null;
  beforeDate: string;
  afterDate: string | null;
  projectId?: string;
  exportDetails?: any;
  trade?: string;
  description?: string;
  room?: string;
  /** Pixel offset of the "after" image in the slider, to line it up with the
   *  "before" (e.g. match a roof line). */
  alignX?: number;
  alignY?: number;
};

const STORAGE_KEY = "photo-comparisons";

// Copy a picked image into permanent app storage. Picker/cache URIs are
// temporary and get purged (e.g. on app update), which is why previously
// imported comparison images vanished.
async function persistCompareImage(uri: string): Promise<string> {
  try {
    if (!FileSystem.documentDirectory) return uri;
    const dir = `${FileSystem.documentDirectory}compare-media/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const ext = uri.toLowerCase().includes(".png") ? "png" : "jpg";
    const dest = `${dir}${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

export default function PhotoCompareScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const [comparisons, setComparisons] = useState<ComparisonPair[]>([]);
  const [projFloors, setProjFloors] = useState<ProjectFloor[]>([]);
  const [projRooms, setProjRooms] = useState<ProjectRoom[]>([]);
  const [cmpFloorId, setCmpFloorId] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<ComparisonPair | null>(null);
  const [sliderPosition, setSliderPosition] = useState(0.5);
  const compareRef = React.useRef<View>(null);
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  const [aligning, setAligning] = useState(false);
  const [shareSelectVisible, setShareSelectVisible] = useState(false);
  const [shareIds, setShareIds] = useState<string[]>([]);
  const titleInputRef = React.useRef<TextInput>(null);
  const alignStart = React.useRef({ x: 0, y: 0 });

  async function loadComparisons() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const all: ComparisonPair[] = JSON.parse(stored);
        if (params.projectId) {
          setComparisons(all.filter(c => c.projectId === params.projectId));
        } else {
          setComparisons(all);
        }
      }
    } catch {}
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadComparisons();
    });
    if (params.projectId) {
      void (async () => {
        try {
          const structure = await getProjectStructure(params.projectId!);
          setProjFloors(structure.floors.sort((a, b) => a.number - b.number));
          setProjRooms(structure.rooms);
        } catch {}
      })();
    }
  }, []);

  // Set the room ("Etage · Raum") on the open comparison and persist it.
  const setCompareRoom = async (label: string | undefined) => {
    if (!selectedPair) return;
    const next = { ...selectedPair, room: label };
    setSelectedPair(next);
    const updated = comparisons.map((c) => (c.id === next.id ? { ...c, ...next } : c));
    setComparisons(updated);
    await saveComparisons(updated);
  };

  const saveComparisons = async (updated: ComparisonPair[]) => {
    try {
      // Keep pairs from OTHER projects untouched; replace this scope's pairs
      // with `updated` (so deletions actually persist).
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const all: ComparisonPair[] = stored ? JSON.parse(stored) : [];
      const others = params.projectId
        ? all.filter(c => c.projectId !== params.projectId)
        : [];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...others, ...updated]));
    } catch {}
  };

  const createNewComparison = async () => {
    try {
      const picked = await pickImagesWithSource({ t });
      if (picked.length === 0) return;
      const beforeUri = await persistCompareImage(picked[0].uri);

      const newPair: ComparisonPair = {
        id: Date.now().toString(),
        label: t('photo_compare_vergleich_n' as any).replace('{n}', String(comparisons.length + 1)),
        beforeUri,
        afterUri: null,
        beforeDate: new Date().toISOString(),
        afterDate: null,
        projectId: params.projectId,
      };

      const updated = [...comparisons, newPair];
      setComparisons(updated);
      await saveComparisons(updated);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_foto_konnte_nicht_geladen_werden'));
    }
  };

  const addAfterPhoto = async (pair: ComparisonPair) => {
    try {
      const picked = await pickImagesWithSource({ t });
      if (picked.length === 0) return;
      const afterUri = await persistCompareImage(picked[0].uri);

      const updated = comparisons.map(c =>
        c.id === pair.id ? { ...c, afterUri, afterDate: new Date().toISOString() } : c
      );
      setComparisons(updated);
      await saveComparisons(updated);
      if (selectedPair?.id === pair.id) {
        setSelectedPair({ ...pair, afterUri, afterDate: new Date().toISOString() });
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_foto_konnte_nicht_geladen_werden'));
    }
  };

  const deletePair = (pair: ComparisonPair) => {
    Alert.alert(t('alert_loeschen'), t('wirklich_loeschen_mit_name').replace('{name}', pair.label), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_loeschen'),
        style: "destructive",
        onPress: async () => {
          const updated = comparisons.filter(c => c.id !== pair.id);
          setComparisons(updated);
          await saveComparisons(updated);
          if (selectedPair?.id === pair.id) setSelectedPair(null);
        },
      },
    ]);
  };

  // Persist an edited comparison title.
  const saveTitle = async () => {
    if (!selectedPair) return;
    const label = selectedPair.label.trim() || selectedPair.label;
    const updated = comparisons.map((c) => (c.id === selectedPair.id ? { ...c, label } : c));
    setComparisons(updated);
    await saveComparisons(updated);
  };

  // Update a free-text field on the selected pair in state, then persist on blur.
  const updateSelectedField = (field: "trade" | "description" | "room") => (text: string) => {
    if (!selectedPair) return;
    setSelectedPair({ ...selectedPair, [field]: text });
  };
  const persistSelectedPair = async () => {
    if (!selectedPair) return;
    const updated = comparisons.map((c) => (c.id === selectedPair.id ? { ...c, ...selectedPair } : c));
    setComparisons(updated);
    await saveComparisons(updated);
  };

  // Refs mirror the latest state so gesture callbacks (whose closures can be a
  // render behind) read/persist current values without a stale snapshot.
  const comparisonsRef = React.useRef(comparisons);
  React.useEffect(() => { comparisonsRef.current = comparisons; }, [comparisons]);
  const selectedPairRef = React.useRef(selectedPair);
  React.useEffect(() => { selectedPairRef.current = selectedPair; }, [selectedPair]);

  // Persist the "after" image alignment offset for one comparison.
  const saveAlign = (id: string, x: number, y: number) => {
    const updated = comparisonsRef.current.map((c) => (c.id === id ? { ...c, alignX: x, alignY: y } : c));
    comparisonsRef.current = updated;
    setComparisons(updated);
    setSelectedPair((p) => (p && p.id === id ? { ...p, alignX: x, alignY: y } : p));
    void saveComparisons(updated);
  };

  // Share the chosen comparisons of this project as one PDF. Without `ids` all
  // comparisons that have a "nachher" photo are included.
  const shareAllComparisons = async (ids?: string[]) => {
    const pairs = comparisons.filter((c) => c.afterUri && (!ids || ids.includes(c.id)));
    if (pairs.length === 0) { Alert.alert(t('vorhernachher'), t('project_export_empty' as any)); return; }
    try {
      let projectName = "";
      try {
        const raw = await AsyncStorage.getItem("projects");
        projectName = (raw ? JSON.parse(raw) : []).find((p: any) => p.id === params.projectId)?.name || "";
      } catch {}
      const toData = async (uri?: string | null): Promise<string | null> => {
        if (!uri) return null;
        try {
          let src = uri;
          try { const m = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1400 } }], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }); if (m?.uri) src = m.uri; } catch {}
          const b64 = await FileSystem.readAsStringAsync(src, { encoding: FileSystem.EncodingType.Base64 });
          return `data:image/jpeg;base64,${b64}`;
        } catch { return null; }
      };
      const cards: PdfCard[] = [];
      for (const p of pairs) {
        const images: PdfImage[] = [];
        const before = await toData(p.beforeUri); if (before) images.push({ base64: before, caption: "Vorher" });
        const after = await toData(p.afterUri); if (after) images.push({ base64: after, caption: "Nachher" });
        cards.push({
          title: p.label || t('vorhernachher'),
          fields: [{ label: "Raum", value: p.room || "" }, { label: "Gewerk", value: p.trade || "" }],
          note: p.description || "",
          images,
        });
      }
      await generateAndSharePdf({
        title: t('vorhernachher'),
        subtitle: projectName || undefined,
        reportType: t('vorhernachher'),
        datum: new Date().toLocaleDateString("de-DE"),
        projekt: projectName || undefined,
        sections: [{ title: `${t('vorhernachher')} (${pairs.length})`, content: "", cards }],
        accentColor: "#1E3A5F",
      });
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), e?.message || "");
    }
  };

  const shareComparison = async () => {
    if (!selectedPair) return;
    try {
      const toDataUri = async (uri?: string | null): Promise<string | null> => {
        if (!uri) return null;
        try {
          const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          return `data:image/jpeg;base64,${b64}`;
        } catch {
          return null;
        }
      };
      const beforeImg = await toDataUri(selectedPair.beforeUri);
      const afterImg = await toDataUri(selectedPair.afterUri);
      // Persist the entered details onto the pair so they are remembered.
      const updatedPairs = comparisons.map((c) => (c.id === selectedPair.id ? { ...c, ...selectedPair } : c));
      await saveComparisons(updatedPairs);
      const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const dataRows = [
        selectedPair.trade ? `<p style="margin:3px 0;"><strong style="color:#1E3A5F;">${t('photo_compare_trade')}:</strong> ${escapeHtml(selectedPair.trade)}</p>` : "",
        selectedPair.description ? `<p style="margin:3px 0;"><strong style="color:#1E3A5F;">${t('photo_compare_description')}:</strong> ${escapeHtml(selectedPair.description)}</p>` : "",
      ].join("");
      // Project meta (Bauvorhaben/Adresse) comes from the project itself; Raum is
      // the one optional field entered here.
      let projMeta: any = null;
      try {
        const praw = await AsyncStorage.getItem("projects");
        projMeta = (praw ? JSON.parse(praw) : []).find((p: any) => p.id === selectedPair.projectId) || null;
      } catch {}
      const metaHeader = buildExportDetailsHeaderHtml(
        {
          bauvorhaben: projMeta?.name || "",
          adresse: projMeta?.address || "",
          etage: "",
          raum: selectedPair.room || "",
          notizen: "",
        },
        {
          bauvorhaben: t('export_bauvorhaben'),
          adresse: t('export_adresse'),
          etage: t('export_etage'),
          raum: t('export_raum'),
          notizen: t('export_notizen'),
        },
      );
      const cell = (label: string, color: string, date: string, img: string | null) => `
        <td style="width:50%; vertical-align:top; padding:6px;">
          <div style="font-weight:700; color:${color}; text-align:center; margin-bottom:6px; font-size:13px;">${label}</div>
          ${img ? `<img src="${img}" style="width:100%; border:1px solid #e8ecf1; border-radius:8px;"/>` : `<div style="height:200px; border:1px dashed #e8ecf1; border-radius:8px;"></div>`}
          <div style="text-align:center; color:#64748b; font-size:11px; margin-top:6px;">${date}</div>
        </td>`;
      const branding = await getPdfBranding().catch(() => null);
      const accent = branding?.accentColor || "#1E3A5F";
      const logoDataUri = await resolveBrandingLogo(branding);
      const body = `
        ${metaHeader}
        <table style="width:100%; border-collapse:collapse; margin-top:14px;"><tr>
          ${cell(t('vorher'), "#DC2626", selectedPair.beforeDate ? formatDate(selectedPair.beforeDate) : "", beforeImg)}
          ${cell(t('nachher'), "#4E8B6B", selectedPair.afterDate ? formatDate(selectedPair.afterDate) : "", afterImg)}
        </tr></table>
        ${dataRows ? `<div style="margin-top:14px; padding:12px 14px; border:1px solid #e8ecf1; border-radius:8px; font-size:12px; line-height:1.5; color:#334155;">${dataRows}</div>` : ""}`;
      const html = buildPremiumHtml({
        branding: branding || ({} as any),
        accentColor: accent,
        title: selectedPair.label || t('vergleich'),
        reportTag: t('vergleich'),
        body,
        logoDataUri,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch {
      Alert.alert(t('alert_fehler'), t('msg_vergleich_konnte_nicht_geteilt_werden'));
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  // Detail view with slider
  if (selectedPair) {
    const imgWidth = SCREEN_WIDTH - 32;
    const imgHeight = imgWidth * 0.75;
    // Split view: two equal tiles side by side, large and prominent
    const colWidth = (imgWidth - 8) / 2;
    const splitHeight = Math.min(SCREEN_HEIGHT * 0.55, colWidth * 1.5);
    // Interactive before/after slider dimensions.
    const sliderW = imgWidth;
    const sliderH = Math.min(SCREEN_HEIGHT * 0.5, imgWidth * 0.8);
    const clampPos = (v: number) => Math.max(0, Math.min(1, v));
    const dividerX = sliderW * sliderPosition;
    const sliderPan = Gesture.Pan()
      .onBegin((e) => setSliderPosition(clampPos(e.x / sliderW)))
      .onUpdate((e) => setSliderPosition(clampPos(e.x / sliderW)))
      .runOnJS(true);

    // Align mode: dragging moves the "after" image (not the divider), so its
    // features can be lined up with "before" (e.g. the same roof height).
    const alignPan = Gesture.Pan()
      .onBegin(() => { alignStart.current = { x: selectedPairRef.current?.alignX || 0, y: selectedPairRef.current?.alignY || 0 }; })
      .onUpdate((e) => {
        setSelectedPair((prev) => prev ? { ...prev, alignX: alignStart.current.x + e.translationX, alignY: alignStart.current.y + e.translationY } : prev);
      })
      .onEnd((e) => {
        const id = selectedPairRef.current?.id;
        if (id) saveAlign(id, alignStart.current.x + e.translationX, alignStart.current.y + e.translationY);
      })
      .runOnJS(true);
    const afterTransform = [{ translateX: selectedPair.alignX || 0 }, { translateY: selectedPair.alignY || 0 }];

    return (
      <ScreenContainer className="flex-1">
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable onPress={() => { setSelectedPair(null); setAligning(false); }} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginRight: 12 }]}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TextInput
                ref={titleInputRef}
                value={selectedPair.label}
                onChangeText={(text) => setSelectedPair({ ...selectedPair, label: text })}
                onEndEditing={saveTitle}
                onSubmitEditing={saveTitle}
                returnKeyType="done"
                placeholder={t('photo_compare_titel_placeholder' as any)}
                placeholderTextColor={colors.muted}
                style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground, paddingVertical: 0 }}
              />
              <Pressable
                onPress={() => titleInputRef.current?.focus()}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('photo_compare_titel_placeholder' as any)}
                style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.5 : 1 }]}
              >
                <MaterialIcons name="edit" size={18} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <View ref={compareRef} style={{ backgroundColor: colors.background }}>
              {selectedPair.afterUri ? (
                /* Interactive before/after slider: drag the handle between old & new. */
                <GestureDetector gesture={aligning ? alignPan : sliderPan}>
                  <View style={{ width: sliderW, height: sliderH, borderRadius: 8, overflow: "hidden", backgroundColor: colors.muted + "22", alignSelf: "center" }}>
                    {/* Base layer = after (new) */}
                    <Image source={{ uri: selectedPair.afterUri }} style={{ position: "absolute", left: 0, top: 0, width: sliderW, height: sliderH, transform: afterTransform }} contentFit="cover" />
                    {/* Overlay = before (old), clipped to the left of the divider */}
                    <View style={{ position: "absolute", left: 0, top: 0, width: dividerX, height: sliderH, overflow: "hidden" }}>
                      <Image source={{ uri: selectedPair.beforeUri }} style={{ width: sliderW, height: sliderH }} contentFit="cover" />
                    </View>
                    {/* Labels */}
                    <View style={{ position: "absolute", top: 8, left: 8, backgroundColor: colors.error, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>{t('vorher')}</Text>
                    </View>
                    <View style={{ position: "absolute", top: 8, right: 8, backgroundColor: colors.success, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>{t('nachher')}</Text>
                    </View>
                    {/* Divider line */}
                    <View style={{ position: "absolute", left: dividerX - 1.5, top: 0, width: 3, height: sliderH, backgroundColor: "#fff" }} />
                    {/* Drag handle */}
                    <View style={{ position: "absolute", left: dividerX - 20, top: sliderH / 2 - 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 4 }}>
                      <MaterialIcons name={aligning ? "open-with" : "compare-arrows"} size={24} color="#1E3A5F" />
                    </View>
                  </View>
                </GestureDetector>
              ) : (
                /* No after photo yet: show before + add-after placeholder side by side */
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error }} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.error }}>{t('vorher')}</Text>
                    </View>
                    <Pressable onPress={() => setZoomUri(selectedPair.beforeUri)}>
                      <Image source={{ uri: selectedPair.beforeUri }} style={{ width: "100%", height: splitHeight, borderRadius: 8, backgroundColor: colors.muted + "22" }} contentFit="cover" />
                    </Pressable>
                    <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 6 }}>{formatDate(selectedPair.beforeDate)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success }}>{t('nachher')}</Text>
                    </View>
                    <Pressable
                      onPress={() => addAfterPhoto(selectedPair)}
                      style={({ pressed }) => [{
                        width: "100%",
                        height: splitHeight,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderStyle: "dashed",
                        borderColor: colors.border,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.6 : 1,
                      }]}
                    >
                      <MaterialIcons name="add-a-photo" size={32} color={colors.muted} />
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{t('nachherfoto')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            {selectedPair.afterUri && (
              <>
                <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 10 }}>
                  {aligning ? t('photo_compare_align_hint' as any) : t('photo_compare_slider_hint' as any)}
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <Pressable
                    onPress={() => setAligning((v) => !v)}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: aligning ? colors.primary : colors.border, backgroundColor: aligning ? colors.primary + "18" : "transparent", opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="open-with" size={16} color={aligning ? colors.primary : colors.muted} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: aligning ? colors.primary : colors.muted }}>
                      {aligning ? t('done') : t('photo_compare_align' as any)}
                    </Text>
                  </Pressable>
                  {aligning && ((selectedPair.alignX || 0) !== 0 || (selectedPair.alignY || 0) !== 0) && (
                    <Pressable
                      onPress={() => saveAlign(selectedPair.id, 0, 0)}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name="restart-alt" size={16} color={colors.muted} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>{t('photo_compare_align_reset' as any)}</Text>
                    </Pressable>
                  )}
                </View>
                <View style={{ flexDirection: "row", justifyContent: "center", gap: 18, marginTop: 8 }}>
                  <Pressable onPress={() => setZoomUri(selectedPair.beforeUri)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="zoom-in" size={18} color={colors.error} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.error }}>{t('vorher')}</Text>
                  </Pressable>
                  <Pressable onPress={() => setZoomUri(selectedPair.afterUri!)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="zoom-in" size={18} color={colors.success} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success }}>{t('nachher')}</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{formatDate(selectedPair.beforeDate)}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{selectedPair.afterDate ? formatDate(selectedPair.afterDate) : ""}</Text>
                </View>
              </>
            )}

            {/* Comparison data: trade + what was done */}
            <View style={{ marginTop: 20, padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{t('photo_compare_data_title' as any)}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, marginTop: 10 }}>{t('photo_compare_trade' as any)}</Text>
              <TextInput
                value={selectedPair.trade || ""}
                onChangeText={updateSelectedField("trade")}
                onEndEditing={persistSelectedPair}
                onBlur={persistSelectedPair}
                placeholder={t('photo_compare_trade' as any)}
                placeholderTextColor={colors.muted}
                style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 }}
              />
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, marginTop: 10 }}>{t('photo_compare_description' as any)}</Text>
              <TextInput
                value={selectedPair.description || ""}
                onChangeText={updateSelectedField("description")}
                onEndEditing={persistSelectedPair}
                onBlur={persistSelectedPair}
                placeholder={t('photo_compare_description_ph' as any)}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, minHeight: 72, textAlignVertical: "top" }}
              />
              {projRooms.length > 0 ? (() => {
                const floorsWithRooms = projFloors.filter((f) => projRooms.some((r) => r.floorId === f.id));
                const roomFromValue = projRooms.find((r) => {
                  const fn = projFloors.find((f) => f.id === r.floorId)?.name || "";
                  const lbl = fn ? `${fn} · ${r.name}` : r.name;
                  return lbl === selectedPair.room;
                });
                const effFloorId = cmpFloorId || roomFromValue?.floorId || floorsWithRooms[0]?.id || null;
                const roomsOfFloor = projRooms.filter((r) => r.floorId === effFloorId);
                return (
                  <>
                    <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, marginTop: 10 }}>{t('export_etage' as any)}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                      {floorsWithRooms.map((f) => {
                        const on = effFloorId === f.id;
                        return (
                          <Pressable key={f.id} onPress={() => setCmpFloorId(f.id)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "18" : "transparent" }}>
                            <Text style={{ fontSize: 12, fontWeight: on ? "700" : "600", color: on ? colors.primary : colors.muted }}>{f.name}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, marginTop: 10 }}>{t('export_raum' as any)}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                      {roomsOfFloor.map((room) => {
                        const floorName = projFloors.find((f) => f.id === room.floorId)?.name || "";
                        const label = floorName ? `${floorName} · ${room.name}` : room.name;
                        const on = selectedPair.room === label;
                        return (
                          <Pressable key={room.id} onPress={() => void setCompareRoom(on ? undefined : label)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "18" : "transparent" }}>
                            <Text style={{ fontSize: 12, fontWeight: on ? "700" : "600", color: on ? colors.primary : colors.muted }}>{room.name}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                );
              })() : (
                <>
                  <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, marginTop: 10 }}>{t('export_raum' as any)}</Text>
                  <TextInput
                    value={selectedPair.room || ""}
                    onChangeText={updateSelectedField("room")}
                    onEndEditing={persistSelectedPair}
                    onBlur={persistSelectedPair}
                    placeholder={t('export_raum' as any)}
                    placeholderTextColor={colors.muted}
                    style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 }}
                  />
                </>
              )}
            </View>

            {selectedPair.afterUri && (
              <Pressable onPress={() => void shareComparison()} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, paddingVertical: 15, borderRadius: 12, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
                <MaterialIcons name="ios-share" size={20} color="#FFFFFF" />
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFFFFF" }}>{t('protocol_share' as any)}</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Fullscreen zoom overlay */}
          <Modal visible={!!zoomUri} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
            <Pressable
              onPress={() => setZoomUri(null)}
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}
            >
              {zoomUri && (
                <Image source={{ uri: zoomUri }} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8 }} contentFit="contain" />
              )}
              <View style={{ position: "absolute", top: 48, right: 20 }}>
                <MaterialIcons name="close" size={32} color="#fff" />
              </View>
            </Pressable>
          </Modal>
        </View>
      </ScreenContainer>
    );
  }

  // List view
  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginRight: 12 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>{t('vorhernachher')}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{t('fortschrittsdokumentation')}</Text>
          </View>
          <Pressable
            onPress={() => {
              const shareable = comparisons.filter((c) => c.afterUri).map((c) => c.id);
              if (shareable.length === 0) return;
              if (shareable.length === 1) { void shareAllComparisons(shareable); return; }
              setShareIds(shareable); // preselect all
              setShareSelectVisible(true);
            }}
            disabled={comparisons.filter((c) => c.afterUri).length === 0}
            style={({ pressed }) => [{ opacity: comparisons.filter((c) => c.afterUri).length === 0 ? 0.4 : pressed ? 0.6 : 1, marginRight: 14 }]}
          >
            <MaterialIcons name="ios-share" size={22} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={createNewComparison} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, backgroundColor: colors.primary, borderRadius: 0, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }]}>
            <MaterialIcons name="add" size={18} color="#FFF" />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFF" }}>{t('neu')}</Text>
          </Pressable>
        </View>

        {comparisons.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <MaterialIcons name="compare" size={64} color={colors.muted} />
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginTop: 16 }}>{t('keine_vergleiche')}</Text>
            <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 8 }}>
              {t('photo_compare_leer_hinweis' as any)}
            </Text>
            <Pressable
              onPress={createNewComparison}
              style={({ pressed }) => [{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 0, paddingHorizontal: 20, paddingVertical: 10, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF" }}>{t('ersten_vergleich_erstellen')}</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {comparisons.map(pair => (
              <Swipeable
                key={pair.id}
                renderRightActions={() => (
                  <Pressable
                    onPress={() => deletePair(pair)}
                    style={({ pressed }) => [{
                      backgroundColor: "#EF4444",
                      justifyContent: "center",
                      alignItems: "center",
                      width: 88,
                      gap: 4,
                      opacity: pressed ? 0.85 : 1,
                    }]}
                  >
                    <MaterialIcons name="delete" size={24} color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>{t('btn_loeschen')}</Text>
                  </Pressable>
                )}
              >
              <Pressable
                onPress={() => setSelectedPair(pair)}
                onLongPress={() => deletePair(pair)}
                style={({ pressed }) => [{
                  flexDirection: "row",
                  backgroundColor: colors.surface,
                  borderRadius: 0,
                  padding: 12,
                  gap: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                {/* Before thumbnail */}
                <Image source={{ uri: pair.beforeUri }} style={{ width: 60, height: 60, borderRadius: 0 }} contentFit="cover" />
                {/* Arrow */}
                <View style={{ alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="arrow-forward" size={20} color={colors.muted} />
                </View>
                {/* After thumbnail */}
                {pair.afterUri ? (
                  <Image source={{ uri: pair.afterUri }} style={{ width: 60, height: 60, borderRadius: 0 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 60, height: 60, borderRadius: 0, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                    <MaterialIcons name="add" size={20} color={colors.muted} />
                  </View>
                )}
                {/* Info */}
                <View style={{ flex: 1, justifyContent: "center" }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{pair.label}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                    {formatDate(pair.beforeDate)}{pair.afterDate ? ` → ${formatDate(pair.afterDate)}` : t('photo_compare_nachher_fehlt' as any)}
                  </Text>
                  {!pair.afterUri && (
                    <Pressable
                      onPress={() => addAfterPhoto(pair)}
                      style={({ pressed }) => [{ marginTop: 4, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.primary }}>{t('photo_compare_nachher_foto_hinzufuegen' as any)}</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
              </Swipeable>
            ))}
          </ScrollView>
        )}

        {/* Choose which comparisons to share */}
        <Modal visible={shareSelectVisible} transparent animationType="slide" onRequestClose={() => setShareSelectVisible(false)}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShareSelectVisible(false)}>
            <Pressable onPress={() => {}} style={{ backgroundColor: colors.background, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28, maxHeight: "82%" }}>
              <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>{t('photo_compare_share_select' as any)}</Text>
                <View style={{ flexDirection: "row", gap: 14 }}>
                  <Pressable onPress={() => setShareIds(comparisons.filter((c) => c.afterUri).map((c) => c.id))}>
                    <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "700" }}>{t('all')}</Text>
                  </Pressable>
                  <Pressable onPress={() => setShareIds([])}>
                    <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "700" }}>{t('none')}</Text>
                  </Pressable>
                </View>
              </View>
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {comparisons.filter((c) => c.afterUri).map((c) => {
                  const on = shareIds.includes(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setShareIds((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name={on ? "check-box" : "check-box-outline-blank"} size={24} color={on ? colors.primary : colors.muted} />
                      <Image source={{ uri: c.beforeUri }} style={{ width: 44, height: 44, borderRadius: 6 }} contentFit="cover" />
                      {c.afterUri ? <Image source={{ uri: c.afterUri }} style={{ width: 44, height: 44, borderRadius: 6 }} contentFit="cover" /> : null}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>{c.label}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{formatDate(c.beforeDate)}{c.afterDate ? ` → ${formatDate(c.afterDate)}` : ""}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable
                disabled={shareIds.length === 0}
                onPress={() => { const ids = shareIds; setShareSelectVisible(false); void shareAllComparisons(ids); }}
                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, paddingVertical: 15, borderRadius: 12, backgroundColor: colors.primary, opacity: shareIds.length === 0 ? 0.4 : pressed ? 0.85 : 1 }]}
              >
                <MaterialIcons name="ios-share" size={20} color="#FFFFFF" />
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFFFFF" }}>{t('protocol_share' as any)} ({shareIds.length})</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </ScreenContainer>
  );
}
