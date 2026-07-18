/**
 * protoKI – Analyse-Historie Screen
 * 
 * Zeigt alle vergangenen KI-Analysen mit:
 * - Volltextsuche
 * - Filter nach Quelle (photo, speech, matterport, document, manual)
 * - Filter nach Projekt
 * - Detailansicht per Tap
 */

import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getAnalysisHistory,
  clearAnalysisHistory,
  type AnalysisHistoryEntry,
} from "@/lib/analysis-history-store";
import { getSourceIcon, getSourceLabel, getSourceColor } from "@/shared/ai-types";
import type { AnalysisSource } from "@/shared/ai-types";

// ─── Filter Types ────────────────────────────────────────────────────────────

type SourceFilter = AnalysisSource | "all";

export default function AnalysisHistoryScreen() {
  const colors = useColors();
  const router = useRouter();

  // State
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<AnalysisHistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<AnalysisHistoryEntry | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

  // Load data on focus
  useFocusEffect(
    useCallback(() => {
      loadHistory();
      loadProjects();
    }, [])
  );

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const history = await getAnalysisHistory();
      setEntries(history);
      applyFilters(history, searchQuery, sourceFilter, projectFilter);
    } catch (err) {
      console.warn("[AnalysisHistory] Load failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const projectsJson = await AsyncStorage.getItem("projects");
      if (projectsJson) {
        const parsed = JSON.parse(projectsJson);
        setProjects(parsed.map((p: any) => ({ id: p.id, name: p.name })));
      }
    } catch {}
  };

  // Apply filters
  const applyFilters = (
    data: AnalysisHistoryEntry[],
    query: string,
    source: SourceFilter,
    project: string | null,
  ) => {
    let filtered = [...data];

    // Source filter
    if (source !== "all") {
      filtered = filtered.filter(e => e.source === source);
    }

    // Project filter
    if (project) {
      filtered = filtered.filter(e => e.projectId === project);
    }

    // Search
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(e =>
        e.summary.toLowerCase().includes(q) ||
        (e.projectName || "").toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q)
      );
    }

    setFilteredEntries(filtered);
  };

  // Update filters
  useEffect(() => {
    applyFilters(entries, searchQuery, sourceFilter, projectFilter);
  }, [searchQuery, sourceFilter, projectFilter]);

  // Clear history
  const handleClearHistory = () => {
    Alert.alert(
      "Historie löschen",
      "Alle Analyse-Einträge werden unwiderruflich gelöscht.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            await clearAnalysisHistory();
            setEntries([]);
            setFilteredEntries([]);
          },
        },
      ]
    );
  };

  // Format timestamp
  const formatDate = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return ts; }
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  // ─── Detail View ───────────────────────────────────────────────────────────

  if (selectedEntry) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setSelectedEntry(null)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Analyse-Detail</Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          data={[selectedEntry]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={{ gap: 16 }}>
              {/* Source & Time */}
              <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.detailRow}>
                  <MaterialIcons name={getSourceIcon(item.source as AnalysisSource) as any} size={20} color={getSourceColor(item.source as AnalysisSource)} />
                  <Text style={[styles.detailSource, { color: getSourceColor(item.source as AnalysisSource) }]}>
                    {getSourceLabel(item.source as AnalysisSource)}
                  </Text>
                </View>
                <Text style={[styles.detailTime, { color: colors.muted }]}>
                  {formatDate(item.timestamp)} um {formatTime(item.timestamp)}
                </Text>
                {item.projectName && (
                  <View style={[styles.detailProjectBadge, { backgroundColor: colors.primary + "15" }]}>
                    <MaterialIcons name="business" size={14} color={colors.primary} />
                    <Text style={[styles.detailProjectName, { color: colors.primary }]}>{item.projectName}</Text>
                  </View>
                )}
              </View>

              {/* Summary */}
              <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>Zusammenfassung</Text>
                <Text style={[styles.detailText, { color: colors.muted }]}>{item.summary}</Text>
              </View>

              {/* Stats */}
              <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>Ergebnisse</Text>
                <View style={styles.detailStats}>
                  <View style={styles.detailStatItem}>
                    <MaterialIcons name="warning" size={18} color={colors.error} />
                    <Text style={[styles.detailStatNumber, { color: colors.error }]}>{item.defectCount}</Text>
                    <Text style={[styles.detailStatLabel, { color: colors.muted }]}>Mängel</Text>
                  </View>
                  <View style={styles.detailStatItem}>
                    <MaterialIcons name="assignment" size={18} color={colors.primary} />
                    <Text style={[styles.detailStatNumber, { color: colors.primary }]}>{item.taskCount}</Text>
                    <Text style={[styles.detailStatLabel, { color: colors.muted }]}>Aufgaben</Text>
                  </View>
                  <View style={styles.detailStatItem}>
                    <MaterialIcons name="trending-up" size={18} color={colors.success} />
                    <Text style={[styles.detailStatNumber, { color: colors.success }]}>{item.progressPercent}%</Text>
                    <Text style={[styles.detailStatLabel, { color: colors.muted }]}>Fortschritt</Text>
                  </View>
                  <View style={styles.detailStatItem}>
                    <MaterialIcons name="photo" size={18} color={colors.muted} />
                    <Text style={[styles.detailStatNumber, { color: colors.foreground }]}>{item.photoCount}</Text>
                    <Text style={[styles.detailStatLabel, { color: colors.muted }]}>Fotos</Text>
                  </View>
                </View>
              </View>

              {/* Adoption Stats */}
              <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.foreground }]}>Übernahme</Text>
                <View style={styles.adoptionRow}>
                  <View style={[styles.adoptionBadge, { backgroundColor: colors.success + "15" }]}>
                    <MaterialIcons name="check-circle" size={14} color={colors.success} />
                    <Text style={[styles.adoptionText, { color: colors.success }]}>
                      {item.adoptedDefects} Mängel übernommen
                    </Text>
                  </View>
                  <View style={[styles.adoptionBadge, { backgroundColor: colors.primary + "15" }]}>
                    <MaterialIcons name="playlist-add-check" size={14} color={colors.primary} />
                    <Text style={[styles.adoptionText, { color: colors.primary }]}>
                      {item.adoptedTasks} Aufgaben übernommen
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      </ScreenContainer>
    );
  }

  // ─── List View ─────────────────────────────────────────────────────────────

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Analyse-Historie</Text>
        <Pressable onPress={handleClearHistory} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="delete-outline" size={22} color={colors.muted} />
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="search" size={18} color={colors.muted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Analysen durchsuchen..."
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.foreground }]}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <MaterialIcons name="close" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* Source Filter Chips */}
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { key: "all", label: "Alle", icon: "list" },
            { key: "photo", label: "Foto", icon: "photo-camera" },
            { key: "speech", label: "Sprache", icon: "mic" },
            { key: "document", label: "Dokument", icon: "description" },
            { key: "matterport", label: "Matterport", icon: "view-in-ar" },
            { key: "manual", label: "Manuell", icon: "edit" },
          ]}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSourceFilter(item.key as SourceFilter)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: sourceFilter === item.key ? colors.primary + "20" : colors.surface,
                  borderColor: sourceFilter === item.key ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialIcons
                name={item.icon as any}
                size={14}
                color={sourceFilter === item.key ? colors.primary : colors.muted}
              />
              <Text style={[
                styles.filterLabel,
                { color: sourceFilter === item.key ? colors.primary : colors.muted },
              ]}>
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {/* Project Filter */}
      {projects.length > 0 && (
        <View style={styles.projectFilterRow}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ id: null, name: "Alle Projekte" }, ...projects]}
            keyExtractor={(item) => item.id || "all"}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setProjectFilter(item.id)}
                style={[
                  styles.projectChip,
                  {
                    backgroundColor: projectFilter === item.id ? colors.primary + "15" : "transparent",
                    borderColor: projectFilter === item.id ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[
                  styles.projectChipText,
                  { color: projectFilter === item.id ? colors.primary : colors.muted },
                ]}>
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Results Count */}
      <View style={styles.countRow}>
        <Text style={[styles.countText, { color: colors.muted }]}>
          {filteredEntries.length} {filteredEntries.length === 1 ? "Analyse" : "Analysen"}
        </Text>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredEntries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="analytics" size={48} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {entries.length === 0 ? "Keine Analysen vorhanden" : "Keine Treffer"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            {entries.length === 0
              ? "Starte eine KI-Bildanalyse um Ergebnisse hier zu sehen"
              : "Versuche andere Suchbegriffe oder Filter"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedEntry(item)}
              style={({ pressed }) => [
                styles.entryCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <View style={styles.entryHeader}>
                <View style={[styles.sourceIcon, { backgroundColor: getSourceColor(item.source as AnalysisSource) + "20" }]}>
                  <MaterialIcons
                    name={getSourceIcon(item.source as AnalysisSource) as any}
                    size={16}
                    color={getSourceColor(item.source as AnalysisSource)}
                  />
                </View>
                <View style={styles.entryMeta}>
                  <Text style={[styles.entrySource, { color: colors.foreground }]}>
                    {getSourceLabel(item.source as AnalysisSource)}
                  </Text>
                  <Text style={[styles.entryDate, { color: colors.muted }]}>
                    {formatDate(item.timestamp)} · {formatTime(item.timestamp)}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </View>

              <Text style={[styles.entrySummary, { color: colors.muted }]} numberOfLines={2}>
                {item.summary}
              </Text>

              <View style={styles.entryStats}>
                {item.defectCount > 0 && (
                  <View style={[styles.entryStat, { backgroundColor: colors.error + "15" }]}>
                    <Text style={[styles.entryStatText, { color: colors.error }]}>
                      {item.defectCount} Mängel
                    </Text>
                  </View>
                )}
                {item.taskCount > 0 && (
                  <View style={[styles.entryStat, { backgroundColor: colors.primary + "15" }]}>
                    <Text style={[styles.entryStatText, { color: colors.primary }]}>
                      {item.taskCount} Aufgaben
                    </Text>
                  </View>
                )}
                {item.progressPercent > 0 && (
                  <View style={[styles.entryStat, { backgroundColor: colors.success + "15" }]}>
                    <Text style={[styles.entryStatText, { color: colors.success }]}>
                      {item.progressPercent}%
                    </Text>
                  </View>
                )}
                {item.projectName && (
                  <View style={[styles.entryStat, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.entryStatText, { color: colors.muted }]} numberOfLines={1}>
                      {item.projectName}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
        />
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
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  filterRow: {
    marginTop: 12,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  projectFilterRow: {
    marginTop: 8,
  },
  projectChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  projectChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  countRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: "500",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
  },
  entryCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  sourceIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  entryMeta: {
    flex: 1,
  },
  entrySource: {
    fontSize: 14,
    fontWeight: "600",
  },
  entryDate: {
    fontSize: 11,
  },
  entrySummary: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  entryStats: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  entryStat: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  entryStatText: {
    fontSize: 10,
    fontWeight: "700",
  },
  // Detail styles
  detailCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  detailSource: {
    fontSize: 15,
    fontWeight: "700",
  },
  detailTime: {
    fontSize: 13,
    marginBottom: 8,
  },
  detailProjectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  detailProjectName: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  detailText: {
    fontSize: 13,
    lineHeight: 20,
  },
  detailStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  detailStatItem: {
    alignItems: "center",
    gap: 4,
  },
  detailStatNumber: {
    fontSize: 22,
    fontWeight: "800",
  },
  detailStatLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  adoptionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  adoptionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  adoptionText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
