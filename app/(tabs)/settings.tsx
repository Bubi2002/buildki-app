import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { PROTOCOL_TEMPLATES, type ProtocolTemplate } from "@/shared/templates";
import { useRouter } from "expo-router";
import { useThemeContext, type ThemeMode } from "@/lib/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { isSyncEnabled, setSyncEnabled, getLocalProtocols, markProtocolSynced } from "@/lib/cloud-sync";
import { trpc } from "@/lib/trpc";

type Settings = {
  whatsappNumber: string;
  defaultEmail: string;
  style: "formal" | "informal";
  format: "bullets" | "paragraphs";
  language: string;
  templateId: string;
  autoSend: boolean;
  autoSendTarget: "whatsapp" | "email" | "both";
};

type CompanySettings = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  logoBase64: string;
  logoUri: string;
};

const DEFAULT_SETTINGS: Settings = {
  whatsappNumber: "",
  defaultEmail: "",
  style: "formal",
  format: "bullets",
  language: "de",
  templateId: "freitext",
  autoSend: false,
  autoSendTarget: "whatsapp",
};

const DEFAULT_COMPANY: CompanySettings = {
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  logoBase64: "",
  logoUri: "",
};

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { themeMode, setThemeMode } = useThemeContext();
  const { user, isAuthenticated, logout } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [company, setCompany] = useState<CompanySettings>(DEFAULT_COMPANY);
  const [customTemplates, setCustomTemplates] = useState<ProtocolTemplate[]>([]);
  const [saved, setSaved] = useState(false);
  const [syncEnabled, setSyncEnabledState] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const pushMutation = trpc.sync.pushProtocol.useMutation();

  useEffect(() => {
    isSyncEnabled().then(setSyncEnabledState);
  }, []);

  const toggleSync = async (val: boolean) => {
    setSyncEnabledState(val);
    await setSyncEnabled(val);
    if (val && isAuthenticated) {
      syncNow();
    }
  };

  const syncNow = async () => {
    if (!isAuthenticated) {
      Alert.alert("Login erforderlich", "Bitte melde dich an, um Cloud-Sync zu nutzen.");
      return;
    }
    setSyncing(true);
    try {
      const protocols = await getLocalProtocols();
      const unsynced = protocols.filter((p) => !p.synced);
      for (const p of unsynced) {
        await pushMutation.mutateAsync({
          localId: p.id,
          title: p.title || null,
          transcription: p.transcription || null,
          protocol: p.protocol || null,
          templateName: p.templateName || null,
          templateId: p.templateId || null,
          todos: p.todos ? JSON.stringify(p.todos) : null,
          markers: p.markers ? JSON.stringify(p.markers) : null,
          photos: p.photos ? JSON.stringify(p.photos) : null,
          duration: p.duration || null,
          recordingMode: p.recordingMode || null,
          calendarEventId: p.calendarEventId || null,
          createdAt: p.createdAt,
        });
        await markProtocolSynced(p.id);
      }
      Alert.alert("Sync abgeschlossen", `${unsynced.length} Protokoll(e) synchronisiert.`);
    } catch (error) {
      Alert.alert("Sync-Fehler", "Die Synchronisation konnte nicht abgeschlossen werden.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadCompanySettings();
    loadCustomTemplates();
  }, []);

  const loadCustomTemplates = async () => {
    try {
      const stored = await AsyncStorage.getItem("custom-templates");
      if (stored) setCustomTemplates(JSON.parse(stored));
    } catch (error) {
      console.error("Error loading custom templates:", error);
    }
  };

  const deleteCustomTemplate = async (id: string) => {
    try {
      const updated = customTemplates.filter((t) => t.id !== id);
      await AsyncStorage.setItem("custom-templates", JSON.stringify(updated));
      setCustomTemplates(updated);
      if (settings.templateId === id) {
        updateSetting("templateId", "freitext");
      }
    } catch (error) {
      console.error("Error deleting template:", error);
    }
  };

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem("protokoll-settings");
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const loadCompanySettings = async () => {
    try {
      const stored = await AsyncStorage.getItem("company-settings");
      if (stored) {
        setCompany({ ...DEFAULT_COMPANY, ...JSON.parse(stored) });
      }
    } catch (error) {
      console.error("Error loading company settings:", error);
    }
  };

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem("protokoll-settings", JSON.stringify(settings));
      await AsyncStorage.setItem("company-settings", JSON.stringify(company));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      Alert.alert("Fehler", "Einstellungen konnten nicht gespeichert werden.");
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateCompany = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => {
    setCompany((prev) => ({ ...prev, [key]: value }));
  };

  const pickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;

        // Convert to base64 for PDF embedding
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Save logo to persistent directory
        const logoDir = `${FileSystem.documentDirectory}branding/`;
        const dirInfo = await FileSystem.getInfoAsync(logoDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(logoDir, { intermediates: true });
        }
        const logoPath = `${logoDir}logo.png`;
        await FileSystem.copyAsync({ from: uri, to: logoPath });

        const ext = uri.split(".").pop()?.toLowerCase() || "png";
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
        };
        const mime = mimeMap[ext] || "image/png";

        updateCompany("logoBase64", `data:${mime};base64,${base64}`);
        updateCompany("logoUri", logoPath);
      }
    } catch (error) {
      console.error("Logo picker error:", error);
      Alert.alert("Fehler", "Logo konnte nicht geladen werden.");
    }
  };

  const removeLogo = () => {
    updateCompany("logoBase64", "");
    updateCompany("logoUri", "");
  };

  return (
    <ScreenContainer className="flex-1">
      <View style={styles.headerContainer}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>
          Einstellungen
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Company Branding Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Firmendaten & Logo
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            Erscheint im PDF-Export deiner Protokolle
          </Text>

          {/* Logo Upload */}
          <View style={styles.logoSection}>
            {company.logoBase64 ? (
              <View style={styles.logoPreviewContainer}>
                <Image
                  source={{ uri: company.logoBase64 }}
                  style={styles.logoPreview}
                  contentFit="contain"
                />
                <View style={styles.logoActions}>
                  <Pressable
                    onPress={pickLogo}
                    style={({ pressed }) => [
                      styles.logoActionButton,
                      { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <MaterialIcons name="edit" size={16} color={colors.primary} />
                    <Text style={[styles.logoActionText, { color: colors.primary }]}>Ändern</Text>
                  </Pressable>
                  <Pressable
                    onPress={removeLogo}
                    style={({ pressed }) => [
                      styles.logoActionButton,
                      { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <MaterialIcons name="delete" size={16} color={colors.error} />
                    <Text style={[styles.logoActionText, { color: colors.error }]}>Entfernen</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={pickLogo}
                style={({ pressed }) => [
                  styles.logoUploadButton,
                  { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name="add-photo-alternate" size={32} color={colors.muted} />
                <Text style={[styles.logoUploadText, { color: colors.muted }]}>
                  Firmenlogo hochladen
                </Text>
                <Text style={[styles.logoUploadHint, { color: colors.muted }]}>
                  Empfohlen: PNG, max. 500x200px
                </Text>
              </Pressable>
            )}
          </View>

          {/* Company Name */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <MaterialIcons name="business" size={18} color={colors.primary} />
              <Text style={[styles.labelText, { color: colors.foreground }]}>
                Firmenname
              </Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={company.companyName}
              onChangeText={(v) => updateCompany("companyName", v)}
              placeholder="Meine Firma GmbH"
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* Company Address */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <MaterialIcons name="location-on" size={18} color={colors.primary} />
              <Text style={[styles.labelText, { color: colors.foreground }]}>
                Adresse
              </Text>
            </View>
            <TextInput
              style={[styles.input, styles.multilineInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={company.companyAddress}
              onChangeText={(v) => updateCompany("companyAddress", v)}
              placeholder="Musterstraße 1&#10;12345 Musterstadt"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Company Phone */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <MaterialIcons name="phone" size={18} color={colors.primary} />
              <Text style={[styles.labelText, { color: colors.foreground }]}>
                Telefon
              </Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={company.companyPhone}
              onChangeText={(v) => updateCompany("companyPhone", v)}
              placeholder="+49 123 456789"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* Template Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Protokoll-Vorlage
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            Wähle die Standard-Vorlage für neue Protokolle
          </Text>

          {/* Custom Templates */}
          {customTemplates.length > 0 && (
            <View style={[styles.customTemplateSection, { marginBottom: 12 }]}>
              <Text style={[styles.optionLabel, { color: colors.muted, marginBottom: 8 }]}>Eigene Vorlagen</Text>
              {customTemplates.map((template) => (
                <View key={template.id} style={[styles.customTemplateRow, { borderColor: settings.templateId === template.id ? colors.primary : colors.border, backgroundColor: settings.templateId === template.id ? colors.primary + "15" : colors.surface }]}>
                  <Pressable
                    onPress={() => updateSetting("templateId", template.id)}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}
                  >
                    <MaterialIcons name={template.icon as any} size={22} color={settings.templateId === template.id ? colors.primary : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.templateName, { color: settings.templateId === template.id ? colors.primary : colors.foreground }]}>{template.name}</Text>
                      <Text style={[styles.templateDescription, { color: colors.muted }]} numberOfLines={1}>{template.description}</Text>
                    </View>
                    {settings.templateId === template.id && (
                      <MaterialIcons name="check-circle" size={18} color={colors.primary} />
                    )}
                  </Pressable>
                  <View style={{ flexDirection: "row", gap: 4, paddingRight: 8 }}>
                    <Pressable onPress={() => router.push(`/template-editor?editId=${template.id}` as any)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 6 }]}>
                      <MaterialIcons name="edit" size={18} color={colors.muted} />
                    </Pressable>
                    <Pressable onPress={() => deleteCustomTemplate(template.id)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 6 }]}>
                      <MaterialIcons name="delete" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Create new template button */}
          <Pressable
            onPress={() => router.push("/template-editor" as any)}
            style={({ pressed }) => [
              styles.createTemplateButton,
              { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialIcons name="add" size={20} color={colors.primary} />
            <Text style={[styles.createTemplateText, { color: colors.primary }]}>
              Eigene Vorlage erstellen
            </Text>
          </Pressable>

          <Text style={[styles.optionLabel, { color: colors.muted, marginTop: 16, marginBottom: 8 }]}>Standard-Vorlagen</Text>

          <View style={styles.templateGrid}>
            {PROTOCOL_TEMPLATES.map((template) => (
              <Pressable
                key={template.id}
                onPress={() => updateSetting("templateId", template.id)}
                style={({ pressed }) => [
                  styles.templateCard,
                  {
                    backgroundColor:
                      settings.templateId === template.id
                        ? colors.primary + "15"
                        : colors.surface,
                    borderColor:
                      settings.templateId === template.id
                        ? colors.primary
                        : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View style={styles.templateIconRow}>
                  <MaterialIcons
                    name={template.icon as any}
                    size={24}
                    color={
                      settings.templateId === template.id
                        ? colors.primary
                        : colors.muted
                    }
                  />
                  {settings.templateId === template.id && (
                    <MaterialIcons name="check-circle" size={18} color={colors.primary} />
                  )}
                </View>
                <Text
                  style={[
                    styles.templateName,
                    {
                      color:
                        settings.templateId === template.id
                          ? colors.primary
                          : colors.foreground,
                    },
                  ]}
                >
                  {template.name}
                </Text>
                <Text
                  style={[styles.templateDescription, { color: colors.muted }]}
                  numberOfLines={2}
                >
                  {template.description}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recipients Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Empfänger
          </Text>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <MaterialIcons name="chat" size={18} color="#25D366" />
              <Text style={[styles.labelText, { color: colors.foreground }]}>
                WhatsApp-Nummer
              </Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={settings.whatsappNumber}
              onChangeText={(v) => updateSetting("whatsappNumber", v)}
              placeholder="+49 123 456789"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <MaterialIcons name="email" size={18} color={colors.primary} />
              <Text style={[styles.labelText, { color: colors.foreground }]}>
                Standard E-Mail
              </Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={settings.defaultEmail}
              onChangeText={(v) => updateSetting("defaultEmail", v)}
              placeholder="empfaenger@example.de"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Auto-Send Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Automatischer Versand
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            PDF nach Aufnahme automatisch an Standard-Kontakt senden
          </Text>

          {/* Toggle */}
          <Pressable
            onPress={() => updateSetting("autoSend", !settings.autoSend)}
            style={({ pressed }) => [
              styles.autoSendToggle,
              {
                backgroundColor: settings.autoSend ? colors.primary + "15" : colors.surface,
                borderColor: settings.autoSend ? colors.primary : colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={styles.autoSendToggleContent}>
              <MaterialIcons
                name={settings.autoSend ? "send" : "send"}
                size={22}
                color={settings.autoSend ? colors.primary : colors.muted}
              />
              <View style={styles.autoSendToggleText}>
                <Text style={[styles.autoSendTitle, { color: colors.foreground }]}>
                  Auto-Versand {settings.autoSend ? "aktiv" : "inaktiv"}
                </Text>
                <Text style={[styles.autoSendSubtitle, { color: colors.muted }]}>
                  {settings.autoSend
                    ? "PDF wird nach jeder Aufnahme automatisch gesendet"
                    : "Tippe zum Aktivieren"}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.toggleSwitch,
                { backgroundColor: settings.autoSend ? colors.primary : colors.border },
              ]}
            >
              <View
                style={[
                  styles.toggleKnob,
                  { transform: [{ translateX: settings.autoSend ? 18 : 2 }] },
                ]}
              />
            </View>
          </Pressable>

          {/* Target selection */}
          {settings.autoSend && (
            <View style={styles.autoSendTargets}>
              <Text style={[styles.optionLabel, { color: colors.muted }]}>Senden an:</Text>
              <View style={styles.optionRow}>
                <Pressable
                  onPress={() => updateSetting("autoSendTarget", "whatsapp")}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor: settings.autoSendTarget === "whatsapp" ? "#25D366" : colors.surface,
                      borderColor: settings.autoSendTarget === "whatsapp" ? "#25D366" : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      { color: settings.autoSendTarget === "whatsapp" ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    WhatsApp
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => updateSetting("autoSendTarget", "email")}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor: settings.autoSendTarget === "email" ? colors.primary : colors.surface,
                      borderColor: settings.autoSendTarget === "email" ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      { color: settings.autoSendTarget === "email" ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    E-Mail
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => updateSetting("autoSendTarget", "both")}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor: settings.autoSendTarget === "both" ? colors.primary : colors.surface,
                      borderColor: settings.autoSendTarget === "both" ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      { color: settings.autoSendTarget === "both" ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    Beide
                  </Text>
                </Pressable>
              </View>
              {!settings.whatsappNumber && settings.autoSendTarget !== "email" && (
                <Text style={[styles.autoSendWarning, { color: colors.warning }]}>
                  Bitte WhatsApp-Nummer oben eintragen
                </Text>
              )}
              {!settings.defaultEmail && settings.autoSendTarget !== "whatsapp" && (
                <Text style={[styles.autoSendWarning, { color: colors.warning }]}>
                  Bitte E-Mail-Adresse oben eintragen
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Protocol Style Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Protokoll-Stil
          </Text>

          <Text style={[styles.optionLabel, { color: colors.muted }]}>Schreibstil</Text>
          <View style={styles.optionRow}>
            <Pressable
              onPress={() => updateSetting("style", "formal")}
              style={[
                styles.optionButton,
                {
                  backgroundColor: settings.style === "formal" ? colors.primary : colors.surface,
                  borderColor: settings.style === "formal" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  { color: settings.style === "formal" ? "#FFFFFF" : colors.foreground },
                ]}
              >
                Formell
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateSetting("style", "informal")}
              style={[
                styles.optionButton,
                {
                  backgroundColor: settings.style === "informal" ? colors.primary : colors.surface,
                  borderColor: settings.style === "informal" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  { color: settings.style === "informal" ? "#FFFFFF" : colors.foreground },
                ]}
              >
                Informell
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.optionLabel, { color: colors.muted, marginTop: 16 }]}>Format</Text>
          <View style={styles.optionRow}>
            <Pressable
              onPress={() => updateSetting("format", "bullets")}
              style={[
                styles.optionButton,
                {
                  backgroundColor: settings.format === "bullets" ? colors.primary : colors.surface,
                  borderColor: settings.format === "bullets" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  { color: settings.format === "bullets" ? "#FFFFFF" : colors.foreground },
                ]}
              >
                Stichpunkte
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateSetting("format", "paragraphs")}
              style={[
                styles.optionButton,
                {
                  backgroundColor: settings.format === "paragraphs" ? colors.primary : colors.surface,
                  borderColor: settings.format === "paragraphs" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  { color: settings.format === "paragraphs" ? "#FFFFFF" : colors.foreground },
                ]}
              >
                Fließtext
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Sprache
          </Text>
          <View style={styles.optionRow}>
            <Pressable
              onPress={() => updateSetting("language", "de")}
              style={[
                styles.optionButton,
                {
                  backgroundColor: settings.language === "de" ? colors.primary : colors.surface,
                  borderColor: settings.language === "de" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  { color: settings.language === "de" ? "#FFFFFF" : colors.foreground },
                ]}
              >
                Deutsch
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateSetting("language", "en")}
              style={[
                styles.optionButton,
                {
                  backgroundColor: settings.language === "en" ? colors.primary : colors.surface,
                  borderColor: settings.language === "en" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  { color: settings.language === "en" ? "#FFFFFF" : colors.foreground },
                ]}
              >
                English
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Cloud Sync & Konto */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Cloud & Konto
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            Synchronisiere Protokolle geräteübergreifend
          </Text>

          {/* Login Status */}
          <View style={[styles.syncRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name={isAuthenticated ? "account-circle" : "person-outline"} size={24} color={isAuthenticated ? colors.primary : colors.muted} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.syncLabel, { color: colors.foreground }]}>
                {isAuthenticated ? (user?.name || "Angemeldet") : "Nicht angemeldet"}
              </Text>
              <Text style={[styles.syncHint, { color: colors.muted }]}>
                {isAuthenticated ? "Cloud-Sync verfügbar" : "Anmelden für Cloud-Sync"}
              </Text>
            </View>
            {isAuthenticated ? (
              <Pressable onPress={() => { logout(); setSyncEnabledState(false); setSyncEnabled(false); }} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <Text style={{ color: colors.error, fontWeight: "600", fontSize: 14 }}>Abmelden</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push("/oauth/callback")} style={({ pressed }) => [styles.loginButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}>
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>Anmelden</Text>
              </Pressable>
            )}
          </View>

          {/* Sync Toggle */}
          {isAuthenticated && (
            <>
              <Pressable
                onPress={() => toggleSync(!syncEnabled)}
                style={({ pressed }) => [styles.syncRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
              >
                <MaterialIcons name="cloud-sync" size={24} color={syncEnabled ? colors.primary : colors.muted} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.syncLabel, { color: colors.foreground }]}>Auto-Sync</Text>
                  <Text style={[styles.syncHint, { color: colors.muted }]}>Neue Protokolle automatisch hochladen</Text>
                </View>
                <View style={[styles.toggleTrack, { backgroundColor: syncEnabled ? colors.primary : colors.border }]}>
                  <View style={[styles.toggleThumb, { transform: [{ translateX: syncEnabled ? 18 : 2 }] }]} />
                </View>
              </Pressable>

              <Pressable
                onPress={syncNow}
                disabled={syncing}
                style={({ pressed }) => [styles.syncButton, { backgroundColor: colors.primary, opacity: pressed || syncing ? 0.7 : 1 }]}
              >
                <MaterialIcons name={syncing ? "hourglass-top" : "sync"} size={20} color="#FFFFFF" />
                <Text style={styles.syncButtonText}>{syncing ? "Synchronisiere..." : "Jetzt synchronisieren"}</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Save Button */}
        {/* Darstellung / Dark Mode */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Darstellung
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            Wähle das Erscheinungsbild der App
          </Text>

          <View style={styles.themeOptions}>
            {(["system", "light", "dark"] as ThemeMode[]).map((mode) => {
              const labels = { system: "Automatisch", light: "Hell", dark: "Dunkel" };
              const icons = { system: "brightness-auto", light: "light-mode", dark: "dark-mode" };
              const isActive = themeMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setThemeMode(mode)}
                  style={({ pressed }) => [
                    styles.themeOption,
                    {
                      backgroundColor: isActive ? colors.primary + "15" : colors.surface,
                      borderColor: isActive ? colors.primary : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={icons[mode] as any}
                    size={24}
                    color={isActive ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      { color: isActive ? colors.primary : colors.foreground },
                    ]}
                  >
                    {labels[mode]}
                  </Text>
                  {isActive && (
                    <MaterialIcons name="check-circle" size={16} color={colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={saveSettings}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: saved ? colors.success : colors.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <MaterialIcons
            name={saved ? "check" : "save"}
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.saveButtonText}>
            {saved ? "Gespeichert!" : "Einstellungen speichern"}
          </Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    marginBottom: 12,
  },
  logoSection: {
    marginBottom: 16,
  },
  logoPreviewContainer: {
    alignItems: "center",
    gap: 12,
  },
  logoPreview: {
    width: "100%",
    height: 80,
    borderRadius: 8,
  },
  logoActions: {
    flexDirection: "row",
    gap: 12,
  },
  logoActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  logoActionText: {
    fontSize: 13,
    fontWeight: "500",
  },
  logoUploadButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    gap: 6,
  },
  logoUploadText: {
    fontSize: 14,
    fontWeight: "500",
  },
  logoUploadHint: {
    fontSize: 11,
  },
  templateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  templateCard: {
    width: "48%",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 100,
  },
  templateIconRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  templateName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  templateDescription: {
    fontSize: 11,
    lineHeight: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  labelText: {
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    gap: 10,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  customTemplateSection: {
    gap: 8,
  },
  customTemplateRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  createTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginBottom: 8,
  },
  createTemplateText: {
    fontSize: 14,
    fontWeight: "600",
  },
  themeOptions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  themeOption: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  autoSendToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  autoSendToggleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  autoSendToggleText: {
    flex: 1,
  },
  autoSendTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  autoSendSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  autoSendTargets: {
    gap: 8,
  },
  autoSendWarning: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 6,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  syncLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  syncHint: {
    fontSize: 12,
    marginTop: 2,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 4,
  },
  syncButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  loginButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
});
