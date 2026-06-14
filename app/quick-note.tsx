import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function QuickNoteScreen() {
  const colors = useColors();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<TextInput>(null);

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const saveNote = async () => {
    if (!content.trim()) {
      Alert.alert("Hinweis", "Bitte gib einen Text ein.");
      return;
    }

    setSaving(true);
    try {
      const data = await AsyncStorage.getItem("protocols");
      const protocols = JSON.parse(data || "[]");

      const note = {
        id: Date.now().toString(),
        title: title.trim() || `Notiz vom ${new Date().toLocaleDateString("de-DE")}`,
        transcription: content.trim(),
        protocol: content.trim(),
        templateName: "Schnellnotiz",
        templateId: "quick_note",
        photos: [],
        todos: [],
        markers: [],
        tags,
        duration: 0,
        recordingMode: "note",
        createdAt: new Date().toISOString(),
        calendarEventId: null,
        location: null,
        status: "ready",
      };

      protocols.unshift(note);
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));

      Alert.alert("Gespeichert", "Notiz wurde erfolgreich gespeichert.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Fehler", "Notiz konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} className="flex-1">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
              <MaterialIcons name="close" size={24} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Schnellnotiz</Text>
            <Pressable
              onPress={saveNote}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: colors.primary, opacity: pressed || saving ? 0.7 : 1 },
              ]}
            >
              <MaterialIcons name="check" size={20} color="#FFF" />
              <Text style={styles.saveBtnText}>Speichern</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <TextInput
              style={[styles.titleInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Titel (optional)"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
              returnKeyType="next"
              onSubmitEditing={() => contentRef.current?.focus()}
            />

            {/* Content */}
            <TextInput
              ref={contentRef}
              style={[styles.contentInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="Deine Notiz hier eingeben..."
              placeholderTextColor={colors.muted}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />

            {/* Tags */}
            <View style={styles.tagSection}>
              <Text style={[styles.tagLabel, { color: colors.muted }]}>Tags</Text>
              <View style={styles.tagInputRow}>
                <TextInput
                  style={[styles.tagInput, { color: colors.foreground, borderColor: colors.border }]}
                  placeholder="Tag hinzufügen..."
                  placeholderTextColor={colors.muted}
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={addTag}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={addTag}
                  style={({ pressed }) => [styles.tagAddBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name="add" size={20} color="#FFF" />
                </Pressable>
              </View>
              {tags.length > 0 && (
                <View style={styles.tagList}>
                  {tags.map((tag) => (
                    <Pressable
                      key={tag}
                      onPress={() => removeTag(tag)}
                      style={[styles.tag, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}
                    >
                      <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                      <MaterialIcons name="close" size={14} color={colors.primary} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: "600" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  saveBtnText: { color: "#FFF", fontSize: 14, fontWeight: "600" },
  form: { flex: 1, paddingHorizontal: 16 },
  titleInput: { fontSize: 20, fontWeight: "600", paddingVertical: 12, borderBottomWidth: 1, marginBottom: 16 },
  contentInput: { fontSize: 15, lineHeight: 22, padding: 16, borderRadius: 12, borderWidth: 1, minHeight: 200, marginBottom: 20 },
  tagSection: { marginBottom: 20 },
  tagLabel: { fontSize: 13, fontWeight: "500", marginBottom: 8 },
  tagInputRow: { flexDirection: "row", gap: 8 },
  tagInput: { flex: 1, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  tagAddBtn: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tagList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  tagText: { fontSize: 13, fontWeight: "500" },
});
