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
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { generateProtocolPdf, generateProtocolHtmlPreview } from "@/lib/pdf-generator";
import { trpc } from "@/lib/trpc";
import { SignaturePad, pathsToSvgString } from "@/components/signature-pad";

import * as Haptics from "expo-haptics";
import { getVoiceProfiles, saveVoiceProfile, matchSpeakerToProfile, VoiceProfile } from "@/lib/voice-profiles";
import { saveDelegation, formatDelegationNotification, TaskDelegation } from "@/lib/task-delegation";
import { generateTimeline, formatTimestamp, getTimelineIcon, getTimelineColor, TimelineEntry } from "@/lib/protocol-timeline";
import { getTeamContacts, saveTeamContact, markContactUsed, TeamContact, sortContactsByRecent } from "@/lib/team-contacts";
import { getSpeakerName, updateSpeakerName, SpeakerProfile } from "@/lib/speaker-names";
import { SpeakerSegment, getSpeakerColor, getUniqueSpeakers, SPEAKER_COLORS } from "@/lib/speaker-colors";
import { sendActionItemsEmail } from "@/lib/email-actions";
import { queueChange, getSyncStatus } from "@/lib/offline-sync";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const LANGUAGES = [
  { code: "de", name: "Deutsch" },
  { code: "en", name: "Englisch" },
  { code: "fr", name: "Franz\u00f6sisch" },
  { code: "es", name: "Spanisch" },
  { code: "it", name: "Italienisch" },
  { code: "nl", name: "Niederl\u00e4ndisch" },
  { code: "pl", name: "Polnisch" },
  { code: "tr", name: "T\u00fcrkisch" },
  { code: "pt", name: "Portugiesisch" },
  { code: "ru", name: "Russisch" },
  { code: "ar", name: "Arabisch" },
];
const PHOTO_SIZE = (SCREEN_WIDTH - 48 - 8) / 3;

type TodoItem = {
  task: string;
  assignee: string;
  priority: "hoch" | "mittel" | "niedrig";
  deadline: string;
  done: boolean;
  dueDate?: string;
};

type Protocol = {
  id: string;
  title: string;
  transcription: string;
  protocol: string;
  templateName?: string;
  templateId?: string;
  photos?: string[];
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
};

