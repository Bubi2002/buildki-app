import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  formatEvidenceTimecode,
  getEvidence,
  isEvidenceDocumentReady,
  updateEvidence,
  type EvidenceItem,
} from "@/lib/evidence-store";

export default function EvidenceManagerScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ protocolId?: string; projectId?: string }>();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [protocolTitle, setProtocolTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadEvidenceSelection = useCallback(async () => {
    try {
      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      const protocol = protocols.find((item: any) => item.id === params.protocolId);
      const projectId = params.projectId || protocol?.projectId;
      if (!protocol || !projectId) {
        throw new Error("Protokoll oder Projekt konnte nicht ermittelt werden.");
      }
      const evidence = (await getEvidence(projectId))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const readyEvidence = evidence.filter(isEvidenceDocumentReady);
      setProtocolTitle(protocol.title || "Dokument");
      setItems(evidence);
      setSelectedIds(
        Array.isArray(protocol.evidenceIds)
          ? protocol.evidenceIds.filter((id: string) => readyEvidence.some((item) => item.id === id))
          : readyEvidence.map((item) => item.id),
      );
    } catch (error) {
      Alert.alert(
        "Belege nicht verfügbar",
        error instanceof Error ? error.message : "Die Belegauswahl konnte nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [params.projectId, params.protocolId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadEvidenceSelection();
    });
  }, [loadEvidenceSelection]);

  const readyItems = items.filter(isEvidenceDocumentReady);

  const toggleEvidence = (evidenceId: string) => {
    const item = items.find((candidate) => candidate.id === evidenceId);
    if (!item || !isEvidenceDocumentReady(item)) return;
    setSelectedIds((current) =>
      current.includes(evidenceId)
        ? current.filter((id) => id !== evidenceId)
        : [...current, evidenceId],
    );
  };

  async function approveEvidence(item: EvidenceItem) {
    if (!item.findingText?.trim()) {
      Alert.alert("Befundtext erforderlich", "Bitte erfassen Sie vor der Freigabe einen eindeutigen Befundtext am Beleg.");
      return;
    }
    if (item.mediaQuality === "insufficient") {
      Alert.alert("Bildqualität unzureichend", "Dieser Beleg kann nicht freigegeben werden. Bitte erzeugen Sie ein neues, schärferes Standbild oder Foto.");
      return;
    }
    const updated = await updateEvidence(item.id, {
      reviewStatus: "approved",
      mediaQuality: "suitable",
      reviewNote: "Vom Nutzer visuell geprüft und für Dokumente freigegeben.",
    });
    if (!updated) return;
    setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    setSelectedIds((current) => current.includes(updated.id) ? current : [...current, updated.id]);
  }

  async function saveSelection() {
    if (!params.protocolId) return;
    setSaving(true);
    try {
      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      const protocolIndex = protocols.findIndex((item: any) => item.id === params.protocolId);
      if (protocolIndex < 0) throw new Error("Protokoll wurde nicht gefunden.");
      protocols[protocolIndex] = {
        ...protocols[protocolIndex],
        evidenceIds: selectedIds,
        evidenceSelectionUpdatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      Alert.alert(
        "Belegauswahl gespeichert",
        `${selectedIds.length} Beleg${selectedIds.length === 1 ? "" : "e"} werden in allen neu erzeugten Dokumentvarianten dieses Protokolls verwendet.`,
        [{ text: "Fertig", onPress: () => router.back() }],
      );
    } catch (error) {
      Alert.alert(
        "Speichern fehlgeschlagen",
        error instanceof Error ? error.message : "Die Belegauswahl konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Belegauswahl schließen">
          <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Belege auswählen</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
            {protocolTitle || "Dokument"}
          </Text>
        </View>
        <Pressable onPress={() => void saveSelection()} disabled={saving} style={[styles.saveHeader, { opacity: saving ? 0.5 : 1 }]}>
          <Text style={styles.saveHeaderText}>Speichern</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#00ACC1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.explanation, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <MaterialIcons name="verified" size={24} color="#00ACC1" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.explanationTitle, { color: colors.foreground }]}>Dokumentübergreifende Belegauswahl</Text>
              <Text style={[styles.explanationText, { color: colors.muted }]}>
                Ausgewählte Fotos, Videostandbilder und Messungen bleiben mit ihrem Befund, Zeitcode und Quellenmedium verknüpft. Nicht ausgewählte Belege werden nicht in neue Dokumentversionen übernommen.
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => setSelectedIds(selectedIds.length === readyItems.length ? [] : readyItems.map((item) => item.id))}
              style={[styles.actionButton, { borderColor: colors.border }]}
            >
              <MaterialIcons name={selectedIds.length === readyItems.length ? "deselect" : "select-all"} size={18} color="#00ACC1" />
              <Text style={[styles.actionText, { color: colors.foreground }]}>{selectedIds.length === readyItems.length ? "Keine" : "Alle freigegebenen"}</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/measure" as any)} style={[styles.actionButton, { borderColor: colors.border }]}>
              <MaterialIcons name="straighten" size={18} color="#00ACC1" />
              <Text style={[styles.actionText, { color: colors.foreground }]}>Messen</Text>
            </Pressable>
          </View>

          <Text style={[styles.count, { color: colors.muted }]}>{selectedIds.length} von {readyItems.length} freigegebenen Belegen ausgewählt · {items.length - readyItems.length} in Prüfung</Text>

          {items.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border }]}>
              <MaterialIcons name="image-not-supported" size={34} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Keine freigegebenen Belege</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>Erstellen oder prüfen Sie zunächst Fotos, Videostandbilder oder Messbelege.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {items.map((item) => {
                const ready = isEvidenceDocumentReady(item);
                const selected = ready && selectedIds.includes(item.id);
                const timecode = formatEvidenceTimecode(item.videoTimeSeconds);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleEvidence(item.id)}
                    style={[
                      styles.card,
                      {
                        borderColor: selected ? "#00ACC1" : ready ? colors.border : "#F59E0B",
                        backgroundColor: colors.surface,
                        opacity: item.reviewStatus === "rejected" ? 0.55 : 1,
                      },
                    ]}
                  >
                    <Image source={{ uri: item.previewUri || item.originalUri }} style={styles.image} contentFit="cover" />
                    <View style={[styles.check, { backgroundColor: selected ? "#00ACC1" : ready ? "rgba(0,0,0,0.6)" : "#F59E0B" }]}>
                      <MaterialIcons name={selected ? "check" : ready ? "add" : "hourglass-top"} size={16} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.finding, { color: colors.foreground }]} numberOfLines={3}>
                      {item.findingText || "Beleg ohne Befundtext"}
                    </Text>
                    <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={2}>
                      {item.sourceType === "video_frame"
                        ? `Video${timecode ? ` · ${timecode}` : ""}`
                        : item.measurements?.length
                          ? `${item.measurements.length} Messung${item.measurements.length === 1 ? "" : "en"}`
                          : "Foto"}
                    </Text>
                    {!ready && item.reviewStatus !== "rejected" && (
                      <Pressable
                        onPress={() => { void approveEvidence(item); }}
                        style={styles.approveButton}
                      >
                        <MaterialIcons name="verified" size={15} color="#FFFFFF" />
                        <Text style={styles.approveButtonText}>Prüfen & freigeben</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 74, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
  saveHeader: { minHeight: 38, paddingHorizontal: 12, backgroundColor: "#00ACC1", justifyContent: "center" },
  saveHeaderText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 48 },
  explanation: { borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  explanationTitle: { fontSize: 14, fontWeight: "800" },
  explanationText: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionButton: { flex: 1, minHeight: 44, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionText: { fontSize: 13, fontWeight: "700" },
  count: { fontSize: 12, marginVertical: 12 },
  empty: { borderWidth: 1, padding: 24, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "48%" as any, borderWidth: 2, padding: 7, position: "relative" },
  image: { width: "100%", height: 116, backgroundColor: "#111827" },
  check: { position: "absolute", top: 12, right: 12, width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  finding: { fontSize: 12, lineHeight: 16, fontWeight: "800", marginTop: 7 },
  meta: { fontSize: 10, lineHeight: 14, marginTop: 5 },
  approveButton: { minHeight: 34, marginTop: 8, paddingHorizontal: 8, backgroundColor: "#C26A00", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  approveButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
});
