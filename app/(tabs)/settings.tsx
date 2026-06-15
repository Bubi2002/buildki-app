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
import { startOAuthLogin } from "@/constants/oauth";
import { trpc } from "@/lib/trpc";
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
  translateEnabled: false,
  targetLanguage: "en",
  remindersEnabled: true,
  reminderHoursBefore: 24,
};

const DEFAULT_COMPANY: CompanySettings = {
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  logoBase64: "",
  logoUri: "",
};

function BiometricLockSection({ colors }: { colors: any }) {
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
            Biometrische Sperre
          </Text>
          <Text style={[biometricStyles.sectionDescription, { color: colors.muted }]}>
            Face ID / Fingerabdruck zum Entsperren der App
          </Text>
          <View style={[biometricStyles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="fingerprint" size={24} color={colors.muted} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[biometricStyles.label, { color: colors.foreground }]}>App-Sperre</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>Nur auf Ger\u00e4ten mit Biometrie verf\u00fcgbar</Text>
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
        Biometrische Sperre
      </Text>
      <Text style={[biometricStyles.sectionDescription, { color: colors.muted }]}>
        {label} zum Entsperren der App verwenden
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
            App-Sperre mit {label}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {enabled ? 'Aktiv \u2013 App wird beim Start gesperrt' : 'Tippe zum Aktivieren'}
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
    borderRadius: 12,
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
  const [templates, setTemplates] = useState<string[]>([]);
  const [newTemplate, setNewTemplate] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await AsyncStorage.getItem(ANNOTATION_STORAGE_KEY);
      if (data) setTemplates(JSON.parse(data));
    } catch { /* ignore */ }
  };

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
        Annotations-Vorlagen
      </Text>
      <Text style={[annotStyles.sectionDescription, { color: colors.muted }]}>
        Eigene Schnelltext-Vorlagen für die Foto-Annotation
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
          placeholder="Neue Vorlage..."
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
            {isEditing ? 'Fertig' : 'Bearbeiten'}
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '500' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

const WATERMARK_STORAGE_KEY = 'watermark-settings';

function WatermarkSection({ colors }: { colors: any }) {
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
        Wasserzeichen / Stempel
      </Text>
      <Text style={[wmStyles.sectionDescription, { color: colors.muted }]}>
        Firmenstempel als Wasserzeichen im PDF anzeigen
      </Text>

      <View style={[wmStyles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="branding-watermark" size={22} color={enabled ? colors.primary : colors.muted} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[wmStyles.label, { color: colors.foreground }]}>Wasserzeichen aktiv</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>Wird diagonal über jede PDF-Seite gelegt</Text>
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
            placeholder="z.B. Firmenname, VERTRAULICH, ENTWURF"
            placeholderTextColor={colors.muted}
            style={[wmStyles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
            returnKeyType="done"
          />
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
            Tipp: Firmenname oder „VERTRAULICH“ als Stempel
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
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 15, fontWeight: '500' },
  toggleTrack: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1 },
});

