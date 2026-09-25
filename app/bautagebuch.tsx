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
  Modal,
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
import { buildExportDetailsHeaderHtml } from "@/lib/pdf-meta-header";
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
  weatherData?: WeatherData;
  attendanceCount?: number;
  defectsCount?: number;
  createdAt: string;
  updatedAt: string;
};

const BAUTAGEBUCH_KEY = "bautagebuch_entries";

type ReportSection = { title: string; body: string };

/** Split a generated Bautagebuch markdown report into its `## N. Title` sections. */
function parseReportSections(md: string): ReportSection[] {
  if (!md) return [];
  const sections: ReportSection[] = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      if (cur) sections.push({ title: cur.title, body: cur.body.join("\n").trim() });
      cur = { title: m[1].replace(/^\d+\.\s*/, "").trim(), body: [] };
    } else if (cur) {
      const trimmed = line.trim();
      if (trimmed === "---") continue;
      if (/^\*Erstellt mit BuildKI/.test(trimmed)) continue;
      cur.body.push(line);
    }
  }
  if (cur) sections.push({ title: cur.title, body: cur.body.join("\n").trim() });
  return sections;
}

/** Icon + accent colour for a section, matched by its (German) title. */
function sectionStyle(title: string): { icon: any; color: string } {
  const t = title.toLowerCase();
  if (t.includes("witterung") || t.includes("wetter")) return { icon: "wb-sunny", color: "#B45309" };
  if (t.includes("anwesen")) return { icon: "groups", color: "#2563EB" };
  if (t.includes("arbeit")) return { icon: "construction", color: "#475569" };
  if (t.includes("mängel") || t.includes("maengel") || t.includes("mangel")) return { icon: "warning", color: "#DC2626" };
  if (t.includes("vorkommnis")) return { icon: "report-problem", color: "#EA580C" };
  if (t.includes("lieferung") || t.includes("material")) return { icon: "local-shipping", color: "#4F46E5" };
  if (t.includes("entscheidung") || t.includes("anweisung")) return { icon: "gavel", color: "#7C3AED" };
  if (t.includes("planung")) return { icon: "event", color: "#0369A1" };
  return { icon: "sticky-note-2", color: "#64748B" };
}

