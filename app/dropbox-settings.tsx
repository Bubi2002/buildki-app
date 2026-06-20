import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Switch, TextInput, Alert, FlatList } from "react-native";
import { router, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getDropboxSettings,
  saveDropboxSettings,
  getUploadHistory,
  clearUploadHistory,
  type DropboxSettings,
  type DropboxUploadEntry,
} from "@/lib/dropbox-integration";

export default function DropboxSettingsScreen() {
  const colors = useColors();
  const [settings, setSettings] = useState<DropboxSettings | null>(null);
  const [history, setHistory] = useState<DropboxUploadEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const [s, h] = await Promise.all([getDropboxSettings(), getUploadHistory()]);
    setSettings(s);
    setHistory(h);
  };

  const updateSetting = async <K extends keyof DropboxSettings>(key: K, value: DropboxSettings[K]) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveDropboxSettings({ [key]: value });
  };

  const handleClearHistory = () => {
    Alert.alert(
      "Verlauf löschen",
      "Möchtest du den gesamten Upload-Verlauf löschen?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            await clearUploadHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  if (!settings) return null;

  return (
    <ScreenContainer className="flex-1">
      <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Dropbox-Integration</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>Automatischer PDF-Upload</Text>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: "#0061FF15", alignItems: "center", justifyContent: "center" }}>
            <MaterialIcons name="cloud-upload" size={20} color="#0061FF" />
          </View>
        </View>

        {/* Enable Toggle */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Dropbox aktivieren</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                PDFs automatisch über die Teilen-Funktion an Dropbox senden
              </Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(v) => updateSetting("enabled", v)}
              trackColor={{ true: "#0061FF" }}
            />
          </View>
        </View>

        {settings.enabled && (
          <>
            {/* Auto-Upload Options */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Automatisch hochladen
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 14, color: colors.foreground }}>PDF-Protokolle</Text>
                <Switch
                  value={settings.autoUploadPdf}
                  onValueChange={(v) => updateSetting("autoUploadPdf", v)}
                  trackColor={{ true: "#0061FF" }}
                />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: colors.foreground }}>Fotos</Text>
                <Switch
                  value={settings.autoUploadPhotos}
                  onValueChange={(v) => updateSetting("autoUploadPhotos", v)}
                  trackColor={{ true: "#0061FF" }}
                />
              </View>
            </View>

            {/* Folder Settings */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Ordner-Einstellungen
              </Text>
              <Text style={{ fontSize: 13, color: colors.foreground, marginBottom: 6 }}>Basis-Ordner in Dropbox</Text>
              <TextInput
                value={settings.baseFolderPath}
                onChangeText={(text) => updateSetting("baseFolderPath", text)}
                placeholder="/ProtoKI"
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 12,
                }}
              />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: colors.foreground }}>Projekt-Unterordner</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Erstellt z.B. /ProtoKI/Projektname/</Text>
                </View>
                <Switch
                  value={settings.useProjectSubfolders}
                  onValueChange={(v) => updateSetting("useProjectSubfolders", v)}
                  trackColor={{ true: "#0061FF" }}
                />
              </View>
            </View>

            {/* File Naming */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Dateiname
              </Text>
              {([
                { key: "project_date" as const, label: "Projekt + Datum", example: "Hausbau_2026-06-20_Begehung.pdf" },
                { key: "number_title" as const, label: "Nummer + Titel", example: "P-001_Baubegehung_EG.pdf" },
              ]).map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => updateSetting("fileNamingPattern", option.key)}
                  style={({ pressed }) => [{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 10,
                    borderRadius: 8,
                    marginBottom: 6,
                    backgroundColor: settings.fileNamingPattern === option.key ? "#0061FF10" : "transparent",
                    borderWidth: 1,
                    borderColor: settings.fileNamingPattern === option.key ? "#0061FF40" : "transparent",
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <MaterialIcons
                    name={settings.fileNamingPattern === option.key ? "radio-button-checked" : "radio-button-unchecked"}
                    size={20}
                    color={settings.fileNamingPattern === option.key ? "#0061FF" : colors.muted}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: colors.foreground }}>{option.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{option.example}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            {/* Info Box */}
            <View style={{ backgroundColor: "#0061FF08", borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#0061FF20" }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <MaterialIcons name="info-outline" size={18} color="#0061FF" style={{ marginRight: 8, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: "#0061FF", fontWeight: "600", marginBottom: 4 }}>So funktioniert's</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, lineHeight: 16 }}>
                    Nach der Protokoll-Erstellung wird das PDF automatisch über die iOS/Android Teilen-Funktion geöffnet. Wähle dort "In Dropbox speichern" um es direkt in deinen Projektordner hochzuladen.{"\n\n"}
                    Stelle sicher, dass die Dropbox-App auf deinem Gerät installiert ist.
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Upload History */}
        {history.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Upload-Verlauf</Text>
              <Pressable onPress={handleClearHistory} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <Text style={{ fontSize: 12, color: colors.error }}>Löschen</Text>
              </Pressable>
            </View>
            {history.slice(0, 10).map((entry) => (
              <View key={entry.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <MaterialIcons
                  name={entry.success ? "check-circle" : "error"}
                  size={18}
                  color={entry.success ? colors.success : colors.error}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: colors.foreground }} numberOfLines={1}>{entry.fileName}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {new Date(entry.timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {entry.projectName ? ` · ${entry.projectName}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
