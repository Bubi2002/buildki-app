import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
  ActivityIndicator,
  Platform,
  Dimensions,
  Modal,
  Alert,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { MarkdownText } from "@/components/markdown-text";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { generateProtocolPdf, generateProtocolHtmlPreview } from "@/lib/pdf-generator";
import { trpc } from "@/lib/trpc";
import { SignaturePad } from "@/components/signature-pad";

import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { WebView } from "react-native-webview";
import { matchSpeakerToProfile, VoiceProfile } from "@/lib/voice-profiles";
import { saveDelegation, formatDelegationNotification } from "@/lib/task-delegation";
import { generateTimeline, getTimelineIcon, getTimelineColor, TimelineEntry } from "@/lib/protocol-timeline";
import { getTeamContacts, saveTeamContact, markContactUsed, updateTeamContact, TeamContact, sortContactsByRecent } from "@/lib/team-contacts";
// expo-contacts is imported dynamically to avoid web crashes
import { getSpeakerName, updateSpeakerName } from "@/lib/speaker-names";
import { SpeakerSegment, getSpeakerColor, getUniqueSpeakers, SPEAKER_COLORS } from "@/lib/speaker-colors";
import { sendActionItemsEmail } from "@/lib/email-actions";
import { useTranslation } from "@/lib/language-provider";
import { migrateLegacyProtocolPhotos } from "@/lib/evidence-store";
import {
  getAllProtocolTemplates,
  getCustomTemplateGenerationInput,
} from "@/lib/protocol-template-store";
import type { ProtocolTemplate } from "@/shared/templates";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

function getLanguages(t: (key: any) => string) { return [
  { code: "de", name: t('lang_deutsch') },
  { code: "en", name: t('lang_englisch') },
  { code: "fr", name: t('lang_franzoesisch') },
  { code: "es", name: t('lang_spanisch') },
  { code: "it", name: t('lang_italienisch') },
  { code: "nl", name: t('lang_niederlaendisch') },
  { code: "pl", name: t('lang_polnisch') },
  { code: "tr", name: t('lang_tuerkisch') },
  { code: "pt", name: t('lang_portugiesisch') },
  { code: "ru", name: t('lang_russisch') },
  { code: "ar", name: t('lang_arabisch') },
]; }
const PHOTO_SIZE = Math.min(100, (SCREEN_WIDTH - 48 - 8) / 3);

type TodoItem = {
  task: string;
  assignee: string;
  priority: "hoch" | "mittel" | "niedrig";
  deadline: string;
  done: boolean;
  dueDate?: string;
  status?: "offen" | "in_arbeit" | "erledigt";
};

type Protocol = {
  id: string;
  title: string;
  transcription: string;
  protocol: string;
  templateName?: string;
  templateId?: string;
  photos?: string[];
  photoTimestamps?: number[];
  photoCaptions?: string[];
  evidenceIds?: string[];
  videoSources?: {
    uri: string;
    name: string;
    mimeType: string;
    duration?: number;
    source: "gallery" | "camera" | "file";
    transcriptionSegments?: { start: number; end: number; text: string }[];
  }[];
  todos?: TodoItem[];
  duration: number;
  createdAt: string;
  location?: {
    latitude: number;
    longitude: number;
    address: string | null;
    city: string | null;
  } | null;
  status: "processing" | "ready" | "sent";
  processingStep?: string;
  processingError?: string;
  weather?: string | null;
  isFavorite?: boolean;
  isArchived?: boolean;
  tags?: string[];
  recordingMode?: string;
  projectId?: string;
  projectName?: string;
  protocolNumber?: string;
  generatedVersions?: GeneratedVersion[];
  activeVersionId?: string;
};

type GeneratedVersion = {
  id: string;
  templateId: string;
  templateName: string;
  text: string;
  createdAt: string;
  todos?: TodoItem[];
  evidenceIds?: string[];
};

/**
 * A [FOTO N] marker sometimes lands inside a markdown table row (the AI puts it
 * in a cell). Splitting the body on the marker then truncates the row and the
 * whole table falls back to raw "| … |" text. Lift any photo markers out of
 * table rows onto their own line right after the row, so the row stays intact
 * and the photo still renders directly below the table.
 */
function liftTableRowPhotos(text: string): string {
  if (!text || !/\[FOTO\s*\d+\]/i.test(text)) return text;
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|") || !/\[FOTO\s*\d+\]/i.test(trimmed)) return line;
      const markers: string[] = [];
      let row = line.replace(/\[FOTO\s*(\d+)\]/gi, (_m, n) => {
        markers.push(`[FOTO ${n}]`);
        return "";
      });
      // Tidy the cell left behind (double spaces / stray space before a pipe).
      row = row.replace(/[ \t]{2,}/g, " ").replace(/\s+\|/g, " |").replace(/\|\s{2,}/g, "| ").trimEnd();
      return markers.length ? `${row}\n${markers.join("\n")}` : line;
    })
    .join("\n");
}

