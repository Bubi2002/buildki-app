import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { PROTOCOL_TEMPLATES } from "@/shared/templates";

type Settings = {
  whatsappNumber: string;
  defaultEmail: string;
  style: "formal" | "informal";
  format: "bullets" | "paragraphs";
  language: string;
  templateId: string;
};

const DEFAULT_SETTINGS: Settings = {
  whatsappNumber: "",
  defaultEmail: "",
  style: "formal",
  format: "bullets",
  language: "de",
  templateId: "freitext",
};

export default function SettingsScreen() {
  const colors = useColors();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

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

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem("protokoll-settings", JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      Alert.alert("Fehler", "Einstellungen konnten nicht gespeichert werden.");
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
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
        {/* Template Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Protokoll-Vorlage
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            Wähle die Standard-Vorlage für neue Protokolle
          </Text>

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

        {/* Save Button */}
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
});
