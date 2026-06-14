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
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { generateProtocolPdf } from "@/lib/pdf-generator";
import { trpc } from "@/lib/trpc";
import { SignaturePad, pathsToSvgString } from "@/components/signature-pad";

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
  weather?: string | null;
  isFavorite?: boolean;
  isArchived?: boolean;
  tags?: string[];
  recordingMode?: string;
  projectId?: string;
  protocolNumber?: string;
  videoUrl?: string | null;
  videoUploadedAt?: string | null;
  videoUploadPending?: boolean;
  videoIsLocal?: boolean;
  videoSizeMB?: number;
  videoUploadFailed?: boolean;
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

  useEffect(() => {
    loadProtocol();
    loadFeatureFlags();
  }, [id]);

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

  const exportPdf = async () => {
    if (!protocol) return;

    setIsExporting(true);
    try {
      const pdfUri = await generateProtocolPdf({
        title: protocol.title,
        protocol: protocol.protocol,
        templateName: protocol.templateName,
        photos: protocol.photos,
        todos,
        duration: protocol.duration,
        createdAt: protocol.createdAt,
        location: protocol.location,
        weather: protocol.weather,
        protocolNumber: protocol.protocolNumber,
        signaturePaths: signaturePaths.length > 0 ? signaturePaths : undefined,
        signatures: signatures.length > 0 ? signatures : undefined,
      });

      // Share the PDF
      if (Platform.OS === "web") {
        Alert.alert("PDF erstellt", "PDF-Export ist nur auf dem Handy verfügbar.");
      } else {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(pdfUri, {
            mimeType: "application/pdf",
            dialogTitle: `${protocol.templateName || "Protokoll"} als PDF teilen`,
            UTI: "com.adobe.pdf",
          });
        } else {
          Alert.alert("Fehler", "Teilen ist auf diesem Gerät nicht verfügbar.");
        }
      }
    } catch (error) {
      console.error("PDF export error:", error);
      Alert.alert("Fehler", "PDF konnte nicht erstellt werden. Bitte versuche es erneut.");
    } finally {
      setIsExporting(false);
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
        todos,
        duration: protocol.duration,
        createdAt: protocol.createdAt,
        location: protocol.location,
        weather: protocol.weather,
        protocolNumber: protocol.protocolNumber,
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
        </View>
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
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Fotos
            </Text>
            <View style={styles.photoGrid}>
              {photos.map((photoUri, index) => (
                <View key={index} style={{ position: 'relative' }}>
                  <Pressable
                    onPress={() => setSelectedPhoto(photoUri)}
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
              ))}
            </View>
            <Text style={[styles.photoHint, { color: colors.muted }]}>
              Tippe zum Vergr\u00f6\u00dfern \u2022 Halte gedr\u00fcckt zum Teilen \u2022 \u270f\ufe0f Annotieren
            </Text>
          </View>
        )}

        {/* Video Attachment */}
        {protocol.videoUrl && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="videocam" size={20} color={colors.success} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
                Video-Aufnahme
              </Text>
              {protocol.videoSizeMB && (
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  ({protocol.videoSizeMB} MB)
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => {
                if (protocol.videoUrl) {
                  Linking.openURL(protocol.videoUrl);
                }
              }}
              style={({ pressed }) => [{
                marginTop: 8,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.surface,
                padding: 12,
                borderRadius: 10,
                gap: 10,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <MaterialIcons name="play-circle-outline" size={32} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '500' }}>
                  {protocol.videoIsLocal ? 'Video lokal gespeichert' : 'Video abspielen'}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  {protocol.videoIsLocal 
                    ? `Lokal verf\u00fcgbar (${protocol.videoSizeMB || '?'} MB \u2013 zu gro\u00df f\u00fcr Cloud-Upload)`
                    : `Hochgeladen${protocol.videoUploadedAt ? ` am ${new Date(protocol.videoUploadedAt).toLocaleString('de-DE')}` : ''}`
                  }
                </Text>
                {protocol.videoUploadFailed && (
                  <Text style={{ color: colors.warning, fontSize: 11, marginTop: 2 }}>
                    Upload fehlgeschlagen \u2013 lokal gespeichert
                  </Text>
                )}
              </View>
              <MaterialIcons name={protocol.videoIsLocal ? "folder" : "open-in-new"} size={18} color={colors.muted} />
            </Pressable>
          </View>
        )}
        {protocol.videoUploadPending && !protocol.videoUrl && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={colors.warning} />
              <Text style={{ color: colors.warning, fontSize: 13, fontWeight: '500' }}>
                Video wird im Hintergrund hochgeladen...
              </Text>
            </View>
          </View>
        )}

        {/* To-Do List */}
        {todos.length > 0 && (
          <View style={styles.section}>
            <View style={styles.todoHeader}>
              <MaterialIcons name="checklist" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0, marginLeft: 8 }]}>
                Aufgaben ({todos.filter(t => t.done).length}/{todos.length})
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

        {/* Summary */}
        <View style={[styles.section, { marginBottom: 0 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Zusammenfassung</Text>
            </View>
            <Pressable
              onPress={generateSummary}
              disabled={isGeneratingSummary}
              style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.primary + "15", opacity: pressed || isGeneratingSummary ? 0.5 : 1 }]}
            >
              {isGeneratingSummary ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>{summary ? "Neu generieren" : "Generieren"}</Text>
              )}
            </Pressable>
          </View>
          {summary && (
            <View style={{ backgroundColor: colors.primary + "08", borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
              <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>{summary}</Text>
            </View>
          )}
        </View>

        {/* Protocol content */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Protokoll</Text>
            <Pressable
              onPress={isEditing ? saveEdit : startEditing}
              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: isEditing ? colors.success + "15" : colors.surface, borderWidth: 1, borderColor: isEditing ? colors.success : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name={isEditing ? "check" : "edit"} size={14} color={isEditing ? colors.success : colors.muted} />
              <Text style={{ fontSize: 12, color: isEditing ? colors.success : colors.muted }}>{isEditing ? "Speichern" : "Bearbeiten"}</Text>
            </Pressable>
          </View>
          {isEditing ? (
            <TextInput
              value={editedText}
              onChangeText={setEditedText}
              multiline
              style={[styles.protocolText, { color: colors.foreground, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, padding: 12, minHeight: 200, textAlignVertical: "top" }]}
            />
          ) : (
            <Text style={[styles.protocolText, { color: colors.foreground }]}>
              {protocol.protocol}
            </Text>
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

      {/* Action buttons */}
      <View style={[styles.actionsContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
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
      </View>

      {/* Full-screen photo viewer */}
      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedPhoto(null)}
        >
          <View style={styles.modalContent}>
            {selectedPhoto && (
              <Image
                source={{ uri: selectedPhoto }}
                style={styles.modalImage}
                contentFit="contain"
                transition={200}
              />
            )}
            <Pressable
              onPress={() => setSelectedPhoto(null)}
              style={styles.modalCloseButton}
            >
              <MaterialIcons name="close" size={28} color="#FFFFFF" />
            </Pressable>
            {selectedPhoto && (
              <Pressable
                onPress={() => {
                  if (selectedPhoto) sharePhoto(selectedPhoto);
                }}
                style={styles.modalShareButton}
              >
                <MaterialIcons name="share" size={24} color="#FFFFFF" />
                <Text style={styles.modalShareText}>Teilen</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
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
  },
  metaCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 0.5,
    marginBottom: 12,
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 14,
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
    marginBottom: 16,
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
