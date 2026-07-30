/**
 * Design: evidence-first document analysis with square cards and explicit sources.
 * The original file remains visible and every result section is independently scannable.
 */
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import type { DocumentAnalysisResult } from "@/lib/document-ai";
import { decodeUnicodeEscapes } from "@/lib/display-text";

interface DocumentAnalysisDetailProps {
  result: DocumentAnalysisResult | null;
  visible: boolean;
  onClose: () => void;
  onOpenFile: (result: DocumentAnalysisResult) => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {children}
    </View>
  );
}

function EmptyValue() {
  const colors = useColors();
  return <Text style={[styles.emptyValue, { color: colors.muted }]}>Keine Angaben erkannt</Text>;
}

function TagList({ values }: { values: string[] }) {
  const colors = useColors();
  if (values.length === 0) return <EmptyValue />;
  return (
    <View style={styles.tags}>
      {values.map((value, index) => (
        <View key={`${value}-${index}`} style={[styles.tag, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.tagText, { color: colors.foreground }]}>{decodeUnicodeEscapes(value)}</Text>
        </View>
      ))}
    </View>
  );
}

function DataCard({ title, lines, accent = "#5CB8E6" }: { title: string; lines: string[]; accent?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.dataCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.cardMarker, { backgroundColor: accent }]} />
      <View style={styles.dataCopy}>
        <Text style={[styles.dataTitle, { color: colors.foreground }]}>{decodeUnicodeEscapes(title)}</Text>
        {lines.filter(Boolean).map((line, index) => (
          <Text key={`${line}-${index}`} style={[styles.dataLine, { color: colors.muted }]}>
            {decodeUnicodeEscapes(line)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function DocumentAnalysisDetail({ result, visible, onClose, onOpenFile }: DocumentAnalysisDetailProps) {
  const colors = useColors();
  if (!result) return null;

  const extractionLabel = result.extraction.method === "native_pdf_text"
    ? "PDF-Textebene"
    : result.extraction.method === "docx_xml"
      ? "DOCX-Inhalt"
      : result.extraction.method === "xlsx_xml"
        ? "XLSX-Tabellen"
        : result.extraction.method === "plain_text"
          ? "Textdatei"
          : "Bildanalyse";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerEyebrow, { color: colors.primary }]}>DOCUMENT AI</Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>Analyse-Ergebnis</Text>
          </View>
          <Pressable onPress={onClose} style={[styles.closeButton, { borderColor: colors.border }]} accessibilityLabel="Analyse schließen">
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.fileCard, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
            <View style={[styles.fileIcon, { backgroundColor: colors.primary + "18" }]}>
              <MaterialIcons name={result.fileType === "pdf" ? "picture-as-pdf" : "description"} size={26} color={colors.primary} />
            </View>
            <View style={styles.fileCopy}>
              <Text style={[styles.fileName, { color: colors.foreground }]}>{result.fileName}</Text>
              <Text style={[styles.fileMeta, { color: colors.muted }]}>
                {result.fileType.toUpperCase()} · {extractionLabel}
                {result.extraction.pageCount ? ` · ${result.extraction.pageCount} Seiten` : ""}
              </Text>
              <Text style={[styles.fileMeta, { color: colors.muted }]}>Analysiert: {formatDate(result.analyzedAt)}</Text>
            </View>
            <Pressable onPress={() => onOpenFile(result)} style={[styles.openFileButton, { borderColor: colors.primary }]}>
              <MaterialIcons name="open-in-new" size={18} color={colors.primary} />
              <Text style={[styles.openFileText, { color: colors.primary }]}>Datei</Text>
            </Pressable>
          </View>

          <View style={[styles.statusCard, { borderColor: "#10B981", backgroundColor: "#10B98112" }]}>
            <MaterialIcons name="verified" size={22} color="#10B981" />
            <View style={styles.statusCopy}>
              <Text style={[styles.statusTitle, { color: colors.foreground }]}>Analyse tatsächlich abgeschlossen</Text>
              <Text style={[styles.statusMeta, { color: colors.muted }]}>
                Confidence {result.overallConfidence}% · {(result.processingTime / 1000).toFixed(1)} Sekunden
                {result.extraction.textLength ? ` · ${result.extraction.textLength.toLocaleString("de-DE")} Zeichen` : ""}
              </Text>
            </View>
          </View>

          {result.warnings.length > 0 && (
            <View style={[styles.warningCard, { borderColor: "#F59E0B", backgroundColor: "#F59E0B12" }]}>
              <MaterialIcons name="warning-amber" size={20} color="#F59E0B" />
              <View style={styles.warningCopy}>
                {result.warnings.map((warning) => (
                  <Text key={warning} style={[styles.warningText, { color: colors.foreground }]}>{warning}</Text>
                ))}
              </View>
            </View>
          )}

          <Section title="Zusammenfassung">
            <Text style={[styles.summary, { color: colors.foreground }]}>{decodeUnicodeEscapes(result.summary)}</Text>
          </Section>

          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <Section title="Räume / Bereiche"><TagList values={result.rooms} /></Section>
            </View>
            <View style={styles.column}>
              <Section title="Gewerke"><TagList values={result.trades} /></Section>
            </View>
          </View>

          <Section title={`Auffälligkeiten und Mängel (${result.defects.length})`}>
            {result.defects.length === 0 ? <EmptyValue /> : result.defects.map((defect, index) => (
              <DataCard
                key={`${defect.title}-${index}`}
                title={defect.title}
                accent="#EF4444"
                lines={[defect.description || "", defect.location ? `Ort: ${defect.location}` : "", defect.trade ? `Gewerk: ${defect.trade}` : "", defect.severity ? `Bewertung: ${defect.severity}` : ""]}
              />
            ))}
          </Section>

          <Section title={`Aufgaben und Maßnahmen (${result.tasks.length})`}>
            {result.tasks.length === 0 ? <EmptyValue /> : result.tasks.map((task, index) => (
              <DataCard
                key={`${task.title}-${index}`}
                title={task.title}
                accent="#3B82F6"
                lines={[task.description || "", task.trade ? `Gewerk: ${task.trade}` : "", task.deadline ? `Frist: ${task.deadline}` : "", task.assignedTo ? `Verantwortlich: ${task.assignedTo}` : ""]}
              />
            ))}
          </Section>

          <Section title={`Termine und Fristen (${result.appointments.length})`}>
            {result.appointments.length === 0 ? <EmptyValue /> : result.appointments.map((appointment, index) => (
              <DataCard
                key={`${appointment.title}-${index}`}
                title={appointment.title}
                accent="#8B5CF6"
                lines={[`Datum: ${appointment.date}${appointment.time ? ` · ${appointment.time}` : ""}`, appointment.location ? `Ort: ${appointment.location}` : ""]}
              />
            ))}
          </Section>

          {(result.persons.length > 0 || result.companies.length > 0) && (
            <Section title="Ansprechpartner und Firmen">
              {result.persons.map((person, index) => (
                <DataCard key={`${person.name}-${index}`} title={person.name} lines={[person.role || "", person.company || ""]} accent="#06B6D4" />
              ))}
              {result.companies.map((company, index) => (
                <DataCard key={`${company.name}-${index}`} title={company.name} lines={[company.role || ""]} accent="#14B8A6" />
              ))}
            </Section>
          )}

          {(result.quantities.length > 0 || result.references.length > 0) && (
            <Section title="Mengen und Referenzen">
              {result.quantities.map((quantity, index) => (
                <DataCard key={`${quantity.item}-${index}`} title={quantity.item} lines={[`${quantity.amount} ${quantity.unit}`]} accent="#F59E0B" />
              ))}
              {result.references.map((reference, index) => (
                <DataCard key={`${reference.title}-${index}`} title={reference.title} lines={[reference.number || reference.type]} accent="#64748B" />
              ))}
            </Section>
          )}

          <Section title="Quellenstellen aus dem Dokument">
            {result.sourceExcerpts.length === 0 ? <EmptyValue /> : result.sourceExcerpts.map((excerpt, index) => (
              <View key={`${excerpt}-${index}`} style={[styles.excerpt, { borderLeftColor: colors.primary, backgroundColor: colors.surface }]}>
                <Text style={[styles.excerptNumber, { color: colors.primary }]}>{String(index + 1).padStart(2, "0")}</Text>
                <Text style={[styles.excerptText, { color: colors.foreground }]}>{decodeUnicodeEscapes(excerpt)}</Text>
              </View>
            ))}
          </Section>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 54, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1 },
  headerEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  headerTitle: { fontSize: 22, fontWeight: "800", marginTop: 3 },
  closeButton: { width: 44, height: 44, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 60, gap: 18 },
  fileCard: { borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  fileIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  fileCopy: { flex: 1, gap: 3 },
  fileName: { fontSize: 14, fontWeight: "800" },
  fileMeta: { fontSize: 11, lineHeight: 15 },
  openFileButton: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center", gap: 2 },
  openFileText: { fontSize: 10, fontWeight: "800" },
  statusCard: { borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  statusCopy: { flex: 1, gap: 3 },
  statusTitle: { fontSize: 13, fontWeight: "800" },
  statusMeta: { fontSize: 11, lineHeight: 16 },
  warningCard: { borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  warningCopy: { flex: 1, gap: 5 },
  warningText: { fontSize: 11, lineHeight: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  summary: { fontSize: 14, lineHeight: 22 },
  twoColumns: { flexDirection: "row", gap: 14 },
  column: { flex: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  tagText: { fontSize: 11, fontWeight: "700" },
  emptyValue: { fontSize: 12, fontStyle: "italic" },
  dataCard: { borderWidth: 1, flexDirection: "row", marginBottom: 8 },
  cardMarker: { width: 4 },
  dataCopy: { flex: 1, padding: 12, gap: 4 },
  dataTitle: { fontSize: 13, fontWeight: "800" },
  dataLine: { fontSize: 11, lineHeight: 16 },
  excerpt: { borderLeftWidth: 3, padding: 12, flexDirection: "row", gap: 10, marginBottom: 7 },
  excerptNumber: { fontSize: 10, fontWeight: "900", paddingTop: 2 },
  excerptText: { flex: 1, fontSize: 11, lineHeight: 17 },
});
