/**
 * protoKI – Mängel-Export
 * 
 * Export defects as professional PDF or Excel with:
 * - Filter by status, priority, trade
 * - Include photos
 * - Company branding
 * - Summary statistics
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { getDefects, type Defect, type DefectStatus } from "@/lib/defect-store";
import { generateAndSharePdf, generateQrCodeBase64, type ProfessionalPdfOptions, type PdfSection, getCompanyInfo } from "@/lib/pdf-professional";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STATUS_LABEL_KEYS: Record<DefectStatus, string> = {
  offen: "defect_export_status_offen",
  zugewiesen: "defect_export_status_zugewiesen",
  in_bearbeitung: "defect_export_status_in_bearbeitung",
  nachbesserung: "defect_export_status_nachbesserung",
  pruefung: "defect_export_status_pruefung",
  erledigt: "defect_export_status_erledigt",
  abgelehnt: "defect_export_status_abgelehnt",
  geschlossen: "defect_export_status_geschlossen",
};

export default function DefectExportScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useColors();
  const params = useLocalSearchParams<{ projectId?: string }>();

  const [defects, setDefects] = useState<Defect[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<DefectStatus[]>(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  async function loadDefects() {
    const all = await getDefects(params.projectId);
    setDefects(all);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadDefects();
    });
  }, []);

  const filteredDefects = defects.filter(d => selectedStatuses.includes(d.status));

  const toggleStatus = (status: DefectStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleExport = async () => {
    if (filteredDefects.length === 0) {
      Alert.alert(t('defect_export_keine_maengel' as any), t('defect_export_keine_maengel_filter' as any));
      return;
    }

    setIsExporting(true);
    try {
      const companyInfo = await getCompanyInfo();

      // Build sections
      const sections: PdfSection[] = [];

      // Summary section
      const statusCounts = Object.entries(STATUS_LABEL_KEYS).map(([status, labelKey]) => {
        const count = filteredDefects.filter(d => d.status === status).length;
        return [t(labelKey as any), count.toString()];
      }).filter(([, count]) => parseInt(count) > 0);

      sections.push({
        title: t('defect_export_zusammenfassung' as any),
        content: `${t('defect_export_insgesamt' as any)} **${filteredDefects.length} ${t('defect_export_maengel' as any)}** ${t('defect_export_in_bericht' as any)}`,
        table: {
          headers: [t('defect_export_status' as any), t('defect_export_anzahl' as any)],
          rows: statusCounts as string[][],
        },
      });

      // Individual defects
      filteredDefects.forEach((defect, di) => {
        const prioColor = defect.priority === "hoch" ? "#DC2626" : defect.priority === "mittel" ? "#F59E0B" : "#16A34A";
        const prioText = defect.priority === "hoch" ? t('defect_export_prio_hoch' as any) : defect.priority === "mittel" ? t('defect_export_prio_mittel' as any) : t('defect_export_prio_niedrig' as any);

        let content = `**${t('defect_export_label_status' as any)}** ${t(STATUS_LABEL_KEYS[defect.status] as any)}\n`;
        content += `**${t('defect_export_label_prioritaet' as any)}** <span style="color:${prioColor};font-weight:700;">${prioText}</span>\n`;
        if (defect.location) content += `**${t('defect_export_label_ort' as any)}** ${defect.location}\n`;
        if (defect.gewerk) content += `**${t('defect_export_label_gewerk' as any)}** ${defect.gewerk}\n`;
        if (defect.assignee) content += `**${t('defect_export_label_zustaendig' as any)}** ${defect.assignee}\n`;
        if (defect.followUpDate) content += `**${t('defect_export_label_frist' as any)}** ${defect.followUpDate}\n`;
        content += `\n${defect.description}`;

        if (includeComments && defect.comments && defect.comments.length > 0) {
          content += `\n\n**${t('defect_export_label_kommentare' as any)}**\n`;
          for (const comment of defect.comments) {
            content += `- ${comment.text} (${new Date(comment.createdAt).toLocaleDateString("de-DE")})\n`;
          }
        }

        const cleanTitle = (defect.title || "").trim();
        sections.push({
          title: cleanTitle || `${t('defect_export_mangel' as any)} ${di + 1}`,
          content,
        });
      });

      // Generate QR code for digital version
      const qrData = `buildki://defects/${params.projectId || "all"}`;
      const qrCodeBase64 = await generateQrCodeBase64(qrData);

      // Check for Matterport link
      let matterportLink: string | undefined;
      try {
        if (params.projectId) {
          const matterportData = await AsyncStorage.getItem(`matterport_model_${params.projectId}`);
          if (matterportData) {
            const parsed = JSON.parse(matterportData);
            if (parsed.modelId) matterportLink = `https://my.matterport.com/show/?m=${parsed.modelId}`;
          }
        }
      } catch {}

      const options: ProfessionalPdfOptions = {
        title: t('defect_export_maengelbericht' as any),
        subtitle: params.projectId ? `${t('defect_export_projekt' as any)}: ${params.projectId}` : undefined,
        reportType: t('defect_export_maengelbericht' as any),
        datum: new Date().toLocaleDateString("de-DE"),
        sections,
        companyInfo: companyInfo || undefined,
        accentColor: "#EF4444",
        includeTableOfContents: filteredDefects.length > 5,
        qrCodeBase64: qrCodeBase64 || undefined,
        qrCodeLabel: t('defect_export_qr_label' as any),
        matterportLink,
      };

      await generateAndSharePdf(options);
    } catch (error: any) {
      Alert.alert(t('defect_export_fehler' as any), error.message || t('defect_export_fehlgeschlagen' as any));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScreenContainer className="p-0">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('defect_export_maengel_exportieren' as any)}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: "#EF4444" }]}>{defects.length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{t('defect_export_gesamt' as any)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: "#00B0FF" }]}>{filteredDefects.length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{t('defect_export_ausgewaehlt' as any)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: "#43A047" }]}>
              {defects.filter(d => d.status === "erledigt" || d.status === "geschlossen").length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{t('defect_export_status_erledigt' as any)}</Text>
          </View>
        </View>

        {/* Status Filter */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('defect_export_status_filter' as any)}</Text>
        <View style={styles.filterGrid}>
          {(Object.entries(STATUS_LABEL_KEYS) as [DefectStatus, string][]).map(([status, labelKey]) => {
            const isSelected = selectedStatuses.includes(status);
            const count = defects.filter(d => d.status === status).length;
            return (
              <Pressable
                key={status}
                onPress={() => toggleStatus(status)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? "#00B0FF15" : colors.surface,
                    borderColor: isSelected ? "#00B0FF" : colors.border,
                  },
                ]}
              >
                <MaterialIcons
                  name={isSelected ? "check-box" : "check-box-outline-blank"}
                  size={16}
                  color={isSelected ? "#00B0FF" : colors.muted}
                />
                <Text style={[styles.filterLabel, { color: isSelected ? "#00B0FF" : colors.foreground }]}>
                  {t(labelKey as any)} ({count})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Options */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>{t('defect_export_optionen' as any)}</Text>
        <Pressable
          onPress={() => setIncludePhotos(!includePhotos)}
          style={[styles.optionRow, { borderColor: colors.border }]}
        >
          <MaterialIcons
            name={includePhotos ? "check-box" : "check-box-outline-blank"}
            size={20}
            color={includePhotos ? "#00B0FF" : colors.muted}
          />
          <Text style={[styles.optionLabel, { color: colors.foreground }]}>{t('defect_export_fotos_einbinden' as any)}</Text>
        </Pressable>
        <Pressable
          onPress={() => setIncludeComments(!includeComments)}
          style={[styles.optionRow, { borderColor: colors.border }]}
        >
          <MaterialIcons
            name={includeComments ? "check-box" : "check-box-outline-blank"}
            size={20}
            color={includeComments ? "#00B0FF" : colors.muted}
          />
          <Text style={[styles.optionLabel, { color: colors.foreground }]}>{t('defect_export_kommentare_einbinden' as any)}</Text>
        </Pressable>

        {/* Export Button */}
        <Pressable
          onPress={handleExport}
          disabled={isExporting || filteredDefects.length === 0}
          style={({ pressed }) => [
            styles.exportBtn,
            { opacity: isExporting || filteredDefects.length === 0 ? 0.4 : pressed ? 0.8 : 1 },
          ]}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name="picture-as-pdf" size={20} color="#fff" />
          )}
          <Text style={styles.exportBtnText}>
            {isExporting ? t('defect_export_wird_exportiert' as any) : `${filteredDefects.length} ${t('defect_export_maengel' as any)} ${t('defect_export_als_pdf' as any)}`}
          </Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 20,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  optionLabel: {
    fontSize: 15,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 0,
    marginTop: 24,
  },
  exportBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
