/**
 * KI-Bautagebuch Screen
 * 
 * Automatically generates a professional daily construction report by combining:
 * - Weather data (auto-fetched via GPS)
 * - Attendance records for the day
 * - All defects (new, resolved, open)
 * - Protocols/recordings made today
 * - Manual notes and photos
 * 
 * Uses the server LLM endpoint to produce a structured Bautagebuch
 * that can be exported as PDF.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDefects, type Defect } from "@/lib/defect-store";
import { getWeatherForLocation, type WeatherData } from "@/lib/weather-service";
import { getCurrentLocation } from "@/lib/location-service";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type BautagebuchEntry = {
  id: string;
  date: string;
  projectName: string;
  status: "draft" | "generating" | "complete" | "error";
  fullReport?: string;
  weather?: string;
  attendanceCount?: number;
  defectsCount?: number;
  createdAt: string;
  updatedAt: string;
};

const BAUTAGEBUCH_KEY = "bautagebuch_entries";

export default function BautagebuchScreen() {
  const colors = useColors();
  const router = useRouter();
  const [entries, setEntries] = useState<BautagebuchEntry[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<BautagebuchEntry | null>(null);
  const [manualNotes, setManualNotes] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  const generateBautagebuch = trpc.analysis.generateBautagebuch.useMutation();

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      const raw = await AsyncStorage.getItem(BAUTAGEBUCH_KEY);
      if (raw) {
        setEntries(JSON.parse(raw));
      }
    } catch (e) {
      console.error("Error loading Bautagebuch entries:", e);
    }
  };

  const saveEntries = async (updated: BautagebuchEntry[]) => {
    setEntries(updated);
    await AsyncStorage.setItem(BAUTAGEBUCH_KEY, JSON.stringify(updated));
  };

  const getTodayDate = () => {
    return new Date().toISOString().split("T")[0];
  };

  const getActiveProjectName = async (): Promise<string> => {
    try {
      const raw = await AsyncStorage.getItem("active_project");
      if (raw) {
        const project = JSON.parse(raw);
        return project.name || "Bauprojekt";
      }
    } catch {}
    return "Bauprojekt";
  };

  const getAttendanceForDate = async (date: string) => {
    try {
      const raw = await AsyncStorage.getItem("attendance_records");
      if (raw) {
        const records = JSON.parse(raw);
        const todayRecord = records.find((r: any) => r.date === date);
        return todayRecord?.workers || [];
      }
    } catch {}
    return [];
  };

  const getProtocolsForDate = async (date: string) => {
    try {
      const raw = await AsyncStorage.getItem("protocols");
      if (raw) {
        const protocols = JSON.parse(raw);
        return protocols.filter((p: any) => {
          const created = p.createdAt?.split("T")[0];
          return created === date;
        });
      }
    } catch {}
    return [];
  };

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);

    try {
      const today = getTodayDate();
      const projectName = await getActiveProjectName();

      // 1. Get weather
      let weather: WeatherData | null = null;
      try {
        const location = await getCurrentLocation();
        if (location) {
          weather = await getWeatherForLocation(location);
        }
      } catch {}

      // 2. Get attendance
      const attendance = await getAttendanceForDate(today);

      // 3. Get defects
      const allDefects = await getDefects();
      const defectsForReport = allDefects.map((d: Defect) => ({
        title: d.title,
        description: d.description,
        gewerk: d.gewerk,
        room: d.room,
        status: d.status,
        priority: d.priority,
        responsible: d.assignee,
        dueDate: d.dueDate,
        photos: d.photos,
        aiSummary: d.aiSummary,
        positionCode: d.positionCode,
      }));

      // 4. Get protocols from today
      const protocols = await getProtocolsForDate(today);
      const protocolsForReport = protocols.map((p: any) => ({
        title: p.title || "Aufnahme",
        createdAt: p.createdAt,
        transcription: p.transcription?.substring(0, 500),
        templateName: p.templateName,
      }));

      // 5. Get manual notes
      const activities = manualNotes.trim() ? manualNotes.split("\n").filter(Boolean) : undefined;

      // 6. Call server endpoint
      const result = await generateBautagebuch.mutateAsync({
        projectName,
        date: today,
        weatherJson: weather ? JSON.stringify(weather) : undefined,
        attendanceJson: JSON.stringify(attendance),
        defectsJson: JSON.stringify(defectsForReport),
        protocolsJson: JSON.stringify(protocolsForReport),
        activities,
      });

      // 7. Save entry
      const entry: BautagebuchEntry = {
        id: `btb_${Date.now()}`,
        date: today,
        projectName,
        status: "complete",
        fullReport: result.fullReport,
        weather: result.weather,
        attendanceCount: attendance.length,
        defectsCount: allDefects.filter((d: Defect) => d.status !== "erledigt").length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updated = [entry, ...entries.filter(e => e.date !== today)];
      await saveEntries(updated);
      setSelectedEntry(entry);
      setManualNotes("");
      setShowNoteInput(false);
    } catch (error: any) {
      Alert.alert("Fehler", `Bautagebuch konnte nicht erstellt werden: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  }, [generating, entries, manualNotes]);

  const handleShare = async (entry: BautagebuchEntry) => {
    if (!entry.fullReport) return;
    try {
      await Share.share({
        message: entry.fullReport,
        title: `Bautagebuch ${entry.date}`,
      });
    } catch {}
  };

  const handleDelete = (entry: BautagebuchEntry) => {
    Alert.alert(
      "Löschen",
      `Bautagebuch vom ${new Date(entry.date).toLocaleDateString("de-DE")} wirklich löschen?`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            const updated = entries.filter(e => e.id !== entry.id);
            await saveEntries(updated);
            if (selectedEntry?.id === entry.id) setSelectedEntry(null);
          },
        },
      ]
    );
  };

  // Detail view
  if (selectedEntry) {
    return (
      <ScreenContainer className="p-4">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity
            onPress={() => setSelectedEntry(null)}
            style={{ padding: 8 }}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-foreground ml-2 flex-1" numberOfLines={1}>
            {new Date(selectedEntry.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short" })}
          </Text>
          <TouchableOpacity onPress={() => handleShare(selectedEntry)} style={{ padding: 8 }}>
            <MaterialIcons name="share" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Stats bar */}
          <View className="flex-row gap-3 mb-4">
            {selectedEntry.weather && (
              <View className="flex-1 bg-surface rounded-xl p-3">
                <Text className="text-xs text-muted">Wetter</Text>
                <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                  {selectedEntry.weather}
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <Text className="text-xs text-muted">Anwesend</Text>
              <Text className="text-lg font-bold text-foreground">{selectedEntry.attendanceCount || 0}</Text>
            </View>
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <Text className="text-xs text-muted">Offene Mängel</Text>
              <Text className="text-lg font-bold text-error">{selectedEntry.defectsCount || 0}</Text>
            </View>
          </View>

          {/* Full report */}
          {selectedEntry.fullReport && (
            <View className="bg-surface rounded-xl p-4 mb-4">
              <Text className="text-sm text-foreground leading-6" selectable>
                {selectedEntry.fullReport}
              </Text>
            </View>
          )}
        </ScrollView>
      </ScreenContainer>
    );
  }

  // List view
  return (
    <ScreenContainer className="p-4">
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-bold text-foreground">Bautagebuch</Text>
          <Text className="text-sm text-muted">KI-generierte Tagesberichte</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ padding: 8 }}
        >
          <MaterialIcons name="close" size={24} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {/* Generate button */}
      <TouchableOpacity
        onPress={handleGenerate}
        disabled={generating}
        className="bg-primary rounded-xl p-4 mb-4"
        style={{ opacity: generating ? 0.6 : 1 }}
      >
        <View className="flex-row items-center justify-center gap-2">
          {generating ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <MaterialIcons name="auto-awesome" size={20} color={colors.background} />
          )}
          <Text className="text-background font-bold text-base">
            {generating ? "Wird erstellt..." : "Tagesbericht erstellen"}
          </Text>
        </View>
        <Text className="text-background text-xs text-center mt-1 opacity-80">
          Wetter + Anwesenheit + Mängel + Protokolle automatisch zusammenführen
        </Text>
      </TouchableOpacity>

      {/* Manual notes input */}
      <TouchableOpacity
        onPress={() => setShowNoteInput(!showNoteInput)}
        className="flex-row items-center gap-2 mb-3"
      >
        <MaterialIcons name={showNoteInput ? "expand-less" : "add"} size={18} color={colors.primary} />
        <Text className="text-sm text-primary font-medium">Manuelle Notizen hinzufügen</Text>
      </TouchableOpacity>

      {showNoteInput && (
        <View className="bg-surface rounded-xl p-3 mb-4 border border-border">
          <TextInput
            value={manualNotes}
            onChangeText={setManualNotes}
            placeholder="Zusätzliche Notizen für den Tagesbericht (z.B. Lieferungen, Entscheidungen, Vorkommnisse)..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            className="text-sm text-foreground"
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />
        </View>
      )}

      {/* Entries list */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {entries.length === 0 ? (
          <View className="items-center py-12">
            <MaterialIcons name="description" size={48} color={colors.border} />
            <Text className="text-muted text-center mt-3">
              Noch keine Tagesberichte erstellt.{"\n"}
              Tippe oben auf "Tagesbericht erstellen".
            </Text>
          </View>
        ) : (
          entries.map((entry) => (
            <TouchableOpacity
              key={entry.id}
              onPress={() => setSelectedEntry(entry)}
              onLongPress={() => handleDelete(entry)}
              className="bg-surface rounded-xl p-4 mb-3 border border-border"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">
                    {new Date(entry.date).toLocaleDateString("de-DE", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    })}
                  </Text>
                  <Text className="text-xs text-muted mt-1">
                    {entry.projectName}
                    {entry.weather ? ` · ${entry.weather.split(",")[0]}` : ""}
                  </Text>
                </View>
                <View className="flex-row items-center gap-3">
                  {entry.attendanceCount != null && (
                    <View className="items-center">
                      <Text className="text-xs text-muted">Pers.</Text>
                      <Text className="text-sm font-bold text-foreground">{entry.attendanceCount}</Text>
                    </View>
                  )}
                  {entry.defectsCount != null && (
                    <View className="items-center">
                      <Text className="text-xs text-muted">Mängel</Text>
                      <Text className="text-sm font-bold text-error">{entry.defectsCount}</Text>
                    </View>
                  )}
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
