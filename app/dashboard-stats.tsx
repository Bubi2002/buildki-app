import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getDelegations, TaskDelegation } from "@/lib/task-delegation";
import { getTeamContacts, TeamContact } from "@/lib/team-contacts";
import { getSyncStatus, SyncStatus } from "@/lib/offline-sync";
import { getUpcomingEvents, CalendarEvent } from "@/lib/calendar-integration";
import { getDefects, getDefectStats } from "@/lib/defect-store";
import { getOverdueDefects } from "@/lib/defect-pdf-export";
import { useRouter } from "expo-router";
import { Platform } from "react-native";
import { useTranslation } from "@/lib/language-provider";

type DashboardStats = {
  totalProtocols: number;
  thisWeekProtocols: number;
  openTasks: number;
  completedTasks: number;
  delegatedTasks: number;
  upcomingMeetings: number;
  openDefects: number;
  overdueDefects: number;
};

export default function DashboardStatsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalProtocols: 0,
    thisWeekProtocols: 0,
    openTasks: 0,
    completedTasks: 0,
    delegatedTasks: 0,
    upcomingMeetings: 0,
    openDefects: 0,
    overdueDefects: 0,
  });
  const [delegations, setDelegations] = useState<TaskDelegation[]>([]);
  const [contacts, setContacts] = useState<TeamContact[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ isOnline: true, pendingChanges: 0, lastSyncAt: null, conflicts: 0 });
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);

  const loadDashboard = useCallback(async () => {
    try {
      const protocolsData = await AsyncStorage.getItem("protocols");
      const protocols = protocolsData ? JSON.parse(protocolsData) : [];
      
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thisWeek = protocols.filter((p: any) => new Date(p.createdAt) > weekAgo);
      
      let openTasks = 0;
      let completedTasks = 0;
      protocols.forEach((p: any) => {
        if (p.todos) {
          const todos = Array.isArray(p.todos) ? p.todos : [];
          openTasks += todos.filter((td: any) => !td.done).length;
          completedTasks += todos.filter((td: any) => td.done).length;
        }
      });

      const dels = await getDelegations();
      setDelegations(dels);

      const teamContacts = await getTeamContacts();
      setContacts(teamContacts);

      const status = await getSyncStatus();
      setSyncStatus(status);

      if (Platform.OS !== "web") {
        try {
          const events = await getUpcomingEvents(7);
          const seen = new Set<string>();
          const uniqueEvents = events.filter((e) => {
            const key = `${e.title}_${e.startDate.getTime()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setUpcomingEvents(uniqueEvents.slice(0, 5));
        } catch {
          setUpcomingEvents([]);
        }
      }

      const allDefects = await getDefects();
      const defectStats = getDefectStats(allDefects);
      const overdueDefects = getOverdueDefects(allDefects);

      setStats({
        totalProtocols: protocols.length,
        thisWeekProtocols: thisWeek.length,
        openTasks,
        completedTasks,
        delegatedTasks: dels.filter(d => d.status === "sent" || d.status === "pending").length,
        upcomingMeetings: upcomingEvents.length,
        openDefects: defectStats.offen + defectStats.inBearbeitung,
        overdueDefects: overdueDefects.length,
      });
    } catch (e) {
      console.error("Dashboard stats load error:", e);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const StatCard = ({ icon, label, value, color, onPress }: { icon: string; label: string; value: number; color: string; onPress?: () => void }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ flex: 1, backgroundColor: "#0F1E30", borderWidth: 1, borderColor: "#1E3A5F", borderRadius: 12, padding: 14, minWidth: "45%", opacity: pressed && onPress ? 0.7 : 1 }]}
    >
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#F0F4F8", marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: "#8FA3B8", marginTop: 2 }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScreenContainer className="p-0">
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0B1622" }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5DADE2" />}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color="#F0F4F8" />
          </Pressable>
          <View>
            <Text style={{ fontSize: 28, fontWeight: "800", color: "#F0F4F8", letterSpacing: -0.5 }}>{t('statistik')}</Text>
            <Text style={{ fontSize: 13, color: "#8FA3B8", marginTop: 2 }}>{t('tools_subtitle')}</Text>
          </View>
        </View>

        {/* Sync Status */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: syncStatus.isOnline ? "#4ADE8010" : "#FBBF2410", borderRadius: 12, borderWidth: 1, borderColor: syncStatus.isOnline ? "#4ADE8030" : "#FBBF2430", padding: 12, marginBottom: 16, gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: syncStatus.isOnline ? "#4ADE80" : "#FBBF24" }} />
          <Text style={{ fontSize: 12, color: syncStatus.isOnline ? "#4ADE80" : "#FBBF24", fontWeight: "500", flex: 1 }}>
            {syncStatus.isOnline ? t('sync_online') : t('sync_offline')} • {syncStatus.pendingChanges} {t('sync_ausstehende_aenderungen')}
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
          <StatCard icon="description" label={t('protokolle_gesamt')} value={stats.totalProtocols} color="#5DADE2" onPress={() => router.push("/(tabs)/protocols" as any)} />
          <StatCard icon="trending-up" label={t('diese_woche')} value={stats.thisWeekProtocols} color="#A78BFA" onPress={() => router.push("/(tabs)/protocols" as any)} />
          <StatCard icon="check-circle" label={t('offene_aufgaben')} value={stats.openTasks} color="#FBBF24" onPress={() => router.push("/(tabs)/protocols" as any)} />
          <StatCard icon="done-all" label={t('defect_resolved')} value={stats.completedTasks} color="#4ADE80" onPress={() => router.push("/(tabs)/protocols" as any)} />
          <StatCard icon="warning" label={t('offene_maengel')} value={stats.openDefects} color="#F87171" onPress={() => router.push("/defects" as any)} />
          <StatCard icon="schedule" label={t('ueberfaellig')} value={stats.overdueDefects} color="#FB7185" onPress={() => router.push("/defects" as any)} />
          <StatCard icon="send" label={t('delegiert')} value={stats.delegatedTasks} color="#F472B6" onPress={() => router.push("/(tabs)/protocols" as any)} />
          <StatCard icon="event" label={t('meetings_7_tage')} value={upcomingEvents.length} color="#38BDF8" />
        </View>

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#F0F4F8", marginBottom: 12 }}>{t('kommende_termine')}</Text>
            {upcomingEvents.map((event) => (
              <View key={event.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1E3A5F" }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: "#38BDF810", borderWidth: 1, borderColor: "#38BDF830", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <MaterialIcons name="event" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: "#F0F4F8" }}>{event.title}</Text>
                  <Text style={{ fontSize: 11, color: "#8FA3B8" }}>
                    {event.startDate.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })} • {event.startDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Delegated Tasks */}
        {delegations.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#F0F4F8", marginBottom: 12 }}>{t('delegierte_aufgaben')}</Text>
            {delegations.slice(0, 5).map((del) => (
              <View key={del.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1E3A5F" }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: del.status === "completed" ? "#4ADE8010" : "#5DADE210", borderWidth: 1, borderColor: del.status === "completed" ? "#4ADE8030" : "#5DADE230", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <MaterialIcons name={del.status === "completed" ? "check" : "send"} size={16} color={del.status === "completed" ? "#4ADE80" : "#5DADE2"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: "#F0F4F8" }} numberOfLines={1}>{del.taskText}</Text>
                  <Text style={{ fontSize: 11, color: "#8FA3B8" }}>{del.assignee}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Team */}
        {contacts.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#F0F4F8", marginBottom: 12 }}>{t('team_title')}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {contacts.slice(0, 8).map((contact) => (
                <View key={contact.id} style={{ alignItems: "center", width: 70 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#5DADE215", borderWidth: 1, borderColor: "#5DADE230", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#5DADE2" }}>{contact.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: "#F0F4F8", marginTop: 4, textAlign: "center" }} numberOfLines={1}>{contact.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
