import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AssigneeInput } from "@/components/assignee-input";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

const PROJECTS_KEY = "projects";
const COLORS = ["#5DADE2", "#EF4444", "#F59E0B", "#34D399", "#A78BFA", "#EC407A", "#00ACC1", "#FF7043"];
const PROJECT_TYPES: { key: string; labelKey: string }[] = [
  { key: "efh", labelKey: "wizard_type_efh" },
  { key: "mfh", labelKey: "wizard_type_mfh" },
  { key: "gewerbe", labelKey: "wizard_type_commercial" },
  { key: "gutachten", labelKey: "wizard_type_survey" },
  { key: "sonstiges", labelKey: "wizard_type_other" },
];

export default function ProjectEditScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const id = projectId || "";

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [client, setClient] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [desc, setDesc] = useState("");
  const [projType, setProjType] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Load the project once (and refresh if the user comes back to this screen).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(PROJECTS_KEY);
          const list = raw ? JSON.parse(raw) : [];
          const p = Array.isArray(list) ? list.find((x: any) => x.id === id) : null;
          if (active && p) {
            setName(p.name || "");
            setProjectNumber(p.projectNumber || "");
            setClient(p.client || "");
            setAddress(p.address || "");
            setContact(p.contact || "");
            setDesc(p.description || "");
            setProjType(p.projectType || "");
            setColor(p.color || COLORS[0]);
            setImageUri(p.imageUri || null);
          }
        } catch (e) {
          console.warn("[project-edit] load failed", e);
        } finally {
          if (active) setLoaded(true);
        }
      })();
      return () => {
        active = false;
      };
    }, [id]),
  );

  const chooseImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 9], quality: 0.8 });
      if (!res.canceled && res.assets[0]) setImageUri(res.assets[0].uri);
    } catch (e) {
      console.warn("[project-edit] image pick failed", e);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert(t("projektname"), t("project_name_required" as any));
      return;
    }
    setSaving(true);
    try {
      const raw = await AsyncStorage.getItem(PROJECTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const next = (Array.isArray(list) ? list : []).map((p: any) =>
        p.id === id
          ? {
              ...p,
              name: name.trim(),
              projectNumber: projectNumber.trim(),
              client: client.trim(),
              address: address.trim(),
              contact: contact.trim(),
              description: desc.trim(),
              projectType: projType,
              color,
              imageUri: imageUri || undefined,
            }
          : p,
      );
      await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
      router.back();
    } catch (e) {
      console.warn("[project-edit] save failed", e);
      Alert.alert(t("alert_fehler"), t("msg_einstellungen_konnten_nicht_gespeichert_werden"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{t("project_data_edit" as any)}</Text>
      </View>

      {!loaded ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.foreground }]}>{t("projektname")}</Text>
          <TextInput value={name} onChangeText={setName} placeholder={t("projektname")} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

          <Text style={[styles.label, { color: colors.foreground }]}>{t("wizard_project_number" as any)}</Text>
          <TextInput value={projectNumber} onChangeText={setProjectNumber} placeholder="2026-014" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

          <Text style={[styles.label, { color: colors.foreground }]}>{t("wizard_client" as any)}</Text>
          <AssigneeInput value={client} onChange={setClient} placeholder={t("wizard_client" as any)} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

          <Text style={[styles.label, { color: colors.foreground }]}>{t("adresse")}</Text>
          <TextInput value={address} onChangeText={setAddress} placeholder="Musterstraße 1, 12345 Stadt" placeholderTextColor={colors.muted} autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

          <Text style={[styles.label, { color: colors.foreground }]}>{t("wizard_contact" as any)}</Text>
          <TextInput value={contact} onChangeText={setContact} placeholder={t("wizard_contact" as any)} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

          <Text style={[styles.label, { color: colors.foreground }]}>{t("beschreibung_optional")}</Text>
          <TextInput value={desc} onChangeText={setDesc} placeholder={t("beschreibung_optional")} placeholderTextColor={colors.muted} multiline style={[styles.input, { minHeight: 70, textAlignVertical: "top", color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

          <Text style={[styles.label, { color: colors.foreground }]}>{t("wizard_project_type" as any)}</Text>
          <View style={styles.row}>
            {PROJECT_TYPES.map((pt) => {
              const active = projType === pt.key;
              return (
                <Pressable key={pt.key} onPress={() => setProjType(active ? "" : pt.key)} style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.surface }]}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: active ? colors.primary : colors.muted }}>{t(pt.labelKey as any)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>{t("wizard_project_color" as any)}</Text>
          <View style={styles.row}>
            {COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? colors.foreground : "transparent" }]}>
                {color === c && <MaterialIcons name="check" size={16} color="#FFFFFF" />}
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>{t("wizard_project_image" as any)}</Text>
          {imageUri ? (
            <View style={styles.imageWrap}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} contentFit="cover" />
              <Pressable onPress={() => setImageUri(null)} style={styles.imageRemove}>
                <MaterialIcons name="close" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={chooseImage} style={({ pressed }) => [styles.imageAdd, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}>
              <MaterialIcons name="add-a-photo" size={22} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>{t("wizard_add_image" as any)}</Text>
            </Pressable>
          )}

          <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : pressed ? 0.85 : 1 }]}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="check" size={20} color="#FFFFFF" />}
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 16 }}>{t("btn_speichern")}</Text>
          </Pressable>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { height: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: "800", flex: 1 },
  label: { fontSize: 13, fontWeight: "700", marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  imageWrap: { position: "relative", borderRadius: 12, overflow: "hidden" },
  imagePreview: { width: "100%", height: 160, borderRadius: 12 },
  imageRemove: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 14, padding: 5 },
  imageAdd: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderWidth: 1, borderStyle: "dashed", borderRadius: 12 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 12, marginTop: 28 },
});
