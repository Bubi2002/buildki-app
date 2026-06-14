import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type TagEditorProps = {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  suggestions?: string[];
};

export function TagEditor({ tags, onTagsChange, suggestions = [] }: TagEditorProps) {
  const colors = useColors();
  const [inputValue, setInputValue] = useState("");

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed]);
    }
    setInputValue("");
  };

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag));
  };

  const filteredSuggestions = suggestions.filter(
    (s) => !tags.includes(s) && s.includes(inputValue.toLowerCase()) && inputValue.length > 0
  );

  return (
    <View style={styles.container}>
      {/* Current tags */}
      <View style={styles.tagRow}>
        {tags.map((tag) => (
          <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + "15" }]}>
            <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
            <Pressable onPress={() => removeTag(tag)} hitSlop={8}>
              <MaterialIcons name="close" size={14} color={colors.primary} />
            </Pressable>
          </View>
        ))}
      </View>

      {/* Input */}
      <View style={[styles.inputRow, { borderColor: colors.border }]}>
        <MaterialIcons name="label" size={18} color={colors.muted} />
        <TextInput
          value={inputValue}
          onChangeText={setInputValue}
          onSubmitEditing={() => addTag(inputValue)}
          placeholder="Tag hinzufügen..."
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.foreground }]}
          returnKeyType="done"
        />
        {inputValue.length > 0 && (
          <Pressable onPress={() => addTag(inputValue)} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="add" size={16} color="#FFF" />
          </Pressable>
        )}
      </View>

      {/* Suggestions */}
      {filteredSuggestions.length > 0 && (
        <View style={styles.suggestionsRow}>
          {filteredSuggestions.slice(0, 5).map((s) => (
            <Pressable key={s} onPress={() => addTag(s)} style={[styles.suggestion, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.suggestionText, { color: colors.foreground }]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  tagText: { fontSize: 12, fontWeight: "500" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  input: { flex: 1, fontSize: 14, padding: 0 },
  addBtn: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  suggestionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  suggestion: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  suggestionText: { fontSize: 12 },
});
