/**
 * protoKI – Professioneller KI-Berichtsgenerator
 *
 * Features:
 * - 10 Berichtstypen mit spezialisierten Prompts
 * - Automatische Gewerk-Zusammenfassung via LLM
 * - Fotos an den richtigen Stellen referenziert
 * - Professionelle Bauleiter-Sprache
 * - Mängel-Daten aus defect-store integriert
 * - Anwesenheitsdaten aus attendance_records
 * - Editierbarer Bericht vor Export
 * - PDF-Export mit Markdown-Rendering
 */
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { REPORT_TYPES, type ReportType } from "@/lib/report-types";
import { trpc } from "@/lib/trpc";
import { getProjectStructure, type Floor, type Room } from "@/lib/room-store";
import { getDefects } from "@/lib/defect-store";
import {
  formatEvidenceTimecode,
  getEvidence,
  isEvidenceDocumentReady,
  saveEvidenceBatch,
  type EvidenceItem,
} from "@/lib/evidence-store";
import {
  createDocumentEvidenceSelection,
  formatMeasurementForDocument,
  type DocumentEvidenceSelection,
} from "@/lib/document-evidence";

type Step = "select" | "configure" | "generating" | "preview" | "edit";

type PhotoRef = {
  evidenceId: string;
  description: string;
  room?: string;
  trade?: string;
  sourceLabel: string;
  videoTimecode?: string;
  measurements: string[];
};

