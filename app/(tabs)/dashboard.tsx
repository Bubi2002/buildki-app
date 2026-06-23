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

export default function DashboardScreen() {
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
  const [recentActivity, setRecentActivity] = useState<{text: string; time: string; icon: string}[]>([]);

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
          openTasks += todos.filter((t: any) => !t.done).length;
          completedTasks += todos.filter((t: any) => t.done).length;
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

      const activity: {text: string; time: string; icon: string}[] = [];
      const recentProtocols = [...protocols].sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ).slice(0, 5);
      
      recentProtocols.forEach((p: any) => {
        const date = new Date(p.createdAt);
        const timeStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        activity.push({ text: p.title || "Protokoll erstellt", time: timeStr, icon: "description" });
      });

      dels.slice(0, 3).forEach(d => {
        const date = new Date(d.createdAt);
        const timeStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        activity.push({ text: `Aufgabe an ${d.assignee} delegiert`, time: timeStr, icon: "send" });
      });

      activity.sort((a, b) => b.time.localeCompare(a.time));
      setRecentActivity(activity.slice(0, 8));

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
      console.error("Dashboard load error:", e);
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

  const StatCard = ({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) => (
    <View style={{ flex: 1, backgroundColor: "#0F1E30", borderWidth: 1, borderColor: "#1E3A5F", borderRadius: 0, padding: 14, minWidth: "45%" }}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#F0F4F8", marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: "#8FA3B8", marginTop: 2 }}>{label}</Text>
    </View>
  );

  return (
    <ScreenContainer className="p-0">
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0B1622" }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5DADE2" />}
      >
        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: "#F0F4F8", letterSpacing: -0.5 }}>Dashboard</Text>
          <Text style={{ fontSize: 13, color: "#8FA3B8", marginTop: 4 }}>Team-Übersicht und Aktivitäten</Text>
        </View>

        {/* Sync Status Banner */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: syncStatus.isOnline ? "#4ADE8010" : "#FBBF2410", borderRadius: 0, borderWidth: 1, borderColor: syncStatus.isOnline ? "#4ADE8030" : "#FBBF2430", padding: 12, marginBottom: 16, gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: syncStatus.isOnline ? "#4ADE80" : "#FBBF24" }} />
          <Text style={{ fontSize: 12, color: syncStatus.isOnline ? "#4ADE80" : "#FBBF24", fontWeight: "500", flex: 1 }}>
            {syncStatus.isOnline ? "Online" : "Offline"} • {syncStatus.pendingChanges} ausstehende Änderungen
            {syncStatus.conflicts > 0 ? ` • ${syncStatus.conflicts} Konflikte` : ""}
          </Text>
          {syncStatus.lastSyncAt && (
            <Text style={{ fontSize: 10, color: "#8FA3B8" }}>
              Zuletzt: {new Date(syncStatus.lastSyncAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
        </View>

        {/* Quick Actions */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#F0F4F8", marginBottom: 10, letterSpacing: 0.3 }}>Schnellaktionen</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/(tabs)" as any)}
              style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#5DADE215", borderWidth: 1, borderColor: "#5DADE230", borderRadius: 0, padding: 12, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="mic" size={20} color="#5DADE2" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#5DADE2" }}>Aufnahme</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/projects" as any)}
              style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#A78BFA15", borderWidth: 1, borderColor: "#A78BFA30", borderRadius: 0, padding: 12, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="folder" size={20} color="#A78BFA" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#A78BFA" }}>Projekte</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/protocols" as any)}
              style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#4ADE8015", borderWidth: 1, borderColor: "#4ADE8030", borderRadius: 0, padding: 12, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="list-alt" size={20} color="#4ADE80" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#4ADE80" }}>Protokolle</Text>
            </Pressable>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
          <StatCard icon="description" label="Protokolle gesamt" value={stats.totalProtocols} color="#5DADE2" />
          <StatCard icon="trending-up" label="Diese Woche" value={stats.thisWeekProtocols} color="#A78BFA" />
          <StatCard icon="check-circle" label="Offene Aufgaben" value={stats.openTasks} color="#FBBF24" />
          <StatCard icon="done-all" label="Erledigt" value={stats.completedTasks} color="#4ADE80" />
          <StatCard icon="warning" label="Offene Mängel" value={stats.openDefects} color="#F87171" />
          <StatCard icon="schedule" label="Überfällig" value={stats.overdueDefects} color="#FB7185" />
          <StatCard icon="send" label="Delegiert" value={stats.delegatedTasks} color="#F472B6" />
          <StatCard icon="event" label="Meetings (7 Tage)" value={upcomingEvents.length} color="#38BDF8" />
        </View>

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#F0F4F8", marginBottom: 12, letterSpacing: 0.3 }}>Kommende Termine</Text>
            {upcomingEvents.map((event) => (
              <View key={event.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1E3A5F" }}>
                <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: "#38BDF810", borderWidth: 1, borderColor: "#38BDF830", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
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
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#F0F4F8", marginBottom: 12, letterSpacing: 0.3 }}>Delegierte Aufgaben</Text>
            {delegations.slice(0, 5).map((del) => (
              <View key={del.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1E3A5F" }}>
                <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: del.status === "completed" ? "#4ADE8010" : del.status === "sent" ? "#5DADE210" : "#FBBF2410", borderWidth: 1, borderColor: del.status === "completed" ? "#4ADE8030" : del.status === "sent" ? "#5DADE230" : "#FBBF2430", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <MaterialIcons name={del.status === "completed" ? "check" : del.status === "sent" ? "send" : "schedule"} size={16} color={del.status === "completed" ? "#4ADE80" : del.status === "sent" ? "#5DADE2" : "#FBBF24"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: "#F0F4F8" }} numberOfLines={1}>{del.taskText}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
                    <Text style={{ fontSize: 11, color: "#8FA3B8" }}>{del.assignee}</Text>
                    <Text style={{ fontSize: 11, color: del.priority === "hoch" ? "#F87171" : del.priority === "mittel" ? "#FBBF24" : "#4ADE80" }}>● {del.priority}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Team Contacts */}
        {contacts.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#F0F4F8", marginBottom: 12, letterSpacing: 0.3 }}>Team</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {contacts.map((contact) => (
                <View key={contact.id} style={{ alignItems: "center", width: 70 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 0, backgroundColor: "#5DADE215", borderWidth: 1, borderColor: "#5DADE230", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#5DADE2" }}>{contact.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: "#F0F4F8", marginTop: 4, textAlign: "center" }} numberOfLines={1}>{contact.name}</Text>
                  {contact.role ? <Text style={{ fontSize: 9, color: "#8FA3B8" }} numberOfLines={1}>{contact.role}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#F0F4F8", marginBottom: 12, letterSpacing: 0.3 }}>Letzte Aktivitäten</Text>
            {recentActivity.map((activity, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
                <MaterialIcons name={activity.icon as any} size={16} color="#8FA3B8" style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 12, color: "#F0F4F8", flex: 1 }} numberOfLines={1}>{activity.text}</Text>
                <Text style={{ fontSize: 10, color: "#8FA3B8" }}>{activity.time}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Empty State */}
        {stats.totalProtocols === 0 && delegations.length === 0 && (
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <MaterialIcons name="dashboard" size={48} color="#8FA3B8" />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#F0F4F8", marginTop: 12 }}>Willkommen im Dashboard</Text>
            <Text style={{ fontSize: 13, color: "#8FA3B8", marginTop: 4, textAlign: "center" }}>Erstellen Sie Ihr erstes Protokoll, um hier Statistiken und Aktivitäten zu sehen.</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
