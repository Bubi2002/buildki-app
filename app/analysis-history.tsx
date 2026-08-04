import { useState, useEffect, useCallback } from "react";
import { ScrollView, Text, View, Pressable, StyleSheet, TextInput, Modal, FlatList } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { getAnalysisHistory, type AnalysisHistoryEntry } from "@/lib/analysis-history-store";
import { getSourceIcon, getSourceLabel, getSourceColor, type AnalysisSource } from "@/shared/ai-types";

type FilterState = {
  search: string;
  source: AnalysisSource | "all";
  status: "all" | "pending" | "reviewed" | "adopted" | "dismissed";
  project: string;
  room: string;
  trade: string;
  minConfidence: number;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  source: "all",
  status: "all",
  project: "",
  room: "",
  trade: "",
  minConfidence: 0,
  dateFrom: "",
  dateTo: "",
};

export default function AnalysisHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; projectName?: string }>();
  const colors = useColors();
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    project: params.projectId || "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AnalysisHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const history = await getAnalysisHistory();
    setEntries(history);
    setLoading(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(() => {
    loadHistory();
  }); }, [loadHistory]);

  // Apply filters
  const filteredEntries = entries.filter((entry) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matches = entry.summary?.toLowerCase().includes(q)
        || entry.projectName?.toLowerCase().includes(q)
        || entry.roomName?.toLowerCase().includes(q)
        || entry.trade?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (filters.source !== "all" && entry.source !== filters.source) return false;
    if (filters.status !== "all" && entry.status !== filters.status) return false;
    if (filters.project && entry.projectId !== filters.project) return false;
    if (filters.room && entry.roomName !== filters.room) return false;
    if (filters.trade && entry.trade !== filters.trade) return false;
    if (Number(filters.minConfidence) > 0 && (entry.avgConfidence || 0) < Number(filters.minConfidence)) return false;
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      if (new Date(entry.timestamp).getTime() < from) return false;
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo).getTime() + 86400000;
      if (new Date(entry.timestamp).getTime() > to) return false;
    }
    return true;
  });

  const activeFilterCount = Object.entries(filters).filter(([key, val]) => {
    if (key === "search") return false;
    if (key === "minConfidence") return Number(val) > 0;
    return val !== "" && val !== "all";
  }).length;

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case "adopted": return t('analysis_history_status_adopted' as any);
      case "reviewed": return t('analysis_history_status_reviewed' as any);
      case "dismissed": return t('analysis_history_status_dismissed' as any);
      default: return t('analysis_history_status_pending' as any);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "adopted": return "#22C55E";
      case "reviewed": return "#0EA5E9";
      case "dismissed": return "#EF4444";
      default: return "#F59E0B";
    }
  };

  const renderEntry = ({ item }: { item: AnalysisHistoryEntry }) => (
    <Pressable
      onPress={() => setSelectedEntry(item)}
      style={({ pressed }) => [styles.entryCard, { opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={styles.entryHeader}>
        <View style={[styles.sourceTag, { backgroundColor: getSourceColor(item.source as AnalysisSource) + "20" }]}>
          <MaterialIcons name={getSourceIcon(item.source as AnalysisSource) as any} size={12} color={getSourceColor(item.source as AnalysisSource)} />
          <Text style={[styles.sourceTagText, { color: getSourceColor(item.source as AnalysisSource) }]}>
            {getSourceLabel(item.source as AnalysisSource)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "20" }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      <Text style={styles.entrySummary} numberOfLines={2}>{item.summary || t('analysis_history_no_summary' as any)}</Text>

      <View style={styles.entryMeta}>
        <Text style={styles.entryMetaText}>{formatDate(item.timestamp)}</Text>
        {item.projectName && <Text style={styles.entryMetaText}>{item.projectName}</Text>}
        {item.roomName && <Text style={styles.entryMetaText}>{item.roomName}</Text>}
      </View>

      <View style={styles.entryStats}>
        <View style={styles.stat}>
          <MaterialIcons name="warning" size={12} color="#FF9800" />
          <Text style={styles.statText}>{item.defectCount} {t('analysis_history_defects' as any)}</Text>
        </View>
        <View style={styles.stat}>
          <MaterialIcons name="assignment" size={12} color="#5C6BC0" />
          <Text style={styles.statText}>{item.taskCount} {t('analysis_history_tasks' as any)}</Text>
        </View>
        <View style={styles.stat}>
          <MaterialIcons name="trending-up" size={12} color="#66BB6A" />
          <Text style={styles.statText}>{item.progressPercent}%</Text>
        </View>
        {item.avgConfidence != null && (
          <View style={styles.stat}>
            <MaterialIcons name="psychology" size={12} color="#7C4DFF" />
            <Text style={styles.statText}>{Math.round(item.avgConfidence * 100)}%</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  // Detail Modal
  const renderDetailModal = () => {
    if (!selectedEntry) return null;
    return (
      <Modal visible={!!selectedEntry} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <Pressable onPress={() => setSelectedEntry(null)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <MaterialIcons name="close" size={24} color="#F0F4F8" />
            </Pressable>
            <Text style={styles.detailTitle}>{t('analysis_history_detail_title' as any)}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Source & Status */}
            <View style={styles.detailSection}>
              <View style={styles.detailRow}>
                <View style={[styles.sourceTag, { backgroundColor: getSourceColor(selectedEntry.source as AnalysisSource) + "20" }]}>
                  <MaterialIcons name={getSourceIcon(selectedEntry.source as AnalysisSource) as any} size={14} color={getSourceColor(selectedEntry.source as AnalysisSource)} />
                  <Text style={[styles.sourceTagText, { color: getSourceColor(selectedEntry.source as AnalysisSource) }]}>
                    {getSourceLabel(selectedEntry.source as AnalysisSource)}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedEntry.status) + "20" }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(selectedEntry.status) }]}>
                    {getStatusLabel(selectedEntry.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.detailTimestamp}>{formatDate(selectedEntry.timestamp)}</Text>
            </View>

            {/* Images */}
            {selectedEntry.imageUrls && selectedEntry.imageUrls.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>{t('analysis_history_original_images' as any)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {selectedEntry.imageUrls.map((uri, idx) => (
                    <Image key={idx} source={{ uri }} style={styles.detailImage} contentFit="cover" />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Summary */}
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>{t('analysis_history_ai_result' as any)}</Text>
              <Text style={styles.detailText}>{selectedEntry.summary}</Text>
            </View>

            {/* Progress */}
            {selectedEntry.progress && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>{t('analysis_history_progress' as any)}</Text>
                <View style={styles.progressRow}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${selectedEntry.progress.overallPercent}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{selectedEntry.progress.overallPercent}%</Text>
                </View>
                <Text style={styles.detailSubtext}>{t('analysis_history_phase' as any)} {selectedEntry.progress.phase}</Text>
              </View>
            )}

            {/* Defects */}
            {selectedEntry.defects && selectedEntry.defects.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>{t('analysis_history_defects' as any)} ({selectedEntry.defects.length})</Text>
                {selectedEntry.defects.map((defect) => (
                  <View key={defect.id} style={styles.detailListItem}>
                    <View style={[styles.severityDot, { backgroundColor: defect.severity === "critical" ? "#EF4444" : defect.severity === "major" ? "#FF9800" : "#F59E0B" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailItemTitle}>{defect.title}</Text>
                      <Text style={styles.detailItemMeta}>{defect.trade} | {Math.round(defect.confidence * 100)}% {t('analysis_history_confidence' as any)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Tasks */}
            {selectedEntry.tasks && selectedEntry.tasks.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>{t('analysis_history_tasks' as any)} ({selectedEntry.tasks.length})</Text>
                {selectedEntry.tasks.map((task) => (
                  <View key={task.id} style={styles.detailListItem}>
                    <MaterialIcons name="assignment" size={14} color="#5C6BC0" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailItemTitle}>{task.title}</Text>
                      <Text style={styles.detailItemMeta}>{task.trade} | {task.priority}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Observations */}
            {selectedEntry.observations && selectedEntry.observations.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>{t('analysis_history_observations' as any)}</Text>
                {selectedEntry.observations.map((obs, idx) => (
                  <Text key={idx} style={styles.detailObservation}>• {obs}</Text>
                ))}
              </View>
            )}

            {/* Meta info */}
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>{t('analysis_history_report' as any)}</Text>
              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t('analysis_history_project' as any)}</Text>
                  <Text style={styles.metaValue}>{selectedEntry.projectName || "—"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t('analysis_history_room' as any)}</Text>
                  <Text style={styles.metaValue}>{selectedEntry.roomName || "—"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t('analysis_history_trade' as any)}</Text>
                  <Text style={styles.metaValue}>{selectedEntry.trade || "—"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t('analysis_history_photos' as any)}</Text>
                  <Text style={styles.metaValue}>{selectedEntry.photoCount}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t('analysis_history_status_adopted' as any)}</Text>
                  <Text style={styles.metaValue}>{selectedEntry.adoptedDefects} {t('analysis_history_defects' as any)} / {selectedEntry.adoptedTasks} {t('analysis_history_tasks' as any)}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  return (
    <ScreenContainer className="p-0">
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color="#F0F4F8" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('analysis_history_title' as any)}</Text>
        <Pressable onPress={() => setShowFilters(!showFilters)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <View style={{ position: "relative" }}>
            <MaterialIcons name="filter-list" size={24} color={activeFilterCount > 0 ? "#7C4DFF" : "#F0F4F8"} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={18} color="#8FA3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('analysis_history_search_placeholder' as any)}
          placeholderTextColor="#8FA3B8"
          value={filters.search}
          onChangeText={(text) => setFilters(f => ({ ...f, search: text }))}
        />
        {filters.search.length > 0 && (
          <Pressable onPress={() => setFilters(f => ({ ...f, search: "" }))}>
            <MaterialIcons name="close" size={18} color="#8FA3B8" />
          </Pressable>
        )}
      </View>

      {/* Filter Panel */}
      {showFilters && (
        <View style={styles.filterPanel}>
          {/* Source Filter */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>{t('analysis_history_source' as any)}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {(["all", "photo", "speech", "matterport", "document", "manual"] as const).map((src) => (
                <Pressable
                  key={src}
                  onPress={() => setFilters(f => ({ ...f, source: src }))}
                  style={[styles.filterChip, filters.source === src && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, filters.source === src && styles.filterChipTextActive]}>
                    {src === "all" ? t('analysis_history_all' as any) : getSourceLabel(src)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Status Filter */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>{t('analysis_history_status' as any)}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {(["all", "pending", "reviewed", "adopted", "dismissed"] as const).map((st) => (
                <Pressable
                  key={st}
                  onPress={() => setFilters(f => ({ ...f, status: st }))}
                  style={[styles.filterChip, filters.status === st && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, filters.status === st && styles.filterChipTextActive]}>
                    {st === "all" ? t('analysis_history_all' as any) : getStatusLabel(st)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Room Filter */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>{t('analysis_history_room' as any)}</Text>
            <TextInput
              style={styles.filterInput}
              placeholder={t('analysis_history_room_placeholder' as any)}
              placeholderTextColor="#8FA3B8"
              value={filters.room}
              onChangeText={(text) => setFilters(f => ({ ...f, room: text }))}
            />
          </View>

          {/* Trade Filter */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>{t('analysis_history_trade' as any)}</Text>
            <TextInput
              style={styles.filterInput}
              placeholder={t('analysis_history_trade_placeholder' as any)}
              placeholderTextColor="#8FA3B8"
              value={filters.trade}
              onChangeText={(text) => setFilters(f => ({ ...f, trade: text }))}
            />
          </View>

          {/* Reset */}
          <Pressable
            onPress={() => setFilters({ ...DEFAULT_FILTERS, project: params.projectId || "" })}
            style={({ pressed }) => [styles.resetButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.resetButtonText}>{t('analysis_history_reset_filters' as any)}</Text>
          </Pressable>
        </View>
      )}

      {/* Results Count */}
      <View style={styles.resultsBar}>
        <Text style={styles.resultsText}>{filteredEntries.length} {t('analysis_history_analyses' as any)}</Text>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('analysis_history_loading' as any)}</Text>
        </View>
      ) : filteredEntries.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="history" size={48} color="#1E3A5F" />
          <Text style={styles.emptyTitle}>{t('analysis_history_empty_title' as any)}</Text>
          <Text style={styles.emptyText}>
            {entries.length === 0
              ? t('analysis_history_empty_no_entries' as any)
              : t('analysis_history_empty_filtered' as any)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderDetailModal()}
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
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F0F4F8",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#F0F4F8",
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#7C4DFF",
    borderRadius: 0,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
  },
  filterPanel: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
    padding: 12,
    gap: 10,
  },
  filterRow: {
    gap: 4,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#8FA3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 0,
    backgroundColor: "#1E3A5F40",
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: "#7C4DFF30",
  },
  filterChipText: {
    fontSize: 12,
    color: "#8FA3B8",
  },
  filterChipTextActive: {
    color: "#7C4DFF",
    fontWeight: "600",
  },
  filterInput: {
    backgroundColor: "#0A1220",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: "#F0F4F8",
  },
  resetButton: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 0,
    backgroundColor: "#1E3A5F40",
  },
  resetButtonText: {
    fontSize: 12,
    color: "#5DADE2",
    fontWeight: "600",
  },
  resultsBar: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  resultsText: {
    fontSize: 12,
    color: "#8FA3B8",
  },
  entryCard: {
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
    padding: 12,
    marginBottom: 8,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sourceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
  },
  sourceTagText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  entrySummary: {
    fontSize: 13,
    color: "#F0F4F8",
    lineHeight: 18,
  },
  entryMeta: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  entryMetaText: {
    fontSize: 11,
    color: "#8FA3B8",
  },
  entryStats: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1E3A5F40",
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statText: {
    fontSize: 11,
    color: "#8FA3B8",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F0F4F8",
  },
  emptyText: {
    fontSize: 13,
    color: "#8FA3B8",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  // Detail Modal
  detailContainer: {
    flex: 1,
    backgroundColor: "#0A1220",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3A5F",
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F0F4F8",
  },
  detailSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3A5F40",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailTimestamp: {
    fontSize: 12,
    color: "#8FA3B8",
    marginTop: 6,
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5DADE2",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: "#F0F4F8",
    lineHeight: 20,
  },
  detailSubtext: {
    fontSize: 12,
    color: "#8FA3B8",
    marginTop: 4,
  },
  detailImage: {
    width: 120,
    height: 90,
    borderRadius: 0,
    marginRight: 8,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: "#1E3A5F",
    borderRadius: 0,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#66BB6A",
    borderRadius: 0,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#66BB6A",
  },
  detailListItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3A5F20",
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 0,
    marginTop: 4,
  },
  detailItemTitle: {
    fontSize: 13,
    color: "#F0F4F8",
    fontWeight: "500",
  },
  detailItemMeta: {
    fontSize: 11,
    color: "#8FA3B8",
    marginTop: 1,
  },
  detailObservation: {
    fontSize: 13,
    color: "#F0F4F8",
    lineHeight: 18,
    marginBottom: 4,
  },
  metaGrid: {
    gap: 8,
  },
  metaItem: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaLabel: {
    fontSize: 12,
    color: "#8FA3B8",
  },
  metaValue: {
    fontSize: 12,
    color: "#F0F4F8",
    fontWeight: "500",
  },
});
