import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTeamContacts, saveTeamContact, deleteTeamContact, updateTeamContact, TeamContact } from "@/lib/team-contacts";
import { getPdfBranding, savePdfBranding, type PdfBranding } from "@/lib/pdf-branding-store";
import { getSpeakerProfiles, deleteSpeakerProfile, SpeakerProfile } from "@/lib/speaker-names";
import { getVoiceProfiles, deleteVoiceProfile, VoiceProfile } from "@/lib/voice-profiles";
// delegations removed from settings
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { PROTOCOL_TEMPLATES, type ProtocolTemplate } from "@/shared/templates";
import { localizedLabel, templateNameKey, templateDescKey } from "@/lib/template-i18n";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useTranslation } from "@/lib/language-provider";
import { useThemeContext } from "@/lib/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { isSyncEnabled, setSyncEnabled, getLocalProtocols, markProtocolSynced, executeFullSync } from "@/lib/cloud-sync";
import { startOAuthLogin } from "@/constants/oauth";
import { trpc } from "@/lib/trpc";
import { PrivacyChoicesSection } from "@/components/privacy-choices-section";
import { getConsentRequiredMessage, isConsentGiven } from "@/lib/privacy-consent";
import {
  loadCustomProtocolTemplates,
  removeCustomProtocolTemplate,
} from "@/lib/protocol-template-store";
import {
  getBiometricStatus,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
  getBiometricLabel,
  type BiometricStatus,
} from "@/lib/biometric-lock";

type Settings = {
  whatsappNumber: string;
  defaultEmail: string;
  style: "formal" | "informal";
  format: "bullets" | "paragraphs";
  language: string;
  templateId: string;
  autoSend: boolean;
  autoSendTarget: "whatsapp" | "email" | "both";
  translateEnabled: boolean;
  targetLanguage: string;
  remindersEnabled: boolean;
  reminderHoursBefore: number;
  audioQuality: "standard" | "high" | "maximum";
  autoAnalyzePhotos: boolean;
};

type CompanySettings = {
  companyName: string;
  // companyAddress stays as the single composed address line block so every
  // existing PDF generator that reads it keeps working. It is derived from the
  // structured fields below on save (falls back to its legacy value).
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  logoBase64: string;
  logoUri: string;
  // --- structured professional profile (all optional, lossless additions) ---
  legalForm: string;        // Namenszusatz / Rechtsform (z. B. GmbH, Architekturbüro)
  contactPerson: string;    // Ansprechpartner / Inhaber
  contactTitle: string;     // Titel / Funktion
  street: string;           // Straße
  houseNumber: string;      // Hausnummer
  zip: string;              // PLZ
  city: string;             // Ort
  country: string;          // Land
  mobile: string;           // Mobil
  registerCourt: string;    // Registergericht
  registerNumber: string;   // Registernummer (HRB …)
  vatId: string;            // USt-IdNr.
  legalNote: string;        // rechtlicher Zusatz / Pflichtangaben
  defaultEditor: string;    // Standardbearbeiter
  emailSignature: string;   // E-Mail-Signatur
  signatureUri: string;     // optionale Unterschrift (Dateipfad)
  signatureBase64: string;  // optionale Unterschrift (data-URI für PDF)
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
  translateEnabled: false,
  targetLanguage: "en",
  remindersEnabled: true,
  reminderHoursBefore: 24,
  audioQuality: "high",
  autoAnalyzePhotos: false,
};

const DEFAULT_COMPANY: CompanySettings = {
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",
  logoBase64: "",
  logoUri: "",
  legalForm: "",
  contactPerson: "",
  contactTitle: "",
  street: "",
  houseNumber: "",
  zip: "",
  city: "",
  country: "",
  mobile: "",
  registerCourt: "",
  registerNumber: "",
  vatId: "",
  legalNote: "",
  defaultEditor: "",
  emailSignature: "",
  signatureUri: "",
  signatureBase64: "",
};

// Build the single-line/block address from the structured fields. Used so the
// legacy `companyAddress` (read by every PDF generator) always reflects the
// structured data. Returns "" when nothing structured is filled.
function composeCompanyAddress(c: Partial<CompanySettings>): string {
  const line1 = [c.street, c.houseNumber].map((s) => (s || "").trim()).filter(Boolean).join(" ");
  const line2 = [c.zip, c.city].map((s) => (s || "").trim()).filter(Boolean).join(" ");
  const parts = [line1, line2, (c.country || "").trim()].filter(Boolean);
  return parts.join("\n");
}

