import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Switch, TextInput, Alert, ActivityIndicator } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import {
  getDropboxSettings,
  saveDropboxSettings,
  getUploadHistory,
  clearUploadHistory,
  connectDropbox,
  disconnectDropbox,
  handleDropboxCallback,
  type DropboxSettings,
  type DropboxUploadEntry,
} from "@/lib/dropbox-integration";

export default function DropboxSettingsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const params = useLocalSearchParams();
  const [settings, setSettings] = useState<DropboxSettings | null>(null);
  const [history, setHistory] = useState<DropboxUploadEntry[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Handle OAuth callback params (web redirect)
  useEffect(() => {
    if (params.dropbox_connected === "true" && params.access_token) {
      handleDropboxCallback(params as Record<string, string>).then((success) => {
        if (success) {
          loadData();
          Alert.alert(t('alert_verbunden'), t('msg_dropbox_wurde_erfolgreich_verbunden'));
        }
      });
    } else if (params.error) {
      Alert.alert(t('alert_fehler'), `Dropbox-Verbindung fehlgeschlagen: ${params.error}`);
    }
  }, [params.dropbox_connected, params.error]);

  async function loadData() {
    const [s, h] = await Promise.all([getDropboxSettings(), getUploadHistory()]);
    setSettings(s);
    setHistory(h);
  }

  const updateSetting = async <K extends keyof DropboxSettings>(key: K, value: DropboxSettings[K]) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveDropboxSettings({ [key]: value });
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    const result = await connectDropbox();
    setIsConnecting(false);

    if (result.success) {
      await loadData();
      Alert.alert(t('alert_verbunden'), t('msg_dropbox_wurde_erfolgreich_verbunden'));
    } else if (result.error) {
      Alert.alert(t('alert_fehler'), result.error);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      t('dropbox_trennen'),
      t('dropbox_trennen_frage'),
      [
        { text: t('btn_abbrechen'), style: "cancel" },
        {
          text: t('btn_trennen'),
          style: "destructive",
          onPress: async () => {
            await disconnectDropbox();
            await loadData();
          },
        },
      ]
    );
  };

  const handleClearHistory = () => {
    Alert.alert(
      t('verlauf_loeschen'),
      t('upload_verlauf_loeschen_frage'),
      [
        { text: t('btn_abbrechen'), style: "cancel" },
        {
          text: t('btn_loeschen'),
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
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>{t('dropboxintegration')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {settings.isConnected ? `${t('verbunden')} \u2013 ${t('automatischer_upload')}` : t('nicht_verbunden')}
            </Text>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: settings.isConnected ? "#0061FF15" : colors.border + "30", alignItems: "center", justifyContent: "center" }}>
            <MaterialIcons name="cloud" size={20} color={settings.isConnected ? "#0061FF" : colors.muted} />
          </View>
        </View>

        {/* Connection Status Card */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: settings.isConnected ? "#0061FF30" : colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 0, backgroundColor: settings.isConnected ? "#0061FF15" : colors.border + "30", alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name={settings.isConnected ? "cloud-done" : "cloud-off"} size={24} color={settings.isConnected ? "#0061FF" : colors.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                {settings.isConnected ? t('dropbox_verbunden') : t('nicht_verbunden')}
              </Text>
              {settings.isConnected && settings.accountName ? (
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {settings.accountName}{settings.accountEmail ? ` · ${settings.accountEmail}` : ""}
                </Text>
              ) : !settings.isConnected ? (
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  Verbinde dein Konto für automatische Uploads
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            {settings.isConnected ? (
              <Pressable
                onPress={handleDisconnect}
                style={({ pressed }) => [{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  paddingVertical: 10, borderRadius: 0, borderWidth: 1,
                  backgroundColor: colors.error + "08", borderColor: colors.error + "40",
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MaterialIcons name="link-off" size={16} color={colors.error} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.error }}>{t('verbindung_trennen')}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleConnect}
                disabled={isConnecting}
                style={({ pressed }) => [{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  paddingVertical: 12, borderRadius: 0,
                  backgroundColor: "#0061FF", opacity: pressed ? 0.8 : 1,
                }]}
              >
                {isConnecting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="link" size={18} color="#FFFFFF" />
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>{t('mit_dropbox_verbinden')}</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* Settings (only when connected) */}
        {settings.isConnected && (
          <>
            {/* Auto-Upload Options */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Automatisch hochladen
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: colors.foreground }}>{t('pdfprotokolle')}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{t('nach_jeder_protokollerstellung')}</Text>
                </View>
                <Switch
                  value={settings.autoUploadPdf}
                  onValueChange={(v) => updateSetting("autoUploadPdf", v)}
                  trackColor={{ true: "#0061FF" }}
                />
              </View>
              <View style={{ height: 0.5, backgroundColor: colors.border, marginVertical: 4 }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: colors.foreground }}>{t('gallery_photos')}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{t('protokollfotos_in_dropbox_speichern')}</Text>
                </View>
                <Switch
                  value={settings.autoUploadPhotos}
                  onValueChange={(v) => updateSetting("autoUploadPhotos", v)}
                  trackColor={{ true: "#0061FF" }}
                />
              </View>
            </View>

            {/* Folder Settings */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Ordner-Einstellungen
              </Text>
              <Text style={{ fontSize: 13, color: colors.foreground, marginBottom: 6 }}>{t('basisordner_in_dropbox')}</Text>
              <TextInput
                value={settings.baseFolderPath}
                onChangeText={(text) => updateSetting("baseFolderPath", text)}
                placeholder="/BuildKI"
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 0,
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
                  <Text style={{ fontSize: 14, color: colors.foreground }}>{t('projektunterordner')}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{t('erstellt_zb_buildkiprojektname')}</Text>
                </View>
                <Switch
                  value={settings.useProjectSubfolders}
                  onValueChange={(v) => updateSetting("useProjectSubfolders", v)}
                  trackColor={{ true: "#0061FF" }}
                />
              </View>
            </View>

            {/* File Naming */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Dateiname
              </Text>
              {([
                { key: "project_date" as const, label: "Projekt + Datum", example: "Hausbau_2026-06-20_Begehung.pdf" },
                { key: "number_title" as const, label: "Nummer + Titel", example: "P-001_Baubegehung_EG.pdf" },
                { key: "custom" as const, label: t('benutzerdefiniert'), example: t('eigenes_muster') },
              ]).map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => updateSetting("fileNamingPattern", option.key)}
                  style={({ pressed }) => [{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 10,
                    borderRadius: 0,
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

              {settings.fileNamingPattern === "custom" && (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    value={settings.customPattern || ""}
                    onChangeText={(text) => updateSetting("customPattern", text)}
                    placeholder="{project}_{date}_{title}"
                    placeholderTextColor={colors.muted}
                    style={{
                      backgroundColor: colors.background,
                      borderRadius: 0,
                      padding: 10,
                      fontSize: 14,
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                    Platzhalter: {"{project}"}, {"{date}"}, {"{title}"}, {"{number}"}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Info Box (when not connected) */}
        {!settings.isConnected && (
          <View style={{ backgroundColor: "#0061FF08", borderRadius: 0, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#0061FF20" }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <MaterialIcons name="info-outline" size={18} color="#0061FF" style={{ marginRight: 8, marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: "#0061FF", fontWeight: "600", marginBottom: 4 }}>{t('so_funktionierts')}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, lineHeight: 16 }}>
                  Verbinde dein Dropbox-Konto, um PDFs und Fotos automatisch in deinen Projektordner hochzuladen. Die Dateien werden direkt über die Dropbox-API übertragen – kein manuelles Teilen nötig.{"\n\n"}
                  Alternativ kannst du auch ohne Verbindung den &quot;In Dropbox speichern&quot; Button in der PDF-Vorschau nutzen (über das System-Teilen-Menü).
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Upload History */}
        {history.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{t('uploadverlauf')}</Text>
              <Pressable onPress={handleClearHistory} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <Text style={{ fontSize: 12, color: colors.error }}>{t('delete')}</Text>
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
                    {(entry as any).dropboxPath ? ` → ${(entry as any).dropboxPath}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {settings.lastSyncAt && (
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 8 }}>
            Letzter Upload: {new Date(settings.lastSyncAt).toLocaleString("de-DE")}
          </Text>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
