import { useState, useEffect } from "react";
import { View, Text, ScrollView, TextInput, Pressable, Alert, Switch, StyleSheet } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getPdfBranding, savePdfBranding, type PdfBranding, type FilenameSchema, type PdfTemplate, DEFAULT_BRANDING } from "@/lib/pdf-branding-store";
import { useTranslation } from "@/lib/language-provider";

const ACCENT_COLORS = [
  "#0a7ea4", "#1E40AF", "#7C3AED", "#DC2626",
  "#059669", "#D97706", "#374151", "#0F172A",
];

export default function PdfBrandingScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const [branding, setBranding] = useState<PdfBranding>(DEFAULT_BRANDING);
  const [hasChanges, setHasChanges] = useState(false);

  async function loadBranding() {
    const b = await getPdfBranding();
    setBranding(b);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadBranding();
    });
  }, []);

  const updateField = (field: keyof PdfBranding, value: any) => {
    setBranding((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await savePdfBranding(branding);
    setHasChanges(false);
    Alert.alert(t('alert_gespeichert'), t('msg_pdfbranding_wurde_aktualisiert'));
  };

  const handleExportSettings = async () => {
    try {
      const { Platform } = await import("react-native");
      const exportData = { ...branding, logoUri: null }; // Don't export local logo path
      const jsonStr = JSON.stringify(exportData, null, 2);
      
      if (Platform.OS === "web") {
        Alert.alert(t('export'), t('msg_export_ist_nur_auf_dem'));
        return;
      }
      
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const filePath = `${FileSystem.documentDirectory}buildki-branding.json`;
      await FileSystem.writeAsStringAsync(filePath, jsonStr);
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(filePath, {
          mimeType: "application/json",
          dialogTitle: t('pdf_branding_export_dialog_title' as any),
        });
      }
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_export_fehlgeschlagen'));
    }
  };

  const handleImportSettings = async () => {
    try {
      const { Platform } = await import("react-native");
      if (Platform.OS === "web") {
        Alert.alert(t('alert_import'), t('msg_import_ist_nur_auf_dem'));
        return;
      }
      
      const DocumentPicker = await import("expo-document-picker");
      const FileSystem = await import("expo-file-system/legacy");
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      
      const fileUri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(fileUri);
      const imported = JSON.parse(content);
      
      // Merge with defaults to ensure all fields exist
      const merged = { ...DEFAULT_BRANDING, ...imported, logoUri: branding.logoUri };
      setBranding(merged);
      setHasChanges(true);
      Alert.alert(t('alert_importiert'), t('msg_einstellungen_wurden_geladen_bitte_speichern'));
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_import_fehlgeschlagen_ungu00fcltige_datei'));
    }
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      try {
        // Copy to persistent app storage so it's always accessible
        const dir = FileSystem.documentDirectory + "branding/";
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
        const filename = `pdf-logo-${Date.now()}.jpg`;
        const destUri = dir + filename;
        await FileSystem.copyAsync({ from: result.assets[0].uri, to: destUri });
        updateField("logoUri", destUri);
      } catch (e) {
        console.warn("[PDF-Branding] Logo copy failed, using picker URI:", e);
        updateField("logoUri", result.assets[0].uri);
      }
    }
  };

  const removeLogo = () => {
    updateField("logoUri", null);
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('pdfbranding')}</Text>
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 0,
            backgroundColor: hasChanges ? colors.primary : colors.surface,
            opacity: pressed ? 0.7 : 1,
          }]}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: hasChanges ? "#FFF" : colors.muted }}>{t('save')}</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Logo Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('firmenlogo')}</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>{t('wird_in_der_kopfzeile')}</Text>

          {branding.logoUri ? (
            <View style={[styles.logoPreview, { borderColor: colors.border }]}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>{t('logo_ausgewaehlt')}</Text>
                <MaterialIcons name="check-circle" size={24} color={colors.success} style={{ marginTop: 8 }} />
              </View>
              <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
                <Pressable onPress={pickLogo} style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 0, backgroundColor: colors.primary + "10", alignItems: "center", opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>{t('aendern')}</Text>
                </Pressable>
                <Pressable onPress={removeLogo} style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 0, backgroundColor: colors.error + "10", alignItems: "center", opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.error }}>{t('entfernen')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={pickLogo}
              style={({ pressed }) => [styles.logoUpload, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="add-photo-alternate" size={32} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>{t('logo_hochladen')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('empfohlen_300x100px_pngjpg')}</Text>
            </Pressable>
          )}
        </View>

        {/* Company Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings_company')}</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>{t('erscheinen_in_der_fusszeile')}</Text>

          <TextInput
            value={branding.companyName}
            onChangeText={(v) => updateField("companyName", v)}
            placeholder={t('firmenname')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />
          <TextInput
            value={branding.companyAddress}
            onChangeText={(v) => updateField("companyAddress", v)}
            placeholder={t('adresse')}
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              value={branding.companyPhone}
              onChangeText={(v) => updateField("companyPhone", v)}
              placeholder={t('telefon')}
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
            <TextInput
              value={branding.companyEmail}
              onChangeText={(v) => updateField("companyEmail", v)}
              placeholder={t('email')}
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>
          <TextInput
            value={branding.companyWebsite}
            onChangeText={(v) => updateField("companyWebsite", v)}
            placeholder={t('website')}
            placeholderTextColor={colors.muted}
            keyboardType="url"
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />
        </View>

        {/* Header/Footer Text */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('kopf_fusszeile')}</Text>

          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('kopfzeile_optional')}</Text>
          <TextInput
            value={branding.headerText}
            onChangeText={(v) => updateField("headerText", v)}
            placeholder={t('pdf_branding_headertext_placeholder' as any)}
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('fusszeile')}</Text>
          <TextInput
            value={branding.footerText}
            onChangeText={(v) => updateField("footerText", v)}
            placeholder={t('pdf_branding_footertext_placeholder' as any)}
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />
        </View>

        {/* Accent Color */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('akzentfarbe')}</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>{t('farbe_der_kopfzeilenlinie')}</Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            {ACCENT_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => updateField("accentColor", color)}
                style={({ pressed }) => [{
                  width: 36,
                  height: 36,
                  borderRadius: 0,
                  backgroundColor: color,
                  borderWidth: branding.accentColor === color ? 3 : 0,
                  borderColor: "#FFF",
                  opacity: pressed ? 0.7 : 1,
                  shadowColor: branding.accentColor === color ? color : "transparent",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.4,
                  shadowRadius: 4,
                  elevation: branding.accentColor === color ? 4 : 0,
                }]}
              />
            ))}
          </View>
        </View>

        {/* Options */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('optionen')}</Text>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('seitenzahlen')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('seite_x_y_in')}</Text>
            </View>
            <Switch
              value={branding.showPageNumbers}
              onValueChange={(v) => updateField("showPageNumbers", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.showPageNumbers ? colors.primary : colors.muted}
            />
          </View>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('datum_anzeigen')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('aktuelles_datum_in_der')}</Text>
            </View>
            <Switch
              value={branding.showDate}
              onValueChange={(v) => updateField("showDate", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.showDate ? colors.primary : colors.muted}
            />
          </View>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('project_name')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('projektname_in_der_kopfzeile')}</Text>
            </View>
            <Switch
              value={branding.showProjectName}
              onValueChange={(v) => updateField("showProjectName", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.showProjectName ? colors.primary : colors.muted}
            />
          </View>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('deckblatt')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('professionelles_deckblatt_mit_logo')}</Text>
            </View>
            <Switch
              value={branding.showCoverPage !== false}
              onValueChange={(v) => updateField("showCoverPage", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.showCoverPage !== false ? colors.primary : colors.muted}
            />
          </View>

          {branding.showCoverPage !== false && (
            <View style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: 16, backgroundColor: colors.surface }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8, textAlign: "center" }}>{t('deckblattvorschau')}</Text>
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                {branding.logoUri ? (
                  <View style={{ width: 40, height: 40, borderRadius: 4, backgroundColor: colors.border, marginBottom: 8, overflow: "hidden" }}>
                    <Image source={{ uri: branding.logoUri }} style={{ width: 40, height: 40 }} />
                  </View>
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 4, backgroundColor: colors.border, marginBottom: 8, alignItems: "center", justifyContent: "center" }}>
                    <MaterialIcons name="business" size={20} color={colors.muted} />
                  </View>
                )}
                <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>{branding.companyName || t('firmenname')}</Text>
                <View style={{ width: 60, height: 2, backgroundColor: branding.accentColor || colors.primary, marginVertical: 6, borderRadius: 1 }} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>{t('baustellenbericht')}</Text>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>{t('project_name')}</Text>
                <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2 }}>{new Date().toLocaleDateString("de-DE")}</Text>
              </View>
            </View>
          )}

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('fotowasserzeichen')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('datum_und_projektname_dezent')}</Text>
            </View>
            <Switch
              value={branding.photoWatermark !== false}
              onValueChange={(v) => updateField("photoWatermark", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.photoWatermark !== false ? colors.primary : colors.muted}
            />
          </View>

          {branding.photoWatermark !== false && (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('wasserzeichentext_optional')}</Text>
              <TextInput
                value={branding.watermarkText || ""}
                onChangeText={(v) => updateField("watermarkText", v)}
                placeholder={t('leer_datum_projektname')}
                placeholderTextColor={colors.muted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              />
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{t('pdf_branding_wasserzeichen_hint' as any)}</Text>
            </View>
          )}
        </View>

        {/* E-Mail-Versand */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('emailversand')}</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>{t('empfu00e4nger_fu00fcr_pdfdirektversand_k')}</Text>

          <TextInput
            value={branding.defaultEmailAddress || ""}
            onChangeText={(v) => updateField("defaultEmailAddress", v)}
            placeholder={t('pdf_branding_email_addresses_placeholder' as any)}
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            multiline
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, minHeight: 44 }]}
          />
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{t('mehrere_adressen_mit_komma')}</Text>

          <View style={[styles.toggleRow, { borderColor: colors.border, marginTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('autoversand')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('pdf_automatisch_nach_protokollerstellung')}</Text>
            </View>
            <Switch
              value={branding.autoSendEmail === true}
              onValueChange={(v) => updateField("autoSendEmail", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.autoSendEmail === true ? colors.primary : colors.muted}
            />
          </View>

          <Text style={[styles.sectionHint, { color: colors.muted, marginTop: 16 }]}>{t('pdf_branding_email_betreff_hint' as any)}</Text>
          <TextInput
            value={branding.emailSubjectTemplate || ""}
            onChangeText={(v) => updateField("emailSubjectTemplate", v)}
            placeholder={t('pdf_branding_email_betreff_placeholder' as any)}
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />

          <Text style={[styles.sectionHint, { color: colors.muted, marginTop: 12 }]}>{t('pdf_branding_email_text_hint' as any)}</Text>
          <TextInput
            value={branding.emailBodyTemplate || ""}
            onChangeText={(v) => updateField("emailBodyTemplate", v)}
            placeholder={t('pdf_branding_email_text_placeholder' as any)}
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, minHeight: 80, textAlignVertical: "top" }]}
          />

          <Text style={[styles.sectionHint, { color: colors.muted, marginTop: 12 }]}>{t('cc_kommagetrennt')}</Text>
          <TextInput
            value={branding.emailCc || ""}
            onChangeText={(v) => updateField("emailCc", v)}
            placeholder={t('pdf_branding_cc_placeholder' as any)}
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />

          <Text style={[styles.sectionHint, { color: colors.muted, marginTop: 12 }]}>{t('bcc_kommagetrennt')}</Text>
          <TextInput
            value={branding.emailBcc || ""}
            onChangeText={(v) => updateField("emailBcc", v)}
            placeholder={t('pdf_branding_bcc_placeholder' as any)}
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />
        </View>

        {/* Custom Layout Editor */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('layoutanpassung')}</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>{t('feineinstellungen_fu00fcr_das_gewu00e4hl')}</Text>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('transkription_anzeigen')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('originaler_sprachtext_unter_dem')}</Text>
            </View>
            <Switch
              value={branding.showTranscription !== false}
              onValueChange={(v) => updateField("showTranscription", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.showTranscription !== false ? colors.primary : colors.muted}
            />
          </View>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('aufgabenliste')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('offene_aufgabentodos_im_pdf')}</Text>
            </View>
            <Switch
              value={branding.showTodos !== false}
              onValueChange={(v) => updateField("showTodos", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.showTodos !== false ? colors.primary : colors.muted}
            />
          </View>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('metadaten')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('ort_wetter_teilnehmer_etc')}</Text>
            </View>
            <Switch
              value={branding.showMetadata !== false}
              onValueChange={(v) => updateField("showMetadata", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.showMetadata !== false ? colors.primary : colors.muted}
            />
          </View>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>{t('unterschriften')}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t('unterschriftenfelder_im_pdf_anzeigen')}</Text>
            </View>
            <Switch
              value={branding.showSignatures !== false}
              onValueChange={(v) => updateField("showSignatures", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.showSignatures !== false ? colors.primary : colors.muted}
            />
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('fotogru00f6u00dfe')}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["klein", "mittel", "gro\u00df"] as const).map((size) => (
                <Pressable
                  key={size}
                  onPress={() => updateField("photoSize", size)}
                  style={({ pressed }) => [{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 0,
                    alignItems: "center",
                    backgroundColor: (branding.photoSize || "mittel") === size ? colors.primary + "15" : colors.surface,
                    borderWidth: (branding.photoSize || "mittel") === size ? 1.5 : 1,
                    borderColor: (branding.photoSize || "mittel") === size ? colors.primary : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: (branding.photoSize || "mittel") === size ? colors.primary : colors.foreground }}>{size.charAt(0).toUpperCase() + size.slice(1)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Preview */}
        <View style={[styles.previewBox, { backgroundColor: "#FFFFFF", borderColor: colors.border }]}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#666", marginBottom: 8 }}>{t('vorschau')}</Text>
          {/* Header Preview */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {branding.logoUri && <View style={{ width: 30, height: 20, backgroundColor: "#e5e7eb", borderRadius: 3 }} />}
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#1a1a1a" }}>{branding.companyName || t('firmenname')}</Text>
          </View>
          {(branding.headerText || branding.showProjectName) && (
            <Text style={{ fontSize: 9, color: "#666" }}>{branding.headerText || t('pdf_branding_projekt_fallback' as any)}</Text>
          )}
          <View style={{ height: 2, backgroundColor: branding.accentColor, marginVertical: 8, borderRadius: 0 }} />
          {/* Content placeholder */}
          <View style={{ gap: 4, marginBottom: 12 }}>
            <View style={{ height: 6, backgroundColor: "#e5e7eb", borderRadius: 0, width: "80%" }} />
            <View style={{ height: 6, backgroundColor: "#e5e7eb", borderRadius: 0, width: "60%" }} />
            <View style={{ height: 6, backgroundColor: "#e5e7eb", borderRadius: 0, width: "70%" }} />
          </View>
          {/* Footer Preview */}
          <View style={{ height: 1, backgroundColor: "#e5e7eb", marginBottom: 6 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 8, color: "#999" }}>{branding.footerText || t('pdf_branding_erstellt_mit_buildki' as any)}</Text>
            <Text style={{ fontSize: 8, color: "#999" }}>
              {branding.showDate ? "15.06.2026" : ""}{branding.showDate && branding.showPageNumbers ? " | " : ""}{branding.showPageNumbers ? "Seite 1 / 3" : ""}
            </Text>
          </View>
        </View>

        {/* Import/Export */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('einstellungen_sichern')}</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>{t('pdfbrandingeinstellungen_exportieren_ode')}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <Pressable
              onPress={handleExportSettings}
              style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 0, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="file-upload" size={18} color="#FFF" />
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFF" }}>{t('export_title')}</Text>
            </Pressable>
            <Pressable
              onPress={handleImportSettings}
              style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="file-download" size={18} color={colors.foreground} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{t('importieren')}</Text>
            </Pressable>
          </View>
        </View>
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
    fontWeight: "700",
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    fontSize: 14,
    marginBottom: 10,
  },
  logoUpload: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderRadius: 0,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  logoPreview: {
    borderRadius: 0,
    borderWidth: 1,
    overflow: "hidden",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  previewBox: {
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
});