export default function ProtocolDetailScreen() {
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
  const [summary, setSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [signaturePaths, setSignaturePaths] = useState<string[]>([]);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  // Multi-signature support
  type SignatureEntry = { role: string; paths: string[]; signedAt: string };
  const [signatures, setSignatures] = useState<SignatureEntry[]>([]);
  const [activeSignRole, setActiveSignRole] = useState<string>("");
  const SIGNATURE_ROLES = ["Auftraggeber", "Auftragnehmer", "Zeuge", "Pr\u00fcfer"];
  const translateMutation = trpc.translate.translateProtocol.useMutation();
  const [featureFlags, setFeatureFlags] = useState({ photoAnnotation: true, signature: true, multiSignature: false, tags: true });
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [previewPdfUri, setPreviewPdfUri] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  // Fullscreen gallery with swipe
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  // Voice note playback
  const [playingVoiceNote, setPlayingVoiceNote] = useState<number | null>(null);
  // Multi-output (Plaud-style)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [versions, setVersions] = useState<GeneratedVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<{id: string; name: string; icon: string; description: string}[]>([]);
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

  const loadTemplates = async () => {
    const { getAllTemplates } = require("@/shared/templates");
    const templates = await getAllTemplates();
    setAvailableTemplates(templates.map((t: any) => ({ id: t.id, name: t.name, icon: t.icon, description: t.description })));
  };

  // Auto-refresh while protocol is still processing in background
  useEffect(() => {
    if (protocol?.status === "processing") {
      const interval = setInterval(() => {
        loadProtocol();
      }, 3000); // Refresh every 3 seconds
      return () => clearInterval(interval);
    }
  }, [protocol?.status]);

  const loadFeatureFlags = async () => {
    const { isFeatureEnabled } = require("@/lib/feature-toggles");
    const [photoAnnotation, signature, multiSignature, tags] = await Promise.all([
      isFeatureEnabled("photoAnnotation"),
      isFeatureEnabled("signature"),
      isFeatureEnabled("multiSignature"),
      isFeatureEnabled("tags"),
    ]);
    setFeatureFlags({ photoAnnotation, signature, multiSignature, tags });
  };

  const loadProtocol = async () => {
    try {
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );
      const found = protocols.find((p: Protocol) => p.id === id);
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
  };

  const toggleTodo = async (index: number) => {
    const updated = [...todos];
    updated[index] = { ...updated[index], done: !updated[index].done };
    setTodos(updated);

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

  // Generate AI summary
  const generateSummary = async () => {
    if (!protocol) return;
    setIsGeneratingSummary(true);
    try {
      const result = await translateMutation.mutateAsync({
        text: "Fasse folgendes Protokoll in 2-3 pr\u00e4gnanten S\u00e4tzen zusammen: " + protocol.protocol,
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
  const speakerMutation = trpc.speaker.identify.useMutation();

  // Load team contacts
  const loadTeamContacts = async () => {
    const contacts = await getTeamContacts();
    setTeamContacts(sortContactsByRecent(contacts));
  };

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
        Alert.alert("Sprecher erkannt", `"${speakerLabel}" wurde automatisch als "${match.name}" identifiziert (Konfidenz: ${Math.round(match.confidence * 100)}%).`);
      } else {
        Alert.alert("Neues Stimmprofil", `Kein bekanntes Profil gefunden. Benennen Sie den Sprecher, um ein neues Profil zu erstellen.`);
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
        protocolTitle: protocol?.title || "Protokoll",
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
          Alert.alert("Aufgabe delegiert", `"${task}" wurde an ${assignee} gesendet.`);
        }
      } catch (notifError) {
        // Notification sending failed but delegation was saved
        Alert.alert("Aufgabe gespeichert", `Aufgabe wurde gespeichert. Push-Benachrichtigung konnte nicht gesendet werden.`);
      }
    } catch (e) {
      Alert.alert("Fehler", "Aufgabe konnte nicht delegiert werden.");
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
      const protocolTitle = protocol?.title || "Protokoll";
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

  // Multi-output: Regenerate with different template (Plaud-style)
  const protocolMutation = trpc.protocol.generate.useMutation();
  const todosMutation = trpc.protocol.extractTodos.useMutation();

  const regenerateWithTemplate = async (templateId: string, templateName?: string) => {
    if (!protocol) return;
    setIsRegenerating(true);
    setShowRegenerateModal(false);
    try {
      const result = await protocolMutation.mutateAsync({
        transcription: protocol.transcription,
        templateId,
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
      Alert.alert("Fehler", "Protokoll konnte nicht neu generiert werden.");
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
      const keywords = ["Termin", "Aufgabe", "Problem", "Lösung", "Material", "Kosten", "Zuständig", "Mangel", "Nächste Schritte", "Ergebnis"];
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
        topic: protocol.title || "Protokoll",
        branches,
      });
      setShowMindmap(true);
    } catch (e) {
      Alert.alert("Fehler", "Mindmap konnte nicht generiert werden");
    } finally {
      setIsGeneratingMindmap(false);
    }
  };

  // === FEATURE: Export All Versions as PDF ===
  const exportAllVersionsPdf = async () => {
    if (!protocol) return;
    const allVersions = [
      { name: "Original (" + (protocol.templateName || "Freitext") + ")", text: protocol.protocol, todos },
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
          ${v.todos.length > 0 ? `<h3>Aufgaben</h3>${v.todos.map((t: any) => `<div class="todo ${t.done ? 'todo-done' : ''}">${t.done ? '☑' : '☐'} ${t.text}${t.assignee ? ' → ' + t.assignee : ''}</div>`).join('')}` : ''}
        </div>
      `).join('')}
    </body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Alle Versionen exportieren" });
      }
    } catch (e) {
      Alert.alert("Fehler", "PDF-Export fehlgeschlagen");
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
    
    return detected.length > 0 ? detected : [{ title: "Gesamtes Protokoll", startLine: 0, preview: text.substring(0, 80) }];
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
      const pdfUri = await generateProtocolPdf({
        title: protocol.title,
        protocol: protocol.protocol,
        templateName: protocol.templateName,
        photos: protocol.photos,
        photoTimestamps: (protocol as any).photoTimestamps || undefined,
        transcriptionSegments: (protocol as any).transcriptionSegments || undefined,
        todos,
        duration: protocol.duration,
        createdAt: protocol.createdAt,
        location: protocol.location,
        weather: protocol.weather,
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
          protocol: protocol.protocol,
          templateName: protocol.templateName,
          photos: protocol.photos,
          photoTimestamps: (protocol as any).photoTimestamps || undefined,
          transcriptionSegments: (protocol as any).transcriptionSegments || undefined,
          todos,
          duration: protocol.duration,
          createdAt: protocol.createdAt,
          location: protocol.location,
          weather: protocol.weather,
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
      Alert.alert("Fehler", "PDF konnte nicht erstellt werden. Bitte versuche es erneut.");
    } finally {
      setIsExporting(false);
    }
  };

  const sharePdfFromPreview = async () => {
    if (!previewPdfUri || !protocol) return;
    if (Platform.OS === "web") {
      Alert.alert("PDF erstellt", "PDF-Export ist nur auf dem Handy verfügbar.");
      return;
    }
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(previewPdfUri, {
        mimeType: "application/pdf",
        dialogTitle: `${protocol.templateName || "Protokoll"} als PDF teilen`,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert("Fehler", "Teilen ist auf diesem Gerät nicht verfügbar.");
    }
  };

  const shareViaWhatsApp = async () => {
    if (!protocol) return;

    setIsSendingWhatsApp(true);
    try {
      // Generate PDF first
      const pdfUri = await generateProtocolPdf({
        title: protocol.title,
        protocol: protocol.protocol,
        templateName: protocol.templateName,
        photos: protocol.photos,
        photoTimestamps: (protocol as any).photoTimestamps || undefined,
        transcriptionSegments: (protocol as any).transcriptionSegments || undefined,
        todos,
        duration: protocol.duration,
        createdAt: protocol.createdAt,
        location: protocol.location,
        weather: protocol.weather,
        protocolNumber: protocol.protocolNumber,
        projectName: protocol.projectName || undefined,
        signaturePaths: signaturePaths.length > 0 ? signaturePaths : undefined,
        signatures: signatures.length > 0 ? signatures : undefined,
      });

      // Use native share sheet with PDF - user can pick WhatsApp
      if (Platform.OS === "web") {
        Alert.alert("Hinweis", "PDF-Versand per WhatsApp ist nur auf dem Handy verfügbar.");
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: "application/pdf",
          dialogTitle: "Protokoll-PDF per WhatsApp senden",
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
          title: "Protokoll teilen",
        });
      }
    } catch (error) {
      console.error("WhatsApp PDF share error:", error);
      Alert.alert("Fehler", "PDF konnte nicht erstellt werden. Bitte versuche es erneut.");
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
      `${protocol.templateName || "Protokoll"} vom ${new Date(protocol.createdAt).toLocaleDateString("de-DE")}`
    );
    const body = encodeURIComponent(protocol.protocol);

    const url = `mailto:${emailTo}?subject=${subject}&body=${body}`;
    await Linking.openURL(url);
  };

  const copyToClipboard = async () => {
    if (!protocol) return;
    await Clipboard.setStringAsync(protocol.protocol);
    Alert.alert("Kopiert", "Protokoll in die Zwischenablage kopiert!");
  };

  const shareGeneric = async () => {
    if (!protocol) return;
    await Share.share({
      message: protocol.protocol,
      title: protocol.templateName || "Protokoll teilen",
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
    if (Platform.OS === "web") {
      const newCaption = prompt("Foto-Beschreibung bearbeiten:", currentCaption || "");
      if (newCaption !== null) {
        savePhotoCaption(photoIndex, newCaption);
      }
    } else {
      Alert.prompt
        ? Alert.prompt("Foto-Beschreibung", `Text f\u00fcr Foto ${photoIndex + 1} bearbeiten:`, [
            { text: "Abbrechen", style: "cancel" },
            { text: "Speichern", onPress: (text?: string) => savePhotoCaption(photoIndex, text || "") },
          ], "plain-text", currentCaption || "")
        : Alert.alert("Foto-Beschreibung", `Aktuelle Beschreibung:\n\n${currentCaption || "(leer)"}`, [
            { text: "L\u00f6schen", style: "destructive", onPress: () => savePhotoCaption(photoIndex, "") },
            { text: "OK" },
          ]);
    }
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
        <Text className="text-xl text-foreground">Protokoll nicht gefunden</Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.backButtonText}>Zurück</Text>
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
          {protocol.templateName || "Protokoll"}
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
              style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "#3B82F6" + "15", opacity: pressed ? 0.5 : 1, marginLeft: 8 }]}
            >
              <Text style={{ fontSize: 11, color: "#3B82F6", fontWeight: "600" }}>📧 Senden</Text>
            </Pressable></View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Tags */}
        {showTagEditor && (
          <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}>
            <Text style={[{ fontSize: 14, fontWeight: "600", marginBottom: 8, color: colors.foreground }]}>Tags</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {tags.map((tag) => (
                <Pressable key={tag} onPress={() => updateTags(tags.filter(t => t !== tag))} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary + "15", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
                  <Text style={{ fontSize: 12, color: colors.primary }}>{tag}</Text>
                  <MaterialIcons name="close" size={12} color={colors.primary} />
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  Alert.prompt ? Alert.prompt("Tag hinzufügen", "Name des Tags:", (text) => { if (text?.trim()) updateTags([...tags, text.trim().toLowerCase()]); }) : Alert.alert("Tag hinzufügen", "Nutze die Protokoll-Liste (langes Drücken) um Tags zu verwalten.");
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.border + "50", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}
              >
                <MaterialIcons name="add" size={14} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.muted }}>Tag</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Tags display (when editor closed) */}
        {!showTagEditor && tags.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12, paddingHorizontal: 4 }}>
            {tags.map((tag) => (
              <View key={tag} style={{ backgroundColor: colors.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
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
                  Wird im Hintergrund verarbeitet...
                </Text>
                <Text style={{ fontSize: 12, color: "#FF9800", marginTop: 2 }}>
                  {protocol.processingStep === "uploading" && "Audio wird hochgeladen..."}
                  {protocol.processingStep === "transcribing" && "Spracherkennung l\u00e4uft..."}
                  {protocol.processingStep === "generating" && "Protokoll wird erstellt..."}
                  {protocol.processingStep === "extracting-todos" && "Aufgaben werden extrahiert..."}
                  {protocol.processingStep === "failed" && `Fehler: ${protocol.processingError || "Unbekannt"}`}
                  {!protocol.processingStep && "Verarbeitung l\u00e4uft..."}
                </Text>
                {protocol.processingStep === "failed" && (
                  <Text style={{ fontSize: 11, color: "#E65100", marginTop: 4 }}>
                    Tipp: Versuche es erneut mit dem Audio-Modus.
                  </Text>
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
          {protocol.weather && (
            <View style={styles.metaRow}>
              <MaterialIcons name="cloud" size={18} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {protocol.weather}
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
                {protocol.recordingMode === "audio-photo" ? "Audio + Fotos" : "Audio-Aufnahme"}
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
              {isExporting ? "PDF wird erstellt..." : "Als PDF exportieren"}
            </Text>
            <Text style={[styles.pdfBannerSubtitle, { color: colors.muted }]}>
              Professionelles Dokument mit Logo & Fotos
            </Text>
          </View>
          {!isExporting && (
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          )}
        </Pressable>

        {/* Photos Gallery */}
        {photos.length > 0 && (
          <View style={styles.section}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Fotos ({photos.length})
              </Text>
              {photos.length > 1 && (
                <Text style={{ fontSize: 11, color: colors.muted }}>Reihenfolge ändern ↑↓</Text>
              )}
            </View>
            {photos.map((photoUri, index) => {
              const captions: string[] = (protocol as any).photoCaptions || [];
              const segments: Array<{ start: number; end: number; text: string }> = (protocol as any).transcriptionSegments || [];
              const timestamps: number[] = (protocol as any).photoTimestamps || [];
              // Auto-generate caption from segments if not manually set
              let autoCaption = "";
              if (segments.length > 0 && timestamps[index] != null) {
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
                          borderRadius: 12,
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
                          Foto {index + 1}{timestamps[index] != null ? ` \u2013 ${Math.floor(timestamps[index] / 60)}:${(timestamps[index] % 60).toString().padStart(2, "0")} Min.` : ""}
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
                      <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 18 }} numberOfLines={4}>
                        {currentCaption || "Kein zugeordneter Text"}
                      </Text>
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
                            borderRadius: 12,
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
                            {playingVoiceNote === index ? "Wiedergabe..." : "Sprachnotiz"}
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
          </View>
        )}


        {/* To-Do List */}
        {displayedTodos.length > 0 && (
          <View style={styles.section}>
            <View style={styles.todoHeader}>
              <MaterialIcons name="checklist" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0, marginLeft: 8 }]}>
                Aufgaben ({displayedTodos.filter(t => t.done).length}/{displayedTodos.length})
              </Text>
            </View>
            {todos.map((todo, index) => (
              <Pressable
                key={index}
                onPress={() => toggleTodo(index)}
                onLongPress={() => {
                  if (Platform.OS === "web") {
                    const input = prompt("F\u00e4lligkeitsdatum (TT.MM.JJJJ):", todo.dueDate ? new Date(todo.dueDate).toLocaleDateString("de-DE") : "");
                    if (input) {
                      const parts = input.split(".");
                      if (parts.length === 3) {
                        const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                        if (!isNaN(date.getTime())) {
                          const updated = [...todos];
                          updated[index] = { ...updated[index], dueDate: date.toISOString() };
                          setTodos(updated);
                          (async () => {
                            try {
                              const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
                              const pidx = protocols.findIndex((p: any) => p.id === id);
                              if (pidx !== -1) { protocols[pidx].todos = updated; await AsyncStorage.setItem("protocols", JSON.stringify(protocols)); }
                            } catch { /* ignore */ }
                          })();
                        }
                      }
                    }
                  } else {
                    Alert.prompt ? Alert.prompt("F\u00e4lligkeitsdatum", "Format: TT.MM.JJJJ", (input) => {
                      if (input) {
                        const parts = input.split(".");
                        if (parts.length === 3) {
                          const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                          if (!isNaN(date.getTime())) {
                            const updated = [...todos];
                            updated[index] = { ...updated[index], dueDate: date.toISOString() };
                            setTodos(updated);
                            (async () => {
                              try {
                                const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
                                const pidx = protocols.findIndex((p: any) => p.id === id);
                                if (pidx !== -1) { protocols[pidx].todos = updated; await AsyncStorage.setItem("protocols", JSON.stringify(protocols)); }
                              } catch { /* ignore */ }
                            })();
                          }
                        }
                      }
                    }, "plain-text", todo.dueDate ? new Date(todo.dueDate).toLocaleDateString("de-DE") : "") : Alert.alert("Hinweis", "Halte eine Aufgabe gedr\u00fcckt um ein F\u00e4lligkeitsdatum zu setzen.");
                  }
                }}
                style={({ pressed }) => [
                  styles.todoItem,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.todoCheckbox, { borderColor: todo.done ? colors.primary : colors.muted, backgroundColor: todo.done ? colors.primary : "transparent" }]}>
                  {todo.done && <MaterialIcons name="check" size={14} color="#FFFFFF" />}
                </View>
                <View style={styles.todoContent}>
                  <Text style={[styles.todoTask, { color: colors.foreground, textDecorationLine: todo.done ? "line-through" : "none", opacity: todo.done ? 0.6 : 1 }]}>
                    {todo.task}
                  </Text>
                  <View style={styles.todoMeta}>
                    {todo.assignee !== "Nicht zugewiesen" && (
                      <View style={[styles.todoBadge, { backgroundColor: colors.surface }]}>
                        <MaterialIcons name="person" size={12} color={colors.muted} />
                        <Text style={[styles.todoBadgeText, { color: colors.muted }]}>{todo.assignee}</Text>
                      </View>
                    )}
                    <View style={[styles.todoBadge, { backgroundColor: todo.priority === "hoch" ? "#E5393520" : todo.priority === "mittel" ? "#FF980020" : colors.surface }]}>
                      <Text style={[styles.todoBadgeText, { color: todo.priority === "hoch" ? "#E53935" : todo.priority === "mittel" ? "#FF9800" : colors.muted }]}>
                        {todo.priority === "hoch" ? "⚠️ Hoch" : todo.priority === "mittel" ? "Mittel" : "Niedrig"}
                      </Text>
                    </View>
                    <Pressable onPress={() => { setDelegatingTask({ task: todo.task, assignee: todo.assignee, priority: todo.priority, deadline: todo.deadline }); setShowDelegateModal(true); }} style={({ pressed }) => [{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#22C55E15", opacity: pressed ? 0.7 : 1 }]}>
                      <Text style={{ fontSize: 10, color: "#22C55E", fontWeight: "500" }}>📤 Delegieren</Text>
                    </Pressable>
                    {todo.deadline !== "Offen" && (
                      <View style={[styles.todoBadge, { backgroundColor: colors.surface }]}>
                        <MaterialIcons name="schedule" size={12} color={colors.muted} />
                        <Text style={[styles.todoBadgeText, { color: colors.muted }]}>{todo.deadline}</Text>
                      </View>
                    )}
                    {todo.dueDate && (
                      <View style={[styles.todoBadge, { backgroundColor: new Date(todo.dueDate) < new Date() && !todo.done ? "#E5393520" : colors.surface }]}>
                        <MaterialIcons name="event" size={12} color={new Date(todo.dueDate) < new Date() && !todo.done ? "#E53935" : colors.muted} />
                        <Text style={[styles.todoBadgeText, { color: new Date(todo.dueDate) < new Date() && !todo.done ? "#E53935" : colors.muted }]}>
                          {new Date(todo.dueDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* KI-Werkzeuge - Plaud-Style */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>KI-Werkzeuge</Text>
          </View>
          <View style={{ gap: 8 }}>
            {/* Zusammenfassung */}
            <Pressable
              onPress={generateSummary}
              disabled={isGeneratingSummary}
              style={({ pressed }) => [{
                flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12,
                backgroundColor: colors.primary + "08", borderWidth: 1, borderColor: colors.primary + "25",
                opacity: pressed || isGeneratingSummary ? 0.7 : 1,
              }]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                {isGeneratingSummary ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="summarize" size={20} color={colors.primary} />}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Zusammenfassung</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>Kernpunkte auf einen Blick</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            {/* Neu generieren */}
            <Pressable
              onPress={() => setShowRegenerateModal(true)}
              style={({ pressed }) => [{
                flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12,
                backgroundColor: "#8B5CF6" + "08", borderWidth: 1, borderColor: "#8B5CF6" + "25",
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#8B5CF6" + "15", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="refresh" size={20} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Neu generieren</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>Anderes Template oder Format wählen</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            {/* Sprecher erkennen */}
            <Pressable
              onPress={identifySpeakers}
              disabled={isIdentifyingSpeakers}
              style={({ pressed }) => [{
                flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12,
                backgroundColor: "#059669" + "08", borderWidth: 1, borderColor: "#059669" + "25",
                opacity: pressed || isIdentifyingSpeakers ? 0.7 : 1,
              }]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#059669" + "15", alignItems: "center", justifyContent: "center" }}>
                {isIdentifyingSpeakers ? <ActivityIndicator size="small" color="#059669" /> : <MaterialIcons name="record-voice-over" size={20} color="#059669" />}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Sprecher erkennen</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>Personen im Gespräch identifizieren</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            {/* Row with smaller buttons */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={generateTimelineView}
                style={({ pressed }) => [{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: 12, borderRadius: 10, backgroundColor: "#0EA5E9" + "10", borderWidth: 1, borderColor: "#0EA5E9" + "20",
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MaterialIcons name="timeline" size={16} color="#0EA5E9" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#0EA5E9" }}>Timeline</Text>
              </Pressable>
              <Pressable
                onPress={generateMindmap}
                disabled={isGeneratingMindmap}
                style={({ pressed }) => [{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: 12, borderRadius: 10, backgroundColor: "#22C55E" + "10", borderWidth: 1, borderColor: "#22C55E" + "20",
                  opacity: pressed || isGeneratingMindmap ? 0.7 : 1,
                }]}
              >
                <MaterialIcons name="hub" size={16} color="#22C55E" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#22C55E" }}>{isGeneratingMindmap ? "..." : "Mindmap"}</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowStats(true)}
                style={({ pressed }) => [{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: 12, borderRadius: 10, backgroundColor: "#F59E0B" + "10", borderWidth: 1, borderColor: "#F59E0B" + "20",
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MaterialIcons name="bar-chart" size={16} color="#F59E0B" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#F59E0B" }}>Statistik</Text>
              </Pressable>
            </View>
          </View>
          {/* Summary result display */}
          {summary && (
            <View style={{ marginTop: 12, backgroundColor: colors.primary + "06", borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
              <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 21 }}>{summary}</Text>
            </View>
          )}
        </View>
        {/* Protocol content with multi-output versions */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Protokoll</Text>
            <Pressable
              onPress={isEditing ? saveEdit : startEditing}
              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: isEditing ? colors.success + "12" : colors.surface, borderWidth: 1, borderColor: isEditing ? colors.success : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name={isEditing ? "check" : "edit"} size={15} color={isEditing ? colors.success : colors.muted} />
              <Text style={{ fontSize: 13, fontWeight: "500", color: isEditing ? colors.success : colors.muted }}>{isEditing ? "Speichern" : "Bearbeiten"}</Text>
            </Pressable>
          </View>

          {/* Version tabs */}
          {versions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
              <Pressable
                onPress={() => switchToVersion(null)}
                style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: !activeVersionId ? colors.primary : colors.surface, borderWidth: 1, borderColor: !activeVersionId ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 12, fontWeight: "500", color: !activeVersionId ? "#FFFFFF" : colors.muted }}>
                  Original ({protocol.templateName || "Freitext"})
                </Text>
              </Pressable>
              {versions.map((v) => (
                <View key={v.id} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Pressable
                    onPress={() => switchToVersion(v.id)}
                    style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: activeVersionId === v.id ? colors.primary : colors.surface, borderWidth: 1, borderColor: activeVersionId === v.id ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: colors.primary + "08", borderRadius: 8, marginBottom: 12 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ fontSize: 13, color: colors.primary }}>Wird neu generiert...</Text>
            </View>
          )}

          {/* Protocol text */}
          {isEditing ? (
            <TextInput
              value={editedText}
              onChangeText={setEditedText}
              multiline
              style={[styles.protocolText, { color: colors.foreground, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, padding: 12, minHeight: 200, textAlignVertical: "top" }]}
            />
          ) : (
            <View>
              {extractedKeywords.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {extractedKeywords.map((kw, i) => (
                    <View key={i} style={{ backgroundColor: colors.primary + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
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
                <Text style={[styles.protocolText, { color: colors.foreground }]}>
                  {displayedProtocolText}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Digital Signatures (Multi-Role) */}
        {(featureFlags.signature || featureFlags.multiSignature) && <View style={[styles.section, { marginTop: 0 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <MaterialIcons name="draw" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Unterschriften</Text>
          </View>

          {/* Existing signatures */}
          {signatures.map((sig, idx) => (
            <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}>
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
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>Rolle wählen und unterschreiben:</Text>
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
                      backgroundColor: colors.surface, borderRadius: 20,
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
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Übersetzung</Text>
            </View>
            <Pressable
              onPress={() => setShowLangPicker(!showLangPicker)}
              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 13, color: colors.foreground }}>{LANGUAGES.find(l => l.code === targetLang)?.name || targetLang}</Text>
              <MaterialIcons name="expand-more" size={16} color={colors.muted} />
            </Pressable>
          </View>

          {showLangPicker && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {LANGUAGES.filter(l => l.code !== "de").map(lang => (
                <Pressable
                  key={lang.code}
                  onPress={() => { setTargetLang(lang.code); setShowLangPicker(false); setTranslatedText(null); }}
                  style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: targetLang === lang.code ? colors.primary : colors.surface, borderWidth: 1, borderColor: targetLang === lang.code ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
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
              } catch (e) {
                Alert.alert("Fehler", "Übersetzung fehlgeschlagen. Bitte versuche es erneut.");
              } finally {
                setIsTranslating(false);
              }
            }}
            disabled={isTranslating}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10, backgroundColor: showTranslation ? colors.surface : colors.primary + "15", borderWidth: 1, borderColor: showTranslation ? colors.border : colors.primary + "40", opacity: (pressed || isTranslating) ? 0.6 : 1 }]}
          >
            {isTranslating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name={showTranslation ? "visibility-off" : "translate"} size={18} color={colors.primary} />
            )}
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>
              {isTranslating ? "Übersetze..." : showTranslation ? "Übersetzung ausblenden" : `In ${LANGUAGES.find(l => l.code === targetLang)?.name || targetLang} übersetzen`}
            </Text>
          </Pressable>

          {showTranslation && translatedText && (
            <View style={[styles.transcriptionBox, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 }]}>
              <Text style={[styles.protocolText, { color: colors.foreground }]}>{translatedText}</Text>
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
            {showTranscription ? "Transkription ausblenden" : "Originaltranskription anzeigen"}
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
              Versenden erst m\u00f6glich wenn Verarbeitung abgeschlossen
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
          <Text style={styles.actionButtonText}>E-Mail</Text>
        </Pressable>

        <Pressable
          onPress={copyToClipboard}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="content-copy" size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>Kopieren</Text>
        </Pressable>

        <Pressable
          onPress={shareGeneric}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.foreground, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="share" size={20} color={colors.background} />
          <Text style={[styles.actionButtonText, { color: colors.background }]}>Teilen</Text>
        </Pressable>
          </>
        )}
      </View>

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
          <View style={{ position: "absolute", top: 60, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, zIndex: 10 }}>
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
                borderRadius: 24,
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
                borderRadius: 24,
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
              <Text style={styles.modalShareText}>Teilen</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowGallery(false);
                router.push(`/photo-annotate?photoUri=${encodeURIComponent(photos[galleryIndex])}&protocolId=${protocol?.id}&photoIndex=${galleryIndex}` as any);
              }}
              style={({ pressed }) => [styles.modalShareButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="edit" size={24} color="#FFFFFF" />
              <Text style={styles.modalShareText}>Annotieren</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowGallery(false);
                router.push({ pathname: "/cloud-photo-export", params: { photos: JSON.stringify(photos), projectName: protocol?.title || "Protokoll" } } as any);
              }}
              style={({ pressed }) => [styles.modalShareButton, { backgroundColor: "#0EA5E9", opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="cloud-upload" size={24} color="#FFFFFF" />
              <Text style={styles.modalShareText}>Cloud</Text>
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
              <Text style={{ fontSize: 16, color: colors.primary }}>Schlie\u00dfen</Text>
            </Pressable>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>PDF-Vorschau</Text>
            <Pressable onPress={sharePdfFromPreview} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 }]}>
              <MaterialIcons name="share" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, color: colors.primary }}>Teilen</Text>
            </Pressable>
          </View>
          {Platform.OS === "web" && previewHtml ? (
            <View style={{ flex: 1 }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                <View style={{ backgroundColor: "#fff", borderRadius: 8, padding: 16, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 12, textAlign: "center" }}>PDF-Vorschau (Druckansicht)</Text>
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
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="share" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>PDF teilen / herunterladen</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowPdfPreview(false)}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={{ fontSize: 16, color: colors.foreground }}>Zur\u00fcck</Text>
                </Pressable>
              </View>
            </View>
          ) : previewPdfUri && Platform.OS !== "web" ? (
            <View style={{ flex: 1, padding: 8 }}>
              <Image
                source={{ uri: previewPdfUri }}
                style={{ flex: 1, borderRadius: 8 }}
                contentFit="contain"
              />
              <View style={{ paddingVertical: 12, gap: 8 }}>
                <Pressable
                  onPress={sharePdfFromPreview}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="share" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>PDF teilen</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowPdfPreview(false)}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={{ fontSize: 16, color: colors.foreground }}>Zur\u00fcck</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
              <MaterialIcons name="picture-as-pdf" size={64} color={colors.primary} />
              <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginTop: 16 }}>PDF wird erstellt...</Text>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 16 }} />
            </View>
          )}
        </View>
      </Modal>

        {/* Mindmap Fullscreen Modal */}
        <Modal visible={showMindmap} animationType="slide" onRequestClose={() => setShowMindmap(false)}>
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 60 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>Mindmap</Text>
              <Pressable onPress={() => setShowMindmap(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }}>
              {mindmapData && (
                <View style={{ alignItems: "center" }}>
                  <View style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, marginBottom: 30 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF" }}>{mindmapData.topic}</Text>
                  </View>
                  {mindmapData.branches.map((branch, idx) => (
                    <View key={idx} style={{ marginBottom: 20, alignItems: "center", width: "100%" }}>
                      <View style={{ backgroundColor: branch.color + "20", borderWidth: 2, borderColor: branch.color, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, marginBottom: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: branch.color }}>{branch.title}</Text>
                      </View>
                      {branch.items.map((item, iIdx) => (
                        <View key={iIdx} style={{ backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginBottom: 4, maxWidth: "90%" }}>
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
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>Sprachstatistik</Text>
              <Pressable onPress={() => setShowStats(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            {speechStats && (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
                  {[
                    { label: "Wörter", value: speechStats.words.toString() },
                    { label: "Sätze", value: speechStats.sentences.toString() },
                    { label: "Absätze", value: speechStats.paragraphs.toString() },
                    { label: "Wörter/Min", value: speechStats.wordsPerMinute.toString() },
                    { label: "Ø Satzlänge", value: speechStats.avgSentenceLength + " Wörter" },
                  ].map((stat, idx) => (
                    <View key={idx} style={{ backgroundColor: colors.surface, padding: 16, borderRadius: 12, minWidth: "45%", flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: "700", color: colors.primary }}>{stat.value}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{stat.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>Häufigste Wörter</Text>
                {speechStats.topWords.map((w, idx) => (
                  <View key={idx} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <View style={{ flex: 1, height: 24, backgroundColor: colors.surface, borderRadius: 6, overflow: "hidden" }}>
                      <View style={{ height: 24, backgroundColor: colors.primary + "30", borderRadius: 6, width: `${(w.count / (speechStats.topWords[0]?.count || 1)) * 100}%` as any }} />
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
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>Kapitel</Text>
              <Pressable onPress={() => setShowChapters(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {chapters.map((ch, idx) => (
                <Pressable key={idx} onPress={() => setShowChapters(false)} style={({ pressed }) => [{ backgroundColor: colors.surface, padding: 16, borderRadius: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
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
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>KI-Ausgabeformat wählen</Text>
                <Pressable onPress={() => setShowRegenerateModal(false)} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 1 }]}>
                  <MaterialIcons name="close" size={24} color={colors.foreground} />
                </Pressable>
              </View>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>Generiere eine neue Version aus der Original-Aufnahme:</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Plaud-Style Formate */}
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Plaud-Formate</Text>
                {availableTemplates.filter(t => t.id.includes("plaud")).map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => { setShowRegenerateModal(false); regenerateWithTemplate(t.id, t.name); }}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: colors.primary + "06", borderRadius: 14, marginBottom: 8, borderWidth: 1.5, borderColor: colors.primary + "30", opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name={(t as any).icon || "auto-awesome"} size={22} color={colors.primary} />
                    </View>
                    <View style={{ marginLeft: 14, flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{t.name.replace(" (Plaud)", "")}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t.description}</Text>
                    </View>
                    <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
                  </Pressable>
                ))}
                {/* Fach-Templates */}
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 10 }}>Fach-Vorlagen</Text>
                {availableTemplates.filter(t => !t.id.includes("plaud")).map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => { setShowRegenerateModal(false); regenerateWithTemplate(t.id, t.name); }}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.surface, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.border + "40", alignItems: "center", justifyContent: "center" }}>
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
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Aufgaben per E-Mail senden</Text>
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
                placeholder="E-Mail-Adresse eingeben"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{ 
                  backgroundColor: colors.surface, 
                  borderRadius: 12, 
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
                  <Text style={{ fontSize: 12, color: "#9BA1A6", marginBottom: 6 }}>Kontakte:</Text>
                  {teamContacts.slice(0, 5).map(contact => (
                    <Pressable
                      key={contact.id}
                      onPress={() => selectTeamContact(contact)}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: pressed ? "#1e202220" : "transparent", marginBottom: 2 }]}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#0a7ea420", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
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
                  <Text style={{ fontSize: 12, color: "#0a7ea4" }}>+ Neuen Kontakt speichern</Text>
                </Pressable>
              ) : (
                <View style={{ marginTop: 8, padding: 10, backgroundColor: "#f5f5f5", borderRadius: 8 }}>
                  <TextInput placeholder="Name" value={newContactName} onChangeText={setNewContactName} style={{ fontSize: 13, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingVertical: 4, marginBottom: 6 }} />
                  <TextInput placeholder="E-Mail" value={newContactEmail} onChangeText={setNewContactEmail} keyboardType="email-address" style={{ fontSize: 13, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingVertical: 4, marginBottom: 6 }} />
                  <TextInput placeholder="Rolle (optional)" value={newContactRole} onChangeText={setNewContactRole} style={{ fontSize: 13, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingVertical: 4, marginBottom: 8 }} />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable onPress={addNewTeamContact} style={{ flex: 1, backgroundColor: "#0a7ea4", paddingVertical: 8, borderRadius: 6, alignItems: "center" }}>
                      <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>Speichern</Text>
                    </Pressable>
                    <Pressable onPress={() => setShowAddContact(false)} style={{ flex: 1, backgroundColor: "#E5E7EB", paddingVertical: 8, borderRadius: 6, alignItems: "center" }}>
                      <Text style={{ fontSize: 12, color: "#687076" }}>Abbrechen</Text>
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
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                {isSendingEmail ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>📧 E-Mail senden</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Speaker Name Edit Modal */}
        <Modal visible={!!editingSpeakerLabel} transparent animationType="fade" onRequestClose={() => setEditingSpeakerLabel(null)}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: "white", borderRadius: 16, padding: 24, width: "80%", maxWidth: 320 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>Sprecher benennen</Text>
              <Text style={{ fontSize: 12, color: "#687076", marginBottom: 12 }}>Name für "{editingSpeakerLabel}" eingeben. Wird für zukünftige Protokolle gespeichert.</Text>
              <TextInput
                value={speakerNameInput}
                onChangeText={setSpeakerNameInput}
                placeholder="Name eingeben..."
                style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 16 }}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => { if (editingSpeakerLabel && speakerNameInput.trim()) saveSpeakerName(editingSpeakerLabel, speakerNameInput.trim()); }} style={{ flex: 1, backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 8, alignItems: "center" }}>
                  <Text style={{ color: "white", fontWeight: "600" }}>Speichern</Text>
                </Pressable>
                <Pressable onPress={() => setEditingSpeakerLabel(null)} style={{ flex: 1, backgroundColor: "#f5f5f5", paddingVertical: 12, borderRadius: 8, alignItems: "center" }}>
                  <Text style={{ color: "#687076" }}>Abbrechen</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Timeline Modal */}
        <Modal visible={showTimeline} animationType="slide" onRequestClose={() => setShowTimeline(false)}>
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 60 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>Protokoll-Timeline</Text>
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
                  <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>Keine Timeline-Einträge verfügbar</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Modal>

        {/* Task Delegation Modal */}
        <Modal visible={showDelegateModal} transparent animationType="fade" onRequestClose={() => setShowDelegateModal(false)}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: "white", borderRadius: 16, padding: 24, width: "85%", maxWidth: 360 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 4 }}>Aufgabe delegieren</Text>
              <Text style={{ fontSize: 12, color: "#687076", marginBottom: 16 }}>Push-Benachrichtigung an Teammitglied senden</Text>
              {delegatingTask && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ backgroundColor: "#f5f5f5", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", marginBottom: 4 }}>{delegatingTask.task}</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Text style={{ fontSize: 11, color: "#687076" }}>👤 {delegatingTask.assignee}</Text>
                      <Text style={{ fontSize: 11, color: delegatingTask.priority === "hoch" ? "#EF4444" : delegatingTask.priority === "mittel" ? "#F59E0B" : "#22C55E" }}>● {delegatingTask.priority}</Text>
                      {delegatingTask.deadline && <Text style={{ fontSize: 11, color: "#687076" }}>📅 {delegatingTask.deadline}</Text>}
                    </View>
                  </View>
                  {teamContacts.length > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 12, color: "#687076", marginBottom: 6 }}>An Kontakt senden:</Text>
                      {teamContacts.slice(0, 3).map(contact => (
                        <Pressable key={contact.id} onPress={() => delegateTask(delegatingTask.task, contact.name, delegatingTask.priority, delegatingTask.deadline)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: pressed ? "#f0f0f0" : "transparent", marginBottom: 2 }]}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#22C55E20", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: "#22C55E" }}>{contact.name.charAt(0)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: "500" }}>{contact.name}</Text>
                            <Text style={{ fontSize: 11, color: "#687076" }}>{contact.email}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <Pressable onPress={() => delegateTask(delegatingTask.task, delegatingTask.assignee, delegatingTask.priority, delegatingTask.deadline)} style={({ pressed }) => [{ backgroundColor: "#22C55E", paddingVertical: 12, borderRadius: 8, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}>
                    {isDelegating ? <ActivityIndicator color="white" size="small" /> : <Text style={{ color: "white", fontWeight: "600" }}>📤 Jetzt delegieren</Text>}
                  </Pressable>
                </View>
              )}
              <Pressable onPress={() => { setShowDelegateModal(false); setDelegatingTask(null); }} style={{ marginTop: 8, alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ color: "#687076" }}>Abbrechen</Text>
              </Pressable>
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
    borderRadius: 12,
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
    borderRadius: 12,
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
    borderRadius: 8,
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
    borderRadius: 10,
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
    marginTop: 8,
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
    borderRadius: 8,
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
    borderRadius: 10,
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
    borderRadius: 8,
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
    borderRadius: 8,
  },
  modalCloseButton: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
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
    borderRadius: 20,
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
    borderRadius: 6,
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
    borderRadius: 6,
    gap: 4,
  },
  todoBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
});
// TEST_MARKER