function StatCard({ icon, value, label, color, colors }: { icon: any; value: string | number; label: string; color: string; colors: any }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: "30%", minWidth: 96, backgroundColor: colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <MaterialIcons name={icon} size={16} color={color} />
        <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={{ fontSize: 16, fontWeight: "800", color }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SectionCard({ title, body, colors, onOpenDefects }: { title: string; body: string; colors: any; onOpenDefects?: () => void }) {
  const st = sectionStyle(title);
  const trimmed = body.trim();
  if (!trimmed) return null;

  // Empty/placeholder sections ("Keine ... dokumentiert") → compact one-liner, not a big card.
  const isPlaceholder = /^keine\b/i.test(trimmed) && trimmed.split(/\r?\n/).length <= 2;
  if (isPlaceholder) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, opacity: 0.7 }}>
        <MaterialIcons name={st.icon} size={15} color={colors.muted} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{title}</Text>
        <Text style={{ fontSize: 12, color: colors.muted, flex: 1 }} numberOfLines={1}> · {trimmed}</Text>
      </View>
    );
  }

  const isPlanning = /planung/i.test(title);
  const isMangel = /mängel|maengel|mangel/i.test(title);

  // Critical defects → clickable cards, separated from the rest of the section body.
  let criticalCards: any = null;
  let bodyForMd = trimmed;
  if (isMangel) {
    const lines = trimmed.split(/\r?\n/);
    const crit: string[] = [];
    const rest: string[] = [];
    let inCrit = false;
    for (const l of lines) {
      if (/kritische mängel/i.test(l)) { inCrit = true; continue; }
      if (inCrit && /^\s*[-*]\s+/.test(l)) { crit.push(l.replace(/^\s*[-*]\s+/, "").replace(/^⚠️\s*/, "").trim()); continue; }
      if (inCrit && !l.trim()) { inCrit = false; }
      rest.push(l);
    }
    bodyForMd = rest.join("\n").trim();
    if (crit.length) {
      criticalCards = (
        <View style={{ marginTop: 10, gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#DC2626", marginBottom: 2 }}>Kritische Mängel</Text>
          {crit.map((c: string, i: number) => (
            <TouchableOpacity key={i} onPress={onOpenDefects} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, backgroundColor: "#DC262212", borderWidth: 1, borderColor: "#DC262633" }}>
              <MaterialIcons name="error" size={16} color="#DC2626" />
              <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }}>{c}</Text>
              <MaterialIcons name="chevron-right" size={18} color="#DC2626" />
            </TouchableOpacity>
          ))}
        </View>
      );
    }
  }

  return (
    <View style={{ borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: isPlanning ? st.color : colors.border, borderLeftWidth: isPlanning ? 4 : 1, borderLeftColor: isPlanning ? st.color : colors.border, backgroundColor: isPlanning ? st.color + "0D" : colors.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: st.color + "1A", alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name={st.icon} size={18} color={st.color} />
        </View>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }}>{title}</Text>
      </View>
      {bodyForMd ? <ReportMarkdownPreview markdown={bodyForMd} /> : null}
      {criticalCards}
    </View>
  );
}

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
  const [showExportModal, setShowExportModal] = useState(false);
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
        weatherData: weather || undefined,
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
      const accent = branding.accentColor || "#1E3A5F";
      const logoDataUri = await resolveBrandingLogo(branding);
      const ic = premiumIcons(accent);
      const reportHtml = markdownReportToHtml(entry.fullReport);

      // Header (Kopf): Projektname · Datum · Wetter · Erstellt am
      const info: InfoCol[] = [];
      if (entry.projectName) info.push({ label: t('projekt' as any), value: entry.projectName, icon: ic.building });
      info.push({ label: t('datum' as any), value: dateLabel, icon: ic.calendar });
      if (entry.weather) info.push({ label: t('wetter' as any), value: entry.weather, icon: ic.cloud });
      info.push({ label: t('erstellt_am' as any), value: new Date(entry.createdAt).toLocaleDateString("de-DE"), icon: ic.calendarClock });

      // Kennzahlenleiste: Anwesend · Neue Mängel · Behobene Mängel · Offene Mängel
      const parseNum = (re: RegExp) => { const m = entry.fullReport?.match(re); return m ? Number(m[1]) : null; };
      const newToday = parseNum(/Neu heute:\s*(\d+)/);
      const resolvedToday = parseNum(/Behoben heute:\s*(\d+)/);
      const bandItems: { value: string | number; label: string; color: string; icon?: string }[] = [];
      const gi = (color: string) => premiumIcons(color, 22);
      if (entry.attendanceCount != null) bandItems.push({ value: entry.attendanceCount, label: t('bautagebuch_present' as any), color: "#334155", icon: gi("#64748b").people });
      if (newToday != null) bandItems.push({ value: newToday, label: t('btb_dash_new' as any), color: "#EA580C", icon: gi("#EA580C").warning });
      if (resolvedToday != null) bandItems.push({ value: resolvedToday, label: t('btb_dash_resolved' as any), color: "#16A34A", icon: gi("#16A34A").check });
      if (entry.defectsCount != null) bandItems.push({ value: entry.defectsCount, label: t('offene_maengel'), color: "#B91C1C", icon: gi("#B91C1C").warning });
      const band = bandItems.length ? statBand(bandItems) : "";

      // Optional export details (entered in the modal) → header block in the PDF.
      const detailsHeader = buildExportDetailsHeaderHtml(exportDetails, {
        bauvorhaben: t('export_bauvorhaben'),
        adresse: t('export_adresse'),
        etage: t('export_etage'),
        raum: t('export_raum'),
        notizen: t('export_notizen'),
      });

      const html = buildPremiumHtml({
        branding,
        accentColor: accent,
        title: t('bautagebuch'),
        reportTag: t('bautagebuch_report_tag' as any),
        subtitle: esc(dateLabel),
        info,
        body: `${band}${detailsHeader ? `<div style="margin-top:14px;">${detailsHeader}</div>` : ""}<div class="md-report" style="margin-top:18px;">${reportHtml}</div>`,
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
    const sections = parseReportSections(selectedEntry.fullReport || "");
    const findSec = (kw: string) => sections.find((s) => s.title.toLowerCase().includes(kw));
    const mangelSec = findSec("mängel") || findSec("maengel");
    const resolvedToday = mangelSec ? mangelSec.body.match(/Behoben heute:\s*(\d+)/)?.[1] : undefined;
    const newToday = mangelSec ? mangelSec.body.match(/Neu heute:\s*(\d+)/)?.[1] : undefined;
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
            onPress={() => setShowExportModal(true)}
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
          {editingReport ? (
            <View className="bg-surface rounded-xl p-4 mb-4">
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
            </View>
          ) : (
            <>
              {/* Kennzahlen: Anwesend · Neu · Behoben · Offen */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                <StatCard icon="groups" value={selectedEntry.attendanceCount ?? 0} label={t('bautagebuch_present' as any)} color="#2563EB" colors={colors} />
                <StatCard icon="add-alert" value={newToday ?? 0} label={t('btb_dash_new' as any)} color="#EA580C" colors={colors} />
                <StatCard icon="check-circle" value={resolvedToday ?? 0} label={t('btb_dash_resolved' as any)} color="#16A34A" colors={colors} />
                <StatCard icon="warning" value={selectedEntry.defectsCount ?? 0} label={t('offene_maengel')} color="#DC2626" colors={colors} />
              </View>

              {/* Sections as separate cards */}
              {sections.length > 0 ? (
                sections.map((s, i) => <SectionCard key={i} title={s.title} body={s.body} colors={colors} onOpenDefects={() => router.push("/defects")} />)
              ) : selectedEntry.fullReport ? (
                <View className="bg-surface rounded-xl p-4 mb-4">
                  <ReportMarkdownPreview markdown={selectedEntry.fullReport} />
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* Export details as a small modal (opened from the PDF button), not inline on the page */}
        <Modal visible={showExportModal} transparent animationType="slide" onRequestClose={() => setShowExportModal(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: "88%" }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground }}>{t('bautagebuch_export_details_title' as any)}</Text>
                <TouchableOpacity onPress={() => setShowExportModal(false)} style={{ padding: 6 }}>
                  <MaterialIcons name="close" size={22} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>{t('bautagebuch_export_details_hint' as any)}</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                <ExportDetailsBox value={exportDetails} onChange={setExportDetails} />
              </ScrollView>
              <TouchableOpacity
                onPress={() => { setShowExportModal(false); if (selectedEntry) exportPdf(selectedEntry); }}
                style={{ marginTop: 12, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>{t('pdf_exportieren' as any)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
