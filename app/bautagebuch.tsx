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
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { ScreenContainer } from "@/components/screen-container";
import { SwipeableRow } from "@/components/swipeable-row";
import { ReportMarkdownPreview } from "@/components/report-markdown-preview";
import { markdownReportToHtml, markdownReportStyles } from "@/lib/markdown-report-html";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDefects, type Defect } from "@/lib/defect-store";
import { getWeatherForLocation, type WeatherData } from "@/lib/weather-service";
import { getCurrentLocation } from "@/lib/location-service";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "@/lib/language-provider";
import { ExportDetailsBox, EMPTY_EXPORT_DETAILS, type ExportDetails } from "@/components/export-details-box";
import { buildPremiumHtml, statBand, premiumIcons, resolveBrandingLogo, type InfoCol } from "@/lib/pdf-premium";
import { getPdfBranding } from "@/lib/pdf-branding-store";
import { BusyOverlay } from "@/components/busy-overlay";

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
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [entries, setEntries] = useState<BautagebuchEntry[]>([]);
  const [generating, setGenerating] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<BautagebuchEntry | null>(null);
  const [manualNotes, setManualNotes] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [exportDetails, setExportDetails] = useState<ExportDetails>(EMPTY_EXPORT_DETAILS);
  const [editingReport, setEditingReport] = useState(false);
  const [reportDraft, setReportDraft] = useState("");

  const generateBautagebuch = trpc.analysis.generateBautagebuch.useMutation();

  async function loadEntries() {
    try {
      const raw = await AsyncStorage.getItem(BAUTAGEBUCH_KEY);
      if (raw) {
        setEntries(JSON.parse(raw));
      }
    } catch (e) {
      console.error("Error loading Bautagebuch entries:", e);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadEntries();
    });
  }, []);

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

      // 3. Get defects (scoped to the active project)
      const activeProjectId = (await AsyncStorage.getItem("last-selected-project-id")) || undefined;
      const allDefects = await getDefects(activeProjectId);
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

      // 4. Get protocols from today (scoped to the active project)
      const protocolsRaw = await getProtocolsForDate(today);
      const protocols = activeProjectId ? protocolsRaw.filter((p: any) => p.projectId === activeProjectId) : protocolsRaw;
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
        defectsCount: allDefects.filter((d: Defect) => d.status !== "erledigt" && d.status !== "geschlossen" && d.status !== "abgelehnt").length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updated = [entry, ...entries.filter(e => e.date !== today)];
      await saveEntries(updated);
      setSelectedEntry(entry);
      setManualNotes("");
      setShowNoteInput(false);
    } catch (error: any) {
      Alert.alert(t('alert_fehler'), `${t('bautagebuch_generate_error' as any)}${error.message}`);
    } finally {
      setGenerating(false);
    }
  }, [generating, entries, manualNotes]);

  const handleShare = async (entry: BautagebuchEntry) => {
    if (!entry.fullReport) return;
    try {
      await Share.share({
        message: entry.fullReport,
        title: `${t('bautagebuch')} ${entry.date}`,
      });
    } catch {}
  };

  const exportPdf = async (entry: BautagebuchEntry) => {
    if (!entry.fullReport || pdfBusy) return;
    setPdfBusy(true);
    try {
      const esc = (s: string) =>
        String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const dateLabel = new Date(entry.date).toLocaleDateString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const branding = await getPdfBranding();
      const accent = branding.accentColor || "#0E7490";
      const logoDataUri = await resolveBrandingLogo(branding);
      const ic = premiumIcons(accent);
      const reportHtml = markdownReportToHtml(entry.fullReport);

      const info: InfoCol[] = [];
      if (entry.projectName) info.push({ label: t('projekt' as any), value: entry.projectName, icon: ic.building });
      info.push({ label: t('datum' as any), value: dateLabel, icon: ic.calendar });
      if (entry.weather) info.push({ label: t('wetter' as any), value: entry.weather, icon: ic.warning });

      const bandItems: { value: string | number; label: string; color: string }[] = [];
      if (entry.attendanceCount != null) bandItems.push({ value: entry.attendanceCount, label: t('bautagebuch_present' as any), color: "#334155" });
      if (entry.defectsCount != null) bandItems.push({ value: entry.defectsCount, label: t('offene_maengel'), color: "#B91C1C" });
      const band = bandItems.length ? statBand(bandItems) : "";

      const html = buildPremiumHtml({
        branding,
        accentColor: accent,
        title: t('bautagebuch'),
        reportTag: t('bautagebuch_report_tag' as any),
        subtitle: esc(dateLabel),
        info,
        body: `${band}<div class="md-report" style="margin-top:18px;">${reportHtml}</div>`,
        extraCss: markdownReportStyles(accent),
        logoDataUri,
        footerLeft: entry.projectName ? `Projekt: ${entry.projectName}` : undefined,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
      try {
        const { addExportEntry } = await import("@/lib/pdf-export-history");
        await addExportEntry({ filename: uri.split("/").pop() || "bautagebuch.pdf", protocolTitle: t('bautagebuch'), templateName: t('bautagebuch_report_tag' as any), projectName: entry.projectName || "", recipients: [], ccRecipients: [], method: "share" });
      } catch {}
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), e?.message || t('pdf_teilen'));
    } finally {
      setPdfBusy(false);
    }
  };

  const startEditReport = () => {
    if (!selectedEntry) return;
    setReportDraft(selectedEntry.fullReport || "");
    setEditingReport(true);
  };

  const saveReport = async () => {
    if (!selectedEntry) return;
    const updatedEntry = { ...selectedEntry, fullReport: reportDraft };
    const updated = entries.map((e) => (e.id === selectedEntry.id ? updatedEntry : e));
    setEntries(updated);
    await saveEntries(updated);
    setSelectedEntry(updatedEntry);
    setEditingReport(false);
  };

  const handleDelete = (entry: BautagebuchEntry) => {
    Alert.alert(
      t('btn_loeschen'),
      `${t('bautagebuch_delete_confirm_a' as any)}${new Date(entry.date).toLocaleDateString("de-DE")}${t('bautagebuch_delete_confirm_b' as any)}`,
      [
        { text: t('btn_abbrechen'), style: "cancel" },
        {
          text: t('btn_loeschen'),
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
          {selectedEntry.fullReport ? (
            <TouchableOpacity
              onPress={editingReport ? saveReport : startEditReport}
              style={{ padding: 8 }}
              accessibilityLabel={editingReport ? t('save') : t('edit')}
            >
              <MaterialIcons name={editingReport ? "check" : "edit"} size={22} color={editingReport ? colors.success : colors.primary} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => exportPdf(selectedEntry)}
            style={{ padding: 8 }}
            accessibilityLabel={t('pdf_teilen')}
          >
            <MaterialIcons name="picture-as-pdf" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleShare(selectedEntry)} style={{ padding: 8 }}>
            <MaterialIcons name="share" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Stats bar */}
          <View className="flex-row gap-3 mb-4">
            {selectedEntry.weather && (
              <View className="flex-1 bg-surface rounded-xl p-3">
                <Text className="text-xs text-muted">{t('weather_title')}</Text>
                <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                  {selectedEntry.weather}
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <Text className="text-xs text-muted">{t('bautagebuch_present' as any)}</Text>
              <Text className="text-lg font-bold text-foreground">{selectedEntry.attendanceCount || 0}</Text>
            </View>
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <Text className="text-xs text-muted">{t('offene_maengel')}</Text>
              <Text className="text-lg font-bold text-error">{selectedEntry.defectsCount || 0}</Text>
            </View>
          </View>

          {/* Full report */}
          {selectedEntry.fullReport && (
            <View className="bg-surface rounded-xl p-4 mb-4">
              {editingReport ? (
                <>
                  <TextInput
                    value={reportDraft}
                    onChangeText={setReportDraft}
                    multiline
                    textAlignVertical="top"
                    style={{ minHeight: 320, fontSize: 14, lineHeight: 21, color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }}
                    placeholder={t('bautagebuch') as any}
                    placeholderTextColor={colors.muted}
                  />
                  <View className="flex-row justify-end mt-3" style={{ gap: 10 }}>
                    <TouchableOpacity onPress={() => setEditingReport(false)} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ color: colors.muted, fontWeight: "700" }}>{t('btn_abbrechen')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={saveReport} style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: colors.primary }}>
                      <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{t('save')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <ReportMarkdownPreview markdown={selectedEntry.fullReport} />
              )}
            </View>
          )}

          {/* Optional export details printed into the PDF header */}
          <ExportDetailsBox value={exportDetails} onChange={setExportDetails} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  // List view
  return (
    <ScreenContainer className="p-4">
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityLabel={t('btn_zurueck' as any)}
            style={{ paddingVertical: 8, paddingRight: 8 }}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-2xl font-bold text-foreground">{t('bautagebuch')}</Text>
            <Text className="text-sm text-muted">{t('bautagebuch_subtitle' as any)}</Text>
          </View>
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
            {generating ? t('bautagebuch_generating' as any) : t('bautagebuch_generate' as any)}
          </Text>
        </View>
        <Text className="text-background text-xs text-center mt-1 opacity-80">
          {t('bautagebuch_generate_hint' as any)}
        </Text>
      </TouchableOpacity>

      {/* Manual notes input */}
      <TouchableOpacity
        onPress={() => setShowNoteInput(!showNoteInput)}
        className="flex-row items-center gap-2 mb-3"
      >
        <MaterialIcons name={showNoteInput ? "expand-less" : "add"} size={18} color={colors.primary} />
        <Text className="text-sm text-primary font-medium">{t('bautagebuch_add_notes' as any)}</Text>
      </TouchableOpacity>

      {showNoteInput && (
        <View className="bg-surface rounded-xl p-3 mb-4 border border-border">
          <TextInput
            value={manualNotes}
            onChangeText={setManualNotes}
            placeholder={t('bautagebuch_notes_placeholder' as any)}
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
              {t('bautagebuch_empty_line1' as any)}{"\n"}
              {t('bautagebuch_empty_line2' as any)}
            </Text>
          </View>
        ) : (
          entries.map((entry) => (
            <SwipeableRow key={entry.id} onDelete={() => handleDelete(entry)} deleteLabel={t('btn_loeschen')}>
            <TouchableOpacity
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
                      <Text className="text-xs text-muted">{t('bautagebuch_persons_short' as any)}</Text>
                      <Text className="text-sm font-bold text-foreground">{entry.attendanceCount}</Text>
                    </View>
                  )}
                  {entry.defectsCount != null && (
                    <View className="items-center">
                      <Text className="text-xs text-muted">{t('maengel')}</Text>
                      <Text className="text-sm font-bold text-error">{entry.defectsCount}</Text>
                    </View>
                  )}
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                </View>
              </View>
            </TouchableOpacity>
            </SwipeableRow>
          ))
        )}
      </ScrollView>
      <BusyOverlay visible={pdfBusy} label={t('pdf_wird_erstellt' as any)} />
    </ScreenContainer>
  );
}
