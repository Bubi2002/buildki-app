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
import { useTranslation } from "@/lib/language-provider";
import {
  formatEvidenceTimecode,
  getEvidence,
  isEvidenceDocumentReady,
  updateEvidence,
  type EvidenceItem,
} from "@/lib/evidence-store";

export default function EvidenceManagerScreen() {
  const colors = useColors();
  const { t } = useTranslation();
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
        throw new Error(t('evidence_manager_protocol_project_error' as any));
      }
      const evidence = (await getEvidence(projectId))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const readyEvidence = evidence.filter(isEvidenceDocumentReady);
      setProtocolTitle(protocol.title || t('evidence_manager_document' as any));
      setItems(evidence);
      setSelectedIds(
        Array.isArray(protocol.evidenceIds)
          ? protocol.evidenceIds.filter((id: string) => readyEvidence.some((item) => item.id === id))
          : readyEvidence.map((item) => item.id),
      );
    } catch (error) {
      Alert.alert(
        t('evidence_manager_receipts_unavailable' as any),
        error instanceof Error ? error.message : t('evidence_manager_load_failed' as any),
      );
    } finally {
      setLoading(false);
    }
  }, [params.projectId, params.protocolId, t]);

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
      Alert.alert(t('evidence_manager_finding_required' as any), t('evidence_manager_finding_required_msg' as any));
      return;
    }
    if (item.mediaQuality === "insufficient") {
      Alert.alert(t('evidence_manager_quality_insufficient' as any), t('evidence_manager_quality_insufficient_msg' as any));
      return;
    }
    const updated = await updateEvidence(item.id, {
      reviewStatus: "approved",
      mediaQuality: "suitable",
      reviewNote: t('evidence_manager_review_note' as any),
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
      if (protocolIndex < 0) throw new Error(t('evidence_manager_protocol_not_found' as any));
      protocols[protocolIndex] = {
        ...protocols[protocolIndex],
        evidenceIds: selectedIds,
        evidenceSelectionUpdatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      Alert.alert(
        t('evidence_manager_selection_saved' as any),
        `${selectedIds.length} ${selectedIds.length === 1 ? t('evidence_manager_receipt_one' as any) : t('evidence_manager_receipt_many' as any)} ${t('evidence_manager_used_in_variants' as any)}`,
        [{ text: t('evidence_manager_done' as any), onPress: () => router.back() }],
      );
    } catch (error) {
      Alert.alert(
        t('evidence_manager_save_failed' as any),
        error instanceof Error ? error.message : t('evidence_manager_save_failed_msg' as any),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel={t('evidence_manager_close_selection' as any)}>
          <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('evidence_manager_select_receipts' as any)}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
            {protocolTitle || t('evidence_manager_document' as any)}
          </Text>
        </View>
        <Pressable onPress={() => void saveSelection()} disabled={saving} style={[styles.saveHeader, { opacity: saving ? 0.5 : 1 }]}>
          <Text style={styles.saveHeaderText}>{t('evidence_manager_save' as any)}</Text>
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
              <Text style={[styles.explanationTitle, { color: colors.foreground }]}>{t('evidence_manager_cross_document_title' as any)}</Text>
              <Text style={[styles.explanationText, { color: colors.muted }]}>
                {t('evidence_manager_cross_document_text' as any)}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => setSelectedIds(selectedIds.length === readyItems.length ? [] : readyItems.map((item) => item.id))}
              style={[styles.actionButton, { borderColor: colors.border }]}
            >
              <MaterialIcons name={selectedIds.length === readyItems.length ? "deselect" : "select-all"} size={18} color="#00ACC1" />
              <Text style={[styles.actionText, { color: colors.foreground }]}>{selectedIds.length === readyItems.length ? t('evidence_manager_none' as any) : t('evidence_manager_all_approved' as any)}</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/measure" as any)} style={[styles.actionButton, { borderColor: colors.border }]}>
              <MaterialIcons name="straighten" size={18} color="#00ACC1" />
              <Text style={[styles.actionText, { color: colors.foreground }]}>{t('evidence_manager_measure' as any)}</Text>
            </Pressable>
          </View>

          <Text style={[styles.count, { color: colors.muted }]}>{selectedIds.length} {t('evidence_manager_of' as any)} {readyItems.length} {t('evidence_manager_selected_of_approved' as any)} {items.length - readyItems.length} {t('evidence_manager_in_review' as any)}</Text>

          {items.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border }]}>
              <MaterialIcons name="image-not-supported" size={34} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('evidence_manager_no_approved_receipts' as any)}</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t('evidence_manager_empty_text' as any)}</Text>
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
                      {item.findingText || t('evidence_manager_no_finding_text' as any)}
                    </Text>
                    <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={2}>
                      {item.sourceType === "video_frame"
                        ? `${t('evidence_manager_video' as any)}${timecode ? ` · ${timecode}` : ""}`
                        : item.measurements?.length
                          ? `${item.measurements.length} ${item.measurements.length === 1 ? t('evidence_manager_measurement_one' as any) : t('evidence_manager_measurement_many' as any)}`
                          : t('evidence_manager_photo' as any)}
                    </Text>
                    {!ready && item.reviewStatus !== "rejected" && (
                      <Pressable
                        onPress={() => { void approveEvidence(item); }}
                        style={styles.approveButton}
                      >
                        <MaterialIcons name="verified" size={15} color="#FFFFFF" />
                        <Text style={styles.approveButtonText}>{t('evidence_manager_review_release' as any)}</Text>
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
