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
import { useTranslation } from "@/lib/language-provider";
import { pickImagesWithSource } from "@/lib/import-picker";
import { Swipeable } from "react-native-gesture-handler";
import { ExportDetailsBox, EMPTY_EXPORT_DETAILS, type ExportDetails } from "@/components/export-details-box";
import { buildExportDetailsHeaderHtml } from "@/lib/pdf-meta-header";
import { buildPremiumHtml, resolveBrandingLogo } from "@/lib/pdf-premium";
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
  exportDetails?: ExportDetails;
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
  const [selectedPair, setSelectedPair] = useState<ComparisonPair | null>(null);
  const [sliderPosition, setSliderPosition] = useState(0.5);
  const compareRef = React.useRef<View>(null);
  // Optional project/floor/room/notes for the PDF export; initialized from the
  // selected pair so previously entered values are remembered.
  const [exportDetails, setExportDetails] = useState<ExportDetails>(EMPTY_EXPORT_DETAILS);
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  useEffect(() => {
    setExportDetails(selectedPair?.exportDetails || EMPTY_EXPORT_DETAILS);
  }, [selectedPair?.id]);

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
  }, []);

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
      // Persist the entered details onto the pair so they are remembered, and
      // print them into the PDF header.
      const updatedPairs = comparisons.map((c) => (c.id === selectedPair.id ? { ...c, exportDetails } : c));
      await saveComparisons(updatedPairs);
      const metaHeader = buildExportDetailsHeaderHtml(exportDetails, {
        bauvorhaben: t('export_bauvorhaben'),
        adresse: t('export_adresse'),
        etage: t('export_etage'),
        raum: t('export_raum'),
        notizen: t('export_notizen'),
      });
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
        </tr></table>`;
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

    return (
      <ScreenContainer className="flex-1">
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable onPress={() => setSelectedPair(null)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginRight: 12 }]}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TextInput
                value={selectedPair.label}
                onChangeText={(text) => setSelectedPair({ ...selectedPair, label: text })}
                onEndEditing={saveTitle}
                onSubmitEditing={saveTitle}
                returnKeyType="done"
                placeholder={t('photo_compare_titel_placeholder' as any)}
                placeholderTextColor={colors.muted}
                style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground, paddingVertical: 0 }}
              />
              <MaterialIcons name="edit" size={16} color={colors.muted} />
            </View>
            {selectedPair.afterUri && (
              <Pressable onPress={shareComparison} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                <MaterialIcons name="share" size={22} color={colors.primary} />
              </Pressable>
            )}
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            {/* Split view: before left, after right — equal size */}
            <View ref={compareRef} style={{ backgroundColor: colors.background }}>
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
                  {selectedPair.afterUri ? (
                    <>
                      <Pressable onPress={() => setZoomUri(selectedPair.afterUri!)}>
                        <Image source={{ uri: selectedPair.afterUri }} style={{ width: "100%", height: splitHeight, borderRadius: 8, backgroundColor: colors.muted + "22" }} contentFit="cover" />
                      </Pressable>
                      <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 6 }}>{formatDate(selectedPair.afterDate!)}</Text>
                    </>
                  ) : (
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
                  )}
                </View>
              </View>
            </View>

            {selectedPair.afterUri && (
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 12 }}>{t('photo_compare_tap_zoom' as any)}</Text>
            )}

            {/* Optional details printed into the PDF export header */}
            <ExportDetailsBox value={exportDetails} onChange={setExportDetails} />
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
      </View>
    </ScreenContainer>
  );
}
