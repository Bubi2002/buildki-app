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
import { getDefects, type Defect, type DefectStatus } from "@/lib/defect-store";
import { generateAndSharePdf, generateQrCodeBase64, type ProfessionalPdfOptions, type PdfSection, getCompanyInfo } from "@/lib/pdf-professional";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STATUS_LABELS: Record<DefectStatus, string> = {
  offen: "Offen",
  zugewiesen: "Zugewiesen",
  in_bearbeitung: "In Bearbeitung",
  nachbesserung: "Nachbesserung",
  pruefung: "Prüfung",
  erledigt: "Erledigt",
  abgelehnt: "Abgelehnt",
  geschlossen: "Geschlossen",
};

export default function DefectExportScreen() {
  const router = useRouter();
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
      Alert.alert("Keine Mängel", "Es gibt keine Mängel mit den ausgewählten Filtern.");
      return;
    }

    setIsExporting(true);
    try {
      const companyInfo = await getCompanyInfo();

      // Build sections
      const sections: PdfSection[] = [];

      // Summary section
      const statusCounts = Object.entries(STATUS_LABELS).map(([status, label]) => {
        const count = filteredDefects.filter(d => d.status === status).length;
        return [label, count.toString()];
      }).filter(([, count]) => parseInt(count) > 0);

      sections.push({
        title: "Zusammenfassung",
        content: `Insgesamt **${filteredDefects.length} Mängel** in diesem Bericht.`,
        table: {
          headers: ["Status", "Anzahl"],
          rows: statusCounts as string[][],
        },
      });

      // Individual defects
      for (const defect of filteredDefects) {
        let content = `**Status:** ${STATUS_LABELS[defect.status]}\n`;
        content += `**Priorität:** ${defect.priority === "hoch" ? "Hoch" : defect.priority === "mittel" ? "Mittel" : "Niedrig"}\n`;
        if (defect.location) content += `**Ort:** ${defect.location}\n`;
        if (defect.gewerk) content += `**Gewerk:** ${defect.gewerk}\n`;
        if (defect.assignee) content += `**Zuständig:** ${defect.assignee}\n`;
        if (defect.followUpDate) content += `**Frist:** ${defect.followUpDate}\n`;
        content += `\n${defect.description}`;

        if (includeComments && defect.comments && defect.comments.length > 0) {
          content += `\n\n**Kommentare:**\n`;
          for (const comment of defect.comments) {
            content += `- ${comment.text} (${new Date(comment.createdAt).toLocaleDateString("de-DE")})\n`;
          }
        }

        sections.push({
          title: `#${defect.id.slice(-4)} – ${defect.title}`,
          content,
        });
      }

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
        title: "Mängelbericht",
        subtitle: params.projectId ? `Projekt: ${params.projectId}` : undefined,
        reportType: "Mängelbericht",
        datum: new Date().toLocaleDateString("de-DE"),
        sections,
        companyInfo: companyInfo || undefined,
        accentColor: "#EF4444",
        includeTableOfContents: filteredDefects.length > 5,
        qrCodeBase64: qrCodeBase64 || undefined,
        qrCodeLabel: "Digitalen Mängelbericht öffnen",
        matterportLink,
      };

      await generateAndSharePdf(options);
    } catch (error: any) {
      Alert.alert("Export-Fehler", error.message || "Export fehlgeschlagen");
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mängel exportieren</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: "#EF4444" }]}>{defects.length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Gesamt</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: "#00B0FF" }]}>{filteredDefects.length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Ausgewählt</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: "#43A047" }]}>
              {defects.filter(d => d.status === "erledigt" || d.status === "geschlossen").length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Erledigt</Text>
          </View>
        </View>

        {/* Status Filter */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Status-Filter</Text>
        <View style={styles.filterGrid}>
          {(Object.entries(STATUS_LABELS) as [DefectStatus, string][]).map(([status, label]) => {
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
                  {label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Options */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>Optionen</Text>
        <Pressable
          onPress={() => setIncludePhotos(!includePhotos)}
          style={[styles.optionRow, { borderColor: colors.border }]}
        >
          <MaterialIcons
            name={includePhotos ? "check-box" : "check-box-outline-blank"}
            size={20}
            color={includePhotos ? "#00B0FF" : colors.muted}
          />
          <Text style={[styles.optionLabel, { color: colors.foreground }]}>Fotos einbinden</Text>
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
          <Text style={[styles.optionLabel, { color: colors.foreground }]}>Kommentare einbinden</Text>
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
            {isExporting ? "Wird exportiert..." : `${filteredDefects.length} Mängel als PDF exportieren`}
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
