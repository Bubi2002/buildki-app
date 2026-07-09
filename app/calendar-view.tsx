import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "@/lib/language-provider";

type Protocol = {
  id: string;
  title: string;
  templateName?: string;
  createdAt: string;
  projectId?: string;
  projectName?: string;
  projectColor?: string;
  isArchived?: boolean;
};

function getDays(t: (key: any) => string) { return [t('cal_mo'), t('cal_di'), t('cal_mi'), t('cal_do'), t('cal_fr'), t('cal_sa'), t('cal_so')]; }
function getMonths(t: (key: any) => string) { return [t('cal_januar'), t('cal_februar'), t('cal_maerz'), t('cal_april'), t('cal_mai'), t('cal_juni'), t('cal_juli'), t('cal_august'), t('cal_september'), t('cal_oktober'), t('cal_november'), t('cal_dezember')]; }

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

export default function CalendarViewScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadProtocols();
  }, []);

  const loadProtocols = async () => {
    try {
      const [protocolsData, projectsData] = await Promise.all([
        AsyncStorage.getItem("protocols"),
        AsyncStorage.getItem("projects"),
      ]);
      const allProtocols = protocolsData ? JSON.parse(protocolsData) : [];
      const allProjects = projectsData ? JSON.parse(projectsData) : [];

      const enriched = allProtocols
        .filter((p: any) => !p.isArchived)
        .map((p: any) => {
          const project = allProjects.find((pr: any) => pr.id === p.projectId);
          return {
            ...p,
            projectName: project?.name,
            projectColor: project?.color,
          };
        });
      setProtocols(enriched);
    } catch {}
  };

  // Group protocols by date
  const protocolsByDate = useMemo(() => {
    const map: Record<string, Protocol[]> = {};
    protocols.forEach(p => {
      const date = new Date(p.createdAt).toISOString().split("T")[0];
      if (!map[date]) map[date] = [];
      map[date].push(p);
    });
    return map;
  }, [protocols]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setSelectedDate(null);
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
    setSelectedDate(now.toISOString().split("T")[0]);
  };

  const selectedProtocols = selectedDate ? (protocolsByDate[selectedDate] || []) : [];

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [firstDay, daysInMonth]);

  const formatDateKey = (day: number) => {
    return `${currentYear}-${(currentMonth + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  };

  const todayKey = new Date().toISOString().split("T")[0];

  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginRight: 12 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>{t('kalender')}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{t('protokolltimeline')}</Text>
          </View>
          <Pressable onPress={goToToday} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, backgroundColor: colors.primary + "15", borderRadius: 0, paddingHorizontal: 10, paddingVertical: 4 }]}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>{t('heute')}</Text>
          </Pressable>
        </View>

        {/* Month navigation */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable onPress={goToPrevMonth} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}>
            <MaterialIcons name="chevron-left" size={28} color={colors.foreground} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
            {getMonths(t)[currentMonth]} {currentYear}
          </Text>
          <Pressable onPress={goToNextMonth} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}>
            <MaterialIcons name="chevron-right" size={28} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Day headers */}
        <View style={{ flexDirection: "row", paddingHorizontal: 8 }}>
          {getDays(t).map(day => (
            <View key={day} style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>{day}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 }}>
          {calendarDays.map((day, idx) => {
            if (day === null) {
              return <View key={`empty-${idx}`} style={{ width: "14.28%", height: 48 }} />;
            }
            const dateKey = formatDateKey(day);
            const hasProtocols = protocolsByDate[dateKey]?.length > 0;
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;
            const count = protocolsByDate[dateKey]?.length || 0;

            return (
              <Pressable
                key={dateKey}
                onPress={() => setSelectedDate(dateKey)}
                style={({ pressed }) => [{
                  width: "14.28%",
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.6 : 1,
                }]}
              >
                <View style={[
                  { width: 36, height: 36, borderRadius: 0, alignItems: "center", justifyContent: "center" },
                  isSelected && { backgroundColor: colors.primary },
                  isToday && !isSelected && { borderWidth: 2, borderColor: colors.primary },
                ]}>
                  <Text style={[
                    { fontSize: 14, fontWeight: isToday ? "700" : "400" },
                    { color: isSelected ? "#FFF" : colors.foreground },
                  ]}>
                    {day}
                  </Text>
                </View>
                {hasProtocols && (
                  <View style={{ flexDirection: "row", gap: 2, marginTop: 1 }}>
                    {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                      <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? colors.primary : colors.success }} />
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Selected date protocols */}
        <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 }}>
          {selectedDate ? (
            selectedProtocols.length > 0 ? (
              <FlatList
                data={selectedProtocols}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16, gap: 8 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => router.push(`/protocol-detail?id=${item.id}` as any)}
                    style={({ pressed }) => [{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: colors.surface,
                      borderRadius: 0,
                      padding: 12,
                      gap: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      opacity: pressed ? 0.8 : 1,
                    }]}
                  >
                    {item.projectColor && (
                      <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: item.projectColor }} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>{item.title}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        {item.templateName && (
                          <Text style={{ fontSize: 11, color: colors.muted }}>{item.templateName}</Text>
                        )}
                        {item.projectName && (
                          <Text style={{ fontSize: 11, color: colors.primary }}>• {item.projectName}</Text>
                        )}
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {new Date(item.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
                  </Pressable>
                )}
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>{t('keine_protokolle_an_diesem')}</Text>
              </View>
            )
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="touch-app" size={32} color={colors.muted} />
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}>{t('tag_auswaehlen')}</Text>
            </View>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}
