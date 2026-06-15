import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Protocol = {
  id: string;
  title: string;
  transcription: string;
  protocol: string;
  templateName?: string;
  duration: number;
  createdAt: string;
  status: "processing" | "ready" | "sent";
  todos?: Array<{ task: string; done: boolean }>;
  isFavorite?: boolean;
  isArchived?: boolean;
  tags?: string[];
  recordingMode?: string;
  projectId?: string;
  protocolNumber?: string;
};

type SortOption = "date_desc" | "date_asc" | "name_asc" | "name_desc" | "duration_desc";
type FilterOption = "all" | "favorites" | "archived";

export default function ProtocolsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [featureFlags, setFeatureFlags] = useState({ protocolCompare: false, csvExport: true, statistics: true });

  useFocusEffect(
    useCallback(() => {
      loadProtocols();
      loadFeatureFlags();
      setBatchMode(false);
      setSelectedIds(new Set());
    }, [])
  );

  const loadFeatureFlags = async () => {
    const { isFeatureEnabled } = require("@/lib/feature-toggles");
    const [protocolCompare, csvExport, statistics] = await Promise.all([
      isFeatureEnabled("protocolCompare"),
      isFeatureEnabled("csvExport"),
      isFeatureEnabled("statistics"),
    ]);
    setFeatureFlags({ protocolCompare, csvExport, statistics });
  };

  const loadProtocols = async () => {
    try {
      const stored = await AsyncStorage.getItem("protocols");
      if (stored) {
        let parsed = JSON.parse(stored);
        // Migration: Add projectName to protocols that have projectId but no projectName
        const needsMigration = parsed.some((p: any) => p.projectId && !p.projectName);
        if (needsMigration) {
          const projectsStr = await AsyncStorage.getItem("projects");
          const projects = projectsStr ? JSON.parse(projectsStr) : [];
          parsed = parsed.map((p: any) => {
            if (p.projectId && !p.projectName) {
              const proj = projects.find((pr: any) => pr.id === p.projectId);
              if (proj) return { ...p, projectName: proj.name };
            }
            return p;
          });
          await AsyncStorage.setItem("protocols", JSON.stringify(parsed));
        }
        setProtocols(parsed);
      }
    } catch (error) {
      console.error("Error loading protocols:", error);
    }
  };

  const saveProtocols = async (updated: Protocol[]) => {
    setProtocols(updated);
    await AsyncStorage.setItem("protocols", JSON.stringify(updated));
  };

  const toggleFavorite = async (id: string) => {
    const updated = protocols.map((p) =>
      p.id === id ? { ...p, isFavorite: !p.isFavorite } : p
    );
    await saveProtocols(updated);
  };

  const archiveProtocol = async (id: string) => {
    const updated = protocols.map((p) =>
      p.id === id ? { ...p, isArchived: !p.isArchived } : p
    );
    await saveProtocols(updated);
  };

  const duplicateProtocol = async (item: Protocol) => {
    const duplicate: Protocol = {
      ...item,
      id: Date.now().toString(),
      title: `${item.title} (Kopie)`,
      createdAt: new Date().toISOString(),
      status: "ready",
      isFavorite: false,
      isArchived: false,
    };
    const updated = [duplicate, ...protocols];
    await saveProtocols(updated);
    Alert.alert("Dupliziert", "Protokoll wurde als Kopie erstellt.");
  };

  const deleteProtocol = (id: string) => {
    Alert.alert(
      "Protokoll löschen",
      "Möchtest du dieses Protokoll wirklich löschen?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            const updated = protocols.filter((p) => p.id !== id);
            await saveProtocols(updated);
          },
        },
      ]
    );
  };

  // Batch actions
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    const allIds = new Set(getDisplayedProtocols().map((p) => p.id));
    setSelectedIds(allIds);
  };

  const batchDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      `${selectedIds.size} Protokolle löschen`,
      "Möchtest du die ausgewählten Protokolle wirklich löschen?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            const updated = protocols.filter((p) => !selectedIds.has(p.id));
            await saveProtocols(updated);
            setBatchMode(false);
            setSelectedIds(new Set());
          },
        },
      ]
    );
  };

  const batchArchive = async () => {
    if (selectedIds.size === 0) return;
    const updated = protocols.map((p) =>
      selectedIds.has(p.id) ? { ...p, isArchived: true } : p
    );
    await saveProtocols(updated);
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const batchFavorite = async () => {
    if (selectedIds.size === 0) return;
    const updated = protocols.map((p) =>
      selectedIds.has(p.id) ? { ...p, isFavorite: true } : p
    );
    await saveProtocols(updated);
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusColor = (status: Protocol["status"]) => {
    switch (status) {
      case "ready": return colors.success;
      case "processing": return colors.warning;
      case "sent": return colors.primary;
      default: return colors.muted;
    }
  };

  const getStatusLabel = (status: Protocol["status"]) => {
    switch (status) {
      case "ready": return "Fertig";
      case "processing": return "Verarbeitung";
      case "sent": return "Gesendet";
      default: return status;
    }
  };

  const sortProtocols = (list: Protocol[]): Protocol[] => {
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "date_desc": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "date_asc": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name_asc": return a.title.localeCompare(b.title, "de");
        case "name_desc": return b.title.localeCompare(a.title, "de");
        case "duration_desc": return (b.duration || 0) - (a.duration || 0);
        default: return 0;
      }
    });
  };

  const getDisplayedProtocols = (): Protocol[] => {
    let filtered = protocols;

    // Filter by category
    switch (filterBy) {
      case "favorites":
        filtered = filtered.filter((p) => p.isFavorite);
        break;
      case "archived":
        filtered = filtered.filter((p) => p.isArchived);
        break;
      case "all":
      default:
        filtered = filtered.filter((p) => !p.isArchived);
        break;
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((p) =>
        p.title.toLowerCase().includes(query) ||
        p.protocol.toLowerCase().includes(query) ||
        p.transcription.toLowerCase().includes(query) ||
        (p.templateName && p.templateName.toLowerCase().includes(query)) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(query)))
      );
    }

    return sortProtocols(filtered);
  };

  const displayedProtocols = getDisplayedProtocols();

  const openTodosCount = protocols.reduce((count, p) => {
    if (p.todos) {
      return count + p.todos.filter((t: any) => !t.done).length;
    }
    return count;
  }, 0);

  const showContextMenu = (item: Protocol) => {
    const actions: any[] = [
      { text: item.isFavorite ? "Favorit entfernen" : "Als Favorit", onPress: () => toggleFavorite(item.id) },
      { text: item.isArchived ? "Wiederherstellen" : "Archivieren", onPress: () => archiveProtocol(item.id) },
      { text: "Duplizieren", onPress: () => duplicateProtocol(item) },
      { text: "Löschen", style: "destructive", onPress: () => deleteProtocol(item.id) },
      { text: "Abbrechen", style: "cancel" },
    ];
    Alert.alert(item.title, "Aktion wählen:", actions);
  };

  const renderItem = ({ item }: { item: Protocol }) => (
    <Pressable
      onPress={() => {
        if (batchMode) {
          toggleSelect(item.id);
        } else {
          router.push(`/protocol-detail?id=${item.id}` as any);
        }
      }}
      onLongPress={() => {
        if (!batchMode) showContextMenu(item);
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: batchMode && selectedIds.has(item.id)
            ? colors.primary + "15"
            : colors.surface,
          borderColor: batchMode && selectedIds.has(item.id)
            ? colors.primary
            : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          {batchMode && (
            <MaterialIcons
              name={selectedIds.has(item.id) ? "check-circle" : "radio-button-unchecked"}
              size={22}
              color={selectedIds.has(item.id) ? colors.primary : colors.muted}
            />
          )}
          {item.isFavorite && !batchMode && (
            <MaterialIcons name="star" size={18} color="#FFC107" />
          )}
          <MaterialIcons
            name={item.recordingMode === "audio" ? "mic" : item.recordingMode === "audio-photo" ? "photo-camera" : "edit-note"}
            size={18}
            color={colors.primary}
          />
          <Text
            style={[styles.cardTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "20" }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {item.protocolNumber && (
          <View style={[styles.numberBadge, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
            <Text style={[styles.numberBadgeText, { color: colors.primary }]}>{item.protocolNumber}</Text>
          </View>
        )}
        {item.templateName && (
          <Text style={[styles.templateBadge, { color: colors.primary }]}>
            {item.templateName}
          </Text>
        )}
      </View>

      <Text
        style={[styles.cardPreview, { color: colors.muted }]}
        numberOfLines={2}
      >
        {item.protocol.substring(0, 120)}
      </Text>

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <View style={styles.tagRow}>
          {item.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={[styles.tagChip, { backgroundColor: colors.primary + "15" }]}>
              <Text style={[styles.tagChipText, { color: colors.primary }]}>{tag}</Text>
            </View>
          ))}
          {item.tags.length > 3 && (
            <Text style={[styles.moreTagsText, { color: colors.muted }]}>+{item.tags.length - 3}</Text>
          )}
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.cardMeta}>
          <MaterialIcons name="event" size={14} color={colors.muted} />
          <Text style={[styles.cardMetaText, { color: colors.muted }]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <MaterialIcons name="timer" size={14} color={colors.muted} />
          <Text style={[styles.cardMetaText, { color: colors.muted }]}>
            {formatDuration(item.duration)}
          </Text>
        </View>
        {item.todos && item.todos.filter((t: any) => !t.done).length > 0 && (
          <View style={styles.cardMeta}>
            <MaterialIcons name="check-box" size={14} color={colors.warning} />
            <Text style={[styles.cardMetaText, { color: colors.warning }]}>
              {item.todos.filter((t: any) => !t.done).length} offen
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      {searchQuery.trim() ? (
        <>
          <MaterialIcons name="search-off" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Keine Ergebnisse</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Für "{searchQuery}" wurden keine Protokolle gefunden.
          </Text>
        </>
      ) : filterBy === "favorites" ? (
        <>
          <MaterialIcons name="star-outline" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Keine Favoriten</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Halte ein Protokoll gedrückt, um es als Favorit zu markieren.
          </Text>
        </>
      ) : filterBy === "archived" ? (
        <>
          <MaterialIcons name="archive" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Archiv leer</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Archivierte Protokolle erscheinen hier.
          </Text>
        </>
      ) : (
        <>
          <MaterialIcons name="mic-none" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Noch keine Protokolle</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Starte eine Aufnahme, um dein erstes Protokoll zu erstellen.
          </Text>
        </>
      )}
    </View>
  );

  const sortOptions: { key: SortOption; label: string; icon: string }[] = [
    { key: "date_desc", label: "Neueste zuerst", icon: "arrow-downward" },
    { key: "date_asc", label: "Älteste zuerst", icon: "arrow-upward" },
    { key: "name_asc", label: "Name A-Z", icon: "sort-by-alpha" },
    { key: "name_desc", label: "Name Z-A", icon: "sort-by-alpha" },
    { key: "duration_desc", label: "Längste zuerst", icon: "timer" },
  ];

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.screenTitle, { color: colors.foreground }]}>
              Protokolle
            </Text>
            <Text style={[styles.screenSubtitle, { color: colors.muted }]}>
              {displayedProtocols.length} Protokoll{displayedProtocols.length !== 1 ? "e" : ""}
              {filterBy === "favorites" ? " (Favoriten)" : filterBy === "archived" ? " (Archiv)" : ""}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {/* Dashboard */}
            {featureFlags.statistics && <Pressable
              onPress={() => router.push("/dashboard" as any)}
              style={({ pressed }) => [styles.headerBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="bar-chart" size={20} color={colors.primary} />
            </Pressable>}
            {/* Quick Note */}
            <Pressable
              onPress={() => router.push("/quick-note" as any)}
              style={({ pressed }) => [styles.headerBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="edit-note" size={20} color={colors.primary} />
            </Pressable>
            {/* Projects */}
            <Pressable
              onPress={() => router.push("/projects" as any)}
              style={({ pressed }) => [styles.headerBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="folder" size={20} color={colors.primary} />
            </Pressable>
            {/* Tasks */}
            <Pressable
              onPress={() => router.push("/tasks" as any)}
              style={({ pressed }) => [styles.headerBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="checklist" size={20} color={colors.primary} />
              {openTodosCount > 0 && (
                <View style={[styles.todoBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.todoBadgeText}>{openTodosCount}</Text>
                </View>
              )}
            </Pressable>
            {/* Compare */}
            {featureFlags.protocolCompare && <Pressable
              onPress={() => router.push("/protocol-compare" as any)}
              style={({ pressed }) => [styles.headerBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="compare-arrows" size={20} color={colors.primary} />
            </Pressable>}
            {/* Search */}
            <Pressable
              onPress={() => setShowSearch(!showSearch)}
              style={({ pressed }) => [styles.headerBtn, { backgroundColor: showSearch ? colors.primary + "20" : colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="search" size={20} color={showSearch ? colors.primary : colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterRow}>
          {([
            { key: "all" as FilterOption, label: "Alle", icon: "list" },
            { key: "favorites" as FilterOption, label: "Favoriten", icon: "star" },
            { key: "archived" as FilterOption, label: "Archiv", icon: "archive" },
          ]).map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilterBy(f.key)}
              style={[
                styles.filterTab,
                { backgroundColor: filterBy === f.key ? colors.primary + "15" : "transparent", borderColor: filterBy === f.key ? colors.primary : colors.border },
              ]}
            >
              <MaterialIcons name={f.icon as any} size={16} color={filterBy === f.key ? colors.primary : colors.muted} />
              <Text style={[styles.filterTabText, { color: filterBy === f.key ? colors.primary : colors.muted }]}>{f.label}</Text>
            </Pressable>
          ))}

          {/* Sort button */}
          <Pressable
            onPress={() => setShowSortMenu(!showSortMenu)}
            style={[styles.filterTab, { backgroundColor: colors.surface, borderColor: colors.border, marginLeft: "auto" }]}
          >
            <MaterialIcons name="sort" size={16} color={colors.muted} />
          </Pressable>

          {/* Batch mode toggle */}
          <Pressable
            onPress={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
            style={[styles.filterTab, { backgroundColor: batchMode ? colors.primary + "15" : colors.surface, borderColor: batchMode ? colors.primary : colors.border }]}
          >
            <MaterialIcons name="checklist-rtl" size={16} color={batchMode ? colors.primary : colors.muted} />
          </Pressable>
        </View>

        {/* Sort Menu */}
        {showSortMenu && (
          <View style={[styles.sortMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {sortOptions.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => { setSortBy(opt.key); setShowSortMenu(false); }}
                style={[styles.sortOption, sortBy === opt.key && { backgroundColor: colors.primary + "10" }]}
              >
                <MaterialIcons name={opt.icon as any} size={16} color={sortBy === opt.key ? colors.primary : colors.muted} />
                <Text style={[styles.sortOptionText, { color: sortBy === opt.key ? colors.primary : colors.foreground }]}>{opt.label}</Text>
                {sortBy === opt.key && <MaterialIcons name="check" size={16} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        )}

        {/* Search bar */}
        {showSearch && (
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="search" size={20} color={colors.muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Protokolle, Tags, Vorlagen durchsuchen..."
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.foreground }]}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <MaterialIcons name="close" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>
        )}

        {/* Batch actions bar */}
        {batchMode && (
          <View style={[styles.batchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable onPress={selectAll} style={styles.batchBtn}>
              <MaterialIcons name="select-all" size={18} color={colors.primary} />
              <Text style={[styles.batchBtnText, { color: colors.primary }]}>Alle</Text>
            </Pressable>
            <Pressable onPress={batchFavorite} style={styles.batchBtn}>
              <MaterialIcons name="star" size={18} color="#FFC107" />
              <Text style={[styles.batchBtnText, { color: colors.foreground }]}>Favorit</Text>
            </Pressable>
            <Pressable onPress={batchArchive} style={styles.batchBtn}>
              <MaterialIcons name="archive" size={18} color="#FF9800" />
              <Text style={[styles.batchBtnText, { color: colors.foreground }]}>Archiv</Text>
            </Pressable>
            <Pressable onPress={batchDelete} style={styles.batchBtn}>
              <MaterialIcons name="delete" size={18} color={colors.error} />
              <Text style={[styles.batchBtnText, { color: colors.error }]}>Löschen</Text>
            </Pressable>
            <Text style={[styles.batchCount, { color: colors.muted }]}>{selectedIds.size} gewählt</Text>
          </View>
        )}
      </View>

      <FlatList
        data={displayedProtocols}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerContainer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerActions: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  todoBadge: { position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  todoBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  screenTitle: { fontSize: 26, fontWeight: "700" },
  screenSubtitle: { fontSize: 13, marginTop: 2 },
  filterRow: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" },
  filterTab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  filterTabText: { fontSize: 12, fontWeight: "500" },
  sortMenu: { marginTop: 8, borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  sortOption: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sortOptionText: { flex: 1, fontSize: 14 },
  searchBar: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  batchBar: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, borderWidth: 1, gap: 6 },
  batchBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  batchBtnText: { fontSize: 11, fontWeight: "500" },
  batchCount: { marginLeft: "auto", fontSize: 11 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, flexGrow: 1 },
  card: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: "600" },
  templateBadge: { fontSize: 11, fontWeight: "500", marginBottom: 4 },
  numberBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  numberBadgeText: { fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] as any },
  cardPreview: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  tagRow: { flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" },
  tagChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagChipText: { fontSize: 10, fontWeight: "500" },
  moreTagsText: { fontSize: 10, alignSelf: "center" },
  cardFooter: { flexDirection: "row", gap: 12 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText: { fontSize: 11 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: "center", marginTop: 8, paddingHorizontal: 40 },
});