export default function ProtocolDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTranscription, setShowTranscription] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [targetLang, setTargetLang] = useState("en");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [tableEdit, setTableEdit] = useState<null | { before: string; after: string; header: string[]; rows: string[][] }>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [signaturePaths, setSignaturePaths] = useState<string[]>([]);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  // Multi-signature support
  type SignatureEntry = { role: string; paths: string[]; signedAt: string };
  const [signatures, setSignatures] = useState<SignatureEntry[]>([]);
  const [activeSignRole, setActiveSignRole] = useState<string>("");
  const SIGNATURE_ROLES = [t('rolle_auftraggeber'), t('rolle_auftragnehmer'), t('rolle_zeuge'), t('rolle_pruefer')];
  const translateMutation = trpc.translate.translateProtocol.useMutation();
  const [featureFlags, setFeatureFlags] = useState({ photoAnnotation: true, signature: true, multiSignature: false, tags: true });
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [previewPdfUri, setPreviewPdfUri] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  // Fullscreen gallery with swipe
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  const [showCaptionEdit, setShowCaptionEdit] = useState(false);
  const [captionEditIndex, setCaptionEditIndex] = useState(0);
  const [captionEditText, setCaptionEditText] = useState("");
  // Voice note playback
  const [playingVoiceNote, setPlayingVoiceNote] = useState<number | null>(null);
  // Multi-output (KI-Zusammenfassungen)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [suggestedDocType, setSuggestedDocType] = useState<{ type: string; confidence: number; reason: string } | null>(null);
  const [isDetectingType, setIsDetectingType] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [versions, setVersions] = useState<GeneratedVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<ProtocolTemplate[]>([]);
  // Speaker Identification
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([]);
  const [isIdentifyingSpeakers, setIsIdentifyingSpeakers] = useState(false);
  const [showSpeakers, setShowSpeakers] = useState(false);
  // Action Items Email
  const [showEmailModal, setShowEmailModal] = useState(false);

  const [teamContacts, setTeamContacts] = useState<TeamContact[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [showPdfRecipientPicker, setShowPdfRecipientPicker] = useState(false);
  const [pdfRecipientEmail, setPdfRecipientEmail] = useState("");
  const [editingContact, setEditingContact] = useState<TeamContact | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editingTodoIndex, setEditingTodoIndex] = useState<number | null>(null);
  const [editTodoTask, setEditTodoTask] = useState("");
  const [editTodoPriority, setEditTodoPriority] = useState<"hoch" | "mittel" | "niedrig">("mittel");
  const [editTodoDueDate, setEditTodoDueDate] = useState("");
  const [editTodoAssignee, setEditTodoAssignee] = useState("");
  const [editTodoEmail, setEditTodoEmail] = useState("");
  const [editingSpeakerLabel, setEditingSpeakerLabel] = useState<string | null>(null);
  const [speakerNameInput, setSpeakerNameInput] = useState("");
  const [speakerNameMap, setSpeakerNameMap] = useState<Record<string, string>>({});  const [emailRecipient, setEmailRecipient] = useState("");

  const [isSendingEmail, setIsSendingEmail] = useState(false);
  // Timeline
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  // Voice Profiles
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState(false);
  // Task Delegation
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [delegatingTask, setDelegatingTask] = useState<{task: string; assignee: string; priority: string; deadline?: string} | null>(null);
  const [isDelegating, setIsDelegating] = useState(false);  // Mindmap

  useEffect(() => {
    loadProtocol();
    loadTeamContacts();
    loadFeatureFlags();
    loadTemplates();
  }, [id]);

  async function loadTemplates() {
    setAvailableTemplates(await getAllProtocolTemplates());
  }

  // Auto-refresh while protocol is still processing in background
  useEffect(() => {
    if (protocol?.status === "processing") {
      const interval = setInterval(() => {
        loadProtocol();
      }, 3000); // Refresh every 3 seconds
      return () => clearInterval(interval);
    }
  }, [protocol?.status]);

  async function loadFeatureFlags() {
    const { isFeatureEnabled } = require("@/lib/feature-toggles");
    const [photoAnnotation, signature, multiSignature, tags] = await Promise.all([
      isFeatureEnabled("photoAnnotation"),
      isFeatureEnabled("signature"),
      isFeatureEnabled("multiSignature"),
      isFeatureEnabled("tags"),
    ]);
    setFeatureFlags({ photoAnnotation, signature, multiSignature, tags });
  }

  async function loadProtocol() {
    try {
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );
      let found = protocols.find((p: Protocol) => p.id === id);
      if (found?.photos?.length && !found.evidenceIds?.length) {
        const migrated = await migrateLegacyProtocolPhotos({
          projectId: found.projectId || "default",
          protocolId: found.id,
          photos: found.photos,
          photoTimestamps: found.photoTimestamps,
          photoCaptions: found.photoCaptions,
          capturedAt: found.createdAt,
        });
        found = { ...found, evidenceIds: migrated.map((item) => item.id) };
        const protocolIndex = protocols.findIndex((item: Protocol) => item.id === found?.id);
        if (protocolIndex >= 0) {
          protocols[protocolIndex] = found;
          await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
        }
      }
      setProtocol(found || null);
      if (found?.todos) {
        setTodos(found.todos);
      }
      if (found) {
        setIsFavorite(found.isFavorite || false);
        setTags(found.tags || []);
        if ((found as any).signaturePaths) setSignaturePaths((found as any).signaturePaths);
        if ((found as any).signatureData) setSignatureData((found as any).signatureData);
        if ((found as any).signatures) setSignatures((found as any).signatures);
        // Load generated versions
        if (found.generatedVersions) {
          setVersions(found.generatedVersions);
          setActiveVersionId(found.activeVersionId || null);
        }
      }
    } catch (error) {
      console.error("Error loading protocol:", error);
    } finally {
      setLoading(false);
    }
  }

  const toggleTodo = async (index: number) => {
    const updated = [...todos];
    const current = updated[index];
    // Cycle: offen → in_arbeit → erledigt → offen
    const currentStatus = current.status || (current.done ? "erledigt" : "offen");
    const nextStatus = currentStatus === "offen" ? "in_arbeit" : currentStatus === "in_arbeit" ? "erledigt" : "offen";
    updated[index] = { ...current, status: nextStatus, done: nextStatus === "erledigt" };
    setTodos(updated);

    // Also update kanban-state
    try {
      const kanbanState = JSON.parse(await AsyncStorage.getItem("kanban-state") || "{}");
      const taskId = `${id}-${index}`;
      kanbanState[taskId] = nextStatus;
      await AsyncStorage.setItem("kanban-state", JSON.stringify(kanbanState));
    } catch { /* ignore */ }

    // Persist to AsyncStorage
    try {
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );
      const idx = protocols.findIndex((p: Protocol) => p.id === id);
      if (idx !== -1) {
        protocols[idx].todos = updated;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      }
    } catch (error) {
      console.error("Error saving todo state:", error);
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const startEditTodo = (index: number) => {
    const todo = todos[index];
    setEditingTodoIndex(index);
    setEditTodoTask(todo.task);
    setEditTodoPriority(todo.priority);
    setEditTodoDueDate(todo.dueDate ? new Date(todo.dueDate).toLocaleDateString("de-DE") : "");
    setEditTodoAssignee(todo.assignee && todo.assignee !== t('nicht_zugewiesen') ? todo.assignee : "");
    setEditTodoEmail((todo as any).assigneeEmail || "");
  };

  const saveEditTodo = async () => {
    if (editingTodoIndex === null || !editTodoTask.trim()) return;
    const updated = [...todos];
    let dueDate: string | undefined = undefined;
    if (editTodoDueDate.trim()) {
      const parts = editTodoDueDate.split(".");
      if (parts.length === 3) {
        const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (!isNaN(date.getTime())) dueDate = date.toISOString();
      }
    }
    const assigneeName = editTodoAssignee.trim() || "Nicht zugewiesen";
    const assigneeEmail = editTodoEmail.trim() || undefined;
    const previousAssignee = updated[editingTodoIndex].assignee;
    updated[editingTodoIndex] = {
      ...updated[editingTodoIndex],
      task: editTodoTask.trim(),
      priority: editTodoPriority,
      dueDate,
      assignee: assigneeName,
      assigneeEmail,
    } as any;
    setTodos(updated);
    setEditingTodoIndex(null);
    try {
      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      const idx = protocols.findIndex((p: Protocol) => p.id === id);
      if (idx !== -1) { protocols[idx].todos = updated; await AsyncStorage.setItem("protocols", JSON.stringify(protocols)); }
    } catch { /* ignore */ }
    // Send email notification if person was assigned/changed and email is provided
    if (assigneeEmail && assigneeName !== t('nicht_zugewiesen') && assigneeName !== previousAssignee) {
      try {
        const { sendActionItemsEmail } = await import("@/lib/email-actions");
        const protocolDate = protocol?.createdAt ? new Date(protocol.createdAt).toLocaleDateString("de-DE") : new Date().toLocaleDateString("de-DE");
        await sendActionItemsEmail(
          [{ task: editTodoTask.trim(), assignee: assigneeName, priority: editTodoPriority, deadline: editTodoDueDate || t('status_offen') }],
          assigneeEmail,
          protocol?.title || t('protokoll'),
          protocolDate,
        );
        Alert.alert(t('alert_benachrichtigung_gesendet'), t('email_geoeffnet').replace('{name}', assigneeName).replace('{email}', assigneeEmail));
      } catch (emailErr) {
        console.warn("Email notification failed:", emailErr);
      }
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleFavorite = async () => {
    const newVal = !isFavorite;
    setIsFavorite(newVal);
    try {
      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      const idx = protocols.findIndex((p: Protocol) => p.id === id);
      if (idx !== -1) {
        protocols[idx].isFavorite = newVal;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  const updateTags = async (newTags: string[]) => {
    setTags(newTags);
    try {
      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      const idx = protocols.findIndex((p: Protocol) => p.id === id);
      if (idx !== -1) {
        protocols[idx].tags = newTags;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      }
    } catch (error) {
      console.error("Error updating tags:", error);
    }
  };

  // Duplicate protocol
  const duplicateProtocol = async () => {
    if (!protocol) return;
    try {
      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      let newNumber: string | undefined;
      if (protocol.projectId) {
        const { getNextProtocolNumber } = await import("@/lib/protocol-numbering");
        newNumber = (await getNextProtocolNumber(protocol.projectId)) || undefined;
      }
      const duplicate = {
        ...protocol,
        id: Date.now().toString(),
        title: `${protocol.title} (Kopie)`,
        createdAt: new Date().toISOString(),
        status: "ready" as const,
        isFavorite: false,
        isArchived: false,
        protocolNumber: newNumber || protocol.protocolNumber,
        todos: protocol.todos?.map(t => ({ ...t, done: false, status: "offen" as const })),
      };
      await AsyncStorage.setItem("protocols", JSON.stringify([duplicate, ...protocols]));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('alert_dupliziert'), `Protokoll wurde als Kopie erstellt.${newNumber ? ` Neue Nr: ${newNumber}` : ""}`, [
        { text: t('btn_oeffnen'), onPress: () => router.replace({ pathname: "/protocol-detail", params: { id: duplicate.id } }) },
        { text: t('ok') },
      ]);
    } catch (e) {
      console.error("Error duplicating protocol:", e);
      Alert.alert(t('alert_fehler'), t('msg_protokoll_konnte_nicht_dupliziert_werden'));
    }
  };

  // Edit protocol text
  const startEditing = () => {
    setEditedText(protocol?.protocol || "");
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!protocol) return;
    try {
      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      const idx = protocols.findIndex((p: Protocol) => p.id === id);
      if (idx !== -1) {
        protocols[idx].protocol = editedText;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
        setProtocol({ ...protocol, protocol: editedText });
      }
    } catch (error) {
      console.error("Error saving edit:", error);
    }
    setIsEditing(false);
  };

  // ── Tabellen-Editor: Markdown-Tabelle strukturiert bearbeiten ──
  const splitTableRow = (line: string): string[] =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  const openTableEditor = () => {
    const lines = editedText.split("\n");
    let start = -1;
    let end = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      const isRow = l.startsWith("|") && l.endsWith("|") && l.length > 2;
      if (isRow) {
        if (start === -1) start = i;
        end = i;
      } else if (start !== -1) {
        break;
      }
    }
    if (start === -1 || end - start < 2) {
      Alert.alert(t('protocol_detail_edit' as any), "In diesem Protokoll gibt es keine Tabelle zum Bearbeiten.");
      return;
    }
    const tableLines = lines.slice(start, end + 1);
    const header = splitTableRow(tableLines[0]);
    const rows = tableLines.slice(2).map((l) => {
      const cells = splitTableRow(l).slice(0, header.length);
      while (cells.length < header.length) cells.push("");
      return cells;
    });
    setTableEdit({
      before: lines.slice(0, start).join("\n").trimEnd(),
      after: lines.slice(end + 1).join("\n").trimStart(),
      header,
      rows,
    });
  };

  const setTableCell = (rowIdx: number, colIdx: number, value: string) => {
    setTableEdit((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((row, ri) =>
              ri === rowIdx ? row.map((cell, ci) => (ci === colIdx ? value : cell)) : row
            ),
          }
        : prev
    );
  };

  const applyTableEditor = () => {
    if (!tableEdit) return;
    const headerLine = "| " + tableEdit.header.join(" | ") + " |";
    const sepLine = "|" + tableEdit.header.map(() => " --- ").join("|") + "|";
    const rowLines = tableEdit.rows.map(
      (r) => "| " + r.map((c) => (c || "").replace(/\|/g, "/").trim()).join(" | ") + " |"
    );
    const table = [headerLine, sepLine, ...rowLines].join("\n");
    const parts = [tableEdit.before, table, tableEdit.after].filter((s) => s && s.length > 0);
    setEditedText(parts.join("\n\n").replace(/\n{3,}/g, "\n\n"));
    setTableEdit(null);
  };

  // Generate AI summary
  const generateSummary = async () => {
    if (!protocol) return;
    setIsGeneratingSummary(true);
    try {
      const result = await translateMutation.mutateAsync({
        text: t('ki_zusammenfassung_prompt') + protocol.protocol,
        targetLanguage: "de",
      });
      setSummary(result.translated);
    } catch (error) {
      console.error("Error generating summary:", error);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Speaker Identification
  const detectDocumentType = async () => {
    if (!protocol?.protocol) return;
    setIsDetectingType(true);
    try {
      const result = await detectTypeMutation.mutateAsync({
        transcription: protocol.protocol,
      });
      setSuggestedDocType({ type: result.suggestedType, confidence: result.confidence, reason: result.reason });
    } catch (error) {
      console.error("Document type detection error:", error);
      Alert.alert(t('alert_fehler'), t('msg_dokumenttyp_konnte_nicht_erkannt_werden'));
    } finally {
      setIsDetectingType(false);
    }
  };

  const detectTypeMutation = trpc.detectDocumentType.useMutation();
  const speakerMutation = trpc.speaker.identify.useMutation();

  // Load team contacts
  async function loadTeamContacts() {
    const contacts = await getTeamContacts();
    setTeamContacts(sortContactsByRecent(contacts));
  }

  // Generate timeline from protocol
  const generateTimelineView = () => {
    if (!protocol) return;
    const entries = generateTimeline(
      displayedProtocolText,
      protocol.duration || 0,
      speakerSegments.length > 0 ? speakerSegments : undefined
    );
    setTimelineEntries(entries);
    setShowTimeline(true);
  };

  // Analyze voice and create/match profile
  const analyzeVoiceProfile = async (speakerLabel: string, text: string) => {
    setIsAnalyzingVoice(true);
    try {
      const wordCount = text.split(/\s+/).length;
      const estimatedDuration = (protocol?.duration || 60) / Math.max(speakerSegments.length, 1);
      const speakingRate = Math.round((wordCount / estimatedDuration) * 60);
      
      // Try to match with existing profile
      const characteristics = `speaking rate ${speakingRate} wpm, segment length ${wordCount} words`;
      const match = await matchSpeakerToProfile(characteristics, speakingRate);
      
      if (match) {
        // Auto-assign the matched name
        setSpeakerNameMap(prev => ({ ...prev, [speakerLabel]: match.name }));
        Alert.alert(t('alert_sprecher_erkannt'), `"${speakerLabel}" wurde automatisch als "${match.name}" identifiziert (Konfidenz: ${Math.round(match.confidence * 100)}%).`);
      } else {
        Alert.alert(t('alert_neues_stimmprofil'), `Kein bekanntes Profil gefunden. Benennen Sie den Sprecher, um ein neues Profil zu erstellen.`);
      }
    } catch (e) {
      console.error("Voice profile analysis error:", e);
    } finally {
      setIsAnalyzingVoice(false);
    }
  };

  // Delegate a task with push notification
  const delegateTask = async (task: string, assignee: string, priority: string, deadline?: string) => {
    setIsDelegating(true);
    try {
      const delegation = await saveDelegation({
        taskText: task,
        assignee,
        assigneeEmail: teamContacts.find(c => c.name === assignee)?.email,
        priority: priority as "hoch" | "mittel" | "niedrig",
        deadline,
        protocolId: protocol?.id || "",
        protocolTitle: protocol?.title || t('protokoll'),
        status: "sent",
        sentAt: Date.now(),
      });
      
      // Send push notification via server
      const notification = formatDelegationNotification(delegation);
      try {
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"}/api/trpc/system.sendNotification`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: { title: notification.title, content: notification.content } }),
        });
        if (response.ok) {
          Alert.alert(t('alert_aufgabe_delegiert'), t('msg_aufgabe_delegiert_gespeichert').replace('{task}', task).replace('{assignee}', assignee));
        }
      } catch  {
        // Notification sending failed but delegation was saved - show success anyway
        Alert.alert(t('alert_aufgabe_delegiert_ok'), t('msg_aufgabe_delegiert_gespeichert').replace('{task}', task).replace('{assignee}', assignee));
      }
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_aufgabe_konnte_nicht_delegiert_werden'));
    } finally {
      setIsDelegating(false);
      setShowDelegateModal(false);
      setDelegatingTask(null);
    }
  };


  // Load speaker names from storage
  const loadSpeakerNames = async (segments: { speaker: string }[]) => {
    const nameMap: Record<string, string> = {};
    for (const seg of segments) {
      const savedName = await getSpeakerName(seg.speaker, protocol?.projectId || undefined);
      if (savedName) nameMap[seg.speaker] = savedName;
    }
    setSpeakerNameMap(nameMap);
  };

  // Save a speaker name
  const saveSpeakerName = async (label: string, name: string) => {
    await updateSpeakerName(label, name, protocol?.projectId || undefined);
    setSpeakerNameMap(prev => ({ ...prev, [label]: name }));
    setEditingSpeakerLabel(null);
    setSpeakerNameInput("");
  };

  // Add a new team contact
  const addNewTeamContact = async () => {
    if (!newContactName.trim() || !newContactEmail.trim()) return;
    const contact = await saveTeamContact({
      name: newContactName.trim(),
      email: newContactEmail.trim(),
      role: newContactRole.trim() || undefined,
      lastUsed: Date.now(),
    });
    setTeamContacts(prev => [contact, ...prev]);
    setNewContactName("");
    setNewContactEmail("");
    setNewContactRole("");
    setShowAddContact(false);
  };

  // Import contact from phone
  const importFromPhoneContacts = async () => {
    try {
      if (Platform.OS === "web") {
        Alert.alert(t('alert_nicht_verfuegbar'), t('msg_kontaktimport_ist_nur_auf_dem'));
        return;
      }
      const ContactsModule = await import("expo-contacts/legacy");
      const { status } = await ContactsModule.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t('alert_berechtigung'), t('msg_zugriff_auf_kontakte_wurde_verweigert'));
        return;
      }
      const { data } = await ContactsModule.getContactsAsync({
        fields: [ContactsModule.Fields.Emails, ContactsModule.Fields.PhoneNumbers, ContactsModule.Fields.Name],
        sort: ContactsModule.SortTypes?.FirstName || undefined,
      });
      if (!data || data.length === 0) {
        Alert.alert(t('alert_keine_kontakte'), t('msg_es_wurden_keine_kontakte_auf'));
        return;
      }
      const sorted = data.filter(c => c.name).sort((a, b) => (a.name || "").localeCompare(b.name || "")).slice(0, 10);
      Alert.alert(
        t('alert_kontakt_importieren'),
        t('waehle_kontakt'),
        [
          ...sorted.map(c => ({
            text: c.name || t('unbekannt'),
            onPress: async () => {
              const email = c.emails?.[0]?.email || "";
              const phone = c.phoneNumbers?.[0]?.number || "";
              const newC = await saveTeamContact({
                name: c.name || t('unbekannt'),
                email,
                phone: phone || undefined,
                lastUsed: Date.now(),
              });
              setTeamContacts(prev => [newC, ...prev]);
            },
          })),
          { text: t('btn_abbrechen'), style: "cancel" },
        ]
      );
    } catch (e: any) {
      console.error("Import contacts error:", e);
      Alert.alert(t('alert_fehler'), `Kontakte konnten nicht geladen werden: ${e?.message || t('protocol_detail_unknown_error' as any)}`);
    }
  };

  // Edit contact
  const startEditContact = (contact: TeamContact) => {
    setEditingContact(contact);
    setEditName(contact.name);
    setEditEmail(contact.email);
    setEditPhone(contact.phone || "");
    setEditRole(contact.role || "");
  };

  const saveEditContact = async () => {
    if (!editingContact || !editName.trim()) return;
    await updateTeamContact(editingContact.id, {
      name: editName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim() || undefined,
      role: editRole.trim() || undefined,
    });
    await loadTeamContacts();
    setEditingContact(null);
  };

  // PDF email with contact picker
  const openPdfEmailPicker = () => {
    setShowPdfPreview(false);
    setPdfRecipientEmail("");
    setShowPdfRecipientPicker(true);
  };

  // Pick a recipient straight from the device address book (fills the field)
  const pickDeviceContactForPdf = async () => {
    try {
      if (Platform.OS === "web") {
        Alert.alert(t('alert_nicht_verfuegbar'), t('msg_kontaktimport_ist_nur_auf_dem'));
        return;
      }
      const ContactsModule = await import("expo-contacts/legacy");
      const { status } = await ContactsModule.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t('alert_berechtigung'), t('msg_zugriff_auf_kontakte_wurde_verweigert'));
        return;
      }
      const { data } = await ContactsModule.getContactsAsync({
        fields: [ContactsModule.Fields.Emails, ContactsModule.Fields.Name],
        sort: ContactsModule.SortTypes?.FirstName || undefined,
      });
      const withEmail = (data || []).filter((c) => c.name && c.emails && c.emails.length > 0);
      if (withEmail.length === 0) {
        Alert.alert(t('alert_keine_kontakte'), t('msg_es_wurden_keine_kontakte_auf'));
        return;
      }
      const sorted = withEmail.sort((a, b) => (a.name || "").localeCompare(b.name || "")).slice(0, 12);
      Alert.alert(
        t('alert_kontakt_importieren'),
        t('waehle_kontakt'),
        [
          ...sorted.map((c) => ({
            text: `${c.name} (${c.emails![0].email})`,
            onPress: () => setPdfRecipientEmail(c.emails![0].email || ""),
          })),
          { text: t('btn_abbrechen'), style: "cancel" as const },
        ]
      );
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), `Kontakte konnten nicht geladen werden: ${e?.message || t('protocol_detail_unknown_error' as any)}`);
    }
  };

  const sendPdfToSelectedRecipient = async (email: string) => {
    if (!previewPdfUri || !protocol || !email) return;
    setShowPdfRecipientPicker(false);
    try {
      const { getPdfBranding } = await import("@/lib/pdf-branding-store");
      const branding = await getPdfBranding();
      const recipients = email.split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
      const ccRecipients = (branding.emailCc || "").split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
      const bccRecipients = (branding.emailBcc || "").split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
      const datumStr = new Date(protocol.createdAt).toLocaleDateString("de-DE");
      const replacePlaceholders = (template: string) => {
        return template
          .replace(/\{vorlage\}/g, protocol.templateName || t('protokoll'))
          .replace(/\{titel\}/g, protocol.title || protocol.templateName || t('protokoll'))
          .replace(/\{datum\}/g, datumStr)
          .replace(/\{projekt\}/g, protocol.projectName || "");
      };
      const subjectText = branding.emailSubjectTemplate
        ? replacePlaceholders(branding.emailSubjectTemplate)
        : `${protocol.templateName || t('protokoll')} - ${protocol.title || datumStr}`;
      const bodyText = branding.emailBodyTemplate
        ? replacePlaceholders(branding.emailBodyTemplate)
        : `Anbei das Protokoll "${protocol.title || protocol.templateName || t('protokoll')}" vom ${datumStr}.\n\nMit freundlichen Gr\u00fc\u00dfen`;
      try {
        const MailComposer = await import("expo-mail-composer");
        const isAvailable = await MailComposer.isAvailableAsync();
        if (isAvailable) {
          await MailComposer.composeAsync({
            recipients,
            ccRecipients,
            bccRecipients,
            subject: subjectText,
            body: bodyText,
            attachments: [previewPdfUri],
          });
          return;
        }
      } catch {}
      // Fallback
      const mailtoUrl = `mailto:${recipients.join(",")}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;
      await Linking.openURL(mailtoUrl);
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_email_konnte_nicht_geu00f6ffnet_werden'));
    }
  };

  // Select a team contact for email
  const selectTeamContact = async (contact: TeamContact) => {
    setEmailRecipient(contact.email);
    await markContactUsed(contact.id);
  };

  const identifySpeakers = async () => {
    if (!protocol?.transcription) return;
    setIsIdentifyingSpeakers(true);
    try {
      const result = await speakerMutation.mutateAsync({
        transcription: protocol.transcription,
      });
      setSpeakerSegments(result.segments);
      loadSpeakerNames(result.segments);
      setShowSpeakers(true);
    } catch (error) {
      console.error("Speaker identification failed:", error);
    } finally {
      setIsIdentifyingSpeakers(false);
    }
  };

  // Action Items Email
  const emailMutation = trpc.email.sendActionItems.useMutation();
  const sendTodosViaEmail = async () => {
    if (!emailRecipient || displayedTodos.length === 0) return;
    setIsSendingEmail(true);
    try {
      const protocolDate = new Date(protocol?.createdAt || "").toLocaleDateString("de-DE");
      const protocolTitle = protocol?.title || t('protokoll');
      await sendActionItemsEmail(
        displayedTodos.map(t => ({ task: t.task, assignee: t.assignee, priority: t.priority, deadline: t.deadline })),
        emailRecipient,
        protocolTitle,
        protocolDate,
      );
      setShowEmailModal(false);
      setEmailRecipient("");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Email send failed:", error);
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Multi-output: Regenerate with different template
  const protocolMutation = trpc.protocol.generate.useMutation();
  const todosMutation = trpc.protocol.extractTodos.useMutation();

  const regenerateWithTemplate = async (templateId: string, templateName?: string) => {
    if (!protocol) return;
    setIsRegenerating(true);
    setShowRegenerateModal(false);
    try {
      const selectedTemplate = availableTemplates.find((template) => template.id === templateId);
      const customTemplateInput = selectedTemplate
        ? getCustomTemplateGenerationInput(selectedTemplate)
        : {};
      const result = await protocolMutation.mutateAsync({
        transcription: protocol.transcription,
        templateId,
        ...customTemplateInput,
      });
      // Extract todos for this version
      let versionTodos: TodoItem[] = [];
      try {
        const todosResult = await todosMutation.mutateAsync({
          transcription: protocol.transcription,
          protocolText: result.protocol,
        });
        versionTodos = (todosResult.todos || []).map((t: any) => ({ ...t, done: false }));
      } catch { /* ignore todo extraction errors */ }
      const newVersion: GeneratedVersion = {
        id: Date.now().toString(),
        templateId,
        templateName: result.templateName,
        text: result.protocol,
        todos: versionTodos,
        evidenceIds: [...(protocol.evidenceIds || [])],
        createdAt: new Date().toISOString(),
      };
      const updatedVersions = [...versions, newVersion];
      setVersions(updatedVersions);
      setActiveVersionId(newVersion.id);
      // Persist to AsyncStorage
      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      const idx = protocols.findIndex((p: Protocol) => p.id === id);
      if (idx !== -1) {
        protocols[idx].generatedVersions = updatedVersions;
        protocols[idx].activeVersionId = newVersion.id;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      }
    } catch (error) {
      console.error("Error regenerating:", error);
      Alert.alert(t('alert_fehler'), t('msg_protokoll_konnte_nicht_neu_generiert'));
    } finally {
      setIsRegenerating(false);
    }
  };

  const switchToVersion = (versionId: string | null) => {
    setActiveVersionId(versionId);
  };

  const deleteVersion = async (versionId: string) => {
    const updatedVersions = versions.filter(v => v.id !== versionId);
    setVersions(updatedVersions);
    if (activeVersionId === versionId) setActiveVersionId(null);
    // Persist
    const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
    const idx = protocols.findIndex((p: Protocol) => p.id === id);
    if (idx !== -1) {
      protocols[idx].generatedVersions = updatedVersions;
      if (protocols[idx].activeVersionId === versionId) delete protocols[idx].activeVersionId;
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
    }
  };

  const displayedProtocolText = activeVersionId
    ? versions.find(v => v.id === activeVersionId)?.text || protocol?.protocol || ""
    : protocol?.protocol || "";

  // === FEATURE: Keyword Highlights ===
  const extractedKeywords = (() => {
    const text = displayedProtocolText;
    if (!text || text.length < 50) return [];
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordFreq: {[key: string]: number} = {};
    words.forEach(w => {
      const lower = w.toLowerCase().replace(/[^a-zäöüß]/g, '');
      if (lower.length > 5) {
        wordFreq[lower] = (wordFreq[lower] || 0) + 1;
      }
    });
    return Object.entries(wordFreq)
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);
  })();



  // === FEATURE: displayedTodos (per-version todos) ===
  const displayedTodos = (() => {
    if (!activeVersionId) return todos;
    const activeVersion = versions.find(v => v.id === activeVersionId);
    return activeVersion?.todos || todos;
  })();

  // === FEATURE: Generate Mindmap ===
  const [showMindmap, setShowMindmap] = useState(false);
  const [mindmapData, setMindmapData] = useState<{topic: string; branches: {title: string; color: string; items: string[]}[]} | null>(null);
  const [isGeneratingMindmap, setIsGeneratingMindmap] = useState(false);

  const generateMindmap = async () => {
    if (!protocol) return;
    setIsGeneratingMindmap(true);
    try {
      const text = displayedProtocolText;
      const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
      const topics: {[key: string]: string[]} = {};
      const colors = ["#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#F44336", "#00BCD4"];
      
      // Simple keyword extraction for branches
      const keywords = [t('keyword_termin'), t('keyword_aufgabe'), t('keyword_problem'), t('keyword_loesung'), t('keyword_material'), t('keyword_kosten'), t('keyword_zustaendig'), t('keyword_mangel'), t('keyword_naechste_schritte'), t('keyword_ergebnis')];
      keywords.forEach(kw => {
        const matching = sentences.filter(s => s.toLowerCase().includes(kw.toLowerCase()));
        if (matching.length > 0) {
          topics[kw] = matching.slice(0, 4).map(s => s.trim().substring(0, 60));
        }
      });
      
      // If no keywords matched, create generic branches
      if (Object.keys(topics).length === 0) {
        const chunkSize = Math.ceil(sentences.length / 4);
        for (let i = 0; i < Math.min(4, Math.ceil(sentences.length / chunkSize)); i++) {
          const chunk = sentences.slice(i * chunkSize, (i + 1) * chunkSize);
          topics[`Abschnitt ${i + 1}`] = chunk.slice(0, 3).map(s => s.trim().substring(0, 60));
        }
      }

      const branches = Object.entries(topics).slice(0, 6).map(([title, items], idx) => ({
        title,
        color: colors[idx % colors.length],
        items,
      }));

      setMindmapData({
        topic: protocol.title || t('protokoll'),
        branches,
      });
      setShowMindmap(true);
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_mindmap_konnte_nicht_generiert_werden'));
    } finally {
      setIsGeneratingMindmap(false);
    }
  };

  // === FEATURE: Export All Versions as PDF ===
  const exportAllVersionsPdf = async () => {
    if (!protocol) return;
    const allVersions = [
      { name: "Original (" + (protocol.templateName || t('freitext')) + ")", text: protocol.protocol, todos },
      ...versions.map(v => ({ name: v.templateName, text: v.text, todos: v.todos || [] })),
    ];
    
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, sans-serif; padding: 20px; }
      .version { page-break-after: always; margin-bottom: 40px; }
      .version:last-child { page-break-after: avoid; }
      h1 { color: #1a1a1a; border-bottom: 2px solid #0a7ea4; padding-bottom: 8px; }
      h2 { color: #0a7ea4; margin-top: 24px; }
      .todo { padding: 4px 0; }
      .todo-done { text-decoration: line-through; color: #999; }
    </style></head><body>
      <h1>${protocol.title} - Alle Versionen</h1>
      ${allVersions.map(v => `
        <div class="version">
          <h2>${v.name}</h2>
          <div style="white-space: pre-wrap;">${v.text}</div>
          ${v.todos.length > 0 ? `<h3>{t('team_tasks')}</h3>${v.todos.map((t: any) => `<div class="todo ${t.done ? 'todo-done' : ''}">${t.done ? '☑' : '☐'} ${t.text}${t.assignee ? ' → ' + t.assignee : ''}</div>`).join('')}` : ''}
        </div>
      `).join('')}
    </body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Alle Versionen exportieren" });
      }
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_pdfexport_fehlgeschlagen'));
    }
  };

  // === FEATURE: Speech Statistics ===
  const [showStats, setShowStats] = useState(false);
  const speechStats = (() => {
    if (!protocol) return null;
    const text = protocol.protocol;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    const duration = protocol.duration || 0;
    const wordsPerMinute = duration > 0 ? Math.round(words.length / (duration / 60)) : 0;
    const avgSentenceLength = sentences.length > 0 ? Math.round(words.length / sentences.length) : 0;
    
    // Keyword frequency
    const wordFreq: {[key: string]: number} = {};
    words.forEach(w => {
      const lower = w.toLowerCase().replace(/[^a-zäöüß]/g, '');
      if (lower.length > 4) {
        wordFreq[lower] = (wordFreq[lower] || 0) + 1;
      }
    });
    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    return { words: words.length, sentences: sentences.length, paragraphs: paragraphs.length, wordsPerMinute, avgSentenceLength, topWords, duration };
  })();

  // === FEATURE: Chapter Detection ===
  const [showChapters, setShowChapters] = useState(false);
  const chapters = (() => {
    if (!protocol) return [];
    const text = displayedProtocolText;
    const lines = text.split('\n');
    const detected: {title: string; startLine: number; preview: string}[] = [];
    
    lines.forEach((line, idx) => {
      // Detect chapter-like patterns
      if (
        line.match(/^\d+[\.\)\:]\s/) ||
        line.match(/^[A-ZÄÖÜ][A-ZÄÖÜ\s]{3,}:?$/) ||
        line.match(/^(TOP|Punkt|Abschnitt|Kapitel)\s/i) ||
        line.match(/^#+\s/) ||
        (line.match(/^[A-ZÄÖÜ]/) && line.length < 60 && line.length > 3 && !line.includes('.') && idx > 0 && lines[idx - 1].trim() === '')
      ) {
        const preview = lines.slice(idx + 1, idx + 3).join(' ').trim().substring(0, 80);
        detected.push({ title: line.trim().replace(/^#+\s*/, ''), startLine: idx, preview });
      }
    });
    
    return detected.length > 0 ? detected : [{ title: t('protocol_detail_entire_protocol' as any), startLine: 0, preview: text.substring(0, 80) }];
  })();

  // === FEATURE: Voice Note Playback Simulation ===
  const [voiceNoteProgress, setVoiceNoteProgress] = useState(0);

  const playVoiceNote = (index: number) => {
    if (playingVoiceNote === index) {
      setPlayingVoiceNote(null);
      setVoiceNoteProgress(0);
      return;
    }
    setPlayingVoiceNote(index);
    setVoiceNoteProgress(0);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setVoiceNoteProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setPlayingVoiceNote(null);
        setVoiceNoteProgress(0);
      }
    }, 200);
  };

  // === FEATURE: KI Summary per Version ===
  const [versionSummaries, setVersionSummaries] = useState<{[id: string]: string}>({});

  const generateVersionSummary = async (versionId: string, text: string) => {
    // Generate a 2-sentence summary for a version
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
    const summary = sentences.slice(0, 2).map(s => s.trim()).join('. ') + '.';
    setVersionSummaries(prev => ({ ...prev, [versionId]: summary.substring(0, 120) }));
  };

  const exportPdf = async () => {
    if (!protocol) return;

    setIsExporting(true);
    try {
      // Use the currently displayed text (may be a KI-regenerated version)
      const activeVersion = activeVersionId ? versions.find(v => v.id === activeVersionId) : null;
      const pdfText = activeVersion?.text || protocol.protocol;
      const pdfTemplateName = activeVersion?.templateName || protocol.templateName;
      const pdfUri = await generateProtocolPdf({
        title: protocol.title,
        protocol: pdfText,
        templateName: pdfTemplateName,
        templateId: activeVersion?.templateId || protocol.templateId,
        photos: protocol.photos,
        evidenceIds: activeVersion?.evidenceIds || protocol.evidenceIds,
        photoTimestamps: (protocol as any).photoTimestamps || undefined,
        transcriptionSegments: (protocol as any).transcriptionSegments || undefined,
        photoCaptions: (protocol as any).photoCaptions || undefined,
        todos,
        duration: protocol.duration,
        createdAt: protocol.createdAt,
        location: protocol.location,
        weather: null, // removed per user request
        protocolNumber: protocol.protocolNumber,
        projectName: protocol.projectName || undefined,
        projectColor: (protocol as any).projectColor || undefined,
        signaturePaths: signaturePaths.length > 0 ? signaturePaths : undefined,
        signatures: signatures.length > 0 ? signatures : undefined,
      });

      // Generate HTML preview for web
      if (Platform.OS === "web") {
        const html = await generateProtocolHtmlPreview({
          title: protocol.title,
          protocol: pdfText,
          templateName: pdfTemplateName,
          templateId: activeVersion?.templateId || protocol.templateId,
          photos: protocol.photos,
          evidenceIds: activeVersion?.evidenceIds || protocol.evidenceIds,
          photoTimestamps: (protocol as any).photoTimestamps || undefined,
          transcriptionSegments: (protocol as any).transcriptionSegments || undefined,
          photoCaptions: (protocol as any).photoCaptions || undefined,
          todos,
          duration: protocol.duration,
          createdAt: protocol.createdAt,
          location: protocol.location,
          weather: null, // removed per user request
          protocolNumber: protocol.protocolNumber,
          projectName: protocol.projectName || undefined,
          projectColor: (protocol as any).projectColor || undefined,
          signaturePaths: signaturePaths.length > 0 ? signaturePaths : undefined,
          signatures: signatures.length > 0 ? signatures : undefined,
        });
        setPreviewHtml(html);
      }
      // Show PDF preview
      setPreviewPdfUri(pdfUri);
      setShowPdfPreview(true);
    } catch (error) {
      console.error("PDF export error:", error);
      Alert.alert(t('alert_fehler'), t('msg_pdf_konnte_nicht_erstellt_werden_2'));
    } finally {
      setIsExporting(false);
    }
  };

  const sharePdfFromPreview = async () => {
    if (!previewPdfUri || !protocol) return;
    if (Platform.OS === "web") {
      Alert.alert(t('alert_pdf_erstellt'), t('msg_pdfexport_ist_nur_auf_dem'));
      return;
    }
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(previewPdfUri, {
        mimeType: "application/pdf",
        dialogTitle: `${protocol.templateName || t('protokoll')} als PDF teilen`,
        UTI: "com.adobe.pdf",
      });
      // Log to export history
      try {
        const { addExportEntry } = await import("@/lib/pdf-export-history");
        await addExportEntry({
          filename: previewPdfUri.split("/").pop() || "protokoll.pdf",
          protocolTitle: protocol.title || "",
          templateName: protocol.templateName || t('protokoll'),
          projectName: protocol.projectName || "",
          recipients: [],
          ccRecipients: [],
          method: "share",
        });
      } catch {}
    } else {
      Alert.alert(t('alert_fehler'), t('msg_teilen_ist_auf_diesem_geru00e4t'));
    }
  };

  const sendPdfViaEmail = async () => {
    if (!previewPdfUri || !protocol) return;
    if (Platform.OS === "web") {
      Alert.alert(t('hinweis'), t('msg_emailversand_ist_nur_auf_dem'));
      return;
    }
    try {
      const { getPdfBranding } = await import("@/lib/pdf-branding-store");
      const branding = await getPdfBranding();
      const emailAddressRaw = branding.defaultEmailAddress || "info@iserloh.net";
      const recipients = emailAddressRaw.split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
      const ccRecipients = (branding.emailCc || "").split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
      const bccRecipients = (branding.emailBcc || "").split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
      
      // Apply email templates with placeholders
      const datumStr = new Date(protocol.createdAt).toLocaleDateString("de-DE");
      const replacePlaceholders = (template: string) => {
        return template
          .replace(/\{vorlage\}/g, protocol.templateName || t('protokoll'))
          .replace(/\{titel\}/g, protocol.title || protocol.templateName || t('protokoll'))
          .replace(/\{datum\}/g, datumStr)
          .replace(/\{projekt\}/g, protocol.projectName || "");
      };
      const subjectText = branding.emailSubjectTemplate
        ? replacePlaceholders(branding.emailSubjectTemplate)
        : `${protocol.templateName || t('protokoll')} - ${protocol.title || datumStr}`;
      const bodyText = branding.emailBodyTemplate
        ? replacePlaceholders(branding.emailBodyTemplate)
        : `Anbei das Protokoll "${protocol.title || protocol.templateName || t('protokoll')}" vom ${datumStr}.\n\nMit freundlichen Gr\u00fc\u00dfen`;

      // Use expo-mail-composer if available, otherwise fallback to sharing
      try {
        const MailComposer = await import("expo-mail-composer");
        const isAvailable = await MailComposer.isAvailableAsync();
        if (isAvailable) {
          await MailComposer.composeAsync({
            recipients,
            ccRecipients,
            bccRecipients,
            subject: subjectText,
            body: bodyText,
            attachments: [previewPdfUri],
          });
          // Log to export history
          try {
            const { addExportEntry } = await import("@/lib/pdf-export-history");
            await addExportEntry({
              filename: previewPdfUri.split("/").pop() || "protokoll.pdf",
              protocolTitle: protocol.title || "",
              templateName: protocol.templateName || t('protokoll'),
              projectName: protocol.projectName || "",
              recipients,
              ccRecipients,
              method: "email",
            });
          } catch {}
          return;
        }
      } catch {
        // expo-mail-composer not available, fallback
      }

      // Fallback: open mailto link and share PDF separately
      const mailtoUrl = `mailto:${recipients.join(",")}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
        // Also share the PDF so user can attach it
        setTimeout(async () => {
          const isAvailable = await Sharing.isAvailableAsync();
          if (isAvailable) {
            await Sharing.shareAsync(previewPdfUri, {
              mimeType: "application/pdf",
              dialogTitle: "PDF anh\u00e4ngen",
              UTI: "com.adobe.pdf",
            });
          }
        }, 1000);
      } else {
        Alert.alert(t('hinweis'), t('msg_kein_emailprogramm_gefunden_pdf_wird'));
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(previewPdfUri, {
            mimeType: "application/pdf",
            dialogTitle: `${protocol.templateName || t('protokoll')} per E-Mail senden`,
            UTI: "com.adobe.pdf",
          });
        }
      }
    } catch (e) {
      console.error("[Email] Error:", e);
      Alert.alert(t('alert_fehler'), t('msg_email_konnte_nicht_geu00f6ffnet_werden'));
    }
  };

  const shareViaWhatsApp = async () => {
    if (!protocol) return;

    setIsSendingWhatsApp(true);
    try {
      // Generate the currently selected document version with its stable evidence selection.
      const activeVersion = activeVersionId ? versions.find((version) => version.id === activeVersionId) : null;
      const pdfUri = await generateProtocolPdf({
        title: protocol.title,
        protocol: activeVersion?.text || protocol.protocol,
        templateName: activeVersion?.templateName || protocol.templateName,
        templateId: activeVersion?.templateId || protocol.templateId,
        photos: protocol.photos,
        evidenceIds: activeVersion?.evidenceIds || protocol.evidenceIds,
        photoTimestamps: (protocol as any).photoTimestamps || undefined,
        transcriptionSegments: (protocol as any).transcriptionSegments || undefined,
        photoCaptions: (protocol as any).photoCaptions || undefined,
        todos,
        duration: protocol.duration,
        createdAt: protocol.createdAt,
        location: protocol.location,
        weather: null, // removed per user request
        protocolNumber: protocol.protocolNumber,
        projectName: protocol.projectName || undefined,
        signaturePaths: signaturePaths.length > 0 ? signaturePaths : undefined,
        signatures: signatures.length > 0 ? signatures : undefined,
      });
      // Use native share sheet with PDF - user can pick WhatsApp
      if (Platform.OS === "web") {
        Alert.alert(t('hinweis'), t('msg_pdfversand_per_whatsapp_ist_nur'));
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: "application/pdf",
          dialogTitle: t('protocol_detail_share_whatsapp_title' as any),
          UTI: "com.adobe.pdf",
        });
      } else {
        // Fallback: share text via WhatsApp deep link
        const settings = JSON.parse(
          (await AsyncStorage.getItem("protokoll-settings")) || "{}"
        );
        const phoneNumber = settings.whatsappNumber || "";
        const message = encodeURIComponent(protocol.protocol);

        if (phoneNumber) {
          const url = `whatsapp://send?phone=${phoneNumber}&text=${message}`;
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            await Linking.openURL(url);
            return;
          }
        }
        await Share.share({
          message: protocol.protocol,
          title: t('protokoll_teilen'),
        });
      }
    } catch (error) {
      console.error("WhatsApp PDF share error:", error);
      Alert.alert(t('alert_fehler'), t('msg_pdf_konnte_nicht_erstellt_werden_2'));
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const shareViaEmail = async () => {
    if (!protocol) return;

    const settings = JSON.parse(
      (await AsyncStorage.getItem("protokoll-settings")) || "{}"
    );
    const emailTo = settings.defaultEmail || "";
    const subject = encodeURIComponent(
      `${protocol.templateName || t('protokoll')} vom ${new Date(protocol.createdAt).toLocaleDateString("de-DE")}`
    );
    const body = encodeURIComponent(protocol.protocol);

    const url = `mailto:${emailTo}?subject=${subject}&body=${body}`;
    await Linking.openURL(url);
  };

  const copyToClipboard = async () => {
    if (!protocol) return;
    await Clipboard.setStringAsync(protocol.protocol);
    Alert.alert(t('alert_kopiert'), t('msg_protokoll_in_die_zwischenablage_kopiert'));
  };

  const shareGeneric = async () => {
    if (!protocol) return;
    await Share.share({
      message: protocol.protocol,
      title: protocol.templateName || t('protokoll_teilen'),
    });
  };

  const sharePhoto = async (photoUri: string) => {
    if (Platform.OS === "web") return;
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(photoUri);
    }
  };

  const editPhotoCaption = (photoIndex: number, currentCaption: string) => {
    setCaptionEditIndex(photoIndex);
    setCaptionEditText(currentCaption || "");
    setShowCaptionEdit(true);
  };

  const savePhotoCaption = async (photoIndex: number, caption: string) => {
    try {
      const protocolsStr = await AsyncStorage.getItem("protocols");
      const protocols = protocolsStr ? JSON.parse(protocolsStr) : [];
      const idx = protocols.findIndex((p: any) => p.id === protocol!.id);
      if (idx !== -1) {
        const captions = protocols[idx].photoCaptions || [];
        // Ensure array is long enough
        while (captions.length <= photoIndex) captions.push("");
        captions[photoIndex] = caption;
        protocols[idx].photoCaptions = captions;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
        // Reload protocol to reflect changes
        setProtocol({ ...protocol!, ...protocols[idx] } as any);
      }
    } catch (error) {
      console.error("Error saving photo caption:", error);
    }
  };

  const reEmbedPhotos = async () => {
    if (!protocol) return;
    try {
      // Replace old-format "[Foto X – siehe Fotodokumentation]" with clean "[FOTO X]" markers
      let updatedText = protocol.protocol;
      updatedText = updatedText.replace(/\[Foto\s*(\d+)\s*[\u2013\-–]\s*[^\]]*\]/gi, (_, num) => `[FOTO ${num}]`);
      
      // Save updated protocol text
      const protocolsStr = await AsyncStorage.getItem("protocols");
      const protocols = protocolsStr ? JSON.parse(protocolsStr) : [];
      const idx = protocols.findIndex((p: any) => p.id === protocol.id);
      if (idx !== -1) {
        protocols[idx].protocol = updatedText;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
        setProtocol({ ...protocol, protocol: updatedText } as any);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        Alert.alert(t('alert_fotos_aktualisiert'), t('msg_die_fotoreferenzen_wurden_auf_das'));
      }
    } catch (error) {
      console.error("Error re-embedding photos:", error);
      Alert.alert(t('alert_fehler'), t('msg_fotos_konnten_nicht_aktualisiert_werden'));
    }
  };

  const reorderPhoto = async (fromIndex: number, toIndex: number) => {
    try {
      const protocolsStr = await AsyncStorage.getItem("protocols");
      const protocols = protocolsStr ? JSON.parse(protocolsStr) : [];
      const idx = protocols.findIndex((p: any) => p.id === protocol!.id);
      if (idx !== -1) {
        const p = protocols[idx];
        // Swap photos
        const newPhotos = [...(p.photos || [])];
        [newPhotos[fromIndex], newPhotos[toIndex]] = [newPhotos[toIndex], newPhotos[fromIndex]];
        p.photos = newPhotos;
        // Swap timestamps
        if (p.photoTimestamps && p.photoTimestamps.length > 0) {
          const newTs = [...p.photoTimestamps];
          [newTs[fromIndex], newTs[toIndex]] = [newTs[toIndex], newTs[fromIndex]];
          p.photoTimestamps = newTs;
        }
        // Swap captions
        if (p.photoCaptions && p.photoCaptions.length > 0) {
          const newCaptions = [...p.photoCaptions];
          while (newCaptions.length <= Math.max(fromIndex, toIndex)) newCaptions.push("");
          [newCaptions[fromIndex], newCaptions[toIndex]] = [newCaptions[toIndex], newCaptions[fromIndex]];
          p.photoCaptions = newCaptions;
        }
        // Swap voice notes
        if (p.photoVoiceNotes && p.photoVoiceNotes.length > 0) {
          const newNotes = [...p.photoVoiceNotes];
          while (newNotes.length <= Math.max(fromIndex, toIndex)) newNotes.push(null);
          [newNotes[fromIndex], newNotes[toIndex]] = [newNotes[toIndex], newNotes[fromIndex]];
          p.photoVoiceNotes = newNotes;
        }
        protocols[idx] = p;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
        setProtocol({ ...protocol!, ...p } as any);
      }
    } catch (error) {
      console.error("Error reordering photos:", error);
    }
  };

  const addPhotoFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        // Copy photos to persistent app storage to ensure they remain readable
        const photoDir = `${FileSystem.documentDirectory}photos/`;
        const dirInfo = await FileSystem.getInfoAsync(photoDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(photoDir, { intermediates: true });
        }
        const persistedUris: string[] = [];
        for (const asset of result.assets) {
          try {
            const filename = `photo-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`;
            const destUri = `${photoDir}${filename}`;
            await FileSystem.copyAsync({ from: asset.uri, to: destUri });
            persistedUris.push(destUri);
          } catch  {
            // Fallback to original URI if copy fails
            persistedUris.push(asset.uri);
          }
        }
        const protocolsStr = await AsyncStorage.getItem("protocols");
        const protocols = protocolsStr ? JSON.parse(protocolsStr) : [];
        const idx = protocols.findIndex((p: any) => p.id === protocol!.id);
        if (idx !== -1) {
          const p = protocols[idx];
          p.photos = [...(p.photos || []), ...persistedUris];
          protocols[idx] = p;
          await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
          setProtocol({ ...protocol!, photos: p.photos } as any);
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (error) {
      console.error("Error adding photo:", error);
    }
  };

  if (loading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!protocol) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <Text className="text-xl text-foreground">{t('protokoll_nicht_gefunden')}</Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.backButtonText}>{t('back')}</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  const formattedDate = new Date(protocol.createdAt).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")} Min.`;
  };

  const photos = protocol.photos || [];
  // Count inline photo references in BOTH formats: [FOTO X] and [Foto X ...]
  const inlineFotoCount = (protocol?.protocol || '').match(/\[FOTO\s*\d+\]/gi)?.length || 0;
  const inlineFotoAltCount = (protocol?.protocol || '').match(/\[Foto\s*\d+(?:\s*[\u2013\-\u2013][^\]]*)?\]/gi)?.length || 0;
  const inlinePlacedCount = inlineFotoCount + inlineFotoAltCount;
  const allPhotosInlined = inlinePlacedCount >= photos.length && photos.length > 0;

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {protocol.templateName || t('protokoll')}
        </Text>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          {/* Favorite toggle */}
          <Pressable
            onPress={toggleFavorite}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name={isFavorite ? "star" : "star-outline"} size={24} color={isFavorite ? "#FFC107" : colors.muted} />
          </Pressable>
          {/* Tags */}
          <Pressable
            onPress={() => setShowTagEditor(!showTagEditor)}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="label" size={24} color={tags.length > 0 ? colors.primary : colors.muted} />
          </Pressable>
          {/* Duplicate button */}
          <Pressable
            onPress={duplicateProtocol}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="content-copy" size={22} color={colors.muted} />
          </Pressable>
          {/* PDF Export button in header */}
          <Pressable
            onPress={exportPdf}
            disabled={isExporting}
            style={({ pressed }) => [{ opacity: pressed || isExporting ? 0.5 : 1 }]}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="picture-as-pdf" size={24} color={colors.primary} />
            )}
          </Pressable>
        
            <Pressable
              onPress={() => setShowEmailModal(true)}
              style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 0, backgroundColor: "#3B82F6" + "15", opacity: pressed ? 0.5 : 1, marginLeft: 8 }]}
            >
              <Text style={{ fontSize: 11, color: "#3B82F6", fontWeight: "600" }}>📧 Senden</Text>
            </Pressable></View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {/* Tags */}
        {showTagEditor && (
          <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}>
            <Text style={[{ fontSize: 14, fontWeight: "600", marginBottom: 8, color: colors.foreground }]}>{t('tags')}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {tags.map((tag) => (
                <Pressable key={tag} onPress={() => updateTags(tags.filter(t => t !== tag))} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary + "15", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 0 }}>
                  <Text style={{ fontSize: 12, color: colors.primary }}>{tag}</Text>
                  <MaterialIcons name="close" size={12} color={colors.primary} />
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  if (Alert.prompt) {
                    Alert.prompt(
                      t("tag_hinzufuegen_title"),
                      t("tag_name_prompt"),
                      (text) => {
                        if (text?.trim()) {
                          updateTags([...tags, text.trim().toLowerCase()]);
                        }
                      },
                    );
                  } else {
                    Alert.alert(
                      t("alert_tag_hinzufuegen"),
                      t("msg_nutze_die_protokollliste_langes_druecken"),
                    );
                  }
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.border + "50", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 0 }}
              >
                <MaterialIcons name="add" size={14} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.muted }}>{t('tag')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Tags display (when editor closed) */}
        {!showTagEditor && tags.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12, paddingHorizontal: 4 }}>
            {tags.map((tag) => (
              <View key={tag} style={{ backgroundColor: colors.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0 }}>
                <Text style={{ fontSize: 11, color: colors.primary }}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Processing Status Banner */}
        {protocol.status === "processing" && (
          <View style={[styles.metaCard, { backgroundColor: "#FFF3E0", borderColor: "#FF9800", marginBottom: 12 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator size="small" color="#FF9800" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#E65100" }}>
                  {t('protocol_detail_processing_background' as any)}
                </Text>
                <Text style={{ fontSize: 12, color: "#FF9800", marginTop: 2 }}>
                  {protocol.processingStep === "uploading" && t('protocol_detail_step_uploading' as any)}
                  {protocol.processingStep === "transcribing" && t('spracherkennung_laeuft')}
                  {protocol.processingStep === "generating" && t('protocol_detail_step_generating' as any)}
                  {protocol.processingStep === "extracting-todos" && t('protocol_detail_step_extracting' as any)}
                  {protocol.processingStep === "failed" && `${t('protocol_detail_error_prefix' as any)}: ${protocol.processingError || t('unbekannt')}`}
                  {!protocol.processingStep && t('verarbeitung_laeuft')}
                </Text>
                {protocol.processingStep === "failed" && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: "#E65100" }}>
                      {(protocol.processingError || "").includes("Network") || (protocol.processingError || "").includes("network")
                        ? t('tipp_internetverbindung')
                        : t('protocol_detail_tip_audio_mode' as any)}
                    </Text>
                    <Pressable
                      onPress={() => router.push("/(tabs)" as any)}
                      style={({ pressed }) => [{ marginTop: 6, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#FF9800", borderRadius: 0, alignSelf: "flex-start", opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#FFFFFF" }}>{t('neue_aufnahme_starten')}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Metadata */}
        <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {protocol.protocolNumber && (
            <View style={styles.metaRow}>
              <MaterialIcons name="tag" size={18} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.primary, fontWeight: '600' }]}>{protocol.protocolNumber}</Text>
            </View>
          )}
          <View style={styles.metaRow}>
            <MaterialIcons name="event" size={18} color={colors.muted} />
            <Text style={[styles.metaText, { color: colors.muted }]}>{formattedDate}</Text>
          </View>
          <View style={styles.metaRow}>
            <MaterialIcons name="timer" size={18} color={colors.muted} />
            <Text style={[styles.metaText, { color: colors.muted }]}>
              {formatDuration(protocol.duration)}
            </Text>
          </View>
          {photos.length > 0 && (
            <View style={styles.metaRow}>
              <MaterialIcons name="photo-camera" size={18} color={colors.muted} />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {photos.length} Foto{photos.length !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
          {protocol.location && (
            <View style={styles.metaRow}>
              <MaterialIcons name="location-on" size={18} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.muted }]} numberOfLines={2}>
                {protocol.location.address || `${protocol.location.latitude.toFixed(4)}, ${protocol.location.longitude.toFixed(4)}`}
              </Text>
            </View>
          )}

          {/* Recording Mode Badge */}
          {protocol.recordingMode && (
            <View style={styles.metaRow}>
              <MaterialIcons 
                name={protocol.recordingMode === "audio-photo" ? "photo-camera" : "mic"} 
                size={18} 
                color={colors.primary} 
              />
              <Text style={[styles.metaText, { color: colors.primary, fontWeight: "500" }]}>
                {protocol.recordingMode === "audio-photo" ? t('protocol_detail_mode_audio_photo' as any) : t('protocol_detail_mode_audio' as any)}
              </Text>
            </View>
          )}
        </View>

        {/* PDF Export Banner */}
        <Pressable
          onPress={exportPdf}
          disabled={isExporting}
          style={({ pressed }) => [
            styles.pdfBanner,
            {
              backgroundColor: "#E5393520",
              borderColor: "#E53935",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#E53935" />
          ) : (
            <MaterialIcons name="picture-as-pdf" size={22} color="#E53935" />
          )}
          <View style={styles.pdfBannerText}>
            <Text style={[styles.pdfBannerTitle, { color: colors.foreground }]}>
              {isExporting ? t('protocol_detail_pdf_creating' as any) : t('protocol_detail_export_pdf' as any)}
            </Text>
            <Text style={[styles.pdfBannerSubtitle, { color: colors.muted }]}>
              {t('protocol_detail_pdf_subtitle' as any)}
            </Text>
          </View>
          {!isExporting && (
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          )}
        </Pressable>

        {/* Photos Gallery - only show if photos are NOT already all referenced inline in text */}
        {photos.length > 0 && !allPhotosInlined && (
          <View style={styles.section}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Fotos ({photos.length})
              </Text>
              {photos.length > 1 && (
                <Text style={{ fontSize: 11, color: colors.muted }}>{t('reihenfolge_aendern')}</Text>
              )}
            </View>
            {photos.map((photoUri, index) => {
              const captions: string[] = (protocol as any).photoCaptions || [];
              const segments: { start: number; end: number; text: string }[] = (protocol as any).transcriptionSegments || [];
              const timestamps: number[] = (protocol as any).photoTimestamps || [];
              // Auto-generate caption from segments if not manually set
              let autoCaption = "";
              const voiceNotes: (string | null)[] = (protocol as any).photoVoiceNotes || [];
              const voiceNote = voiceNotes[index];
              if (voiceNote && segments.length > 0) {
                // Voice note exists: extract text from the voice note time range
                // Format: voice-note://photoIndex/startSec/endSec
                const parts = voiceNote.replace("voice-note://", "").split("/");
                const vnStart = parseFloat(parts[1] || "0");
                const vnEnd = parseFloat(parts[2] || "0");
                const vnMatching = segments.filter(s => s.end >= vnStart && s.start <= vnEnd);
                if (vnMatching.length > 0) {
                  autoCaption = vnMatching.map(s => s.text.trim()).join(" ").trim();
                }
              }
              if (!autoCaption && segments.length > 0 && timestamps[index] != null) {
                // Fallback: use time window around photo
                const photoTime = timestamps[index];
                const windowStart = Math.max(0, photoTime - 15);
                const windowEnd = photoTime + 5;
                const matching = segments.filter(s => s.end >= windowStart && s.start <= windowEnd);
                if (matching.length > 0) {
                  autoCaption = matching.map(s => s.text.trim()).join(" ").trim();
                } else {
                  const before = segments.filter(s => s.start <= photoTime);
                  if (before.length > 0) autoCaption = before[before.length - 1].text.trim();
                }
              }
              const currentCaption = captions[index] || autoCaption;
              return (
                <View key={index} style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ position: 'relative' }}>
                      <Pressable
                        onPress={() => { setGalleryIndex(index); setShowGallery(true); }}
                        onLongPress={() => sharePhoto(photoUri)}
                        style={({ pressed }) => [
                          styles.photoThumbnail,
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Image
                          source={{ uri: photoUri }}
                          style={styles.photoImage}
                          contentFit="cover"
                          transition={200}
                        />
                        <View style={styles.photoIndex}>
                          <Text style={styles.photoIndexText}>{index + 1}</Text>
                        </View>
                      </Pressable>
                      {featureFlags.photoAnnotation && <Pressable
                        onPress={() => router.push(`/photo-annotate?photoUri=${encodeURIComponent(photoUri)}&protocolId=${protocol.id}&photoIndex=${index}` as any)}
                        style={({ pressed }) => [{
                          position: 'absolute',
                          bottom: 4,
                          right: 4,
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          borderRadius: 0,
                          padding: 4,
                          opacity: pressed ? 0.6 : 1,
                        }]}
                      >
                        <MaterialIcons name="edit" size={14} color="#FFFFFF" />
                      </Pressable>}
                    </View>
                    {/* Caption area */}
                    <View style={{ flex: 1, justifyContent: "flex-start" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>
                          Foto {index + 1}{timestamps[index] != null ? ` – ${Math.floor(timestamps[index] / 60)}:${(timestamps[index] % 60).toString().padStart(2, "0")} Min.` : ""}
                        </Text>
                        <Pressable
                          onPress={() => editPhotoCaption(index, currentCaption)}
                          style={({ pressed }) => [{ marginLeft: 8, opacity: pressed ? 0.5 : 1 }]}
                        >
                          <MaterialIcons name="edit" size={14} color={colors.primary} />
                        </Pressable>
                        {/* Reorder buttons */}
                        {photos.length > 1 && (
                          <View style={{ flexDirection: "row", marginLeft: "auto", gap: 2 }}>
                            {index > 0 && (
                              <Pressable
                                onPress={() => reorderPhoto(index, index - 1)}
                                style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.5 : 1 }]}
                              >
                                <MaterialIcons name="arrow-upward" size={16} color={colors.muted} />
                              </Pressable>
                            )}
                            {index < photos.length - 1 && (
                              <Pressable
                                onPress={() => reorderPhoto(index, index + 1)}
                                style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.5 : 1 }]}
                              >
                                <MaterialIcons name="arrow-downward" size={16} color={colors.muted} />
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>
                      <Pressable
                        onLongPress={() => editPhotoCaption(index, currentCaption)}
                        onPress={() => editPhotoCaption(index, currentCaption)}
                        style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                      >
                        <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 18 }} numberOfLines={4}>
                          {currentCaption || t('protocol_detail_tap_to_edit' as any)}
                        </Text>
                      </Pressable>
                      {/* Voice note indicator */}
                      {(protocol as any).photoVoiceNotes?.[index] && (
                        <Pressable
                          onPress={() => setPlayingVoiceNote(playingVoiceNote === index ? null : index)}
                          style={({ pressed }) => [{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 4,
                            paddingVertical: 3,
                            paddingHorizontal: 8,
                            backgroundColor: playingVoiceNote === index ? "rgba(76,175,80,0.15)" : "rgba(0,0,0,0.05)",
                            borderRadius: 0,
                            alignSelf: "flex-start",
                            opacity: pressed ? 0.6 : 1,
                          }]}
                        >
                          <MaterialIcons
                            name={playingVoiceNote === index ? "stop" : "play-arrow"}
                            size={14}
                            color={playingVoiceNote === index ? "#4CAF50" : colors.muted}
                          />
                          <Text style={{ fontSize: 10, color: playingVoiceNote === index ? "#4CAF50" : colors.muted }}>
                            {playingVoiceNote === index ? t('wiedergabe') : t('sprachnotiz')}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
            <Text style={[styles.photoHint, { color: colors.muted }]}>
              Tippe zum Vergrößern • Halte gedrückt zum Teilen • ✏️ Annotieren
            </Text>
            <Pressable
              onPress={addPhotoFromGallery}
              style={({ pressed }) => [{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 0,
                borderWidth: 1.5,
                borderColor: colors.primary,
                borderStyle: "dashed" as any,
                backgroundColor: colors.primary + "08",
                marginTop: 8,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <MaterialIcons name="add-photo-alternate" size={20} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>{t('fotos_hinzufuegen')}</Text>
            </Pressable>
            {/* Show re-embed button if protocol text has old-format photo references */}
            {protocol.protocol && /\[Foto\s*\d+\s*[\u2013\-–]\s*siehe/i.test(protocol.protocol) && (
              <Pressable
                onPress={reEmbedPhotos}
                style={({ pressed }) => [{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 0,
                  backgroundColor: "#F59E0B" + "15",
                  borderWidth: 1,
                  borderColor: "#F59E0B",
                  marginTop: 8,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MaterialIcons name="refresh" size={18} color="#F59E0B" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#F59E0B" }}>{t('fotos_neu_einbetten')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Add photos button when no photos exist */}
        {photos.length === 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 12 }]}>{t('gallery_photos')}</Text>
            <Pressable
              onPress={addPhotoFromGallery}
              style={({ pressed }) => [{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 20,
                paddingHorizontal: 16,
                borderRadius: 0,
                borderWidth: 1.5,
                borderColor: colors.border,
                borderStyle: "dashed" as any,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <MaterialIcons name="add-photo-alternate" size={24} color={colors.muted} />
              <Text style={{ fontSize: 14, color: colors.muted }}>{t('fotos_aus_galerie_hinzufuegen')}</Text>
            </Pressable>
          </View>
        )}


        {/* To-Do List */}
        {displayedTodos.length > 0 && (
          <View style={styles.section}>
            <View style={styles.todoHeader}>
              <MaterialIcons name="checklist" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0, marginLeft: 8 }]}>
                Aufgaben ({displayedTodos.filter(t => (t.status || (t.done ? "erledigt" : "offen")) === "erledigt").length}/{displayedTodos.length})
              </Text>
              {displayedTodos.some(t => t.status === "in_arbeit") && (
                <Text style={{ fontSize: 11, color: "#F59E0B", marginLeft: 8 }}>
                  {displayedTodos.filter(t => t.status === "in_arbeit").length} in Arbeit
                </Text>
              )}
            </View>
            {todos.map((todo, index) => (
              <View
                key={index}
                style={[styles.todoItem, { borderColor: colors.border, flexDirection: "row", alignItems: "flex-start" }]}
              >
                <Pressable
                  onPress={() => toggleTodo(index)}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "flex-start", flex: 1, opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={[styles.todoCheckbox, { borderColor: (todo.status || (todo.done ? "erledigt" : "offen")) === "erledigt" ? "#22C55E" : (todo.status === "in_arbeit" ? "#F59E0B" : "#EF4444"), backgroundColor: (todo.status || (todo.done ? "erledigt" : "offen")) === "erledigt" ? "#22C55E" : (todo.status === "in_arbeit" ? "#F59E0B" : "transparent") }]}>
                    {(todo.status || (todo.done ? "erledigt" : "offen")) === "erledigt" && <MaterialIcons name="check" size={14} color="#FFFFFF" />}
                    {todo.status === "in_arbeit" && <MaterialIcons name="autorenew" size={14} color="#FFFFFF" />}
                  </View>
                  <View style={[styles.todoContent, { flex: 1 }]}>
                    <Text style={[styles.todoTask, { color: colors.foreground, textDecorationLine: (todo.status || (todo.done ? "erledigt" : "offen")) === "erledigt" ? "line-through" : "none", fontStyle: todo.status === "in_arbeit" ? "italic" : "normal", opacity: (todo.status || (todo.done ? "erledigt" : "offen")) === "erledigt" ? 0.6 : 1 }]}>
                      {todo.task}
                    </Text>
                    {todo.status && todo.status !== "offen" && (
                      <Text style={{ fontSize: 10, color: todo.status === "in_arbeit" ? "#F59E0B" : "#22C55E", fontWeight: "500", marginTop: 2 }}>
                        {todo.status === "in_arbeit" ? "\u25b6 In Arbeit" : "\u2713 Erledigt"}
                      </Text>
                    )}
                    <View style={styles.todoMeta}>
                      {todo.assignee !== t('nicht_zugewiesen') && (
                        <View style={[styles.todoBadge, { backgroundColor: colors.surface }]}>
                          <MaterialIcons name="person" size={12} color={colors.muted} />
                          <Text style={[styles.todoBadgeText, { color: colors.muted }]}>{todo.assignee}</Text>
                        </View>
                      )}
                      <View style={[styles.todoBadge, { backgroundColor: todo.priority === "hoch" ? "#E5393520" : todo.priority === "mittel" ? "#FF980020" : colors.surface }]}>
                        <Text style={[styles.todoBadgeText, { color: todo.priority === "hoch" ? "#E53935" : todo.priority === "mittel" ? "#FF9800" : colors.muted }]}>
                          {todo.priority === "hoch" ? "\u26a0\ufe0f Hoch" : todo.priority === "mittel" ? "Mittel" : "Niedrig"}
                        </Text>
                      </View>

                    </View>
                  </View>
                </Pressable>
                {/* Edit pencil icon on the right */}
                <Pressable
                  onPress={() => startEditTodo(index)}
                  style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}
                >
                  <MaterialIcons name="edit" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* KI-Werkzeuge */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>{t('kiwerkzeuge')}</Text>
          </View>
          <View style={{ gap: 8 }}>
            {/* Zusammenfassung */}
            <Pressable
              onPress={generateSummary}
              disabled={isGeneratingSummary}
              style={({ pressed }) => [{
                flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0,
                backgroundColor: colors.primary + "08", borderWidth: 1, borderColor: colors.primary + "25",
                opacity: pressed || isGeneratingSummary ? 0.7 : 1,
              }]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 0, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                {isGeneratingSummary ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="summarize" size={20} color={colors.primary} />}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('zusammenfassung')}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{t('kernpunkte_auf_einen_blick')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            {/* Neu generieren */}
            <Pressable
              onPress={() => setShowRegenerateModal(true)}
              style={({ pressed }) => [{
                flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0,
                backgroundColor: "#8B5CF6" + "08", borderWidth: 1, borderColor: "#8B5CF6" + "25",
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 0, backgroundColor: "#8B5CF6" + "15", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="refresh" size={20} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('neu_generieren')}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{t('anderes_template_oder_format')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            {/* Sprecher erkennen */}
            <Pressable
              onPress={identifySpeakers}
              disabled={isIdentifyingSpeakers}
              style={({ pressed }) => [{
                flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0,
                backgroundColor: "#059669" + "08", borderWidth: 1, borderColor: "#059669" + "25",
                opacity: pressed || isIdentifyingSpeakers ? 0.7 : 1,
              }]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 0, backgroundColor: "#059669" + "15", alignItems: "center", justifyContent: "center" }}>
                {isIdentifyingSpeakers ? <ActivityIndicator size="small" color="#059669" /> : <MaterialIcons name="record-voice-over" size={20} color="#059669" />}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('sprecher_erkennen')}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{t('personen_im_gespraech_identifizieren')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>

          </View>
          {/* Summary result display */}
          {summary && (
            <View style={{ marginTop: 12, backgroundColor: colors.primary + "06", borderRadius: 0, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
              <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 21 }}>{summary}</Text>
            </View>
          )}
        </View>
        {/* Protocol content with multi-output versions */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>{t('protokoll')}</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pressable
                onPress={() => router.push(`/protocol-versions?protocolId=${protocol.id}&protocolTitle=${encodeURIComponent(protocol.title || t('protokoll'))}` as any)}
                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="history" size={15} color={colors.muted} />
                <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted }}>{t('versionen')}</Text>
              </Pressable>
              <Pressable
                onPress={isEditing ? saveEdit : startEditing}
                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 0, backgroundColor: isEditing ? colors.success + "12" : colors.surface, borderWidth: 1, borderColor: isEditing ? colors.success : colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name={isEditing ? "check" : "edit"} size={15} color={isEditing ? colors.success : colors.muted} />
                <Text style={{ fontSize: 13, fontWeight: "500", color: isEditing ? colors.success : colors.muted }}>{isEditing ? t('protocol_detail_save' as any) : t('protocol_detail_edit' as any)}</Text>
              </Pressable>
            </View>
          </View>

          {/* Version tabs */}
          {versions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
              <Pressable
                onPress={() => switchToVersion(null)}
                style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 0, backgroundColor: !activeVersionId ? colors.primary : colors.surface, borderWidth: 1, borderColor: !activeVersionId ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 12, fontWeight: "500", color: !activeVersionId ? "#FFFFFF" : colors.muted }}>
                  Original ({protocol.templateName || t('freitext')})
                </Text>
              </Pressable>
              {versions.map((v) => (
                <View key={v.id} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Pressable
                    onPress={() => switchToVersion(v.id)}
                    style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 0, backgroundColor: activeVersionId === v.id ? colors.primary : colors.surface, borderWidth: 1, borderColor: activeVersionId === v.id ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "500", color: activeVersionId === v.id ? "#FFFFFF" : colors.muted }}>
                      {v.templateName}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => deleteVersion(v.id)}
                    style={({ pressed }) => [{ marginLeft: 2, padding: 4, opacity: pressed ? 0.5 : 1 }]}
                  >
                    <MaterialIcons name="close" size={12} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Regenerating indicator */}
          {isRegenerating && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: colors.primary + "08", borderRadius: 0, marginBottom: 12 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ fontSize: 13, color: colors.primary }}>{t('wird_neu_generiert')}</Text>
            </View>
          )}

          {/* Protocol text */}
          {isEditing ? (
            <View>
              <Pressable
                onPress={openTableEditor}
                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary + "12", opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="grid-on" size={17} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>Tabelle bearbeiten</Text>
              </Pressable>
              <TextInput
                value={editedText}
                onChangeText={setEditedText}
                multiline
                scrollEnabled
                style={[styles.protocolText, { color: colors.foreground, borderWidth: 1, borderColor: colors.primary, borderRadius: 0, padding: 12, minHeight: 200, maxHeight: 320, textAlignVertical: "top" }]}
              />
              <Modal visible={tableEdit !== null} transparent animationType="slide" onRequestClose={() => setTableEdit(null)}>
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
                  <View style={{ backgroundColor: colors.surface, maxHeight: "88%", borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Tabelle bearbeiten</Text>
                    <ScrollView style={{ maxHeight: "82%" }}>
                      {tableEdit?.rows.map((row, rIdx) => (
                        <View key={rIdx} style={{ borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 10 }}>
                          {tableEdit.header.map((h, cIdx) => {
                            const isPriority = /priorit/i.test(h);
                            return (
                              <View key={cIdx} style={{ marginBottom: 8 }}>
                                <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</Text>
                                {isPriority ? (
                                  <View style={{ flexDirection: "row", gap: 6 }}>
                                    {["Hoch", "Mittel", "Niedrig"].map((opt) => {
                                      const active = (row[cIdx] || "").toLowerCase() === opt.toLowerCase();
                                      return (
                                        <Pressable
                                          key={opt}
                                          onPress={() => setTableCell(rIdx, cIdx, opt)}
                                          style={({ pressed }) => [{ flex: 1, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : "transparent", opacity: pressed ? 0.7 : 1 }]}
                                        >
                                          <Text style={{ fontSize: 12, fontWeight: "600", color: active ? colors.primary : colors.muted }}>{opt}</Text>
                                        </Pressable>
                                      );
                                    })}
                                  </View>
                                ) : (
                                  <TextInput
                                    value={row[cIdx]}
                                    onChangeText={(v) => setTableCell(rIdx, cIdx, v)}
                                    multiline
                                    style={{ borderWidth: 1, borderColor: colors.border, padding: 8, color: colors.foreground, fontSize: 13 }}
                                  />
                                )}
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </ScrollView>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                      <Pressable onPress={() => setTableEdit(null)} style={({ pressed }) => [{ flex: 1, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                        <Text style={{ color: colors.muted, fontWeight: "600" }}>{t('btn_abbrechen')}</Text>
                      </Pressable>
                      <Pressable onPress={applyTableEditor} style={({ pressed }) => [{ flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}>
                        <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{t('protocol_detail_save' as any)}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Modal>
            </View>
          ) : (
            <View>
              {extractedKeywords.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {extractedKeywords.map((kw, i) => (
                    <View key={i} style={{ backgroundColor: colors.primary + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 0 }}>
                      <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "500" }}>{kw}</Text>
                    </View>
                  ))}
                </View>
              )}
              {showSpeakers && speakerSegments.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  {/* Speaker Legend */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {getUniqueSpeakers(speakerSegments).map((speaker, idx) => {
                      const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
                      return (
                        <View key={speaker} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.text }} />
                          <Pressable onPress={() => { setEditingSpeakerLabel(speaker); setSpeakerNameInput(speakerNameMap[speaker] || speaker); }}>
                            <Text style={{ fontSize: 11, fontWeight: "500", color: color.text }}>{speakerNameMap[speaker] || speaker}</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                  {/* Speaker Segments */}
                  {speakerSegments.map((seg, idx) => {
                    const speakers = getUniqueSpeakers(speakerSegments);
                    const speakerColor = getSpeakerColor(seg.speaker, speakers);
                    return (
                      <View key={idx} style={{ marginBottom: 8, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: speakerColor.border }}>
                        <Pressable onPress={() => { setEditingSpeakerLabel(seg.speaker); setSpeakerNameInput(speakerNameMap[seg.speaker] || seg.speaker); }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: speakerColor.text, marginBottom: 2 }}>{speakerNameMap[seg.speaker] || seg.speaker}</Text>
                        </Pressable>
                        <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 18 }}>{seg.text}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              {!showSpeakers && (
                <View>
                  {liftTableRowPhotos(displayedProtocolText).split(/(\[FOTO\s*\d+\])/gi).map((part, idx) => {
                    const fotoMatch = part.match(/^\[FOTO\s*(\d+)\]$/i);
                    if (fotoMatch) {
                      const photoIdx = parseInt(fotoMatch[1], 10) - 1;
                      const photoUri = photos[photoIdx];
                      if (photoUri) {
                        return (
                          <View key={`inline-photo-${idx}`} style={{ marginVertical: 8, alignItems: "center" }}>
                            <Pressable onPress={() => { setGalleryIndex(photoIdx); setShowGallery(true); }}>
                              <Image source={{ uri: photoUri }} style={{ width: SCREEN_WIDTH - 64, height: 180, borderRadius: 0 }} contentFit="cover" />
                            </Pressable>
                            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Foto {photoIdx + 1}</Text>
                          </View>
                        );
                      }
                    }
                    if (part.trim()) {
                      return <MarkdownText key={`text-${idx}`} text={part} color={colors.foreground} />;
                    }
                    return null;
                  })}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Digital Signatures (Multi-Role) */}
        {(featureFlags.signature || featureFlags.multiSignature) && <View style={[styles.section, { marginTop: 0 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <MaterialIcons name="draw" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>{t('unterschriften')}</Text>
          </View>

          {/* Existing signatures */}
          {signatures.map((sig, idx) => (
            <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}>
              <MaterialIcons name="verified" size={18} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{sig.role}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{sig.signedAt}</Text>
              </View>
              <Pressable
                onPress={() => {
                  const updated = signatures.filter((_, i) => i !== idx);
                  setSignatures(updated);
                  (async () => {
                    try {
                      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
                      const pidx = protocols.findIndex((p: any) => p.id === id);
                      if (pidx !== -1) {
                        protocols[pidx].signatures = updated;
                        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
                      }
                    } catch { /* ignore */ }
                  })();
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}
              >
                <MaterialIcons name="close" size={16} color={colors.error} />
              </Pressable>
            </View>
          ))}

          {/* Active signing pad */}
          {showSignature ? (
            <View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 8 }}>Rolle: {activeSignRole}</Text>
              <SignaturePad
                initialPaths={[]}
                onSave={(paths) => {
                  const signedAt = `${new Date().toLocaleDateString("de-DE")} um ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
                  const newEntry = { role: activeSignRole, paths, signedAt };
                  const updated = [...signatures, newEntry];
                  setSignatures(updated);
                  setShowSignature(false);
                  // Also keep legacy fields for backward compat
                  if (!signaturePaths.length) {
                    setSignaturePaths(paths);
                    setSignatureData(`Unterzeichnet am ${signedAt}`);
                  }
                  (async () => {
                    try {
                      const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
                      const pidx = protocols.findIndex((p: any) => p.id === id);
                      if (pidx !== -1) {
                        protocols[pidx].signatures = updated;
                        protocols[pidx].signaturePaths = protocols[pidx].signaturePaths || paths;
                        protocols[pidx].signatureData = protocols[pidx].signatureData || `Unterzeichnet am ${signedAt}`;
                        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
                      }
                    } catch { /* ignore */ }
                  })();
                }}
                onCancel={() => setShowSignature(false)}
              />
            </View>
          ) : (
            <View>
              {/* Role selection chips */}
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>{t('rolle_waehlen_und_unterschreiben')}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SIGNATURE_ROLES.filter(role => !signatures.find(s => s.role === role)).map((role) => (
                  <Pressable
                    key={role}
                    onPress={() => {
                      setActiveSignRole(role);
                      setShowSignature(true);
                    }}
                    style={({ pressed }) => [{
                      flexDirection: "row", alignItems: "center", gap: 6,
                      paddingHorizontal: 14, paddingVertical: 10,
                      backgroundColor: colors.surface, borderRadius: 0,
                      borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
                      opacity: pressed ? 0.7 : 1,
                    }]}
                  >
                    <MaterialIcons name="draw" size={16} color={colors.muted} />
                    <Text style={{ fontSize: 13, color: colors.foreground }}>{role}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>}

        {/* Translation section */}
        <View style={[styles.section, { marginTop: 0 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MaterialIcons name="translate" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>{t('uebersetzung')}</Text>
            </View>
            <Pressable
              onPress={() => setShowLangPicker(!showLangPicker)}
              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 13, color: colors.foreground }}>{getLanguages(t).find(l => l.code === targetLang)?.name || targetLang}</Text>
              <MaterialIcons name="expand-more" size={16} color={colors.muted} />
            </Pressable>
          </View>

          {showLangPicker && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {getLanguages(t).filter(l => l.code !== "de").map(lang => (
                <Pressable
                  key={lang.code}
                  onPress={() => { setTargetLang(lang.code); setShowLangPicker(false); setTranslatedText(null); }}
                  style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 0, backgroundColor: targetLang === lang.code ? colors.primary : colors.surface, borderWidth: 1, borderColor: targetLang === lang.code ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ fontSize: 12, color: targetLang === lang.code ? "#FFFFFF" : colors.foreground }}>{lang.name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            onPress={async () => {
              if (showTranslation && translatedText) {
                setShowTranslation(false);
                return;
              }
              setIsTranslating(true);
              try {
                const result = await translateMutation.mutateAsync({
                  text: protocol.protocol,
                  sourceLanguage: "de",
                  targetLanguage: targetLang,
                });
                setTranslatedText(result.translated);
                setShowTranslation(true);
              } catch  {
                Alert.alert(t('alert_fehler'), t('msg_uebersetzung_fehlgeschlagen_bitte_versuche_es'));
              } finally {
                setIsTranslating(false);
              }
            }}
            disabled={isTranslating}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 0, backgroundColor: showTranslation ? colors.surface : colors.primary + "15", borderWidth: 1, borderColor: showTranslation ? colors.border : colors.primary + "40", opacity: (pressed || isTranslating) ? 0.6 : 1 }]}
          >
            {isTranslating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name={showTranslation ? "visibility-off" : "translate"} size={18} color={colors.primary} />
            )}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>
              {isTranslating ? t('uebersetze') : showTranslation ? t('uebersetzung_ausblenden') : t('in_sprache_uebersetzen').replace('{lang}', getLanguages(t).find(l => l.code === targetLang)?.name || targetLang)}
            </Text>
          </Pressable>

          {showTranslation && translatedText && (
            <View style={[styles.transcriptionBox, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
              <MarkdownText text={translatedText} color={colors.foreground} />
            </View>
          )}
        </View>

        {/* Transcription toggle */}
        <Pressable
          onPress={() => setShowTranscription(!showTranscription)}
          style={({ pressed }) => [
            styles.toggleButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialIcons
            name={showTranscription ? "expand-less" : "expand-more"}
            size={20}
            color={colors.muted}
          />
          <Text style={[styles.toggleText, { color: colors.muted }]}>
            {showTranscription ? t('transkription_ausblenden') : t('transkription_anzeigen')}
          </Text>
        </Pressable>

        {showTranscription && (
          <View style={[styles.transcriptionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.transcriptionText, { color: colors.muted }]}>
              {protocol.transcription}
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action buttons - disabled while processing */}
      <View style={[styles.actionsContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {protocol.status === "processing" && (
          <View style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, color: "#FF9800", fontWeight: "500" }}>
              Versenden erst möglich wenn Verarbeitung abgeschlossen
            </Text>
          </View>
        )}
        {protocol.status !== "processing" && (
          <>
        <Pressable
          onPress={shareViaWhatsApp}
          disabled={isSendingWhatsApp}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: "#25D366", opacity: (pressed || isSendingWhatsApp) ? 0.6 : 1 },
          ]}
        >
          {isSendingWhatsApp ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name="chat" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.actionButtonText}>
            {isSendingWhatsApp ? "PDF..." : "WhatsApp"}
          </Text>
        </Pressable>

        <Pressable
          onPress={shareViaEmail}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="email" size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>{t('email')}</Text>
        </Pressable>

        <Pressable
          onPress={copyToClipboard}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="content-copy" size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>{t('kopieren')}</Text>
        </Pressable>

        <Pressable
          onPress={shareGeneric}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.foreground, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="share" size={20} color={colors.background} />
          <Text style={[styles.actionButtonText, { color: colors.background }]}>{t('protocol_share')}</Text>
        </Pressable>
          </>
        )}
      </View>

      {/* Photo Caption Edit Modal */}
      <Modal
        visible={showCaptionEdit}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCaptionEdit(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
          onPress={() => setShowCaptionEdit(false)}
        >
          <Pressable
            style={{ width: "100%", maxWidth: 400, backgroundColor: colors.background, borderRadius: 0, padding: 20 }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
              Foto {captionEditIndex + 1} – Beschreibung
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>
              Diese Beschreibung erscheint im PDF unter dem Foto.
            </Text>
            <TextInput
              value={captionEditText}
              onChangeText={setCaptionEditText}
              placeholder={t('beschreibung_eingeben')}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={5}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 0,
                padding: 12,
                fontSize: 14,
                color: colors.foreground,
                minHeight: 120,
                textAlignVertical: "top",
                borderWidth: 1,
                borderColor: colors.border,
              }}
              autoFocus
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 12 }}>
              <Pressable
                onPress={() => {
                  setCaptionEditText("");
                  savePhotoCaption(captionEditIndex, "");
                  setShowCaptionEdit(false);
                }}
                style={({ pressed }) => [{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 0,
                  alignItems: "center",
                  backgroundColor: colors.error + "15",
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.error }}>{t('delete')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowCaptionEdit(false)}
                style={({ pressed }) => [{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 0,
                  alignItems: "center",
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  savePhotoCaption(captionEditIndex, captionEditText);
                  setShowCaptionEdit(false);
                }}
                style={({ pressed }) => [{
                  flex: 1.5,
                  paddingVertical: 12,
                  borderRadius: 0,
                  alignItems: "center",
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Full-screen photo gallery with swipe */}
      <Modal
        visible={showGallery}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGallery(false)}
      >
        <View style={styles.modalBackdrop}>
          {/* Close button */}
          <Pressable
            onPress={() => setShowGallery(false)}
            style={styles.modalCloseButton}
          >
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </Pressable>

          {/* Photo counter */}
          <View style={{ position: "absolute", top: 60, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 0, zIndex: 10 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>
              {galleryIndex + 1} / {photos.length}
            </Text>
          </View>

          {/* Main image */}
          <View style={styles.modalContent}>
            {photos[galleryIndex] && (
              <Image
                source={{ uri: photos[galleryIndex] }}
                style={styles.modalImage}
                contentFit="contain"
                transition={150}
              />
            )}
          </View>

          {/* Navigation arrows */}
          {galleryIndex > 0 && (
            <Pressable
              onPress={() => setGalleryIndex(galleryIndex - 1)}
              style={({ pressed }) => [{
                position: "absolute",
                left: 12,
                top: "50%",
                backgroundColor: "rgba(0,0,0,0.5)",
                borderRadius: 0,
                padding: 8,
                opacity: pressed ? 0.6 : 1,
              }]}
            >
              <MaterialIcons name="chevron-left" size={32} color="#FFFFFF" />
            </Pressable>
          )}
          {galleryIndex < photos.length - 1 && (
            <Pressable
              onPress={() => setGalleryIndex(galleryIndex + 1)}
              style={({ pressed }) => [{
                position: "absolute",
                right: 12,
                top: "50%",
                backgroundColor: "rgba(0,0,0,0.5)",
                borderRadius: 0,
                padding: 8,
                opacity: pressed ? 0.6 : 1,
              }]}
            >
              <MaterialIcons name="chevron-right" size={32} color="#FFFFFF" />
            </Pressable>
          )}

          {/* Bottom actions */}
          <View style={{ position: "absolute", bottom: 50, flexDirection: "row", gap: 16, alignSelf: "center" }}>
            <Pressable
              onPress={() => { if (photos[galleryIndex]) sharePhoto(photos[galleryIndex]); }}
              style={({ pressed }) => [styles.modalShareButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="share" size={24} color="#FFFFFF" />
              <Text style={styles.modalShareText}>{t('protocol_share')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowGallery(false);
                router.push(`/photo-annotate?photoUri=${encodeURIComponent(photos[galleryIndex])}&protocolId=${protocol?.id}&photoIndex=${galleryIndex}` as any);
              }}
              style={({ pressed }) => [styles.modalShareButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="edit" size={24} color="#FFFFFF" />
              <Text style={styles.modalShareText}>{t('annotieren')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowGallery(false);
                router.push({ pathname: "/cloud-photo-export", params: { photos: JSON.stringify(photos), projectName: protocol?.title || t('protokoll') } } as any);
              }}
              style={({ pressed }) => [styles.modalShareButton, { backgroundColor: "#0EA5E9", opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="cloud-upload" size={24} color="#FFFFFF" />
              <Text style={styles.modalShareText}>{t('cloud')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* PDF Preview Modal */}
      <Modal
        visible={showPdfPreview}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPdfPreview(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable onPress={() => setShowPdfPreview(false)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
              <Text style={{ fontSize: 16, color: colors.primary }}>{t('close')}</Text>
            </Pressable>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>{t('pdfvorschau')}</Text>
            <Pressable onPress={sharePdfFromPreview} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 }]}>
              <MaterialIcons name="share" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, color: colors.primary }}>{t('protocol_share')}</Text>
            </Pressable>
          </View>
          {Platform.OS === "web" && previewHtml ? (
            <View style={{ flex: 1 }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                <View style={{ backgroundColor: "#fff", borderRadius: 0, padding: 16, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 12, textAlign: "center" }}>{t('pdfvorschau_druckansicht')}</Text>
                  {/* Render HTML preview as text summary on web */}
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 4, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 20 }}>
                      {protocol?.protocol?.substring(0, 500) || ""}{(protocol?.protocol?.length || 0) > 500 ? "..." : ""}
                    </Text>
                    {photos.length > 0 && (
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>
                        + {photos.length} Foto(s) im PDF enthalten
                      </Text>
                    )}
                  </View>
                </View>
              </ScrollView>
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
                <Pressable
                  onPress={sharePdfFromPreview}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 0, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="share" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>{t('pdf_teilen_herunterladen')}</Text>
                </Pressable>
                <Pressable
                  onPress={openPdfEmailPicker}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 0, backgroundColor: "#059669", opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="email" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>{t('email_senden')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowPdfPreview(false)}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={{ fontSize: 16, color: colors.foreground }}>{t('back')}</Text>
                </Pressable>
              </View>
            </View>
          ) : previewPdfUri && Platform.OS !== "web" ? (
            <View style={{ flex: 1 }}>
              <View style={{ flex: 1 }}>
                <WebView
                  source={{ uri: previewPdfUri }}
                  style={{ flex: 1 }}
                  originWhitelist={["*"]}
                  allowFileAccess={true}
                  allowFileAccessFromFileURLs={true}
                  allowUniversalAccessFromFileURLs={true}
                  startInLoadingState={true}
                  renderLoading={() => (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#f8f8f8" }}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>{t('pdf_wird_geladen')}</Text>
                    </View>
                  )}
                />
              </View>
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
                <Pressable
                  onPress={sharePdfFromPreview}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 0, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="share" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>{t('pdf_teilen')}</Text>
                </Pressable>
                <Pressable
                  onPress={openPdfEmailPicker}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 0, backgroundColor: "#059669", opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="email" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>{t('email_senden')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowPdfPreview(false)}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={{ fontSize: 16, color: colors.foreground }}>{t('back')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
              <MaterialIcons name="picture-as-pdf" size={64} color={colors.primary} />
              <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginTop: 16 }}>{t('pdf_wird_erstellt')}</Text>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 16 }} />
            </View>
          )}
        </View>
      </Modal>

        {/* Mindmap Fullscreen Modal */}
        <Modal visible={showMindmap} animationType="slide" onRequestClose={() => setShowMindmap(false)}>
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 60 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>{t('mindmap')}</Text>
              <Pressable onPress={() => setShowMindmap(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }}>
              {mindmapData && (
                <View style={{ alignItems: "center" }}>
                  <View style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 0, marginBottom: 30 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF" }}>{mindmapData.topic}</Text>
                  </View>
                  {mindmapData.branches.map((branch, idx) => (
                    <View key={idx} style={{ marginBottom: 20, alignItems: "center", width: "100%" }}>
                      <View style={{ backgroundColor: branch.color + "20", borderWidth: 2, borderColor: branch.color, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 0, marginBottom: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: branch.color }}>{branch.title}</Text>
                      </View>
                      {branch.items.map((item, iIdx) => (
                        <View key={iIdx} style={{ backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 0, marginBottom: 4, maxWidth: "90%" }}>
                          <Text style={{ fontSize: 12, color: colors.foreground }}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </Modal>

        {/* Stats Modal */}
        <Modal visible={showStats} animationType="slide" onRequestClose={() => setShowStats(false)}>
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 60 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>{t('sprachstatistik')}</Text>
              <Pressable onPress={() => setShowStats(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            {speechStats && (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
                  {[
                    { label: t('woerter'), value: speechStats.words.toString() },
                    { label: t('saetze'), value: speechStats.sentences.toString() },
                    { label: t('absaetze'), value: speechStats.paragraphs.toString() },
                    { label: t('woerter_pro_min'), value: speechStats.wordsPerMinute.toString() },
                    { label: t('avg_satzlaenge'), value: speechStats.avgSentenceLength + ' ' + t('woerter_einheit') },
                  ].map((stat, idx) => (
                    <View key={idx} style={{ backgroundColor: colors.surface, padding: 16, borderRadius: 0, minWidth: "45%", flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: "700", color: colors.primary }}>{stat.value}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{stat.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>{t('haeufigste_woerter')}</Text>
                {speechStats.topWords.map((w, idx) => (
                  <View key={idx} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <View style={{ flex: 1, height: 24, backgroundColor: colors.surface, borderRadius: 0, overflow: "hidden" }}>
                      <View style={{ height: 24, backgroundColor: colors.primary + "30", borderRadius: 0, width: `${(w.count / (speechStats.topWords[0]?.count || 1)) * 100}%` as any }} />
                    </View>
                    <Text style={{ fontSize: 12, color: colors.foreground, marginLeft: 8, width: 80 }}>{w.word} ({w.count})</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </Modal>

        {/* Chapters Modal */}
        <Modal visible={showChapters} animationType="slide" onRequestClose={() => setShowChapters(false)}>
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 60 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>{t('kapitel')}</Text>
              <Pressable onPress={() => setShowChapters(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {chapters.map((ch, idx) => (
                <Pressable key={idx} onPress={() => setShowChapters(false)} style={({ pressed }) => [{ backgroundColor: colors.surface, padding: 16, borderRadius: 0, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{ch.title}</Text>
                  {ch.preview ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }} numberOfLines={2}>{ch.preview}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>

        {/* Regenerate Template Modal */}
        <Modal visible={showRegenerateModal} animationType="slide" transparent onRequestClose={() => setShowRegenerateModal(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "80%" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>{t('kiausgabeformat_waehlen')}</Text>
                <Pressable onPress={() => setShowRegenerateModal(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}>
                  <MaterialIcons name="close" size={24} color={colors.foreground} />
                </Pressable>
              </View>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>{t('generiere_eine_neue_version')}</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Pressable
                  onPress={() => {
                    setShowRegenerateModal(false);
                    router.push({
                      pathname: "/evidence-manager",
                      params: {
                        protocolId: protocol?.id || "",
                        projectId: protocol?.projectId || "",
                      },
                    } as any);
                  }}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={{ width: 38, height: 38, backgroundColor: "#00ACC118", alignItems: "center", justifyContent: "center" }}>
                    <MaterialIcons name="collections" size={21} color="#00ACC1" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{t('protocol_detail_evidence_all_variants' as any)}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      {(protocol?.evidenceIds || []).length} {t('protocol_detail_evidence_selected_suffix' as any)}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                </Pressable>
                {/* Auto-Detect Button */}
                <Pressable
                  onPress={detectDocumentType}
                  disabled={isDetectingType}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12, borderRadius: 0, backgroundColor: suggestedDocType ? "#E8F5E9" : "#F3E8FF", opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name={suggestedDocType ? "check-circle" : "auto-awesome"} size={20} color={suggestedDocType ? "#4CAF50" : "#7C3AED"} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: suggestedDocType ? "#2E7D32" : "#7C3AED" }}>
                    {isDetectingType ? "Analysiere..." : suggestedDocType ? `Empfohlen: ${suggestedDocType.reason}` : "KI-Dokumenttyp erkennen"}
                  </Text>
                </Pressable>
                {suggestedDocType && (
                  <View style={{ marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#E8F5E9", borderRadius: 0, borderLeftWidth: 3, borderLeftColor: "#4CAF50" }}>
                    <Text style={{ fontSize: 12, color: "#2E7D32", fontWeight: "500" }}>
                      Konfidenz: {suggestedDocType.confidence}% – Typ: {suggestedDocType.type}
                    </Text>
                  </View>
                )}
                {/* KI-Zusammenfassungen */}
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{t('kizusammenfassungen')}</Text>
                {availableTemplates.filter(t => t.id.includes("-ki")).map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => { setShowRegenerateModal(false); regenerateWithTemplate(t.id, t.name); }}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: colors.primary + "06", borderRadius: 0, marginBottom: 8, borderWidth: 1.5, borderColor: colors.primary + "30", opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={{ width: 42, height: 42, borderRadius: 0, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name={(t as any).icon || "auto-awesome"} size={22} color={colors.primary} />
                    </View>
                    <View style={{ marginLeft: 14, flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{t.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t.description}</Text>
                    </View>
                    <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
                  </Pressable>
                ))}
                {/* Fach-Templates */}
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 10 }}>{t('fachvorlagen')}</Text>
                {availableTemplates.filter(t => !t.id.includes("-ki")).map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => { setShowRegenerateModal(false); regenerateWithTemplate(t.id, t.name); }}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.surface, borderRadius: 0, marginBottom: 8, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: colors.border + "40", alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name={(t as any).icon || "description"} size={18} color={colors.muted} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{t.description}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

    
        {/* Email Action Items Modal */}
        <Modal visible={showEmailModal} animationType="slide" transparent>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "60%" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{t('aufgaben_per_email_senden')}</Text>
                <Pressable onPress={() => setShowEmailModal(false)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                  <MaterialIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
                {displayedTodos.length} Aufgabe(n) werden als E-Mail versendet
              </Text>
              <TextInput
                value={emailRecipient}
                onChangeText={setEmailRecipient}
                placeholder={t('emailadresse_eingeben')}
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{ 
                  backgroundColor: colors.surface, 
                  borderRadius: 0, 
                  padding: 14, 
                  fontSize: 15, 
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 16,
                }}
              />
              {/* Team Contacts */}
              {teamContacts.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: "#9BA1A6", marginBottom: 6 }}>{t('kontakte')}</Text>
                  {teamContacts.slice(0, 5).map(contact => (
                    <Pressable
                      key={contact.id}
                      onPress={() => selectTeamContact(contact)}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 0, backgroundColor: pressed ? "#1e202220" : "transparent", marginBottom: 2 }]}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 0, backgroundColor: "#0a7ea420", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#0a7ea4" }}>{contact.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "500", color: "#11181C" }}>{contact.name}</Text>
                        <Text style={{ fontSize: 11, color: "#687076" }}>{contact.email}</Text>
                      </View>
                      {contact.role && <Text style={{ fontSize: 10, color: "#9BA1A6", backgroundColor: "#f5f5f5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>{contact.role}</Text>}
                    </Pressable>
                  ))}
                </View>
              )}
              {/* Add Contact Button */}
              {!showAddContact ? (
                <Pressable onPress={() => setShowAddContact(true)} style={{ marginTop: 8, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 12, color: "#0a7ea4" }}>{t('protocol_detail_save_new_contact' as any)}</Text>
                </Pressable>
              ) : (
                <View style={{ marginTop: 8, padding: 10, backgroundColor: "#f5f5f5", borderRadius: 0 }}>
                  <TextInput placeholder={t('project_sort_name')} value={newContactName} onChangeText={setNewContactName} style={{ fontSize: 13, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingVertical: 4, marginBottom: 6 }} />
                  <TextInput placeholder={t('email')} value={newContactEmail} onChangeText={setNewContactEmail} keyboardType="email-address" style={{ fontSize: 13, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingVertical: 4, marginBottom: 6 }} />
                  <TextInput placeholder={t('rolle_optional')} value={newContactRole} onChangeText={setNewContactRole} style={{ fontSize: 13, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingVertical: 4, marginBottom: 8 }} />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable onPress={addNewTeamContact} style={{ flex: 1, backgroundColor: "#0a7ea4", paddingVertical: 8, borderRadius: 0, alignItems: "center" }}>
                      <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>{t('save')}</Text>
                    </Pressable>
                    <Pressable onPress={() => setShowAddContact(false)} style={{ flex: 1, backgroundColor: "#E5E7EB", paddingVertical: 8, borderRadius: 0, alignItems: "center" }}>
                      <Text style={{ fontSize: 12, color: "#687076" }}>{t('cancel')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              <ScrollView style={{ maxHeight: 200, marginBottom: 16 }}>
                {displayedTodos.map((todo, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: todo.priority === "hoch" ? colors.error : todo.priority === "mittel" ? colors.warning : colors.success }}>●</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: colors.foreground }}>{todo.task}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>{todo.assignee} • {todo.deadline}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <Pressable
                onPress={sendTodosViaEmail}
                disabled={isSendingEmail || !emailRecipient}
                style={({ pressed }) => [{
                  backgroundColor: emailRecipient ? colors.primary : colors.border,
                  borderRadius: 0,
                  padding: 14,
                  alignItems: "center",
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                {isSendingEmail ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>{t('protocol_detail_send_email' as any)}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Edit Todo Modal */}
        <Modal visible={editingTodoIndex !== null} transparent animationType="fade" onRequestClose={() => setEditingTodoIndex(null)}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: colors.background, borderRadius: 0, padding: 24, width: "90%", maxWidth: 380, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>{t('aufgabe_bearbeiten')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>{t('titel')}</Text>
              <TextInput
                value={editTodoTask}
                onChangeText={setEditTodoTask}
                placeholder={t('aufgabe_beschreiben')}
                placeholderTextColor={colors.muted}
                multiline
                style={{ fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 12, minHeight: 60 }}
              />
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>{"Priorit\u00e4t"}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {(["hoch", "mittel", "niedrig"] as const).map(p => (
                  <Pressable
                    key={p}
                    onPress={() => setEditTodoPriority(p)}
                    style={{ flex: 1, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: editTodoPriority === p ? (p === "hoch" ? "#E53935" : p === "mittel" ? "#FF9800" : "#22C55E") : colors.border, backgroundColor: editTodoPriority === p ? (p === "hoch" ? "#E5393520" : p === "mittel" ? "#FF980020" : "#22C55E20") : "transparent" }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: editTodoPriority === p ? (p === "hoch" ? "#E53935" : p === "mittel" ? "#FF9800" : "#22C55E") : colors.muted }}>
                      {p === "hoch" ? "\u26a0\ufe0f Hoch" : p === "mittel" ? "Mittel" : "Niedrig"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>{"F\u00e4lligkeitsdatum (TT.MM.JJJJ)"}</Text>
              <TextInput
                value={editTodoDueDate}
                onChangeText={setEditTodoDueDate}
                placeholder="z.B. 15.07.2026"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                style={{ fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 12 }}
              />
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>{t('person')}</Text>
              <TextInput
                value={editTodoAssignee}
                onChangeText={setEditTodoAssignee}
                placeholder="z.B. Max Mustermann"
                placeholderTextColor={colors.muted}
                style={{ fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 12 }}
              />
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>{t('email_fuer_benachrichtigung')}</Text>
              <TextInput
                value={editTodoEmail}
                onChangeText={setEditTodoEmail}
                placeholder="z.B. max@firma.de"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{ fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 16 }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={saveEditTodo} style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 0, alignItems: "center" }}>
                  <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "600" }}>{t('save')}</Text>
                </Pressable>
                <Pressable onPress={() => setEditingTodoIndex(null)} style={{ flex: 1, backgroundColor: colors.surface, paddingVertical: 12, borderRadius: 0, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 14, color: colors.muted }}>{t('cancel')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* PDF Recipient Picker Modal */}
        <Modal visible={showPdfRecipientPicker} animationType="slide" transparent onRequestClose={() => setShowPdfRecipientPicker(false)}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "70%" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{t('empfu00e4nger_wu00e4hlen')}</Text>
                <Pressable onPress={() => setShowPdfRecipientPicker(false)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                  <MaterialIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>
              <TextInput
                value={pdfRecipientEmail}
                onChangeText={setPdfRecipientEmail}
                placeholder={t('emailadresse_eingeben')}
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
              />
              {teamContacts.length > 0 && (
                <ScrollView style={{ maxHeight: 200, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>{t('gespeicherte_kontakte')}</Text>
                  {teamContacts.map(contact => (
                    <Pressable
                      key={contact.id}
                      onPress={() => {
                        setPdfRecipientEmail(contact.email);
                        markContactUsed(contact.id);
                      }}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, backgroundColor: pressed ? colors.surface : "transparent", marginBottom: 2 }]}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 0, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>{contact.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>{contact.name}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{contact.email}{contact.phone ? ` \u2022 ${contact.phone}` : ""}</Text>
                      </View>
                      {contact.role && <Text style={{ fontSize: 10, color: colors.muted, backgroundColor: colors.surface, paddingHorizontal: 6, paddingVertical: 2 }}>{contact.role}</Text>}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <Pressable
                onPress={pickDeviceContactForPdf}
                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12, paddingVertical: 12, borderRadius: 0, borderWidth: 1, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="contacts" size={18} color={colors.primary} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>{t('aus_kontakten')}</Text>
              </Pressable>
              <Pressable
                onPress={() => sendPdfToSelectedRecipient(pdfRecipientEmail)}
                disabled={!pdfRecipientEmail.trim()}
                style={({ pressed }) => [{ backgroundColor: pdfRecipientEmail.trim() ? "#059669" : colors.border, borderRadius: 0, padding: 14, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>{t('email_senden')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { setShowPdfRecipientPicker(false); sendPdfViaEmail(); }}
                style={({ pressed }) => [{ marginTop: 8, borderRadius: 0, padding: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={{ color: colors.muted, fontSize: 13 }}>{t('standardempfu00e4nger_verwenden')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Edit Contact Modal */}
        <Modal visible={!!editingContact} transparent animationType="fade" onRequestClose={() => setEditingContact(null)}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: colors.background, borderRadius: 0, padding: 24, width: "85%", maxWidth: 360, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>{t('kontakt_bearbeiten')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('project_sort_name')}</Text>
              <TextInput value={editName} onChangeText={setEditName} placeholder={t('project_sort_name')} placeholderTextColor={colors.muted} style={{ fontSize: 14, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 10 }} />
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('email')}</Text>
              <TextInput value={editEmail} onChangeText={setEditEmail} placeholder={t('email')} placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={{ fontSize: 14, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 10 }} />
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('telefon')}</Text>
              <TextInput value={editPhone} onChangeText={setEditPhone} placeholder="+49 123 456789" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={{ fontSize: 14, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 10 }} />
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('rolle')}</Text>
              <TextInput value={editRole} onChangeText={setEditRole} placeholder="z.B. Bauleiter" placeholderTextColor={colors.muted} style={{ fontSize: 14, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 16 }} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={saveEditContact} style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 0, alignItems: "center" }}>
                  <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "600" }}>{t('save')}</Text>
                </Pressable>
                <Pressable onPress={() => setEditingContact(null)} style={{ flex: 1, backgroundColor: colors.surface, paddingVertical: 10, borderRadius: 0, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 14, color: colors.muted }}>{t('cancel')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Speaker Name Edit Modal */}
        <Modal visible={!!editingSpeakerLabel} transparent animationType="fade" onRequestClose={() => setEditingSpeakerLabel(null)}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: "white", borderRadius: 0, padding: 24, width: "80%", maxWidth: 320 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>{t('sprecher_benennen')}</Text>
              <Text style={{ fontSize: 12, color: "#687076", marginBottom: 12 }}>{t('speaker_name_eingeben').replace('{label}', editingSpeakerLabel || '')}</Text>
              <TextInput
                value={speakerNameInput}
                onChangeText={setSpeakerNameInput}
                placeholder={t('name_eingeben')}
                style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 0, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 16 }}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => { if (editingSpeakerLabel && speakerNameInput.trim()) saveSpeakerName(editingSpeakerLabel, speakerNameInput.trim()); }} style={{ flex: 1, backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 0, alignItems: "center" }}>
                  <Text style={{ color: "white", fontWeight: "600" }}>{t('save')}</Text>
                </Pressable>
                <Pressable onPress={() => setEditingSpeakerLabel(null)} style={{ flex: 1, backgroundColor: "#f5f5f5", paddingVertical: 12, borderRadius: 0, alignItems: "center" }}>
                  <Text style={{ color: "#687076" }}>{t('cancel')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Timeline Modal */}
        <Modal visible={showTimeline} animationType="slide" onRequestClose={() => setShowTimeline(false)}>
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 60 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>{t('protokolltimeline')}</Text>
              <Pressable onPress={() => setShowTimeline(false)} style={{ padding: 8 }}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
              {timelineEntries.map((entry, idx) => (
                <View key={entry.id} style={{ flexDirection: "row", marginBottom: 16 }}>
                  {/* Time column */}
                  <View style={{ width: 55, alignItems: "flex-end", marginRight: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, fontVariant: ["tabular-nums"] }}>{entry.formattedTime}</Text>
                  </View>
                  {/* Timeline line */}
                  <View style={{ width: 24, alignItems: "center" }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: getTimelineColor(entry.type), marginTop: 4 }} />
                    {idx < timelineEntries.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: colors.border, marginTop: 4 }} />}
                  </View>
                  {/* Content */}
                  <View style={{ flex: 1, paddingBottom: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 12 }}>{getTimelineIcon(entry.type)}</Text>
                      {entry.speaker && <Text style={{ fontSize: 11, fontWeight: "600", color: getTimelineColor(entry.type) }}>{speakerNameMap[entry.speaker] || entry.speaker}</Text>}
                      {entry.isHighlight && <View style={{ backgroundColor: getTimelineColor(entry.type) + "20", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}><Text style={{ fontSize: 9, color: getTimelineColor(entry.type), fontWeight: "600" }}>{entry.type === "decision" ? "Beschluss" : "Aktion"}</Text></View>}
                    </View>
                    <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 18 }}>{entry.text}</Text>
                  </View>
                </View>
              ))}
              {timelineEntries.length === 0 && (
                <View style={{ alignItems: "center", paddingTop: 40 }}>
                  <MaterialIcons name="timeline" size={48} color={colors.muted} />
                  <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>{t('keine_timelineeintraege_verfuegbar')}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Modal>

        {/* Task Delegation Modal */}
        <Modal visible={showDelegateModal} transparent animationType="fade" onRequestClose={() => setShowDelegateModal(false)}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: colors.background, borderRadius: 0, padding: 24, width: "90%", maxWidth: 400, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{t('aufgabe_delegieren')}</Text>
                <Pressable onPress={() => { setShowDelegateModal(false); setDelegatingTask(null); }}>
                  <MaterialIcons name="close" size={22} color={colors.muted} />
                </Pressable>
              </View>
              {delegatingTask && (
                <View>
                  {/* Task preview */}
                  <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>{delegatingTask.task}</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Text style={{ fontSize: 11, color: delegatingTask.priority === "hoch" ? "#EF4444" : delegatingTask.priority === "mittel" ? "#F59E0B" : "#22C55E" }}>● {delegatingTask.priority}</Text>
                      {delegatingTask.deadline && <Text style={{ fontSize: 11, color: colors.muted }}>📅 {delegatingTask.deadline}</Text>}
                    </View>
                  </View>

                  {/* Option A: Manual input */}
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>{t('person_eingeben')}</Text>
                  <TextInput
                    placeholder={t('project_sort_name')}
                    placeholderTextColor={colors.muted}
                    value={delegatingTask.assignee !== t('nicht_zugewiesen') ? delegatingTask.assignee : ""}
                    onChangeText={(text) => setDelegatingTask(prev => prev ? {...prev, assignee: text} : null)}
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 0, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, marginBottom: 8 }}
                  />
                  <TextInput
                    placeholder={t('email_oder_telefon_optional')}
                    placeholderTextColor={colors.muted}
                    keyboardType="email-address"
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 0, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.foreground, marginBottom: 16 }}
                  />

                  {/* Option B: Team contacts list */}
                  {teamContacts.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>{t('oder_teammitglied_waehlen')}</Text>
                      {teamContacts.slice(0, 5).map(contact => (
                        <Pressable key={contact.id} onPress={() => delegateTask(delegatingTask.task, contact.name, delegatingTask.priority, delegatingTask.deadline)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 0, backgroundColor: pressed ? colors.surface : "transparent", marginBottom: 2, borderWidth: 1, borderColor: pressed ? colors.primary : "transparent" }]}>
                          <View style={{ width: 32, height: 32, borderRadius: 0, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{contact.name.charAt(0)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.foreground }}>{contact.name}</Text>
                            <Text style={{ fontSize: 11, color: colors.muted }}>{contact.email}</Text>
                          </View>
                          <MaterialIcons name="send" size={16} color={colors.primary} />
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* Delegate button */}
                  <Pressable onPress={() => delegateTask(delegatingTask.task, delegatingTask.assignee, delegatingTask.priority, delegatingTask.deadline)} style={({ pressed }) => [{ backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 0, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}>
                    {isDelegating ? <ActivityIndicator color="white" size="small" /> : <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>✓ Delegieren & Benachrichtigen</Text>}
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </Modal>
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
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  metaCard: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 14,
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  pdfBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 0,
    borderWidth: 1.5,
    marginBottom: 20,
    gap: 12,
  },
  pdfBannerText: {
    flex: 1,
  },
  pdfBannerTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  pdfBannerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  photoThumbnail: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 0,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoIndex: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 20,
    height: 20,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  photoIndexText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  photoHint: {
    fontSize: 12,
    marginTop: 16,
    marginBottom: 12,
    textAlign: "center",
  },
  protocolText: {
    fontSize: 15,
    lineHeight: 24,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 6,
    borderTopWidth: 0.5,
  },
  toggleText: {
    fontSize: 14,
  },
  transcriptionBox: {
    padding: 12,
    borderRadius: 0,
    borderWidth: 0.5,
    marginTop: 8,
  },
  transcriptionText: {
    fontSize: 14,
    lineHeight: 22,
    fontStyle: "italic",
  },
  actionsContainer: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    borderTopWidth: 0.5,
  },
  actionButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 0,
    gap: 4,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  backButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 0,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_WIDTH - 32,
    borderRadius: 0,
  },
  modalCloseButton: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 0,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalShareButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 0,
    gap: 8,
  },
  modalShareText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  todoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  todoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  todoCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 0,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  todoContent: {
    flex: 1,
    gap: 6,
  },
  todoTask: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  todoMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  todoBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
    gap: 4,
  },
  todoBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
});
// TEST_MARKER