function TaskReminderSection({ colors }: { colors: any }) {
  const [enabled, setEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(9);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await AsyncStorage.getItem("task-reminder-settings");
      if (data) {
        const s = JSON.parse(data);
        setEnabled(s.enabled ?? false);
        setReminderHour(s.reminderHour ?? 9);
      }
      // Check permission status
      if (Platform.OS !== "web") {
        const Notif = require("expo-notifications");
        const { status } = await Notif.getPermissionsAsync();
        setPermissionGranted(status === "granted");
      }
    } catch { /* ignore */ }
  };

  const toggleEnabled = async (val: boolean) => {
    setEnabled(val);
    if (val && Platform.OS !== "web") {
      const Notif = require("expo-notifications");
      const { status } = await Notif.requestPermissionsAsync();
      setPermissionGranted(status === "granted");
      if (status !== "granted") {
        Alert.alert("Berechtigung verweigert", "Bitte erlaube Benachrichtigungen in den Systemeinstellungen.");
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

  const changeHour = async (hour: number) => {
    setReminderHour(hour);
    const settings = { enabled, reminderHour: hour, reminderMinute: 0, daysBeforeDue: 1 };
    await AsyncStorage.setItem("task-reminder-settings", JSON.stringify(settings));
    if (enabled && Platform.OS !== "web") {
      const { scheduleTaskReminders } = require("@/lib/task-reminders");
      await scheduleTaskReminders();
    }
  };

  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>Aufgaben-Erinnerungen</Text>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>Benachrichtigungen bei f\u00e4lligen Aufgaben</Text>

      <Pressable
        onPress={() => toggleEnabled(!enabled)}
        style={({ pressed }) => [{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          padding: 14, borderRadius: 12, borderWidth: 1,
          backgroundColor: colors.surface, borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <MaterialIcons name="notifications" size={20} color={enabled ? colors.primary : colors.muted} />
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.foreground }}>Erinnerungen aktiv</Text>
        </View>
        <View style={[{ width: 44, height: 26, borderRadius: 13, justifyContent: "center" }, { backgroundColor: enabled ? colors.primary : colors.border }]}>
          <View style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" }, { marginLeft: enabled ? 20 : 2 }]} />
        </View>
      </Pressable>

      {enabled && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>Erinnerungszeit:</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[7, 8, 9, 10, 12, 14, 17].map((h) => (
              <Pressable
                key={h}
                onPress={() => changeHour(h)}
                style={({ pressed }) => [{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
                  backgroundColor: reminderHour === h ? colors.primary : colors.surface,
                  borderWidth: 1, borderColor: reminderHour === h ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ fontSize: 13, color: reminderHour === h ? "#fff" : colors.foreground }}>{h}:00</Text>
              </Pressable>
            ))}
          </View>
          {Platform.OS !== "web" && !permissionGranted && (
            <Text style={{ fontSize: 11, color: colors.warning, marginTop: 8 }}>\u26a0\ufe0f Benachrichtigungs-Berechtigung noch nicht erteilt</Text>
          )}
        </View>
      )}
    </View>
  );
}

function FeatureTogglesSection({ colors }: { colors: any }) {
  const [toggles, setToggles] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadToggles();
  }, []);

  const loadToggles = async () => {
    const { getFeatureToggles } = require("@/lib/feature-toggles");
    const t = await getFeatureToggles();
    setToggles([...t]);
  };

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
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>Features verwalten</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>{enabledCount} von {toggles.length} aktiv</Text>
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
                    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4,
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
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 4 }}>Deaktivierte Features werden in der App ausgeblendet</Text>
        </View>
      )}
    </View>
  );
}

function BackupSection({ colors }: { colors: any }) {
  const [stats, setStats] = useState({ protocolCount: 0, projectCount: 0, totalSize: "0 KB" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const { getBackupStats } = require("@/lib/backup");
    const s = await getBackupStats();
    setStats(s);
  };

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
      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>Datensicherung</Text>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
        {stats.protocolCount} Protokolle, {stats.projectCount} Projekte ({stats.totalSize})
      </Text>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable
          onPress={handleBackup}
          disabled={loading}
          style={({ pressed }) => [{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary,
            opacity: pressed || loading ? 0.7 : 1,
          }]}
        >
          <MaterialIcons name="backup" size={18} color="#fff" />
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Backup</Text>
        </Pressable>

        <Pressable
          onPress={handleRestore}
          disabled={loading}
          style={({ pressed }) => [{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            paddingVertical: 12, borderRadius: 12, borderWidth: 1,
            borderColor: colors.border, backgroundColor: colors.surface,
            opacity: pressed || loading ? 0.7 : 1,
          }]}
        >
          <MaterialIcons name="restore" size={18} color={colors.foreground} />
          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>Wiederherstellen</Text>
        </Pressable>
      </View>
    </View>
  );
}

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

        {/* Wasserzeichen / Firmenstempel */}
        <WatermarkSection colors={colors} />

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
                  } catch (e) {
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

        {/* Erinnerungen */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Erinnerungen
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            Benachrichtigungen für Aufgaben mit nahender Frist
          </Text>

          <View style={[styles.autoSendRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.autoSendLabel, { color: colors.foreground }]}>Erinnerungen aktiv</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>Push-Benachrichtigungen vor Fristablauf</Text>
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
              <Text style={[styles.label, { color: colors.muted }]}>Vorlaufzeit (Stunden vor Frist)</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                {[6, 12, 24, 48].map((hours) => (
                  <Pressable
                    key={hours}
                    onPress={() => setSettings({ ...settings, reminderHoursBefore: hours })}
                    style={({ pressed }) => [{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
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

        {/* Push-Benachrichtigungen */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Benachrichtigungen</Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>Erinnerungen für Mängel und Checklisten</Text>
          <Pressable
            onPress={() => router.push("/notifications-settings" as any)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="notifications" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Push-Benachrichtigungen</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Tägliche Erinnerungen konfigurieren</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Biometrische Sperre */}
        <BiometricLockSection colors={colors} />

        {/* Text-Vorlagen für Annotation */}
        <AnnotationTemplatesSection colors={colors} />

        {/* Aufgaben-Erinnerungen */}
        <TaskReminderSection colors={colors} />

        {/* Backup */}
        <BackupSection colors={colors} />

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

        {/* Feature-Toggles */}
        <FeatureTogglesSection colors={colors} />

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
});
