import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
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
import { captureRef } from "react-native-view-shot";
import { useTranslation } from "@/lib/language-provider";

const SCREEN_WIDTH = Dimensions.get("window").width;

type ComparisonPair = {
  id: string;
  label: string;
  beforeUri: string;
  afterUri: string | null;
  beforeDate: string;
  afterDate: string | null;
  projectId?: string;
};

const STORAGE_KEY = "photo-comparisons";

export default function PhotoCompareScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const [comparisons, setComparisons] = useState<ComparisonPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<ComparisonPair | null>(null);
  const [sliderPosition, setSliderPosition] = useState(0.5);
  const compareRef = React.useRef<View>(null);

  useEffect(() => {
    loadComparisons();
  }, []);

  const loadComparisons = async () => {
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
  };

  const saveComparisons = async (updated: ComparisonPair[]) => {
    try {
      // Load all, update matching, save all
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const all: ComparisonPair[] = stored ? JSON.parse(stored) : [];
      const ids = new Set(updated.map(c => c.id));
      const others = all.filter(c => !ids.has(c.id));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...others, ...updated]));
    } catch {}
  };

  const createNewComparison = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (result.canceled) return;

      const newPair: ComparisonPair = {
        id: Date.now().toString(),
        label: `Vergleich ${comparisons.length + 1}`,
        beforeUri: result.assets[0].uri,
        afterUri: null,
        beforeDate: new Date().toISOString(),
        afterDate: null,
        projectId: params.projectId,
      };

      const updated = [...comparisons, newPair];
      setComparisons(updated);
      await saveComparisons(updated);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert(t('alert_fehler'), t('msg_foto_konnte_nicht_geladen_werden'));
    }
  };

  const addAfterPhoto = async (pair: ComparisonPair) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (result.canceled) return;

      const updated = comparisons.map(c =>
        c.id === pair.id ? { ...c, afterUri: result.assets[0].uri, afterDate: new Date().toISOString() } : c
      );
      setComparisons(updated);
      await saveComparisons(updated);
      if (selectedPair?.id === pair.id) {
        setSelectedPair({ ...pair, afterUri: result.assets[0].uri, afterDate: new Date().toISOString() });
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
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

  const shareComparison = async () => {
    if (!compareRef.current) return;
    try {
      const uri = await captureRef(compareRef.current, { format: "png", quality: 0.9 });
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (e) {
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

    return (
      <ScreenContainer className="flex-1">
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable onPress={() => setSelectedPair(null)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginRight: 12 }]}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, flex: 1 }}>{selectedPair.label}</Text>
            {selectedPair.afterUri && (
              <Pressable onPress={shareComparison} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                <MaterialIcons name="share" size={22} color={colors.primary} />
              </Pressable>
            )}
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            {/* Side-by-side comparison */}
            <View ref={compareRef} style={{ backgroundColor: colors.background }}>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.error, marginBottom: 4, textAlign: "center" }}>{t('vorher')}</Text>
                  <Image source={{ uri: selectedPair.beforeUri }} style={{ width: "100%", height: imgHeight / 2, borderRadius: 0 }} contentFit="cover" />
                  <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center", marginTop: 4 }}>{formatDate(selectedPair.beforeDate)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success, marginBottom: 4, textAlign: "center" }}>{t('nachher')}</Text>
                  {selectedPair.afterUri ? (
                    <>
                      <Image source={{ uri: selectedPair.afterUri }} style={{ width: "100%", height: imgHeight / 2, borderRadius: 0 }} contentFit="cover" />
                      <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center", marginTop: 4 }}>{formatDate(selectedPair.afterDate!)}</Text>
                    </>
                  ) : (
                    <Pressable
                      onPress={() => addAfterPhoto(selectedPair)}
                      style={({ pressed }) => [{
                        width: "100%",
                        height: imgHeight / 2,
                        borderRadius: 0,
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

            {/* Full-size images */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 20, marginBottom: 8 }}>{t('vollansicht')}</Text>
            <View style={{ gap: 12 }}>
              <View>
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.error, marginBottom: 4 }}>Vorher – {formatDate(selectedPair.beforeDate)}</Text>
                <Image source={{ uri: selectedPair.beforeUri }} style={{ width: imgWidth, height: imgHeight, borderRadius: 0 }} contentFit="contain" />
              </View>
              {selectedPair.afterUri && (
                <View>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.success, marginBottom: 4 }}>Nachher – {formatDate(selectedPair.afterDate!)}</Text>
                  <Image source={{ uri: selectedPair.afterUri }} style={{ width: imgWidth, height: imgHeight, borderRadius: 0 }} contentFit="contain" />
                </View>
              )}
            </View>
          </ScrollView>
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
              Erstelle einen Vorher/Nachher-Vergleich um den Baufortschritt zu dokumentieren.
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
              <Pressable
                key={pair.id}
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
                    {formatDate(pair.beforeDate)}{pair.afterDate ? ` → ${formatDate(pair.afterDate)}` : " – Nachher fehlt"}
                  </Text>
                  {!pair.afterUri && (
                    <Pressable
                      onPress={() => addAfterPhoto(pair)}
                      style={({ pressed }) => [{ marginTop: 4, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.primary }}>+ Nachher-Foto hinzufügen</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </ScreenContainer>
  );
}