// Best-effort split of a legacy single-line/block address into structured
// fields (display convenience only). Conservative: on any doubt it leaves the
// structured fields empty — the composed value always falls back to the
// original string, so no data is ever lost.
function parseLegacyAddress(addr: string): Partial<CompanySettings> {
  const out: Partial<CompanySettings> = {};
  if (!addr || !addr.trim()) return out;
  const lines = addr
    .split(/\r?\n|,/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 1) return out;
  // Find a "PLZ Ort" line (4-5 digit postal code followed by a place name).
  const zipIdx = lines.findIndex((l) => /^\d{4,5}\s+\S/.test(l));
  if (zipIdx >= 0) {
    const m = lines[zipIdx].match(/^(\d{4,5})\s+(.+)$/);
    if (m) {
      out.zip = m[1];
      out.city = m[2];
    }
  }
  // The street line = first line that is not the zip line and has a trailing number.
  const streetLine = lines.find((l, i) => i !== zipIdx && /\d/.test(l));
  if (streetLine) {
    const m = streetLine.match(/^(.*?)[\s]+(\d+\s*[a-zA-Z]?)$/);
    if (m) {
      out.street = m[1].trim();
      out.houseNumber = m[2].trim();
    } else {
      out.street = streetLine;
    }
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeWebsite(w: string): string {
  const t = (w || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return t; // keep as typed (e.g. www.firma.de); normalization for links happens at render
}

// A labelled text input used throughout the company profile mask. Keeps the
// look consistent and supports inline validation + optional two-column layout.
function LabeledInput({
  colors,
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
  invalid,
  hint,
  optional,
  containerStyle,
}: {
  colors: any;
  icon?: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  invalid?: boolean;
  hint?: string;
  optional?: boolean;
  containerStyle?: any;
}) {
  return (
    <View style={[styles.inputGroup, containerStyle]}>
      <View style={styles.inputLabel}>
        {icon ? <MaterialIcons name={icon as any} size={16} color={colors.primary} /> : null}
        <Text style={[styles.labelText, { color: colors.foreground }]}>
          {label}
          {optional ? <Text style={{ color: colors.muted, fontWeight: "400" }}>  ·  optional</Text> : null}
        </Text>
      </View>
      <TextInput
        style={[
          styles.input,
          multiline ? styles.multilineInput : null,
          { color: colors.foreground, borderColor: invalid ? colors.error : colors.border, backgroundColor: colors.surface },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={!!multiline}
      />
      {hint ? (
        <Text style={{ fontSize: 11, color: invalid ? colors.error : colors.muted, marginTop: 4 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

// Small segmented control (e.g. logo size / position).
function Segmented({
  colors,
  value,
  options,
  onChange,
}: {
  colors: any;
  value: string;
  options: { v: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: "hidden" }}>
      {options.map((o, i) => {
        const active = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            style={{
              flex: 1,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: active ? colors.primary : colors.surface,
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: active ? "700" : "500", color: active ? "#fff" : colors.foreground }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Group heading inside a section.
function GroupHeading({ colors, children }: { colors: any; children: any }) {
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: colors.muted,
        marginTop: 18,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

const BRAND_COLORS = ["#1E3A5F", "#0F2744", "#334155", "#1F6F54", "#7C2D12", "#4C1D95", "#111827", "#B91C1C"];

function BiometricLockSection({ colors }: { colors: any }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<BiometricStatus | null>(null);

  useEffect(() => {
    (async () => {
      const biometricStatus = await getBiometricStatus();
      setStatus(biometricStatus);
      const isEnabled = await isBiometricLockEnabled();
      setEnabled(isEnabled);
    })();
  }, []);

  const toggle = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    await setBiometricLockEnabled(newVal);
  };

  if (!status || !status.available || !status.enrolled) {
    // Don't show section if biometrics not available
    // But on web we show it as informational
    if (Platform.OS === 'web') {
      return (
        <View style={biometricStyles.section}>
          <Text style={[biometricStyles.sectionTitle, { color: colors.foreground }]}>
            {t('settings_biometric_lock_title' as any)}
          </Text>
          <Text style={[biometricStyles.sectionDescription, { color: colors.muted }]}>
            {t('settings_biometric_web_desc' as any)}
          </Text>
          <View style={[biometricStyles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="fingerprint" size={24} color={colors.muted} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[biometricStyles.label, { color: colors.foreground }]}>{t('appsperre')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t('nur_auf_geraeten_mit')}</Text>
            </View>
            <View style={[biometricStyles.toggleTrack, { backgroundColor: enabled ? colors.primary : colors.border }]}>
              <View style={[biometricStyles.toggleThumb, { transform: [{ translateX: enabled ? 18 : 2 }] }]} />
            </View>
          </View>
        </View>
      );
    }
    return null;
  }

  const label = getBiometricLabel(status.type);

  return (
    <View style={biometricStyles.section}>
      <Text style={[biometricStyles.sectionTitle, { color: colors.foreground }]}>
        {t('settings_biometric_lock_title' as any)}
      </Text>
      <Text style={[biometricStyles.sectionDescription, { color: colors.muted }]}>
        {label} {t('settings_biometric_use_to_unlock' as any)}
      </Text>

      <Pressable
        onPress={toggle}
        style={({ pressed }) => [
          biometricStyles.row,
          {
            backgroundColor: enabled ? colors.primary + '15' : colors.surface,
            borderColor: enabled ? colors.primary : colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <MaterialIcons
          name={status.type === 'face' ? 'face' : 'fingerprint'}
          size={24}
          color={enabled ? colors.primary : colors.muted}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[biometricStyles.label, { color: colors.foreground }]}>
            {t('settings_biometric_lock_with' as any)} {label}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {enabled ? t('settings_biometric_active' as any) : t('settings_tap_to_activate' as any)}
          </Text>
        </View>
        <View style={[biometricStyles.toggleTrack, { backgroundColor: enabled ? colors.primary : colors.border }]}>
          <View style={[biometricStyles.toggleThumb, { transform: [{ translateX: enabled ? 18 : 2 }] }]} />
        </View>
      </Pressable>
    </View>
  );
}

const biometricStyles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  sectionDescription: { fontSize: 13, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
  },
  label: { fontSize: 15, fontWeight: '500' },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
});

const ANNOTATION_STORAGE_KEY = 'annotation-custom-templates';

function AnnotationTemplatesSection({ colors }: { colors: any }) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<string[]>([]);
  const [newTemplate, setNewTemplate] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  async function loadTemplates() {
    try {
      const data = await AsyncStorage.getItem(ANNOTATION_STORAGE_KEY);
      if (data) setTemplates(JSON.parse(data));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadTemplates();
    });
  }, []);

  const saveTemplates = async (updated: string[]) => {
    setTemplates(updated);
    await AsyncStorage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify(updated));
  };

  const addTemplate = () => {
    const trimmed = newTemplate.trim();
    if (!trimmed || templates.includes(trimmed)) return;
    saveTemplates([...templates, trimmed]);
    setNewTemplate('');
  };

  const removeTemplate = (index: number) => {
    const updated = templates.filter((_, i) => i !== index);
    saveTemplates(updated);
  };

  return (
    <View style={annotStyles.section}>
      <Text style={[annotStyles.sectionTitle, { color: colors.foreground }]}>
        {t('settings_annotation_templates_title' as any)}
      </Text>
      <Text style={[annotStyles.sectionDescription, { color: colors.muted }]}>
        {t('settings_annotation_templates_desc' as any)}
      </Text>

      {/* Existing templates */}
      {templates.length > 0 && (
        <View style={annotStyles.chipContainer}>
          {templates.map((tmpl, i) => (
            <View key={i} style={[annotStyles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[annotStyles.chipText, { color: colors.foreground }]}>{tmpl}</Text>
              {isEditing && (
                <Pressable onPress={() => removeTemplate(i)} style={{ padding: 2 }}>
                  <MaterialIcons name="close" size={14} color={colors.error} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Add new template */}
      <View style={[annotStyles.addRow, { borderColor: colors.border }]}>
        <TextInput
          value={newTemplate}
          onChangeText={setNewTemplate}
          placeholder={t('neue_vorlage')}
          placeholderTextColor={colors.muted}
          style={[annotStyles.addInput, { color: colors.foreground, backgroundColor: colors.surface }]}
          returnKeyType="done"
          onSubmitEditing={addTemplate}
        />
        <Pressable
          onPress={addTemplate}
          disabled={!newTemplate.trim()}
          style={({ pressed }) => [
            annotStyles.addBtn,
            { backgroundColor: newTemplate.trim() ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialIcons name="add" size={20} color="#FFF" />
        </Pressable>
      </View>

      {templates.length > 0 && (
        <Pressable
          onPress={() => setIsEditing(!isEditing)}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, marginTop: 8 }]}
        >
          <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '500' }}>
            {isEditing ? t('done') : t('edit')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const annotStyles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  sectionDescription: { fontSize: 13, marginBottom: 12 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 0, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '500' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1, borderRadius: 0, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addBtn: { width: 38, height: 38, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
});

const WATERMARK_STORAGE_KEY = 'watermark-settings';

function WatermarkSection({ colors }: { colors: any }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem(WATERMARK_STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data);
          setEnabled(parsed.enabled || false);
          setText(parsed.text || '');
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const save = async (newEnabled: boolean, newText: string) => {
    setEnabled(newEnabled);
    setText(newText);
    await AsyncStorage.setItem(WATERMARK_STORAGE_KEY, JSON.stringify({ enabled: newEnabled, text: newText }));
  };

  return (
    <View style={wmStyles.section}>
      <Text style={[wmStyles.sectionTitle, { color: colors.foreground }]}>
        {t('settings_watermark_title' as any)}
      </Text>
      <Text style={[wmStyles.sectionDescription, { color: colors.muted }]}>
        {t('settings_watermark_desc' as any)}
      </Text>

      <View style={[wmStyles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="branding-watermark" size={22} color={enabled ? colors.primary : colors.muted} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[wmStyles.label, { color: colors.foreground }]}>{t('wasserzeichen_aktiv')}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>{t('wird_diagonal_ueber_jede')}</Text>
        </View>
        <Pressable onPress={() => save(!enabled, text)} style={{ padding: 4 }}>
          <View style={[wmStyles.toggleTrack, { backgroundColor: enabled ? colors.primary : colors.border }]}>
            <View style={[wmStyles.toggleThumb, { transform: [{ translateX: enabled ? 18 : 2 }] }]} />
          </View>
        </Pressable>
      </View>

      {enabled && (
        <View style={{ marginTop: 12 }}>
          <TextInput
            value={text}
            onChangeText={(v) => save(true, v)}
            placeholder={t('settings_watermark_placeholder' as any)}
            placeholderTextColor={colors.muted}
            style={[wmStyles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
            returnKeyType="done"
          />
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
            {t('settings_watermark_tip' as any)}
          </Text>
        </View>
      )}
    </View>
  );
}

const wmStyles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  sectionDescription: { fontSize: 13, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 0, borderWidth: 1 },
  label: { fontSize: 15, fontWeight: '500' },
  toggleTrack: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  input: { borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1 },
});

function TaskReminderSection({ colors }: { colors: any }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(9);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [hourText, setHourText] = useState("09");
  const [minuteText, setMinuteText] = useState("00");
  const [permissionGranted, setPermissionGranted] = useState(false);

  async function loadSettings() {
    try {
      const data = await AsyncStorage.getItem("task-reminder-settings");
      if (data) {
        const s = JSON.parse(data);
        setEnabled(s.enabled ?? false);
        setReminderHour(s.reminderHour ?? 9);
        setReminderMinute(s.reminderMinute ?? 0);
        setHourText(String(s.reminderHour ?? 9).padStart(2, '0'));
        setMinuteText(String(s.reminderMinute ?? 0).padStart(2, '0'));
      }
      // Check permission status
      if (Platform.OS !== "web") {
        const Notif = require("expo-notifications");
        const { status } = await Notif.getPermissionsAsync();
        setPermissionGranted(status === "granted");
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadSettings();
    });
  }, []);

  const toggleEnabled = async (val: boolean) => {
    setEnabled(val);
    if (val && Platform.OS !== "web") {
      const Notif = require("expo-notifications");
      const { status } = await Notif.requestPermissionsAsync();
      setPermissionGranted(status === "granted");
      if (status !== "granted") {
        Alert.alert(t('alert_berechtigung_verweigert'), t('msg_bitte_erlaube_benachrichtigungen_in_den'));
        setEnabled(false);
        return;
      }
    }
    const settings = { enabled: val, reminderHour, reminderMinute: 0, daysBeforeDue: 1 };
    await AsyncStorage.setItem("task-reminder-settings", JSON.stringify(settings));
    if (val && Platform.OS !== "web") {
      const { scheduleTaskReminders } = require("@/lib/task-reminders");
      await scheduleTaskReminders();
    }
  };

  const changeTime = async (hour: number, minute: number) => {
    setReminderHour(hour);
    setReminderMinute(minute);
    const settings = { enabled, reminderHour: hour, reminderMinute: minute, daysBeforeDue: 1 };
    await AsyncStorage.setItem("task-reminder-settings", JSON.stringify(settings));
    if (enabled && Platform.OS !== "web") {
      const { scheduleTaskReminders } = require("@/lib/task-reminders");
      await scheduleTaskReminders();
    }
  };

  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>{t('aufgabenerinnerungen')}</Text>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>{t('benachrichtigungen_bei_faelligen_aufgabe')}</Text>

      <Pressable
        onPress={() => toggleEnabled(!enabled)}
        style={({ pressed }) => [{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          padding: 14, borderRadius: 0, borderWidth: 1,
          backgroundColor: colors.surface, borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <MaterialIcons name="notifications" size={20} color={enabled ? colors.primary : colors.muted} />
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.foreground }}>{t('erinnerungen_aktiv')}</Text>
        </View>
        <View style={[{ width: 44, height: 26, borderRadius: 13, justifyContent: "center" }, { backgroundColor: enabled ? colors.primary : colors.border }]}>
          <View style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" }, { marginLeft: enabled ? 20 : 2 }]} />
        </View>
      </Pressable>

      {enabled && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>{t('erinnerungszeit')}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={hourText}
              onChangeText={(t) => setHourText(t.replace(/[^0-9]/g, '').slice(0, 2))}
              onBlur={() => {
                const h = Math.min(23, Math.max(0, parseInt(hourText) || 0));
                setHourText(String(h).padStart(2, '0'));
                changeTime(h, reminderMinute);
              }}
              keyboardType="number-pad"
              maxLength={2}
              style={{ width: 50, textAlign: 'center', fontSize: 18, fontWeight: '600', color: colors.foreground, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 10 }}
            />
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>:</Text>
            <TextInput
              value={minuteText}
              onChangeText={(t) => setMinuteText(t.replace(/[^0-9]/g, '').slice(0, 2))}
              onBlur={() => {
                const m = Math.min(59, Math.max(0, parseInt(minuteText) || 0));
                setMinuteText(String(m).padStart(2, '0'));
                changeTime(reminderHour, m);
              }}
              keyboardType="number-pad"
              maxLength={2}
              style={{ width: 50, textAlign: 'center', fontSize: 18, fontWeight: '600', color: colors.foreground, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 10 }}
            />
            <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 8 }}>{t('uhr')}</Text>
          </View>
          {Platform.OS !== "web" && !permissionGranted && (
            <Text style={{ fontSize: 11, color: colors.warning, marginTop: 8 }}>{t('settings_notif_permission_missing' as any)}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function FeatureTogglesSection({ colors }: { colors: any }) {
  const { t } = useTranslation();
  const [toggles, setToggles] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);

  async function loadToggles() {
    const { getFeatureToggles } = require("@/lib/feature-toggles");
    const t = await getFeatureToggles();
    setToggles([...t]);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadToggles();
    });
  }, []);

  const handleToggle = async (key: string, enabled: boolean) => {
    const { setFeatureEnabled } = require("@/lib/feature-toggles");
    await setFeatureEnabled(key, enabled);
    await loadToggles();
  };

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const t of toggles) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  }

  const enabledCount = toggles.filter(t => t.enabled).length;

  return (
    <View style={{ marginBottom: 28 }}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: pressed ? 0.7 : 1 }]}
      >
        <View>
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>{t('features_verwalten')}</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>{enabledCount} {t('settings_of' as any)} {toggles.length} {t('settings_active_lower' as any)}</Text>
        </View>
        <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={24} color={colors.muted} />
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 16 }}>
          {Object.entries(grouped).map(([category, items]) => (
            <View key={category} style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{category}</Text>
              {items.map((toggle: any) => (
                <Pressable
                  key={toggle.key}
                  onPress={() => handleToggle(toggle.key, !toggle.enabled)}
                  style={({ pressed }) => [{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 0, marginBottom: 4,
                    backgroundColor: toggle.enabled ? colors.surface : "transparent",
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{toggle.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{toggle.description}</Text>
                  </View>
                  <View style={[{ width: 44, height: 26, borderRadius: 13, justifyContent: "center" }, { backgroundColor: toggle.enabled ? colors.primary : colors.border }]}>
                    <View style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" }, { marginLeft: toggle.enabled ? 20 : 2 }]} />
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 4 }}>{t('deaktivierte_features_werden_in')}</Text>
        </View>
      )}
    </View>
  );
}

function BackupSection({ colors }: { colors: any }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ protocolCount: 0, projectCount: 0, totalSize: "0 KB" });
  const [loading, setLoading] = useState(false);

  async function loadStats() {
    const { getBackupStats } = require("@/lib/backup");
    const s = await getBackupStats();
    setStats(s);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadStats();
    });
  }, []);

  const handleBackup = async () => {
    setLoading(true);
    try {
      const { createBackup } = require("@/lib/backup");
      await createBackup();
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const { restoreBackup } = require("@/lib/backup");
      await restoreBackup();
      await loadStats();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>{t('datensicherung')}</Text>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
        {stats.protocolCount} {t('settings_protocols' as any)}, {stats.projectCount} {t('settings_projects' as any)} ({stats.totalSize})
      </Text>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable
          onPress={handleBackup}
          disabled={loading}
          style={({ pressed }) => [{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            paddingVertical: 12, borderRadius: 0, backgroundColor: colors.primary,
            opacity: pressed || loading ? 0.7 : 1,
          }]}
        >
          <MaterialIcons name="backup" size={18} color="#fff" />
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>{t('backup')}</Text>
        </Pressable>

        <Pressable
          onPress={handleRestore}
          disabled={loading}
          style={({ pressed }) => [{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            paddingVertical: 12, borderRadius: 0, borderWidth: 1,
            borderColor: colors.border, backgroundColor: colors.surface,
            opacity: pressed || loading ? 0.7 : 1,
          }]}
        >
          <MaterialIcons name="restore" size={18} color={colors.foreground} />
          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('project_unarchive')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const settingsParams = useLocalSearchParams<{ section?: string }>();
  // Settings home = 6 category cards; tapping one opens that category's masks.
  const [cat, setCat] = useState<string | null>((settingsParams.section as string) || null);
  const inCat = (c: string) => cat === c;
  // When the user jumps in from "Mehr" with ?section=… while this tab is already
  // mounted, the initial state above won't re-run — sync on param change only
  // (not on every render, so manually backing out to the overview still works).
  const lastSectionParam = useRef<string | undefined>((settingsParams.section as string) || undefined);
  useEffect(() => {
    const s = (settingsParams.section as string) || undefined;
    if (s !== lastSectionParam.current) {
      lastSectionParam.current = s;
      if (s) setCat(s);
    }
  }, [settingsParams.section]);
  const { setThemeMode } = useThemeContext();
  // Force dark mode always
  useEffect(() => { setThemeMode("dark"); }, []);
  const { user, isAuthenticated, logout } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [company, setCompany] = useState<CompanySettings>(DEFAULT_COMPANY);
  // Single source for presentation choices (Firmenfarbe / Logo) — loaded from
  // and saved back to the PDF-branding store so nothing diverges.
  const [branding, setBranding] = useState<PdfBranding | null>(null);
  const [showOptionalLegal, setShowOptionalLegal] = useState(false);
  // Becomes true once the user edits any structured address field; only then do
  // we let the composed address replace a legacy free-form companyAddress.
  const [addressDirty, setAddressDirty] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<ProtocolTemplate[]>([]);
  const [templateFeedback, setTemplateFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const [syncEnabled, setSyncEnabledState] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const pushMutation = trpc.sync.pushProtocol.useMutation();

  useEffect(() => {
    isSyncEnabled().then(setSyncEnabledState);
  }, []);

  const toggleSync = async (val: boolean) => {
    if (val && !(await isConsentGiven("cloudSync"))) {
      Alert.alert(t('settings_cloud_sync_disabled' as any), getConsentRequiredMessage("cloudSync"));
      return;
    }
    setSyncEnabledState(val);
    await setSyncEnabled(val);
    if (val && isAuthenticated) {
      syncNow();
    }
  };

  const syncNow = async () => {
    if (!(await isConsentGiven("cloudSync"))) {
      Alert.alert(t('settings_cloud_sync_disabled' as any), getConsentRequiredMessage("cloudSync"));
      return;
    }
    if (!isAuthenticated) {
      Alert.alert(t('alert_login_erforderlich'), t('msg_bitte_melde_dich_an_um'));
      return;
    }
    setSyncing(true);
    try {
      // 1. Sync protocols (legacy)
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
      // 2. Full sync (defects + projects) via new unified cloud-sync
      const result = await executeFullSync(trpc);
      const totalPushed = result.pushed.defects + result.pushed.projects;
      const totalPulled = result.pulled.defects + result.pulled.projects;
      const totalConflicts = result.conflicts.defects + result.conflicts.projects;
      const totalSynced = unsynced.length + totalPushed + totalPulled;
      Alert.alert(t('settings_sync_complete' as any), `${totalSynced} ${t('settings_sync_elements_synced' as any)} (${totalConflicts} ${t('settings_sync_conflicts_resolved' as any)}`);
    } catch  {
      Alert.alert(t('alert_sync_fehler'), t('msg_die_synchronisation_konnte_nicht_abgeschlossen'));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadCompanySettings();
    loadCustomTemplates();
  }, []);

  // Reload custom templates + the shared branding when the screen is focused
  // (e.g. returning from the template editor or a child settings screen), so
  // presentation/dispatch controls never show a stale value edited elsewhere.
  useFocusEffect(
    useCallback(() => {
      loadCustomTemplates();
      getPdfBranding().then(setBranding).catch(() => {});
    }, [])
  );

  async function loadCustomTemplates() {
    try {
      setCustomTemplates(await loadCustomProtocolTemplates());
    } catch (error) {
      console.error("Error loading custom templates:", error);
      setCustomTemplates([]);
    }
  }

  const deleteCustomTemplate = async (id: string) => {
    try {
      const updated = await removeCustomProtocolTemplate(id);
      setCustomTemplates(updated);
      if (settings.templateId === id) {
        const updatedSettings = { ...settings, templateId: "freitext" };
        setSettings(updatedSettings);
        await AsyncStorage.setItem("protokoll-settings", JSON.stringify(updatedSettings));
      }
    } catch (error) {
      console.error("Error deleting template:", error);
    }
  };

  async function loadSettings() {
    try {
      const stored = await AsyncStorage.getItem("protokoll-settings");
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  }

  // Mirror the shared company identity into the PDF-branding store so both the
  // classic protocol PDF and the premium reports use one set of company data.
  async function mirrorCompanyToBranding(c: CompanySettings) {
    // c.companyAddress is already the authoritative address (composed by the
    // caller only once the user edited the structured fields) — never recompute
    // here, so a legacy free-form address is preserved verbatim until edited.
    await savePdfBranding({
      companyName: c.companyName,
      companyAddress: c.companyAddress,
      companyPhone: c.companyPhone,
      companyEmail: c.companyEmail,
      companyWebsite: c.companyWebsite,
      logoUri: c.logoUri || null,
      // extended identity so the unified PDF template can render a full header
      companyLegalForm: c.legalForm,
      companyContactPerson: c.contactPerson,
      companyContactTitle: c.contactTitle,
      companyMobile: c.mobile,
      companyRegisterCourt: c.registerCourt,
      companyRegisterNumber: c.registerNumber,
      companyVatId: c.vatId,
      companyLegalNote: c.legalNote,
      defaultEditor: c.defaultEditor,
    });
  }

  async function loadCompanySettings() {
    try {
      const stored = await AsyncStorage.getItem("company-settings");
      const base: CompanySettings = { ...DEFAULT_COMPANY, ...(stored ? JSON.parse(stored) : {}) };
      // One-time unify: pull any fields that previously only lived in the
      // PDF-branding store (e.g. email/website) so nothing is lost.
      const branding = await getPdfBranding();
      const merged: CompanySettings = {
        ...base,
        companyName: base.companyName || branding.companyName || "",
        companyAddress: base.companyAddress || branding.companyAddress || "",
        companyPhone: base.companyPhone || branding.companyPhone || "",
        companyEmail: base.companyEmail || branding.companyEmail || "",
        companyWebsite: base.companyWebsite || branding.companyWebsite || "",
        logoBase64: base.logoBase64 || "",
        logoUri: base.logoUri || branding.logoUri || "",
      };
      // Convenience: if the structured address fields are still empty but we
      // have a legacy one-line address, split it best-effort for display. The
      // original string is kept, so composition always has a safe fallback.
      const structuredEmpty = !merged.street && !merged.zip && !merged.city;
      if (structuredEmpty && merged.companyAddress) {
        Object.assign(merged, parseLegacyAddress(merged.companyAddress));
      }
      setCompany(merged);
      setBranding(branding);
      await AsyncStorage.setItem("company-settings", JSON.stringify(merged));
      await mirrorCompanyToBranding(merged);
    } catch (error) {
      console.error("Error loading company settings:", error);
    }
  }

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem("protokoll-settings", JSON.stringify(settings));
      // Keep the composed one-line address in sync with the structured fields
      // so every PDF generator that reads companyAddress shows current data.
      const composedAddr = addressDirty
        ? composeCompanyAddress(company) || company.companyAddress
        : company.companyAddress;
      const companyToSave: CompanySettings = { ...company, companyAddress: composedAddr };
      await AsyncStorage.setItem("company-settings", JSON.stringify(companyToSave));
      await mirrorCompanyToBranding(companyToSave);
      // Persist presentation choices (Firmenfarbe, Logo) in the single branding source.
      if (branding) {
        await savePdfBranding({
          accentColor: branding.accentColor,
          logoSize: branding.logoSize,
          logoPosition: branding.logoPosition,
          // dispatch (keep legacy autoSendEmail flag in sync with the 3-state mode)
          autoSendMode: branding.autoSendMode,
          autoSendEmail: branding.autoSendMode === "auto",
          defaultEmailAddress: branding.defaultEmailAddress,
        });
      }

      // Schedule or cancel reminders based on settings
      if (settings.remindersEnabled) {
        const { requestNotificationPermissions, scheduleTaskReminders } = await import("@/lib/reminders");
        const granted = await requestNotificationPermissions();
        if (granted) {
          await scheduleTaskReminders(settings.reminderHoursBefore);
        }
      } else {
        const { cancelAllReminders } = await import("@/lib/reminders");
        await cancelAllReminders();
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_einstellungen_konnten_nicht_gespeichert_werden'));
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };


  const selectProtocolTemplate = async (template: ProtocolTemplate) => {
    const updated = { ...settings, templateId: template.id };
    setSettings(updated);
    await AsyncStorage.setItem("protokoll-settings", JSON.stringify(updated));
    setTemplateFeedback(`„${template.name}“ ${t('settings_now_default_template' as any)}`);
    setSaved(true);
    setTimeout(() => {
      setTemplateFeedback("");
      setSaved(false);
    }, 2400);
  };

  const openTemplateEditor = () => {
    setTemplateFeedback(t('settings_template_editor_opening' as any));
    router.push({ pathname: "/template-editor" } as any);
  };

  const updateCompany = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => {
    setCompany((prev) => ({ ...prev, [key]: value }));
  };

  // Updater for the structured address fields: marks the address dirty so the
  // composed value is persisted (and the legacy string is replaced) on save.
  const updateCompanyAddr = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => {
    setAddressDirty(true);
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

        // Normalize orientation using ImageManipulator (fixes rotated/skewed logos from iOS)
        let normalizedUri = uri;
        try {
          if (Platform.OS !== "web") {
            const manipResult = await ImageManipulator.manipulateAsync(
              uri,
              [], // no transforms needed - manipulateAsync auto-applies EXIF orientation
              { compress: 0.9, format: ImageManipulator.SaveFormat.PNG }
            );
            normalizedUri = manipResult.uri;
          }
        } catch (e) {
          console.warn("Logo orientation normalization failed, using original:", e);
        }

        // Convert to base64 for PDF embedding
        const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Save logo to persistent directory
        const logoDir = `${FileSystem.documentDirectory}branding/`;
        const dirInfo = await FileSystem.getInfoAsync(logoDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(logoDir, { intermediates: true });
        }
        const logoPath = `${logoDir}logo.png`;
        await FileSystem.copyAsync({ from: normalizedUri, to: logoPath });

        // Always use PNG mime since we normalized to PNG format
        const mime = "image/png";

        updateCompany("logoBase64", `data:${mime};base64,${base64}`);
        updateCompany("logoUri", logoPath);
      }
    } catch (error) {
      console.error("Logo picker error:", error);
      Alert.alert(t('alert_fehler'), t('msg_logo_konnte_nicht_geladen_werden'));
    }
  };

  const removeLogo = () => {
    updateCompany("logoBase64", "");
    updateCompany("logoUri", "");
  };

  const updateBranding = <K extends keyof PdfBranding>(key: K, value: PdfBranding[K]) => {
    setBranding((prev) => ({ ...(prev || ({} as PdfBranding)), [key]: value }));
  };

  const pickSignature = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        let normalizedUri = uri;
        try {
          if (Platform.OS !== "web") {
            const manip = await ImageManipulator.manipulateAsync(uri, [], {
              compress: 0.95,
              format: ImageManipulator.SaveFormat.PNG,
            });
            normalizedUri = manip.uri;
          }
        } catch (e) {
          console.warn("Signature normalization failed:", e);
        }
        const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const dir = `${FileSystem.documentDirectory}branding/`;
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const path = `${dir}signature.png`;
        await FileSystem.copyAsync({ from: normalizedUri, to: path });
        updateCompany("signatureBase64", `data:image/png;base64,${base64}`);
        updateCompany("signatureUri", path);
      }
    } catch (error) {
      console.error("Signature picker error:", error);
    }
  };

  const removeSignature = () => {
    updateCompany("signatureBase64", "");
    updateCompany("signatureUri", "");
  };

  // Small inline-validation helpers for the profile mask.
  const emailValid = !company.companyEmail || EMAIL_RE.test(company.companyEmail.trim());

  
  // Team Contacts
  const [teamContacts, setTeamContacts] = useState<TeamContact[]>([]);
  const [showAddTeamContact, setShowAddTeamContact] = useState(false);
  const [tcName, setTcName] = useState("");
  const [tcEmail, setTcEmail] = useState("");
  const [tcPhone, setTcPhone] = useState("");
  const [tcRole, setTcRole] = useState("");
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfile[]>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);


  useEffect(() => {
    loadTeamContacts();
    loadVoiceProfiles();
    loadSpeakerProfiles();
  }, []);

  async function loadTeamContacts() {
    const contacts = await getTeamContacts();
    setTeamContacts(contacts);
  }

  async function loadSpeakerProfiles() {
    const profiles = await getSpeakerProfiles();
    setSpeakerProfiles(profiles);
  }

  async function loadVoiceProfiles() {
    const profiles = await getVoiceProfiles();
    setVoiceProfiles(profiles);
  }



  const handleDeleteVoiceProfile = async (id: string) => {
    await deleteVoiceProfile(id);
    loadVoiceProfiles();
  };


  const handleAddTeamContact = async () => {
    if (!tcName.trim()) return;
    await saveTeamContact({ name: tcName.trim(), email: tcEmail.trim() || "", phone: tcPhone.trim() || undefined, role: tcRole.trim() || undefined, lastUsed: Date.now() });
    setTcName(""); setTcEmail(""); setTcPhone(""); setTcRole("");
    setShowAddTeamContact(false);
    loadTeamContacts();
  };

  const handleDeleteContact = async (id: string) => {
    await deleteTeamContact(id);
    loadTeamContacts();
  };

  const [editingContact, setEditingContact] = useState<TeamContact | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");

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
    loadTeamContacts();
    setEditingContact(null);
  };

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
        t('msg_waehle_einen_kontakt'),
        [
          ...sorted.map(c => ({
            text: c.name || t('unbekannt'),
            onPress: async () => {
              const email = c.emails?.[0]?.email || "";
              const phone = c.phoneNumbers?.[0]?.number || "";
              await saveTeamContact({
                name: c.name || t('unbekannt'),
                email,
                phone: phone || undefined,
                lastUsed: Date.now(),
              });
              loadTeamContacts();
            },
          })),
          { text: t('btn_abbrechen'), style: "cancel" as const },
        ]
      );
    } catch (e: any) {
      console.error("Import contacts error:", e);
      Alert.alert(t('alert_fehler'), `${t('settings_contacts_load_failed' as any)} ${e?.message || t('settings_unknown_error' as any)}`);
    }
  };

  const handleDeleteSpeaker = async (id: string) => {
    await deleteSpeakerProfile(id);
    loadSpeakerProfiles();
  };

return (
    <ScreenContainer className="flex-1">
      <View style={[styles.headerContainer, cat ? { flexDirection: "row", alignItems: "center", gap: 10 } : null]}>
        {cat && (
          <Pressable
            onPress={() => setCat(null)}
            hitSlop={10}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginRight: 2 }]}
          >
            <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
          </Pressable>
        )}
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>
          {cat
            ? t(
                (cat === "unternehmen"
                  ? "cat_company_title"
                  : cat === "berichte"
                    ? "cat_reports_title"
                    : cat === "versand"
                      ? "cat_dispatch_title"
                      : cat === "benachrichtigungen"
                        ? "cat_notif_title"
                        : cat === "konto"
                          ? "cat_account_title"
                          : "cat_app_title") as any,
              )
            : t('settings_screen_title' as any)}
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!cat && (
          <View style={{ gap: 10 }}>
            {([
              { k: "unternehmen", icon: "business", title: t('cat_company_title' as any), sub: t('cat_company_sub' as any) },
              { k: "berichte", icon: "description", title: t('cat_reports_title' as any), sub: t('cat_reports_sub' as any) },
              { k: "versand", icon: "send", title: t('cat_dispatch_title' as any), sub: t('cat_dispatch_sub' as any) },
              { k: "benachrichtigungen", icon: "notifications", title: t('cat_notif_title' as any), sub: t('cat_notif_sub' as any) },
              { k: "konto", icon: "cloud", title: t('cat_account_title' as any), sub: t('cat_account_sub' as any) },
              { k: "app", icon: "settings", title: t('cat_app_title' as any), sub: t('cat_app_sub' as any) },
            ] as const).map((c) => (
              <Pressable key={c.k} onPress={() => setCat(c.k)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <MaterialIcons name={c.icon as any} size={24} color={colors.primary} style={{ marginRight: 14 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{c.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{c.sub}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}
        {/* Company Branding Section */}
        {inCat("unternehmen") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t('settings_company_data_title' as any)}
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            {t('settings_company_data_desc' as any)}
          </Text>

          {/* Digitale Firmenkarte (Live-Vorschau) */}
          {!!company.companyName && (
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, padding: 16, marginBottom: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {company.logoBase64 ? (
                  <Image source={{ uri: company.logoBase64 }} style={{ width: 68, height: 42 }} contentFit="contain" />
                ) : (
                  <View style={{ width: 68, height: 42, borderRadius: 6, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
                    <MaterialIcons name="business" size={22} color={colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>
                    {company.companyName}
                    {company.legalForm ? " " + company.legalForm : ""}
                  </Text>
                  {!!company.contactPerson && (
                    <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 1 }}>
                      {company.contactPerson}
                      {company.contactTitle ? " · " + company.contactTitle : ""}
                    </Text>
                  )}
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
              {!!(composeCompanyAddress(company) || company.companyAddress) && (
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
                  {(composeCompanyAddress(company) || company.companyAddress).replace(/\n/g, ", ")}
                </Text>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 2 }}>
                {!!company.companyPhone && <Text style={{ fontSize: 12, color: colors.muted }}>{"☎  " + company.companyPhone}</Text>}
                {!!company.mobile && <Text style={{ fontSize: 12, color: colors.muted }}>{"📱  " + company.mobile}</Text>}
                {!!company.companyEmail && <Text style={{ fontSize: 12, color: colors.muted }}>{"✉  " + company.companyEmail}</Text>}
                {!!company.companyWebsite && <Text style={{ fontSize: 12, color: colors.muted }}>{"🌐  " + company.companyWebsite}</Text>}
              </View>
            </View>
          )}

          {/* Logo */}
          <View style={styles.logoSection}>
            {company.logoBase64 ? (
              <View style={styles.logoPreviewContainer}>
                <Image source={{ uri: company.logoBase64 }} style={styles.logoPreview} contentFit="contain" />
                <View style={styles.logoActions}>
                  <Pressable
                    onPress={pickLogo}
                    style={({ pressed }) => [styles.logoActionButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="edit" size={16} color={colors.primary} />
                    <Text style={[styles.logoActionText, { color: colors.primary }]}>{t('aendern')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={removeLogo}
                    style={({ pressed }) => [styles.logoActionButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="delete" size={16} color={colors.error} />
                    <Text style={[styles.logoActionText, { color: colors.error }]}>{t('entfernen')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={pickLogo}
                style={({ pressed }) => [styles.logoUploadButton, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="add-photo-alternate" size={32} color={colors.muted} />
                <Text style={[styles.logoUploadText, { color: colors.muted }]}>{t('settings_upload_logo' as any)}</Text>
                <Text style={[styles.logoUploadHint, { color: colors.muted }]}>{t('settings_logo_hint' as any)}</Text>
              </Pressable>
            )}
          </View>

          {/* Firmenname / Rechtsform */}
          <LabeledInput
            colors={colors}
            icon="business"
            label={t('settings_company_name' as any)}
            value={company.companyName}
            onChangeText={(v) => updateCompany("companyName", v)}
            placeholder={t('meine_firma_gmbh')}
          />
          <LabeledInput
            colors={colors}
            icon="badge"
            label={t('company_legal_form' as any)}
            value={company.legalForm}
            onChangeText={(v) => updateCompany("legalForm", v)}
            placeholder={t('company_legal_form_ph' as any)}
            optional
          />

          {/* Ansprechpartner & Bearbeiter */}
          <GroupHeading colors={colors}>{t('company_group_contact' as any)}</GroupHeading>
          <LabeledInput
            colors={colors}
            icon="person"
            label={t('company_contact_person' as any)}
            value={company.contactPerson}
            onChangeText={(v) => updateCompany("contactPerson", v)}
            placeholder={t('company_contact_person_ph' as any)}
          />
          <LabeledInput
            colors={colors}
            icon="work"
            label={t('company_contact_title' as any)}
            value={company.contactTitle}
            onChangeText={(v) => updateCompany("contactTitle", v)}
            placeholder={t('company_contact_title_ph' as any)}
            optional
          />
          <LabeledInput
            colors={colors}
            icon="edit-note"
            label={t('company_default_editor' as any)}
            value={company.defaultEditor}
            onChangeText={(v) => updateCompany("defaultEditor", v)}
            placeholder={t('company_default_editor_ph' as any)}
            optional
          />

          {/* Anschrift */}
          <GroupHeading colors={colors}>{t('company_group_address' as any)}</GroupHeading>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <LabeledInput
              colors={colors}
              icon="location-on"
              label={t('company_street' as any)}
              value={company.street}
              onChangeText={(v) => updateCompanyAddr("street", v)}
              placeholder="Musterstraße"
              containerStyle={{ flex: 3 }}
            />
            <LabeledInput
              colors={colors}
              label={t('company_house_number' as any)}
              value={company.houseNumber}
              onChangeText={(v) => updateCompanyAddr("houseNumber", v)}
              placeholder="110"
              containerStyle={{ flex: 1 }}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <LabeledInput
              colors={colors}
              label={t('company_zip' as any)}
              value={company.zip}
              onChangeText={(v) => updateCompanyAddr("zip", v)}
              placeholder="12345"
              keyboardType="number-pad"
              containerStyle={{ flex: 1 }}
            />
            <LabeledInput
              colors={colors}
              label={t('company_city' as any)}
              value={company.city}
              onChangeText={(v) => updateCompanyAddr("city", v)}
              placeholder="Musterstadt"
              containerStyle={{ flex: 3 }}
            />
          </View>
          <LabeledInput
            colors={colors}
            icon="public"
            label={t('company_country' as any)}
            value={company.country}
            onChangeText={(v) => updateCompanyAddr("country", v)}
            placeholder="Deutschland"
            optional
          />

          {/* Kontakt */}
          <GroupHeading colors={colors}>{t('company_group_reach' as any)}</GroupHeading>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <LabeledInput
              colors={colors}
              icon="phone"
              label={t('telefon')}
              value={company.companyPhone}
              onChangeText={(v) => updateCompany("companyPhone", v)}
              placeholder="+49 123 456789"
              keyboardType="phone-pad"
              containerStyle={{ flex: 1 }}
            />
            <LabeledInput
              colors={colors}
              icon="smartphone"
              label={t('company_mobile' as any)}
              value={company.mobile}
              onChangeText={(v) => updateCompany("mobile", v)}
              placeholder="+49 170 1234567"
              keyboardType="phone-pad"
              containerStyle={{ flex: 1 }}
              optional
            />
          </View>
          <LabeledInput
            colors={colors}
            icon="email"
            label={t('email')}
            value={company.companyEmail}
            onChangeText={(v) => updateCompany("companyEmail", v)}
            placeholder="info@firma.de"
            keyboardType="email-address"
            autoCapitalize="none"
            invalid={!emailValid}
            hint={!emailValid ? t('company_email_invalid' as any) : undefined}
          />
          <LabeledInput
            colors={colors}
            icon="language"
            label={t('website')}
            value={company.companyWebsite}
            onChangeText={(v) => updateCompany("companyWebsite", v)}
            placeholder="www.firma.de"
            keyboardType="url"
            autoCapitalize="none"
            optional
          />

          {/* Rechtliche Angaben (einklappbar) */}
          <Pressable
            onPress={() => setShowOptionalLegal((s) => !s)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name={showOptionalLegal ? "expand-less" : "expand-more"} size={22} color={colors.primary} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>{t('company_optional_show' as any)}</Text>
          </Pressable>
          {showOptionalLegal && (
            <View style={{ marginTop: 12 }}>
              <LabeledInput
                colors={colors}
                icon="account-balance"
                label={t('company_register_court' as any)}
                value={company.registerCourt}
                onChangeText={(v) => updateCompany("registerCourt", v)}
                placeholder="Amtsgericht Musterstadt"
                optional
              />
              <LabeledInput
                colors={colors}
                icon="tag"
                label={t('company_register_number' as any)}
                value={company.registerNumber}
                onChangeText={(v) => updateCompany("registerNumber", v)}
                placeholder="HRB 12345"
                optional
              />
              <LabeledInput
                colors={colors}
                icon="receipt-long"
                label={t('company_vat_id' as any)}
                value={company.vatId}
                onChangeText={(v) => updateCompany("vatId", v)}
                placeholder="DE123456789"
                autoCapitalize="characters"
                optional
              />
              <LabeledInput
                colors={colors}
                icon="gavel"
                label={t('company_legal_note' as any)}
                value={company.legalNote}
                onChangeText={(v) => updateCompany("legalNote", v)}
                placeholder=""
                multiline
                optional
              />
            </View>
          )}

          {/* Darstellung */}
          <GroupHeading colors={colors}>{t('company_group_display' as any)}</GroupHeading>
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <MaterialIcons name="palette" size={16} color={colors.primary} />
              <Text style={[styles.labelText, { color: colors.foreground }]}>{t('company_brand_color' as any)}</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {BRAND_COLORS.map((c) => {
                const active = (branding?.accentColor || "#1E3A5F").toLowerCase() === c.toLowerCase();
                return (
                  <Pressable
                    key={c}
                    onPress={() => updateBranding("accentColor", c)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: c,
                      borderWidth: active ? 3 : 1,
                      borderColor: active ? colors.foreground : colors.border,
                    }}
                  />
                );
              })}
            </View>
          </View>
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <MaterialIcons name="photo-size-select-large" size={16} color={colors.primary} />
              <Text style={[styles.labelText, { color: colors.foreground }]}>{t('company_logo_size' as any)}</Text>
            </View>
            <Segmented
              colors={colors}
              value={branding?.logoSize || "medium"}
              onChange={(v) => updateBranding("logoSize", v as any)}
              options={[
                { v: "small", label: t('logo_size_small' as any) },
                { v: "medium", label: t('logo_size_medium' as any) },
                { v: "large", label: t('logo_size_large' as any) },
              ]}
            />
          </View>
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <MaterialIcons name="align-horizontal-left" size={16} color={colors.primary} />
              <Text style={[styles.labelText, { color: colors.foreground }]}>{t('company_logo_position' as any)}</Text>
            </View>
            <Segmented
              colors={colors}
              value={branding?.logoPosition || "left"}
              onChange={(v) => updateBranding("logoPosition", v as any)}
              options={[
                { v: "left", label: t('logo_pos_left' as any) },
                { v: "center", label: t('logo_pos_center' as any) },
                { v: "right", label: t('logo_pos_right' as any) },
              ]}
            />
          </View>
          <LabeledInput
            colors={colors}
            icon="draw"
            label={t('company_email_signature' as any)}
            value={company.emailSignature}
            onChangeText={(v) => updateCompany("emailSignature", v)}
            placeholder={t('company_email_signature_ph' as any)}
            multiline
            optional
          />

          {/* Unterschrift (optional) */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <MaterialIcons name="gesture" size={16} color={colors.primary} />
              <Text style={[styles.labelText, { color: colors.foreground }]}>
                {t('company_signature' as any)}
                <Text style={{ color: colors.muted, fontWeight: "400" }}>  ·  optional</Text>
              </Text>
            </View>
            {company.signatureBase64 ? (
              <View style={styles.logoPreviewContainer}>
                <Image source={{ uri: company.signatureBase64 }} style={styles.logoPreview} contentFit="contain" />
                <View style={styles.logoActions}>
                  <Pressable
                    onPress={pickSignature}
                    style={({ pressed }) => [styles.logoActionButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="edit" size={16} color={colors.primary} />
                    <Text style={[styles.logoActionText, { color: colors.primary }]}>{t('aendern')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={removeSignature}
                    style={({ pressed }) => [styles.logoActionButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="delete" size={16} color={colors.error} />
                    <Text style={[styles.logoActionText, { color: colors.error }]}>{t('entfernen')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={pickSignature}
                style={({ pressed }) => [styles.logoUploadButton, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="add-photo-alternate" size={28} color={colors.muted} />
                <Text style={[styles.logoUploadHint, { color: colors.muted }]}>{t('company_signature_hint' as any)}</Text>
              </Pressable>
            )}
          </View>
        </View>

        </>)}
        {/* PDF-Branding */}
        {inCat("berichte") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('pdfbranding')}</Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>{t('pdf_design_desc' as any)}</Text>
          <Pressable
            onPress={() => router.push("/pdf-branding" as any)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="palette" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t('pdflayout_anpassen')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t('pdf_design_subtitle' as any)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/export-history" as any)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginTop: 10 }]}
          >
            <MaterialIcons name="history" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t('exportverlauf')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t('alle_gesendeten_pdfs_anzeigen')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/send-automation" as any)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginTop: 10 }]}
          >
            <MaterialIcons name="send" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t('send_auto_title' as any)}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t('send_auto_intro' as any)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        </>)}
        {/* Wasserzeichen / Firmenstempel */}
        {inCat("berichte") && (<>
        <WatermarkSection colors={colors} />

        {/* App language is chosen via the dedicated Sprache/Language screen
            (full 10-language picker); the old de/en protocol toggle was removed. */}

        </>)}
        {/* Cloud Sync & Konto */}
        {inCat("konto") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t('settings_cloud_account_title' as any)}
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            {t('settings_cloud_account_desc' as any)}
          </Text>

          {/* Login Status */}
          <View style={[styles.syncRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name={isAuthenticated ? "account-circle" : "person-outline"} size={24} color={isAuthenticated ? colors.primary : colors.muted} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.syncLabel, { color: colors.foreground }]}>
                {isAuthenticated ? (user?.name || t('sync_angemeldet')) : t('sync_nicht_angemeldet')}
              </Text>
              <Text style={[styles.syncHint, { color: colors.muted }]}>
                {isAuthenticated ? t('cloud_sync_verfuegbar') : t('anmelden_cloud_sync')}
              </Text>
            </View>
            {isAuthenticated ? (
              <Pressable onPress={() => { logout(); setSyncEnabledState(false); setSyncEnabled(false); }} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <Text style={{ color: colors.error, fontWeight: "600", fontSize: 14 }}>{t('abmelden')}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={async () => {
                const resultUrl = await startOAuthLogin();
                if (resultUrl) {
                  // Parse the URL and navigate to oauth callback with params
                  try {
                    const url = new URL(resultUrl);
                    const code = url.searchParams.get('code');
                    const state = url.searchParams.get('state');
                    const sessionToken = url.searchParams.get('sessionToken');
                    if (sessionToken) {
                      router.push({ pathname: '/oauth/callback', params: { sessionToken } });
                    } else if (code && state) {
                      router.push({ pathname: '/oauth/callback', params: { code, state } });
                    }
                  } catch  {
                    // Try parsing as deep link
                    const params = resultUrl.split('?')[1];
                    if (params) {
                      const searchParams = new URLSearchParams(params);
                      const code = searchParams.get('code');
                      const state = searchParams.get('state');
                      if (code && state) {
                        router.push({ pathname: '/oauth/callback', params: { code, state } });
                      }
                    }
                  }
                }
              }} style={({ pressed }) => [styles.loginButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}>
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>{t('anmelden')}</Text>
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
                  <Text style={[styles.syncLabel, { color: colors.foreground }]}>{t('autosync')}</Text>
                  <Text style={[styles.syncHint, { color: colors.muted }]}>{t('neue_protokolle_automatisch_hochladen')}</Text>
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
                <Text style={styles.syncButtonText}>{syncing ? t('sync_synchronisiere') : t('sync_jetzt_synchronisieren')}</Text>
              </Pressable>
            </>
          )}
        </View>

        </>)}
        {/* Erinnerungen */}
        {inCat("benachrichtigungen") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t('settings_reminders_title' as any)}
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            {t('settings_reminders_desc' as any)}
          </Text>

          <View style={[styles.autoSendRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.autoSendLabel, { color: colors.foreground }]}>{t('erinnerungen_aktiv')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t('pushbenachrichtigungen_vor_fristablauf')}</Text>
            </View>
            <Pressable
              onPress={() => setSettings({ ...settings, remindersEnabled: !settings.remindersEnabled })}
              style={[styles.toggleSwitch, { backgroundColor: settings.remindersEnabled ? colors.primary : colors.border }]}
            >
              <View style={[styles.toggleKnob, { transform: [{ translateX: settings.remindersEnabled ? 20 : 2 }] }]} />
            </Pressable>
          </View>

          {settings.remindersEnabled && (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.label, { color: colors.muted }]}>{t('vorlaufzeit_stunden_vor_frist')}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                {[6, 12, 24, 48].map((hours) => (
                  <Pressable
                    key={hours}
                    onPress={() => setSettings({ ...settings, reminderHoursBefore: hours })}
                    style={({ pressed }) => [{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 0,
                      backgroundColor: settings.reminderHoursBefore === hours ? colors.primary : colors.surface,
                      borderWidth: 1, borderColor: settings.reminderHoursBefore === hours ? colors.primary : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    }]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "500", color: settings.reminderHoursBefore === hours ? "#FFFFFF" : colors.foreground }}>
                      {hours}h
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        </>)}
        {/* Push-Benachrichtigungen */}
        {inCat("benachrichtigungen") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings_notifications')}</Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>{t('erinnerungen_fuer_maengel_und')}</Text>
          <Pressable
            onPress={() => router.push("/notifications-settings" as any)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="notifications" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t('pushbenachrichtigungen')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t('taegliche_erinnerungen_konfigurieren')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/daily-summary-settings" as any)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginTop: 8 }]}
          >
            <MaterialIcons name="summarize" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t('tageszusammenfassung')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t('abendliche_push_mit_tagesuebersicht')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        </>)}
        {/* Sprache */}
        {inCat("app") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings_language')}</Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>{t('appsprache_fuer_internationale_baustelle')}</Text>
          <Pressable
            onPress={() => router.push("/language-settings" as any)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="translate" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t('sprache_language')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t('deutsch_english_franais')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        </>)}
        {/* Biometrische Sperre */}
        {inCat("app") && (<>
        <BiometricLockSection colors={colors} />

        {/* Text-Vorlagen für Annotation */}

        </>)}
        {/* Aufgaben-Erinnerungen */}
        {inCat("benachrichtigungen") && (<>
        <TaskReminderSection colors={colors} />

        </>)}
        {/* Backup */}
        {inCat("konto") && (<>
        <BackupSection colors={colors} />

        </>)}
        {/* Dropbox Integration */}
        {inCat("konto") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Dropbox
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            {t('settings_dropbox_desc' as any)}
          </Text>
          <Pressable
            onPress={() => router.push("/dropbox-settings" as any)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", padding: 14,
              backgroundColor: colors.surface, borderRadius: 0,
              borderWidth: 1, borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: "#0061FF15", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <MaterialIcons name="cloud-upload" size={20} color="#0061FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('dropboxeinstellungen')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t('ordner_dateinamen_autoupload')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        </>)}
        {/* Versandart (zentrale Dispatch-Steuerung) */}
        {inCat("versand") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('dispatch_mode_title' as any)}</Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>{t('dispatch_mode_desc' as any)}</Text>
          <Segmented
            colors={colors}
            value={branding?.autoSendMode || "off"}
            onChange={(v) => updateBranding("autoSendMode", v as any)}
            options={[
              { v: "off", label: t('dispatch_manual' as any) },
              { v: "prepare", label: t('dispatch_prepare' as any) },
              { v: "auto", label: t('dispatch_auto' as any) },
            ]}
          />
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
            {(branding?.autoSendMode || "off") === "auto"
              ? t('dispatch_auto_hint' as any)
              : (branding?.autoSendMode || "off") === "prepare"
                ? t('dispatch_prepare_hint' as any)
                : t('dispatch_manual_hint' as any)}
          </Text>
          <View style={{ marginTop: 14 }}>
            <LabeledInput
              colors={colors}
              icon="alternate-email"
              label={t('dispatch_default_recipient' as any)}
              value={branding?.defaultEmailAddress || ""}
              onChangeText={(v) => updateBranding("defaultEmailAddress", v)}
              placeholder="info@firma.de"
              keyboardType="email-address"
              autoCapitalize="none"
              optional
            />
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t('dispatch_recipient_note' as any)}</Text>
          </View>
        </View>

        </>)}
        {/* Auto-Bericht */}
        {inCat("versand") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t('settings_auto_report_title' as any)}
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            {t('settings_auto_report_desc' as any)}
          </Text>
          <Pressable
            onPress={() => router.push("/auto-report-settings" as any)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", padding: 14,
              backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1,
              borderColor: colors.border, opacity: pressed ? 0.7 : 1,
            }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: colors.success + "15", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <MaterialIcons name="schedule" size={20} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('autobericht_einstellungen')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t('haeufigkeit_uhrzeit_versand_konfiguriere')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>




        </>)}
        {/* Team-Kontaktbuch */}
        {inCat("versand") && (<>
        <View style={{ marginTop: 24, backgroundColor: colors.surface, borderRadius: 0, padding: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>{t('teamkontaktbuch')}</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>{t('gespeicherte_kontakte_fuer_schnellen')}</Text>
          {teamContacts.map(contact => (
            <View key={contact.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 32, height: 32, borderRadius: 0, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>{contact.name.charAt(0)}</Text>
              </View>
              <Pressable onPress={() => startEditContact(contact)} style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{contact.name}{contact.role ? ` • ${contact.role}` : ""}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{contact.email}{contact.phone ? ` • ${contact.phone}` : ""}</Text>
              </Pressable>
              <Pressable onPress={() => startEditContact(contact)} style={{ padding: 6 }}>
                <MaterialIcons name="edit" size={16} color={colors.muted} />
              </Pressable>
              <Pressable onPress={() => handleDeleteContact(contact.id)} style={{ padding: 6 }}>
                <Text style={{ fontSize: 16, color: colors.error }}>×</Text>
              </Pressable>
            </View>
          ))}
          {!showAddTeamContact ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Pressable onPress={() => setShowAddTeamContact(true)} style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 0, borderStyle: "dashed" }}>
                <Text style={{ fontSize: 13, color: colors.primary }}>{t('settings_add_manually' as any)}</Text>
              </Pressable>
              <Pressable onPress={importFromPhoneContacts} style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 0, borderStyle: "dashed" }}>
                <Text style={{ fontSize: 13, color: colors.primary }}>{t('aus_kontakten')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginTop: 10, padding: 12, backgroundColor: colors.background, borderRadius: 0, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('name')}</Text>
              <TextInput placeholder={t('max_mustermann')} placeholderTextColor={colors.muted + "80"} value={tcName} onChangeText={setTcName} style={{ fontSize: 13, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 8 }} />
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('email')}</Text>
              <TextInput placeholder="max@firma.de" placeholderTextColor={colors.muted + "80"} value={tcEmail} onChangeText={setTcEmail} keyboardType="email-address" autoCapitalize="none" style={{ fontSize: 13, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 8 }} />
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('telefon')}</Text>
              <TextInput placeholder="+49 123 456789" placeholderTextColor={colors.muted + "80"} value={tcPhone} onChangeText={setTcPhone} keyboardType="phone-pad" style={{ fontSize: 13, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 8 }} />
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('rolle_optional')}</Text>
              <TextInput placeholder={t('settings_role_placeholder' as any)} placeholderTextColor={colors.muted + "80"} value={tcRole} onChangeText={setTcRole} style={{ fontSize: 13, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 12 }} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={handleAddTeamContact} style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 0, alignItems: "center" }}>
                  <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "600" }}>{t('save')}</Text>
                </Pressable>
                <Pressable onPress={() => { setShowAddTeamContact(false); setTcName(""); setTcEmail(""); setTcPhone(""); setTcRole(""); }} style={{ flex: 1, backgroundColor: colors.surface, paddingVertical: 10, borderRadius: 0, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>{t('cancel')}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        </>)}
        {/* Gespeicherte Sprecher */}
        {inCat("app") && (<>
        {speakerProfiles.length > 0 && (
          <View style={{ marginTop: 16, backgroundColor: "white", borderRadius: 0, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>{t('gespeicherte_sprecher')}</Text>
            <Text style={{ fontSize: 12, color: "#687076", marginBottom: 12 }}>{t('automatisch_erkannte_sprecher_mit')}</Text>
            {speakerProfiles.map(profile => (
              <View key={profile.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500" }}>{profile.name}</Text>
                  <Text style={{ fontSize: 11, color: "#687076" }}>{profile.label} • {profile.usageCount}x {t('settings_used' as any)}</Text>
                </View>
                <Pressable onPress={() => handleDeleteSpeaker(profile.id)} style={{ padding: 6 }}>
                  <Text style={{ fontSize: 16, color: "#EF4444" }}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        
        </>)}
        {/* Stimmprofile */}
        {inCat("app") && (<>
        {voiceProfiles.length > 0 && (
          <View style={{ marginTop: 16, backgroundColor: "white", borderRadius: 0, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>{t('stimmprofile')}</Text>
            <Text style={{ fontSize: 12, color: "#687076", marginBottom: 12 }}>{t('automatisch_erkannte_stimmcharakteristik')}</Text>
            {voiceProfiles.map(profile => (
              <View key={profile.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" }}>
                <View style={{ width: 32, height: 32, borderRadius: 0, backgroundColor: "#8B5CF620", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                  <Text style={{ fontSize: 14 }}>🎙️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500" }}>{profile.name}</Text>
                  <Text style={{ fontSize: 11, color: "#687076" }}>{profile.detectionCount}x {t('settings_detected' as any)} • {Math.round(profile.confidence * 100)}% {t('settings_confidence' as any)}</Text>
                </View>
                <Pressable onPress={() => handleDeleteVoiceProfile(profile.id)} style={{ padding: 6 }}>
                  <Text style={{ fontSize: 16, color: "#EF4444" }}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        </>)}
{/* KI-Support */}
        {inCat("app") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t('settings_help_support_title' as any)}
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            {t('settings_help_support_desc' as any)}
          </Text>
          <Pressable
            onPress={() => router.push("/support-chat" as any)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", padding: 14,
              backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1,
              borderColor: colors.border, opacity: pressed ? 0.7 : 1,
            }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <MaterialIcons name="support-agent" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('kisupport_chat')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t('fragen_zur_app_hilfe')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/get-started" as any)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", padding: 14, marginTop: 10,
              backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1,
              borderColor: colors.border, opacity: pressed ? 0.7 : 1,
            }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: "#5DADE215", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <MaterialIcons name="rocket-launch" size={20} color="#5DADE2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('getstarted_title' as any)}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t('getstarted_subtitle' as any)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/tutorial" as any)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", padding: 14, marginTop: 10,
              backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1,
              borderColor: colors.border, opacity: pressed ? 0.7 : 1,
            }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: "#5DADE215", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <MaterialIcons name="menu-book" size={20} color="#5DADE2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('index_anleitung' as any)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/subscription" as any)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", padding: 14, marginTop: 10,
              backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1,
              borderColor: colors.border, opacity: pressed ? 0.7 : 1,
            }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: "#4ADE8015", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <MaterialIcons name="credit-card" size={20} color="#4ADE80" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('index_abo' as any)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        </>)}
{/* Feature-Toggles */}
        {inCat("app") && (<>
        <FeatureTogglesSection colors={colors} />

        </>)}
{/* Rechtliches & Datenschutz */}
        {inCat("app") && (<>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t('settings_legal_privacy_title' as any)}
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            {t('settings_legal_privacy_desc' as any)}
          </Text>
          <PrivacyChoicesSection colors={colors} />
          <View style={{ height: 12 }} />

          <Pressable
            onPress={() => router.push("/legal" as any)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", padding: 14,
              backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1,
              borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginBottom: 8,
            }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <MaterialIcons name="gavel" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('legal_rechtliches' as any)}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t('settings_legal_open_desc' as any)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/legal?section=dsgvo-export" as any)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", padding: 14,
              backgroundColor: colors.surface, borderRadius: 0, borderWidth: 1,
              borderColor: colors.border, opacity: pressed ? 0.7 : 1,
            }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: colors.error + "15", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <MaterialIcons name="delete-forever" size={20} color={colors.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{t('settings_delete_my_data' as any)}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t('settings_delete_my_data_desc' as any)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        </>)}
        {cat && (<>
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
            {saved ? t('btn_gespeichert') : t('btn_einstellungen_speichern')}
          </Text>
        </Pressable>
        </>)}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Contact Modal */}
      <Modal visible={!!editingContact} transparent animationType="fade" onRequestClose={() => setEditingContact(null)}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 0, padding: 24, width: "85%", maxWidth: 360, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>{t('kontakt_bearbeiten')}</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('project_sort_name')}</Text>
            <TextInput value={editName} onChangeText={setEditName} placeholder={t('project_sort_name')} placeholderTextColor={colors.muted + "80"} style={{ fontSize: 14, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 10 }} />
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('email')}</Text>
            <TextInput value={editEmail} onChangeText={setEditEmail} placeholder={t('email')} placeholderTextColor={colors.muted + "80"} keyboardType="email-address" autoCapitalize="none" style={{ fontSize: 14, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 10 }} />
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('telefon')}</Text>
            <TextInput value={editPhone} onChangeText={setEditPhone} placeholder="+49 123 456789" placeholderTextColor={colors.muted + "80"} keyboardType="phone-pad" style={{ fontSize: 14, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 10 }} />
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{t('rolle')}</Text>
            <TextInput value={editRole} onChangeText={setEditRole} placeholder={t('settings_role_placeholder_short' as any)} placeholderTextColor={colors.muted + "80"} style={{ fontSize: 14, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: 16 }} />
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 36,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 16,
    opacity: 0.6,
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
    borderRadius: 0,
  },
  logoActions: {
    flexDirection: "row",
    gap: 12,
  },
  logoActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
  },
  logoActionText: {
    fontSize: 13,
    fontWeight: "500",
  },
  logoUploadButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    borderRadius: 0,
    borderWidth: 1.5,
    borderStyle: "dashed",
    gap: 8,
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
    gap: 12,
  },
  templateCard: {
    width: "47.5%",
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    minHeight: 88,
  },
  templateIconRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  templateName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  templateDescription: {
    fontSize: 12,
    lineHeight: 17,
    opacity: 0.6,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  labelText: {
    fontSize: 15,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    paddingVertical: 14,
    borderRadius: 0,
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
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 8,
  },
  createTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 0,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginBottom: 10,
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
    gap: 8,
    paddingVertical: 16,
    borderRadius: 0,
    borderWidth: 1,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  autoSendToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 14,
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
    paddingVertical: 16,
    borderRadius: 0,
    gap: 8,
    marginTop: 12,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 12,
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
    padding: 16,
    borderRadius: 0,
    gap: 8,
    marginTop: 6,
  },
  syncButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  loginButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 0,
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
  autoSendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  autoSendLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  settingDesc: {
    fontSize: 11,
    marginTop: 2,
  },
});
