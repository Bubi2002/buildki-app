import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getDelegations, TaskDelegation } from "@/lib/task-delegation";
import { getTeamContacts, TeamContact } from "@/lib/team-contacts";
import { getSyncStatus, SyncStatus } from "@/lib/offline-sync";
import { getUpcomingEvents, CalendarEvent } from "@/lib/calendar-integration";
import { Platform } from "react-native";

type DashboardStats = {
  totalProtocols: number;
  thisWeekProtocols: number;
  openTasks: number;
  completedTasks: number;
  delegatedTasks: number;
  upcomingMeetings: number;
};

export default function DashboardScreen() {
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalProtocols: 0,
    thisWeekProtocols: 0,
    openTasks: 0,
    completedTasks: 0,
    delegatedTasks: 0,
    upcomingMeetings: 0,
  });
  const [delegations, setDelegations] = useState<TaskDelegation[]>([]);
  const [contacts, setContacts] = useState<TeamContact[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ isOnline: true, pendingChanges: 0, lastSyncAt: null, conflicts: 0 });
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [recentActivity, setRecentActivity] = useState<{text: string; time: string; icon: string}[]>([]);

  const loadDashboard = useCallback(async () => {
    try {
      // Load protocols
      const protocolsData = await AsyncStorage.getItem("protocols");
      const protocols = protocolsData ? JSON.parse(protocolsData) : [];
      
      // Calculate stats
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

      // Load delegations
      const dels = await getDelegations();
      setDelegations(dels);

      // Load contacts
      const teamContacts = await getTeamContacts();
      setContacts(teamContacts);

      // Load sync status
      const status = await getSyncStatus();
      setSyncStatus(status);

      // Load upcoming events (only on native)
      if (Platform.OS !== "web") {
        try {
          const events = await getUpcomingEvents(7);
          // Deduplicate events by title + startDate to avoid showing the same event multiple times
          // (can happen when event exists in multiple calendars)
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

      // Build recent activity
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

      setStats({
        totalProtocols: protocols.length,
        thisWeekProtocols: thisWeek.length,
        openTasks,
        completedTasks,
        delegatedTasks: dels.filter(d => d.status === "sent" || d.status === "pending").length,
        upcomingMeetings: upcomingEvents.length,
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
    <View style={{ flex: 1, backgroundColor: color + "10", borderRadius: 12, padding: 14, minWidth: "45%" }}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{label}</Text>
    </View>
  );

  return (
    <ScreenContainer className="p-0">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground }}>Dashboard</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>Team-Übersicht und Aktivitäten</Text>
        </View>

        {/* Sync Status Banner */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: syncStatus.isOnline ? "#22C55E10" : "#F59E0B10", borderRadius: 10, padding: 12, marginBottom: 16, gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: syncStatus.isOnline ? "#22C55E" : "#F59E0B" }} />
          <Text style={{ fontSize: 12, color: syncStatus.isOnline ? "#22C55E" : "#F59E0B", fontWeight: "500", flex: 1 }}>
            {syncStatus.isOnline ? "Online" : "Offline"} • {syncStatus.pendingChanges} ausstehende Änderungen
            {syncStatus.conflicts > 0 ? ` • ${syncStatus.conflicts} Konflikte` : ""}
          </Text>
          {syncStatus.lastSyncAt && (
            <Text style={{ fontSize: 10, color: colors.muted }}>
              Zuletzt: {new Date(syncStatus.lastSyncAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
        </View>

        {/* Stats Grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
          <StatCard icon="description" label="Protokolle gesamt" value={stats.totalProtocols} color="#0a7ea4" />
          <StatCard icon="trending-up" label="Diese Woche" value={stats.thisWeekProtocols} color="#8B5CF6" />
          <StatCard icon="check-circle" label="Offene Aufgaben" value={stats.openTasks} color="#F59E0B" />
          <StatCard icon="done-all" label="Erledigt" value={stats.completedTasks} color="#22C55E" />
          <StatCard icon="send" label="Delegiert" value={stats.delegatedTasks} color="#EC4899" />
          <StatCard icon="event" label="Meetings (7 Tage)" value={upcomingEvents.length} color="#0EA5E9" />
        </View>

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Kommende Termine</Text>
            {upcomingEvents.map((event) => (
              <View key={event.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: "#0EA5E910", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <MaterialIcons name="event" size={18} color="#0EA5E9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>{event.title}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
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
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Delegierte Aufgaben</Text>
            {delegations.slice(0, 5).map((del) => (
              <View key={del.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: del.status === "completed" ? "#22C55E15" : del.status === "sent" ? "#0a7ea415" : "#F59E0B15", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <Text style={{ fontSize: 14 }}>{del.status === "completed" ? "✓" : del.status === "sent" ? "📤" : "⏳"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }} numberOfLines={1}>{del.taskText}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>👤 {del.assignee}</Text>
                    <Text style={{ fontSize: 11, color: del.priority === "hoch" ? "#EF4444" : del.priority === "mittel" ? "#F59E0B" : "#22C55E" }}>● {del.priority}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Team Contacts */}
        {contacts.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Team</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {contacts.map((contact) => (
                <View key={contact.id} style={{ alignItems: "center", width: 70 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>{contact.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.foreground, marginTop: 4, textAlign: "center" }} numberOfLines={1}>{contact.name}</Text>
                  {contact.role ? <Text style={{ fontSize: 9, color: colors.muted }} numberOfLines={1}>{contact.role}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Letzte Aktivitäten</Text>
            {recentActivity.map((activity, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
                <MaterialIcons name={activity.icon as any} size={16} color={colors.muted} style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 12, color: colors.foreground, flex: 1 }} numberOfLines={1}>{activity.text}</Text>
                <Text style={{ fontSize: 10, color: colors.muted }}>{activity.time}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Empty State */}
        {stats.totalProtocols === 0 && delegations.length === 0 && (
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <MaterialIcons name="dashboard" size={48} color={colors.muted} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>Willkommen im Dashboard</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, textAlign: "center" }}>Erstellen Sie Ihr erstes Protokoll, um hier Statistiken und Aktivitäten zu sehen.</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
