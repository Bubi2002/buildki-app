/**
 * protoKI – Smart Timeline Screen
 * 
 * Intelligente Projektchronik. Zeigt alle Ereignisse aus allen Quellen
 * (Fotos, Sprache, Dokumente, Matterport, Berichte, Aufgaben) in einer
 * chronologischen Timeline mit Filtern und Zusammenhängen.
 */

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  timelineEngine,
  type TimelineEvent,
  type TimelineFilter,
  type TimelineStats,
  getEventTypeLabel,
  getEventTypeIcon,
  getEventTypeColor,
} from "@/lib/timeline-engine";

type FilterTab = "all" | "defects" | "tasks" | "photos" | "documents" | "reports";

export default function SmartTimelineScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; projectName?: string }>();

  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [stats, setStats] = useState<TimelineStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  async function loadActiveProject() {
    try {
      const projectsJson = await AsyncStorage.getItem("projects");
      const lastId = await AsyncStorage.getItem("last-selected-project-id");
      if (projectsJson && lastId) {
        const projects = JSON.parse(projectsJson);
        const project = projects.find((p: any) => p.id === lastId);
        if (project) setActiveProject({ id: project.id, name: project.name });
      }
    } catch {}
    setIsLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (params.projectId && params.projectName) {
        setActiveProject({ id: params.projectId, name: decodeURIComponent(params.projectName) });
      } else {
        void loadActiveProject();
      }
    });
  }, []);

  async function loadTimeline() {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const filter: TimelineFilter = {
        projectId: activeProject.id,
        searchQuery: searchQuery || undefined,
        limit: 100,
      };

      // Apply category filter
      if (activeFilter === "defects") {
        filter.eventTypes = ["defect_created", "defect_resolved", "defect_updated"];
      } else if (activeFilter === "tasks") {
        filter.eventTypes = ["task_created", "task_completed", "task_updated"];
      } else if (activeFilter === "photos") {
        filter.eventTypes = ["photo_captured", "photo_analyzed"];
      } else if (activeFilter === "documents") {
        filter.eventTypes = ["document_uploaded", "document_analyzed"];
      } else if (activeFilter === "reports") {
        filter.eventTypes = ["report_generated", "protocol_generated", "recording_started", "recording_completed"];
      }

      const [eventResults, statsResult] = await Promise.all([
        timelineEngine.query(filter),
        timelineEngine.getStats(activeProject.id),
      ]);

      setEvents(eventResults);
      setStats(statsResult);
    } catch {}
    setIsLoading(false);
  }

  useEffect(() => {
    if (activeProject) {
      void Promise.resolve().then(() => {
        void loadTimeline();
      });
    }
  }, [activeProject, activeFilter, searchQuery]);

  const filterTabs: { id: FilterTab; label: string; icon: string }[] = [
    { id: "all", label: "Alle", icon: "timeline" },
    { id: "defects", label: "Mängel", icon: "warning" },
    { id: "tasks", label: "Aufgaben", icon: "task-alt" },
    { id: "photos", label: "Fotos", icon: "photo-camera" },
    { id: "documents", label: "Dokumente", icon: "description" },
    { id: "reports", label: "Berichte", icon: "summarize" },
  ];

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Heute";
    if (date.toDateString() === yesterday.toDateString()) return "Gestern";
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Group events by day
  const groupedEvents = useCallback(() => {
    const groups: { date: string; label: string; events: TimelineEvent[] }[] = [];
    let currentDate = "";

    for (const event of events) {
      const day = event.timestamp.slice(0, 10);
      if (day !== currentDate) {
        currentDate = day;
        groups.push({ date: day, label: formatDate(event.timestamp), events: [] });
      }
      groups[groups.length - 1].events.push(event);
    }

    return groups;
  }, [events]);

  const renderEvent = (event: TimelineEvent, isLast: boolean) => {
    const eventColor = getEventTypeColor(event.eventType);
    return (
      <View key={event.id} style={styles.eventRow}>
        {/* Timeline line */}
        <View style={styles.timelineColumn}>
          <View style={[styles.eventDot, { backgroundColor: eventColor }]} />
          {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
        </View>

        {/* Event content */}
        <View style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.eventHeader}>
            <MaterialIcons name={getEventTypeIcon(event.eventType) as any} size={16} color={eventColor} />
            <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={1}>
              {event.title}
            </Text>
            <Text style={[styles.eventTime, { color: colors.muted }]}>{formatTime(event.timestamp)}</Text>
          </View>

          {event.description && (
            <Text style={[styles.eventDescription, { color: colors.muted }]} numberOfLines={2}>
              {event.description}
            </Text>
          )}

          <View style={styles.eventMeta}>
            {event.roomName && (
              <View style={[styles.metaBadge, { backgroundColor: colors.primary + "15" }]}>
                <MaterialIcons name="meeting-room" size={10} color={colors.primary} />
                <Text style={[styles.metaText, { color: colors.primary }]}>{event.roomName}</Text>
              </View>
            )}
            {event.tradeName && (
              <View style={[styles.metaBadge, { backgroundColor: "#F59E0B15" }]}>
                <MaterialIcons name="construction" size={10} color="#F59E0B" />
                <Text style={[styles.metaText, { color: "#F59E0B" }]}>{event.tradeName}</Text>
              </View>
            )}
            {event.confidence != null && (
              <View style={[styles.metaBadge, { backgroundColor: "#10B98115" }]}>
                <Text style={[styles.metaText, { color: "#10B981" }]}>{event.confidence}%</Text>
              </View>
            )}
            <Text style={[styles.sourceLabel, { color: colors.muted }]}>
              {getEventTypeLabel(event.eventType)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderDayGroup = ({ item }: { item: { date: string; label: string; events: TimelineEvent[] } }) => (
    <View style={styles.dayGroup}>
      <View style={styles.dayHeader}>
        <View style={[styles.dayBadge, { backgroundColor: colors.primary + "15" }]}>
          <Text style={[styles.dayLabel, { color: colors.primary }]}>{item.label}</Text>
          <Text style={[styles.dayCount, { color: colors.muted }]}>{item.events.length} Ereignisse</Text>
        </View>
      </View>
      {item.events.map((event, idx) => renderEvent(event, idx === item.events.length - 1))}
    </View>
  );

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Smart Timeline</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Stats Bar */}
      {stats && stats.totalEvents > 0 && (
        <View style={[styles.statsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{stats.totalEvents}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Gesamt</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: "#EF4444" }]}>{stats.eventsByType["defect_created"] || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Mängel</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: "#3B82F6" }]}>{stats.eventsByType["task_created"] || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Aufgaben</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: "#EC4899" }]}>{stats.eventsByType["photo_analyzed"] || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Analysen</Text>
          </View>
        </View>
      )}

      {/* Search */}
      <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="search" size={18} color={colors.muted} />
          <TextInput
            placeholder="Timeline durchsuchen..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchText, { color: colors.foreground }]}
            returnKeyType="search"
          />
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterTabs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 12 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setActiveFilter(item.id)}
              style={[
                styles.filterTab,
                {
                  backgroundColor: activeFilter === item.id ? colors.primary + "15" : "transparent",
                  borderColor: activeFilter === item.id ? colors.primary : "transparent",
                },
              ]}
            >
              <MaterialIcons
                name={item.icon as any}
                size={14}
                color={activeFilter === item.id ? colors.primary : colors.muted}
              />
              <Text style={[styles.filterLabel, { color: activeFilter === item.id ? colors.primary : colors.muted }]}>
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {/* Timeline Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="timeline" size={48} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Noch keine Ereignisse</Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Die Timeline füllt sich automatisch durch Fotoanalysen, Aufnahmen, Dokumente und andere Aktivitäten.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groupedEvents()}
          keyExtractor={item => item.date}
          renderItem={renderDayGroup}
          contentContainerStyle={{ paddingBottom: 40 }}
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
  headerTitle: { fontSize: 17, fontWeight: "700" },
  statsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  statItem: { alignItems: "center" },
  statNumber: { fontSize: 16, fontWeight: "800" },
  statLabel: { fontSize: 10, marginTop: 2 },
  searchRow: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  searchInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchText: { flex: 1, fontSize: 14 },
  filterRow: { paddingVertical: 8, borderBottomWidth: 0.5 },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
  },
  filterLabel: { fontSize: 12, fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginTop: 12 },
  emptyText: { fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 18 },
  dayGroup: { paddingHorizontal: 16, paddingTop: 16 },
  dayHeader: { marginBottom: 12 },
  dayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  dayLabel: { fontSize: 13, fontWeight: "700" },
  dayCount: { fontSize: 11 },
  eventRow: { flexDirection: "row", marginBottom: 12 },
  timelineColumn: { width: 24, alignItems: "center" },
  eventDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  timelineLine: { width: 2, flex: 1, marginTop: 4 },
  eventCard: {
    flex: 1,
    marginLeft: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  eventHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  eventTitle: { flex: 1, fontSize: 13, fontWeight: "600" },
  eventTime: { fontSize: 11 },
  eventDescription: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  eventMeta: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6, alignItems: "center" },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaText: { fontSize: 10, fontWeight: "600" },
  sourceLabel: { fontSize: 10, marginLeft: "auto" },
});
