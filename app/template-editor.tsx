import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "@/lib/language-provider";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "@/shared/templates";
import {
  loadCustomProtocolTemplates,
  upsertCustomProtocolTemplate,
  type StoredProtocolTemplate,
} from "@/lib/protocol-template-store";

const AVAILABLE_ICONS = [
  "description",
  "assignment",
  "checklist",
  "engineering",
  "architecture",
  "home-repair-service",
  "handyman",
  "inventory",
  "receipt-long",
  "summarize",
  "fact-check",
  "rule",
  "grading",
  "note-alt",
  "playlist-add-check",
];

export default function TemplateEditorScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("description");
  const [category, setCategory] = useState<TemplateCategory>("allgemein");
  const [loadedTemplate, setLoadedTemplate] = useState<StoredProtocolTemplate | null>(null);
  const [sections, setSections] = useState<{name: string; type: "text" | "checkbox" | "list" | "date" | "number"}[]>([{name: "", type: "text"}]);
  const [showPreview, setShowPreview] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  async function loadTemplate(id: string) {
    try {
      const templates = await loadCustomProtocolTemplates();
      const template = templates.find((item) => item.id === id);
      if (template) {
        setLoadedTemplate(template);
        setName(template.name);
        setDescription(template.description);
        setIcon(template.icon);
        setCategory(template.category);
        const sectionMatches = template.systemPrompt.match(/\d+\.\s\*\*(.+?)\*\*/g);
        const fieldTypes = template.systemPrompt.match(/\[(.+?)\]/g);
        if (sectionMatches) {
          setSections(sectionMatches.map((match: string, index: number) => ({
            name: match.replace(/\d+\.\s\*\*|\*\*/g, "").replace(/\s*\[.*?\]/g, "").trim(),
            type: (fieldTypes && fieldTypes[index] ? fieldTypes[index].replace(/[\[\]]/g, "") : "text") as "text" | "checkbox" | "list" | "date" | "number",
          })));
        } else {
          setSections([{ name: "", type: "text" }]);
        }
      }
    } catch (error) {
      console.error("Error loading template:", error);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (params.editId) {
        void loadTemplate(params.editId);
      }
    });
  }, [params.editId]);

  const addSection = () => {
    setSections([...sections, {name: "", type: "text"}]);
  };

  const updateSection = (index: number, value: string) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], name: value };
    setSections(updated);
  };
  const updateSectionType = (index: number, type: "text" | "checkbox" | "list" | "date" | "number") => {
    const updated = [...sections];
    updated[index] = { ...updated[index], type };
    setSections(updated);
  };

  const removeSection = (index: number) => {
    if (sections.length <= 1) return;
    const updated = sections.filter((_: any, i: number) => i !== index);
    setSections(updated);
  };

  const buildSystemPrompt = (): string => {
    const validSections = sections.filter((s) => s.name.trim() !== "");
    const sectionList = validSections
      .map((s: any, i: number) => `${i + 1}. **${s.name}** [${s.type}]`)
      .join("\n");

    return `Du bist ein professioneller Protokollant. Erstelle aus dem folgenden transkribierten Text ein strukturiertes Protokoll nach der Vorlage "${name}".

Das Protokoll soll folgende Struktur haben:
${sectionList}

Schreibe sachlich und präzise. Antworte ausschließlich mit dem fertigen Protokoll, ohne Einleitung oder Kommentare.`;
  };

  const saveTemplate = async () => {
    if (!name.trim()) {
      Alert.alert(t('alert_fehler'), t('msg_bitte_gib_einen_namen_fuer'));
      return;
    }

    const validSections = sections.filter((s) => s.name.trim() !== "");
    if (validSections.length === 0) {
      Alert.alert(t('alert_fehler'), t('msg_bitte_fuege_mindestens_eine_sektion'));
      return;
    }

    try {
      await upsertCustomProtocolTemplate({
        ...(loadedTemplate || {}),
        id: params.editId || `custom-${Date.now()}`,
        name: name.trim(),
        icon,
        description: description.trim() || `Benutzerdefinierte Vorlage: ${name.trim()}`,
        category,
        systemPrompt: buildSystemPrompt(),
        isCustom: true,
        source: loadedTemplate?.source || "custom",
        createdAt: loadedTemplate?.createdAt || new Date().toISOString(),
      });
      Alert.alert(t('alert_gespeichert'), t('msg_deine_vorlage_wurde_erfolgreich_gespeichert'), [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_vorlage_konnte_nicht_gespeichert_werden'));
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {params.editId ? t('vorlage_bearbeiten') : t('neue_vorlage')}
        </Text>
        <Pressable
          onPress={saveTemplate}
          style={({ pressed }) => [
            styles.saveHeaderButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="check" size={18} color="#FFFFFF" />
          <Text style={styles.saveHeaderText}>{t('save')}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
        {/* Name */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
            Name der Vorlage *
          </Text>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={name}
            onChangeText={setName}
            placeholder="z.B. Wartungsprotokoll"
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
            Beschreibung
          </Text>
          <TextInput
            style={[styles.input, styles.multilineInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('kurze_beschreibung_der_vorlage')}
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Icon Picker */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
            Icon
          </Text>
          <Pressable
            onPress={() => setShowIconPicker(!showIconPicker)}
            style={({ pressed }) => [
              styles.iconPickerButton,
              { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialIcons name={icon as any} size={28} color={colors.primary} />
            <Text style={[styles.iconPickerText, { color: colors.foreground }]}>
              Icon ändern
            </Text>
            <MaterialIcons
              name={showIconPicker ? "expand-less" : "expand-more"}
              size={24}
              color={colors.muted}
            />
          </Pressable>

          {showIconPicker && (
            <View style={[styles.iconGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {AVAILABLE_ICONS.map((iconName) => (
                <Pressable
                  key={iconName}
                  onPress={() => {
                    setIcon(iconName);
                    setShowIconPicker(false);
                  }}
                  style={({ pressed }) => [
                    styles.iconOption,
                    {
                      backgroundColor: icon === iconName ? colors.primary + "20" : "transparent",
                      borderColor: icon === iconName ? colors.primary : "transparent",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={iconName as any}
                    size={24}
                    color={icon === iconName ? colors.primary : colors.muted}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Category */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Kategorie</Text>
          <View style={styles.categoryGrid}>
            {TEMPLATE_CATEGORIES.map((item) => {
              const selected = category === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setCategory(item.id)}
                  style={({ pressed }) => [
                    styles.categoryButton,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary + "18" : colors.surface,
                      opacity: pressed ? 0.68 : 1,
                    },
                  ]}
                >
                  <MaterialIcons name={item.icon as any} size={18} color={selected ? colors.primary : colors.muted} />
                  <Text style={[styles.categoryText, { color: selected ? colors.primary : colors.foreground }]}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Sections */}
        <View style={styles.field}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
              Protokoll-Sektionen *
            </Text>
            <Text style={[styles.sectionHint, { color: colors.muted }]}>
              Die KI strukturiert das Protokoll nach diesen Abschnitten
            </Text>
          </View>

          {sections.map((section, index) => (
            <View key={index} style={styles.sectionRow}>
              <Text style={[styles.sectionNumber, { color: colors.primary }]}>
                {`${index + 1}.`}
              </Text>
              <TextInput
                style={[styles.sectionInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={typeof section === "string" ? section : section.name}
                onChangeText={(v) => updateSection(index, v)}
                placeholder={`${t('sektion')} ${index + 1}`}
                placeholderTextColor={colors.muted}
              />
              {sections.length > 1 && (
                <Pressable
                  onPress={() => removeSection(index)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 4 }]}
                >
                  <MaterialIcons name="remove-circle" size={22} color={colors.error} />
                </Pressable>
              )}
            </View>
          ))}

          <Pressable
            onPress={addSection}
            style={({ pressed }) => [
              styles.addSectionButton,
              { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialIcons name="add" size={20} color={colors.primary} />
            <Text style={[styles.addSectionText, { color: colors.primary }]}>
              Sektion hinzufügen
            </Text>
          </Pressable>
        </View>

        {/* Preview */}
        {name.trim() && sections.some((s: any) => (typeof s === "string" ? s : s.name).trim()) && (
          <View style={[styles.previewBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.previewTitle, { color: colors.foreground }]}>
              Vorschau
            </Text>
            <Text style={[styles.previewText, { color: colors.muted }]}>
              {buildSystemPrompt().split("\n").slice(3).join("\n")}
            </Text>
          </View>
        )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  saveHeaderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
  },
  saveHeaderText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  field: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryButton: {
    width: "48%",
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  categoryText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  iconPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
  },
  iconPickerText: {
    flex: 1,
    fontSize: 14,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    marginTop: 8,
    borderRadius: 0,
    borderWidth: 1,
  },
  iconOption: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 0,
    borderWidth: 1.5,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionHint: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionNumber: {
    fontSize: 16,
    fontWeight: "700",
    width: 24,
  },
  sectionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  addSectionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 0,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginTop: 4,
  },
  addSectionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  previewBox: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  previewText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