export default function ReportGeneratorScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{
    protocolId?: string;
    transcription?: string;
    projectId?: string;
    roomId?: string;
    roomName?: string;
    floorName?: string;
  }>();

  const [step, setStep] = useState<Step>("select");
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [transcription, setTranscription] = useState(params.transcription || "");
  const [reportContent, setReportContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [generationProgress, setGenerationProgress] = useState(0);

  // Metadata
  const [reportDatum, setReportDatum] = useState(new Date().toLocaleDateString("de-DE"));
  const [reportProjekt, setReportProjekt] = useState("");
  const [reportFloor, setReportFloor] = useState(params.floorName || "");
  const [reportRoom, setReportRoom] = useState(params.roomName || "");
  const [projectFloors, setProjectFloors] = useState<Floor[]>([]);
  const [projectRooms, setProjectRooms] = useState<Room[]>([]);
  const [includeDefects, setIncludeDefects] = useState(true);
  const [includeAttendance, setIncludeAttendance] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [availableEvidence, setAvailableEvidence] = useState<EvidenceItem[]>([]);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [documentEvidence, setDocumentEvidence] = useState<DocumentEvidenceSelection | null>(null);

  // tRPC mutation for report generation
  const generateReportMutation = trpc.analysis.generateReport.useMutation();

  async function loadProjectContext(projectId: string) {
    try {
      const [structure, defects] = await Promise.all([
        getProjectStructure(projectId),
        getDefects(projectId),
      ]);
      setProjectFloors(structure.floors);
      setProjectRooms(structure.rooms);

      await saveEvidenceBatch(
        defects.flatMap((defect) =>
          (defect.photos || []).map((uri, index) => ({
            projectId,
            defectId: defect.id,
            protocolId: defect.protocolId,
            sourceType: "photo" as const,
            originalUri: uri,
            findingText: defect.title,
            room: defect.room || defect.location,
            trade: defect.gewerk || defect.category,
            capturedAt: defect.createdAt,
            reviewStatus: "approved" as const,
            legacySourceKey: `defect:${defect.id}:photo:${index}:${uri}`,
          })),
        ),
      );
      const readyEvidence = (await getEvidence(projectId))
        .filter(isEvidenceDocumentReady)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      setAvailableEvidence(readyEvidence);
      setSelectedEvidenceIds(readyEvidence.slice(0, 20).map((item) => item.id));
    } catch {
      setProjectFloors([]);
      setProjectRooms([]);
      setAvailableEvidence([]);
      setSelectedEvidenceIds([]);
    }
  }

  // Load document context without synchronously updating state inside the effect.
  React.useEffect(() => {
    if (!params.projectId) return;
    queueMicrotask(() => {
      void loadProjectContext(params.projectId as string);
    });
  }, [params.projectId]);

  /**
   * Main report generation flow:
   * 1. Gather context data (defects, attendance, photos)
   * 2. Call server LLM with structured output
   * 3. Receive formatted Markdown report
   */
  const generateReport = async () => {
    if (!selectedType || !transcription.trim()) {
      Alert.alert("Fehler", "Bitte Berichtstyp und Transkription angeben.");
      return;
    }

    setStep("generating");
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // Step 1: Gather defect data
      setGenerationStep("Projektdaten sammeln...");
      setGenerationProgress(10);

      let defectsJson: string | undefined;
      if (includeDefects && params.projectId) {
        try {
          const defects = await getDefects(params.projectId);
          if (defects.length > 0) {
            defectsJson = JSON.stringify(
              defects.map((d) => ({
                id: d.id,
                title: d.title,
                status: d.status,
                priority: d.priority,
                location: d.location,
                gewerk: d.gewerk || d.category,
                description: d.description,
                dueDate: d.dueDate,
                assignee: d.assignee,
                assigneeFirma: d.assigneeFirma,
                positionCode: d.positionCode,
                followUpDate: d.followUpDate,
                followUpResult: d.followUpResult,
                aiSummary: d.aiSummary,
                room: d.room,
                floor: d.floor,
                source: d.source,
                matterportModelId: d.matterportModelId,
                matterportFloorName: d.matterportFloorName,
                matterportRoomName: d.matterportRoomName,
                hasSignatures: (d.signatures?.length || 0) > 0,
                photoCount: d.photos?.length || 0,
                createdAt: d.createdAt,
              }))
            );
          }
        } catch {}
      }

      // Step 2: Gather attendance data
      setGenerationStep("Anwesenheitsdaten laden...");
      setGenerationProgress(25);

      let attendeesJson: string | undefined;
      if (includeAttendance) {
        try {
          const raw = await AsyncStorage.getItem("attendance_records");
          if (raw) {
            const records = JSON.parse(raw);
            // Find today's or most recent record
            const today = new Date().toISOString().slice(0, 10);
            const todayRecord = records.find((r: any) => r.date === today) || records[records.length - 1];
            if (todayRecord?.workers?.length > 0) {
              attendeesJson = JSON.stringify(
                todayRecord.workers.map((w: any) => ({
                  name: w.name,
                  company: w.firma,
                  role: w.gewerk,
                }))
              );
            }
          }
        } catch {}
      }

      // Step 3: Freeze the user-reviewed evidence selection for this document.
      setGenerationStep("Belegauswahl vorbereiten...");
      setGenerationProgress(40);

      let photosJson: string | undefined;
      let frozenEvidence: DocumentEvidenceSelection | null = null;
      if (includePhotos && selectedEvidenceIds.length > 0) {
        try {
          frozenEvidence = await createDocumentEvidenceSelection(selectedEvidenceIds);
          setDocumentEvidence(frozenEvidence);
          const photoRefs: PhotoRef[] = frozenEvidence.snapshots.map((item) => ({
            evidenceId: item.evidenceId,
            description: item.findingText || "Visueller Beleg ohne Befundtext",
            room: item.room,
            trade: item.trade,
            sourceLabel: item.sourceLabel,
            videoTimecode: item.videoTimecode,
            measurements: item.measurements.map(formatMeasurementForDocument),
          }));
          if (photoRefs.length > 0) {
            photosJson = JSON.stringify(photoRefs);
          }
        } catch {
          frozenEvidence = null;
          setDocumentEvidence(null);
        }
      } else {
        setDocumentEvidence(null);
      }

      // Step 4: Call server LLM for professional report
      setGenerationStep("KI generiert professionellen Bericht...");
      setGenerationProgress(60);

      const result = await generateReportMutation.mutateAsync({
        reportType: selectedType,
        transcription,
        projectName: reportProjekt || undefined,
        datum: reportDatum,
        floor: reportFloor || undefined,
        room: reportRoom || undefined,
        defectsJson,
        photosJson,
        attendeesJson,
        additionalContext: [
          params.protocolId ? `Protokoll-ID: ${params.protocolId}` : null,
          photosJson
            ? "Visuelle Belege dürfen ausschließlich über die bereitgestellten evidenceId-Werte referenziert werden. Keine freie oder geschätzte Bildzuordnung erzeugen."
            : null,
        ]
          .filter(Boolean)
          .join("\n") || undefined,
      });

      setGenerationStep("Formatierung abschließen...");
      setGenerationProgress(90);

      if (result.content) {
        setReportContent(result.content);
      } else {
        setReportContent(generateFallbackReport(selectedType));
      }

      setGenerationProgress(100);
      setStep("preview");
    } catch  {
      // Fallback to local template
      setReportContent(generateFallbackReport(selectedType));
      setStep("preview");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateFallbackReport = (type: ReportType): string => {
    const config = REPORT_TYPES.find((r) => r.id === type)!;
    const date = reportDatum || new Date().toLocaleDateString("de-DE");
    const project = reportProjekt || "[Projektname]";

    let report = `# ${config.label}\n\n`;
    report += `| | |\n|---|---|\n`;
    report += `| **Projekt** | ${project} |\n`;
    report += `| **Datum** | ${date} |\n\n`;
    report += `---\n\n`;

    for (const section of config.sections) {
      report += `## ${section}\n\n`;
      report += `[Bitte ergänzen]\n\n`;
    }

    report += `---\n\n`;
    report += `## Originaltranskription\n\n`;
    report += `> ${transcription.slice(0, 500)}${transcription.length > 500 ? "..." : ""}\n\n`;
    report += `---\n\n`;
    report += `*Erstellt mit protoKI am ${date}*\n`;

    return report;
  };

  const exportReportPdf = async () => {
    if (!selectedType || !reportContent) return;
    try {
      const [{ generateProtocolPdf }, Sharing] = await Promise.all([
        import("@/lib/pdf-generator"),
        import("expo-sharing"),
      ]);
      const config = REPORT_TYPES.find((item) => item.id === selectedType);
      const pdfUri = await generateProtocolPdf({
        title: reportProjekt || config?.label || "Bericht",
        projectName: reportProjekt || undefined,
        protocol: reportContent,
        templateId: selectedType,
        templateName: config?.label || selectedType,
        duration: 0,
        createdAt: new Date().toISOString(),
        evidenceIds: documentEvidence?.evidenceIds || [],
        evidenceSnapshots: documentEvidence?.snapshots || [],
      });
      if (pdfUri && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: "application/pdf",
          dialogTitle: `${reportProjekt || config?.label || "Bericht"} teilen`,
        });
      }
    } catch {
      Alert.alert("Fehler", "Der Bericht konnte nicht als PDF exportiert werden.");
    }
  };

  const saveReport = async () => {
    // Save to AsyncStorage for later PDF export
    try {
      const reportData = {
        id: `report_${Date.now()}`,
        type: selectedType,
        content: reportContent,
        projectId: params.projectId,
        projectName: reportProjekt,
        datum: reportDatum,
        evidenceIds: documentEvidence?.evidenceIds || [],
        evidenceSnapshots: documentEvidence?.snapshots || [],
        evidenceSelectionCreatedAt: documentEvidence?.createdAt,
        createdAt: new Date().toISOString(),
      };
      const existing = await AsyncStorage.getItem("saved_reports");
      const reports = existing ? JSON.parse(existing) : [];
      reports.unshift(reportData);
      await AsyncStorage.setItem("saved_reports", JSON.stringify(reports.slice(0, 50)));

      Alert.alert(
        "Bericht gespeichert",
        "Der Bericht wurde erfolgreich gespeichert und kann als PDF exportiert werden.",
        [
          { text: "PDF exportieren", onPress: () => { void exportReportPdf(); } },
          { text: "Fertig", onPress: () => router.back() },
        ]
      );
    } catch {
      Alert.alert("Fehler", "Bericht konnte nicht gespeichert werden.");
    }
  };

  const toggleEvidence = (evidenceId: string) => {
    setSelectedEvidenceIds((current) =>
      current.includes(evidenceId)
        ? current.filter((id) => id !== evidenceId)
        : [...current, evidenceId],
    );
  };

  // ─── Step: Select Report Type ─────────────────────────────────────────────────
  const renderSelectStep = () => (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={[styles.stepTitle, { color: colors.foreground }]}>
        Berichtstyp wählen
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.muted }]}>
        Wählen Sie den passenden Berichtstyp für Ihre Dokumentation.
      </Text>

      <View style={styles.typeGrid}>
        {REPORT_TYPES.map((type) => (
          <Pressable
            key={type.id}
            onPress={() => {
              setSelectedType(type.id);
              setStep("configure");
            }}
            style={({ pressed }) => [
              styles.typeCard,
              {
                backgroundColor: colors.surface,
                borderColor: selectedType === type.id ? type.color : colors.border,
                borderWidth: selectedType === type.id ? 2 : 1,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={[styles.typeIconBg, { backgroundColor: type.color + "15" }]}>
              <MaterialIcons name={type.icon as any} size={24} color={type.color} />
            </View>
            <Text style={[styles.typeLabel, { color: colors.foreground }]}>{type.label}</Text>
            <Text style={[styles.typeDesc, { color: colors.muted }]} numberOfLines={2}>
              {type.description}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );

  // ─── Step: Configure ──────────────────────────────────────────────────────────
  const renderConfigureStep = () => {
    const config = REPORT_TYPES.find((r) => r.id === selectedType);
    if (!config) return null;

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <View style={[styles.typeIconBg, { backgroundColor: config.color + "15" }]}>
              <MaterialIcons name={config.icon as any} size={20} color={config.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepTitle, { color: colors.foreground, marginBottom: 0 }]}>
                {config.label}
              </Text>
              <Text style={[styles.typeDesc, { color: colors.muted }]}>{config.description}</Text>
            </View>
          </View>

          {/* Metadata */}
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Datum</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            value={reportDatum}
            onChangeText={setReportDatum}
            placeholder="TT.MM.JJJJ"
            placeholderTextColor={colors.muted}
          />

          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Projekt</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            value={reportProjekt}
            onChangeText={setReportProjekt}
            placeholder="Projektname..."
            placeholderTextColor={colors.muted}
          />

          {projectFloors.length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Geschoss</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {projectFloors.map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => setReportFloor(f.name)}
                      style={[styles.chipBtn, { backgroundColor: reportFloor === f.name ? config.color + "20" : colors.surface, borderColor: reportFloor === f.name ? config.color : colors.border }]}
                    >
                      <Text style={{ color: reportFloor === f.name ? config.color : colors.foreground, fontSize: 13 }}>{f.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          {projectRooms.length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Raum</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {projectRooms
                    .filter((r) => !reportFloor || r.floorId === projectFloors.find((f) => f.name === reportFloor)?.id)
                    .map((r) => (
                      <Pressable
                        key={r.id}
                        onPress={() => setReportRoom(r.name)}
                        style={[styles.chipBtn, { backgroundColor: reportRoom === r.name ? config.color + "20" : colors.surface, borderColor: reportRoom === r.name ? config.color : colors.border }]}
                      >
                        <Text style={{ color: reportRoom === r.name ? config.color : colors.foreground, fontSize: 13 }}>{r.name}</Text>
                      </Pressable>
                    ))}
                </View>
              </ScrollView>
            </>
          )}

          {/* Data Integration Options */}
          <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 16 }]}>Datenquellen einbeziehen</Text>
          <View style={[styles.optionsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              onPress={() => setIncludeDefects(!includeDefects)}
              style={styles.optionRow}
            >
              <MaterialIcons
                name={includeDefects ? "check-box" : "check-box-outline-blank"}
                size={22}
                color={includeDefects ? config.color : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: colors.foreground }]}>Mängeldaten</Text>
                <Text style={[styles.optionDesc, { color: colors.muted }]}>Aktuelle Mängel aus dem Projekt einbeziehen</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setIncludeAttendance(!includeAttendance)}
              style={styles.optionRow}
            >
              <MaterialIcons
                name={includeAttendance ? "check-box" : "check-box-outline-blank"}
                size={22}
                color={includeAttendance ? config.color : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: colors.foreground }]}>Anwesenheitsliste</Text>
                <Text style={[styles.optionDesc, { color: colors.muted }]}>Heutige Anwesenheit als Teilnehmer</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setIncludePhotos(!includePhotos)}
              style={styles.optionRow}
            >
              <MaterialIcons
                name={includePhotos ? "check-box" : "check-box-outline-blank"}
                size={22}
                color={includePhotos ? config.color : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: colors.foreground }]}>Bild-, Video- und Messbelege</Text>
                <Text style={[styles.optionDesc, { color: colors.muted }]}>Nur ausdrücklich ausgewählte und geprüfte Belege übernehmen</Text>
              </View>
            </Pressable>
          </View>

          {includePhotos && (
            <View style={styles.evidenceSection}>
              <View style={styles.evidenceHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 0 }]}>Belege auswählen</Text>
                  <Text style={[styles.optionDesc, { color: colors.muted }]}>
                    {selectedEvidenceIds.length} von {availableEvidence.length} Belegen ausgewählt
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setSelectedEvidenceIds(
                      selectedEvidenceIds.length === availableEvidence.length
                        ? []
                        : availableEvidence.map((item) => item.id),
                    )
                  }
                  style={[styles.evidenceAction, { borderColor: colors.border }]}
                >
                  <Text style={{ color: config.color, fontSize: 12, fontWeight: "700" }}>
                    {selectedEvidenceIds.length === availableEvidence.length ? "Keine" : "Alle"}
                  </Text>
                </Pressable>
              </View>

              {availableEvidence.length === 0 ? (
                <View style={[styles.evidenceEmpty, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <MaterialIcons name="image-not-supported" size={24} color={colors.muted} />
                  <Text style={[styles.optionLabel, { color: colors.foreground }]}>Noch keine freigegebenen Belege</Text>
                  <Text style={[styles.optionDesc, { color: colors.muted, textAlign: "center" }]}>
                    Fotos, Videostandbilder und Messungen werden nach Prüfung hier dokumentübergreifend angeboten.
                  </Text>
                  <Pressable onPress={() => router.push("/measure" as any)} style={[styles.evidenceAction, { borderColor: config.color }]}>
                    <Text style={{ color: config.color, fontSize: 12, fontWeight: "700" }}>Messen öffnen</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.evidenceGrid}>
                  {availableEvidence.map((item) => {
                    const selected = selectedEvidenceIds.includes(item.id);
                    const timecode = formatEvidenceTimecode(item.videoTimeSeconds);
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => toggleEvidence(item.id)}
                        style={[
                          styles.evidenceCard,
                          {
                            borderColor: selected ? config.color : colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: item.previewUri || item.originalUri }}
                          style={styles.evidenceImage}
                          contentFit="cover"
                        />
                        <View style={[styles.evidenceCheck, { backgroundColor: selected ? config.color : "rgba(0,0,0,0.55)" }]}>
                          <MaterialIcons name={selected ? "check" : "add"} size={15} color="#FFFFFF" />
                        </View>
                        <Text style={[styles.evidenceFinding, { color: colors.foreground }]} numberOfLines={3}>
                          {item.findingText || "Beleg ohne Befundtext"}
                        </Text>
                        <View style={styles.evidenceMetaRow}>
                          <MaterialIcons
                            name={item.sourceType === "video_frame" ? "videocam" : item.measurements?.length ? "straighten" : "photo"}
                            size={13}
                            color={colors.muted}
                          />
                          <Text style={[styles.evidenceMeta, { color: colors.muted }]} numberOfLines={1}>
                            {item.sourceType === "video_frame"
                              ? `Video${timecode ? ` · ${timecode}` : ""}`
                              : item.measurements?.length
                                ? `${item.measurements.length} Messung${item.measurements.length === 1 ? "" : "en"}`
                                : "Foto"}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Transcription Input */}
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
            Transkription / Notizen
          </Text>
          <TextInput
            style={[styles.input, styles.inputLarge, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            value={transcription}
            onChangeText={setTranscription}
            placeholder="Text eingeben oder aus Aufnahme übernehmen..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />

          {/* Sections Preview */}
          <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 8 }]}>
            Berichts-Abschnitte (KI-generiert)
          </Text>
          <View style={[styles.sectionsPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {["Zusammenfassung", "Fortschritt nach Gewerken", "Mängelübersicht", "Nächste Maßnahmen", "Fotodokumentation"].map((section, i) => (
              <View key={i} style={styles.sectionItem}>
                <MaterialIcons name="auto-awesome" size={14} color={config.color} />
                <Text style={[styles.sectionName, { color: colors.foreground }]}>{section}</Text>
              </View>
            ))}
          </View>

          {/* Generate Button */}
          <Pressable
            onPress={generateReport}
            disabled={!transcription.trim()}
            style={({ pressed }) => [
              styles.generateBtn,
              { backgroundColor: config.color, opacity: !transcription.trim() ? 0.4 : pressed ? 0.8 : 1 },
            ]}
          >
            <MaterialIcons name="auto-awesome" size={20} color="#fff" />
            <Text style={styles.generateBtnText}>Professionellen Bericht generieren</Text>
          </Pressable>

          <Pressable
            onPress={() => { setSelectedType(null); setStep("select"); }}
            style={({ pressed }) => [styles.backLink, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="arrow-back" size={16} color={colors.muted} />
            <Text style={[styles.backLinkText, { color: colors.muted }]}>Anderen Typ wählen</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  // ─── Step: Generating ─────────────────────────────────────────────────────────
  const renderGeneratingStep = () => {
    const steps = [
      { label: "Projektdaten sammeln", threshold: 10 },
      { label: "Anwesenheit & Fotos laden", threshold: 30 },
      { label: "KI-Analyse & Strukturierung", threshold: 60 },
      { label: "Professionelle Formatierung", threshold: 90 },
    ];

    return (
      <View style={styles.generatingContainer}>
        <ActivityIndicator size="large" color="#00B0FF" />
        <Text style={[styles.generatingTitle, { color: colors.foreground }]}>
          Professioneller Bericht wird erstellt...
        </Text>
        <Text style={[styles.generatingStep, { color: colors.muted }]}>
          {generationStep}
        </Text>

        {/* Progress bar */}
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: `${generationProgress}%` }]} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{generationProgress}%</Text>

        <View style={styles.generatingSteps}>
          {steps.map((s, i) => {
            const isDone = generationProgress >= s.threshold;
            const isActive = !isDone && (i === 0 || generationProgress >= steps[i - 1].threshold);
            return (
              <View key={i} style={styles.generatingStepRow}>
                <MaterialIcons
                  name={isDone ? "check-circle" : isActive ? "hourglass-top" : "radio-button-unchecked"}
                  size={16}
                  color={isDone ? colors.success : isActive ? "#00B0FF" : colors.muted}
                />
                <Text style={[styles.generatingStepText, { color: isDone ? colors.foreground : colors.muted }]}>
                  {s.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // ─── Step: Preview (read-only Markdown view) ──────────────────────────────────
  const renderPreviewStep = () => (
    <View style={{ flex: 1 }}>
      <View style={[styles.editHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.editTitle, { color: colors.foreground }]}>Bericht-Vorschau</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => setStep("edit")}
            style={({ pressed }) => [styles.editBtn, { borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="edit" size={16} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "500" }}>Bearbeiten</Text>
          </Pressable>
          <Pressable
            onPress={saveReport}
            style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="check" size={16} color="#fff" />
            <Text style={styles.saveBtnText}>Speichern</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Simple Markdown rendering */}
        {reportContent.split("\n").map((line, i) => {
          if (line.startsWith("# ")) {
            return <Text key={i} style={[styles.mdH1, { color: colors.foreground }]}>{line.slice(2)}</Text>;
          }
          if (line.startsWith("## ")) {
            return <Text key={i} style={[styles.mdH2, { color: colors.foreground }]}>{line.slice(3)}</Text>;
          }
          if (line.startsWith("### ")) {
            return <Text key={i} style={[styles.mdH3, { color: colors.foreground }]}>{line.slice(4)}</Text>;
          }
          if (line.startsWith("---")) {
            return <View key={i} style={[styles.mdHr, { backgroundColor: colors.border }]} />;
          }
          if (line.startsWith("| ") && line.includes("|")) {
            // Table row
            const cells = line.split("|").filter(Boolean).map((c) => c.trim());
            if (cells.every((c) => c.match(/^[-:]+$/))) return null; // separator row
            return (
              <View key={i} style={styles.mdTableRow}>
                {cells.map((cell, ci) => (
                  <Text key={ci} style={[styles.mdTableCell, { color: colors.foreground, borderColor: colors.border }]} numberOfLines={2}>
                    {cell.replace(/\*\*/g, "")}
                  </Text>
                ))}
              </View>
            );
          }
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return (
              <View key={i} style={styles.mdListItem}>
                <Text style={{ color: colors.muted }}>•</Text>
                <Text style={[styles.mdText, { color: colors.foreground, flex: 1 }]}>{line.slice(2).replace(/\*\*/g, "")}</Text>
              </View>
            );
          }
          if (line.startsWith("> ")) {
            return (
              <View key={i} style={[styles.mdBlockquote, { borderLeftColor: colors.primary || "#00B0FF" }]}>
                <Text style={[styles.mdText, { color: colors.muted, fontStyle: "italic" }]}>{line.slice(2)}</Text>
              </View>
            );
          }
          if (line.match(/^\d+\. /)) {
            return (
              <View key={i} style={styles.mdListItem}>
                <Text style={{ color: colors.muted, width: 20 }}>{line.match(/^\d+/)![0]}.</Text>
                <Text style={[styles.mdText, { color: colors.foreground, flex: 1 }]}>{line.replace(/^\d+\. /, "").replace(/\*\*/g, "")}</Text>
              </View>
            );
          }
          if (line.startsWith("*") && line.endsWith("*")) {
            return <Text key={i} style={[styles.mdText, { color: colors.muted, fontStyle: "italic", marginBottom: 4 }]}>{line.replace(/\*/g, "")}</Text>;
          }
          if (line.trim() === "") {
            return <View key={i} style={{ height: 8 }} />;
          }
          return <Text key={i} style={[styles.mdText, { color: colors.foreground }]}>{line.replace(/\*\*/g, "")}</Text>;
        })}
      </ScrollView>
    </View>
  );

  // ─── Step: Edit Report ────────────────────────────────────────────────────────
  const renderEditStep = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ flex: 1 }}>
        <View style={[styles.editHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setStep("preview")} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flexDirection: "row", alignItems: "center", gap: 4 })}>
            <MaterialIcons name="arrow-back" size={18} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontSize: 14 }}>Vorschau</Text>
          </Pressable>
          <Pressable
            onPress={saveReport}
            style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="check" size={16} color="#fff" />
            <Text style={styles.saveBtnText}>Speichern</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <TextInput
            style={[styles.reportEditor, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            value={reportContent}
            onChangeText={setReportContent}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <ScreenContainer className="p-0">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => {
            if (step === "configure") { setStep("select"); return; }
            if (step === "preview") { setStep("configure"); return; }
            if (step === "edit") { setStep("preview"); return; }
            router.back();
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>KI-Bericht</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      {step === "select" && renderSelectStep()}
      {step === "configure" && renderConfigureStep()}
      {step === "generating" && renderGeneratingStep()}
      {step === "preview" && renderPreviewStep()}
      {step === "edit" && renderEditStep()}
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
  stepTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  typeCard: {
    width: "48%" as any,
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    minHeight: 110,
  },
  typeIconBg: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  typeDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputLarge: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  optionsContainer: {
    borderWidth: 1,
    borderRadius: 0,
    padding: 4,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  optionDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  evidenceSection: {
    marginTop: 14,
  },
  evidenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  evidenceAction: {
    minHeight: 34,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceEmpty: {
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  evidenceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  evidenceCard: {
    width: "48%" as any,
    borderWidth: 2,
    padding: 7,
    position: "relative",
  },
  evidenceImage: {
    width: "100%",
    height: 104,
    backgroundColor: "#111827",
  },
  evidenceCheck: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceFinding: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 7,
  },
  evidenceMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
  },
  evidenceMeta: {
    flex: 1,
    fontSize: 10,
  },
  sectionsPreview: {
    borderWidth: 1,
    borderRadius: 0,
    padding: 12,
  },
  sectionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  sectionName: {
    fontSize: 13,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 0,
    marginTop: 20,
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
  },
  backLinkText: {
    fontSize: 14,
  },
  generatingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  generatingTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
  },
  generatingStep: {
    fontSize: 14,
  },
  generatingSteps: {
    marginTop: 24,
    gap: 12,
  },
  generatingStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  generatingStepText: {
    fontSize: 14,
  },
  progressBar: {
    width: "80%" as any,
    height: 4,
    borderRadius: 2,
    marginTop: 12,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#00B0FF",
    borderRadius: 2,
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 0,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#00B0FF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  reportEditor: {
    borderWidth: 1,
    borderRadius: 0,
    padding: 16,
    fontSize: 14,
    lineHeight: 22,
    minHeight: 400,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 0,
    minHeight: 36,
    justifyContent: "center" as const,
  },
  // Markdown rendering styles
  mdH1: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 4,
  },
  mdH2: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 16,
  },
  mdH3: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
    marginTop: 12,
  },
  mdText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },
  mdHr: {
    height: 1,
    marginVertical: 12,
  },
  mdTableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  mdTableCell: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRightWidth: 0.5,
  },
  mdListItem: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
    paddingLeft: 4,
  },
  mdBlockquote: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 4,
    marginVertical: 4,
  },
});
