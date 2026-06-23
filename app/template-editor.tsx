import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  FlatList,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const CUSTOM_TEMPLATES_KEY = "custom-templates";

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

type CustomTemplate = {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  isCustom: true;
  createdAt: string;
};

export default function TemplateEditorScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("description");
  const [sections, setSections] = useState<{name: string; type: "text" | "checkbox" | "list" | "date" | "number"}[]>([{name: "", type: "text"}]);
  const [showPreview, setShowPreview] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"markdown" | "structured">("markdown");
  const [showIconPicker, setShowIconPicker] = useState(false);

  useEffect(() => {
    if (params.editId) {
      loadTemplate(params.editId);
    }
  }, [params.editId]);

  const loadTemplate = async (id: string) => {
    try {
      const stored = await AsyncStorage.getItem(CUSTOM_TEMPLATES_KEY);
      if (stored) {
        const templates: CustomTemplate[] = JSON.parse(stored);
        const template = templates.find((t) => t.id === id);
        if (template) {
          setName(template.name);
          setDescription(template.description);
          setIcon(template.icon);
          // Parse sections from systemPrompt
          const sectionMatches = template.systemPrompt.match(/\d+\.\s\*\*(.+?)\*\*/g);
            const fieldTypes = template.systemPrompt.match(/\[(.+?)\]/g);
          if (sectionMatches) {
            setSections(sectionMatches.map((m: string, i: number) => ({
              name: m.replace(/\d+\.\s\*\*|\*\*/g, "").replace(/\s*\[.*?\]/g, "").trim(),
              type: (fieldTypes && fieldTypes[i] ? fieldTypes[i].replace(/[\[\]]/g, "") : "text") as any
            })));
          } else {
            setSections([{name: "", type: "text"}]);
          }
        }
      }
    } catch (error) {
      console.error("Error loading template:", error);
    }
  };

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
      Alert.alert("Fehler", "Bitte gib einen Namen für die Vorlage ein.");
      return;
    }

    const validSections = sections.filter((s) => s.name.trim() !== "");
    if (validSections.length === 0) {
      Alert.alert("Fehler", "Bitte füge mindestens eine Sektion hinzu.");
      return;
    }

    try {
      const stored = await AsyncStorage.getItem(CUSTOM_TEMPLATES_KEY);
      const templates: CustomTemplate[] = stored ? JSON.parse(stored) : [];

      const template: CustomTemplate = {
        id: params.editId || `custom-${Date.now()}`,
        name: name.trim(),
        icon,
        description: description.trim() || `Benutzerdefinierte Vorlage: ${name.trim()}`,
        systemPrompt: buildSystemPrompt(),
        isCustom: true,
        createdAt: new Date().toISOString(),
      };

      if (params.editId) {
        const index = templates.findIndex((t) => t.id === params.editId);
        if (index !== -1) {
          templates[index] = template;
        } else {
          templates.push(template);
        }
      } else {
        templates.push(template);
      }

      await AsyncStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
      Alert.alert("Gespeichert", "Deine Vorlage wurde erfolgreich gespeichert.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert("Fehler", "Vorlage konnte nicht gespeichert werden.");
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
          {params.editId ? "Vorlage bearbeiten" : "Neue Vorlage"}
        </Text>
        <Pressable
          onPress={saveTemplate}
          style={({ pressed }) => [
            styles.saveHeaderButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="check" size={18} color="#FFFFFF" />
          <Text style={styles.saveHeaderText}>Speichern</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
            placeholder="Kurze Beschreibung der Vorlage"
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
                {index + 1}.
              </Text>
              <TextInput
                style={[styles.sectionInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={typeof section === "string" ? section : section.name}
                onChangeText={(v) => updateSection(index, v)}
                placeholder={`Sektion ${index + 1} (z.B. "Zusammenfassung")`}
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
