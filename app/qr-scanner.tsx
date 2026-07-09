import { useState, useEffect } from "react";
import { View, Text, Pressable, Alert, StyleSheet, FlatList, Platform, TextInput, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

const QR_SCANS_KEY = "qr-scans";

type QRScan = {
  id: string;
  data: string;
  type: string;
  label: string;
  category: "material" | "bauteil" | "werkzeug" | "dokument" | "sonstiges";
  projectId?: string;
  scannedAt: string;
  note: string;
};

function getCategories(t: (key: any) => string) { return [
  { id: "material" as const, label: t('material'), icon: "inventory" },
  { id: "bauteil" as const, label: t('bauteil'), icon: "build" },
  { id: "werkzeug" as const, label: t('werkzeug'), icon: "handyman" },
  { id: "dokument" as const, label: t('dokument'), icon: "description" },
  { id: "sonstiges" as const, label: t('sonstiges'), icon: "more-horiz" },
]; }

export default function QRScannerScreen() {
  const { t } = useTranslation();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const [scanResult, setScanResult] = useState<{ type: string; data: string } | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<QRScan["category"]>("material");
  const [history, setHistory] = useState<QRScan[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(QR_SCANS_KEY);
      const all: QRScan[] = stored ? JSON.parse(stored) : [];
      const filtered = projectId ? all.filter((s) => s.projectId === projectId) : all;
      setHistory(filtered.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()));
    } catch {}
  };

  const onBarcodeScanned = ({ type, data }: BarcodeScanningResult) => {
    setScanned(true);
    setScanResult({ type, data });
    setShowCamera(false);
    // Auto-fill label from data if it looks like a product code
    if (data.length < 50) {
      setLabel(data);
    }
  };

  const saveScan = async () => {
    if (!scanResult) return;
    if (!label.trim()) {
      Alert.alert(t('alert_fehler'), t('msg_bitte_gib_eine_bezeichnung_ein'));
      return;
    }

    const scan: QRScan = {
      id: `scan_${Date.now()}`,
      data: scanResult.data,
      type: scanResult.type,
      label: label.trim(),
      category,
      projectId: projectId || undefined,
      scannedAt: new Date().toISOString(),
      note: note.trim(),
    };

    try {
      const stored = await AsyncStorage.getItem(QR_SCANS_KEY);
      const all: QRScan[] = stored ? JSON.parse(stored) : [];
      all.push(scan);
      await AsyncStorage.setItem(QR_SCANS_KEY, JSON.stringify(all));
      Alert.alert(t('alert_gespeichert'), `"${label}" wurde dem Protokoll zugeordnet.`);
      resetScan();
      loadHistory();
    } catch {
      Alert.alert(t('alert_fehler'), t('msg_scan_konnte_nicht_gespeichert_werden'));
    }
  };

  const resetScan = () => {
    setScanned(false);
    setScanResult(null);
    setLabel("");
    setNote("");
    setCategory("material");
    setShowCamera(true);
  };

  const deleteScan = async (id: string) => {
    Alert.alert(t('alert_loeschen'), t('msg_scaneintrag_wirklich_loeschen'), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_loeschen'),
        style: "destructive",
        onPress: async () => {
          const stored = await AsyncStorage.getItem(QR_SCANS_KEY);
          const all: QRScan[] = stored ? JSON.parse(stored) : [];
          const filtered = all.filter((s) => s.id !== id);
          await AsyncStorage.setItem(QR_SCANS_KEY, JSON.stringify(filtered));
          loadHistory();
        },
      },
    ]);
  };

  // Permission handling
  if (!permission) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text style={{ color: colors.muted }}>{t('kamera_wird_geladen')}</Text>
      </ScreenContainer>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenContainer className="flex-1">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
          <MaterialIcons name="qr-code-scanner" size={64} color={colors.muted} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginTop: 16, textAlign: "center" }}>
            Kamera-Zugriff benötigt
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: "center" }}>
            Um QR-Codes und Barcodes zu scannen, benötigt die App Zugriff auf deine Kamera.
          </Text>
          <Pressable
            onPress={requestPermission}
            style={({ pressed }) => [{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 0, marginTop: 24, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "600" }}>{t('kamera_erlauben')}</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginTop: 16, opacity: pressed ? 0.5 : 1 }]}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>{t('back')}</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('qrcode_scanner')}</Text>
        <Pressable onPress={() => setShowHistory(!showHistory)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
          <MaterialIcons name={showHistory ? "qr-code-scanner" : "history"} size={24} color={colors.primary} />
        </Pressable>
      </View>

      {showHistory ? (
        /* History View */
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
              Scan-Verlauf ({history.length})
            </Text>
          </View>
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 60 }}>
                <MaterialIcons name="qr-code" size={48} color={colors.muted} />
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>{t('noch_keine_scans')}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const cat = getCategories(t).find((c) => c.id === item.category);
              return (
                <View style={[styles.historyItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 0, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name={(cat?.icon || "qr-code") as any} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{item.label}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                        {cat?.label} • {new Date(item.scannedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                      {item.note ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{item.note}</Text> : null}
                    </View>
                    <Pressable onPress={() => deleteScan(item.id)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 6 }]}>
                      <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 8, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }} numberOfLines={1}>
                    {item.data}
                  </Text>
                </View>
              );
            }}
          />
        </View>
      ) : showCamera ? (
        /* Camera View */
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, borderRadius: 0, overflow: "hidden", margin: 16 }}>
            {Platform.OS === "web" ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
                <MaterialIcons name="qr-code-scanner" size={64} color={colors.muted} />
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12, textAlign: "center" }}>
                  QR-Code Scanner ist nur auf dem Gerät verfügbar.{"\n"}Nutze die Expo Go App zum Testen.
                </Text>
                {/* Manual input for web testing */}
                <TextInput
                  placeholder={t('qrcode_daten_manuell_eingeben')}
                  placeholderTextColor={colors.muted}
                  style={{ marginTop: 20, padding: 12, borderRadius: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, width: "80%", fontSize: 14 }}
                  onSubmitEditing={(e) => {
                    if (e.nativeEvent.text.trim()) {
                      onBarcodeScanned({ type: "qr", data: e.nativeEvent.text.trim(), cornerPoints: [], bounds: { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } } });
                    }
                  }}
                  returnKeyType="done"
                />
              </View>
            ) : (
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "datamatrix"] }}
                onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
              >
                {/* Scan overlay */}
                <View style={styles.overlay}>
                  <View style={styles.scanFrame}>
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                  </View>
                  <Text style={styles.scanHint}>{t('qrcode_oder_barcode_in')}</Text>
                </View>
              </CameraView>
            )}
          </View>

          {/* Supported formats */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
              Unterstützt: QR-Code, EAN-13, EAN-8, Code 128, Code 39, DataMatrix
            </Text>
          </View>
        </View>
      ) : (
        /* Scan Result View */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Scan Data */}
          <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <MaterialIcons name="qr-code" size={24} color={colors.success} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{t('scan_erfolgreich')}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", backgroundColor: colors.background, padding: 10, borderRadius: 0 }}>
              {scanResult?.data}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
              Typ: {scanResult?.type}
            </Text>
          </View>

          {/* Category Selection */}
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 20, marginBottom: 10 }}>{t('kategorie')}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {getCategories(t).map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => setCategory(cat.id)}
                style={({ pressed }) => [{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 0,
                  borderWidth: 1.5,
                  borderColor: category === cat.id ? colors.primary : colors.border,
                  backgroundColor: category === cat.id ? colors.primary + "10" : "transparent",
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MaterialIcons name={cat.icon as any} size={16} color={category === cat.id ? colors.primary : colors.muted} />
                <Text style={{ fontSize: 13, fontWeight: "500", color: category === cat.id ? colors.primary : colors.foreground }}>{cat.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Label */}
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 20, marginBottom: 8 }}>{t('bezeichnung')}</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder={t('placeholder_zb_stahltraeger')}
            placeholderTextColor={colors.muted}
            style={{ padding: 14, borderRadius: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground, fontSize: 15 }}
          />

          {/* Note */}
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 16, marginBottom: 8 }}>{t('notiz_optional')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('zusaetzliche_informationen')}
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={{ padding: 14, borderRadius: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground, fontSize: 14, minHeight: 80 }}
          />

          {/* Actions */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
            <Pressable
              onPress={resetScan}
              style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 0, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('erneut_scannen')}</Text>
            </Pressable>
            <Pressable
              onPress={saveScan}
              style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 0, backgroundColor: colors.primary, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFF" }}>{t('save')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#FFFFFF",
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanHint: {
    color: "#FFFFFF",
    fontSize: 14,
    marginTop: 24,
    textAlign: "center",
    fontWeight: "500",
  },
  resultCard: {
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
  },
  historyItem: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 10,
  },
});
