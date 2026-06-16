import { useState, useEffect } from "react";
import { View, Text, ScrollView, TextInput, Pressable, Alert, Switch, StyleSheet } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getPdfBranding, savePdfBranding, type PdfBranding, type FilenameSchema, type PdfTemplate, DEFAULT_BRANDING } from "@/lib/pdf-branding-store";

const ACCENT_COLORS = [
  "#0a7ea4", "#1E40AF", "#7C3AED", "#DC2626",
  "#059669", "#D97706", "#374151", "#0F172A",
];

export default function PdfBrandingScreen() {
  const colors = useColors();
  const [branding, setBranding] = useState<PdfBranding>(DEFAULT_BRANDING);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadBranding();
  }, []);

  const loadBranding = async () => {
    const b = await getPdfBranding();
    setBranding(b);
  };

  const updateField = (field: keyof PdfBranding, value: any) => {
    setBranding((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await savePdfBranding(branding);
    setHasChanges(false);
    Alert.alert("Gespeichert", "PDF-Branding wurde aktualisiert.");
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      updateField("logoUri", result.assets[0].uri);
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>PDF-Branding</Text>
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: hasChanges ? colors.primary : colors.surface,
            opacity: pressed ? 0.7 : 1,
          }]}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: hasChanges ? "#FFF" : colors.muted }}>Speichern</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Logo Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Firmenlogo</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>Wird in der Kopfzeile des PDFs angezeigt</Text>

          {branding.logoUri ? (
            <View style={[styles.logoPreview, { borderColor: colors.border }]}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>Logo ausgewählt</Text>
                <MaterialIcons name="check-circle" size={24} color={colors.success} style={{ marginTop: 8 }} />
              </View>
              <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
                <Pressable onPress={pickLogo} style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: colors.primary + "10", alignItems: "center", opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>Ändern</Text>
                </Pressable>
                <Pressable onPress={removeLogo} style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: colors.error + "10", alignItems: "center", opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.error }}>Entfernen</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={pickLogo}
              style={({ pressed }) => [styles.logoUpload, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="add-photo-alternate" size={32} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>Logo hochladen</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>Empfohlen: 300x100px, PNG/JPG</Text>
            </Pressable>
          )}
        </View>

        {/* Company Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Firmendaten</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>Erscheinen in der Fußzeile</Text>

          <TextInput
            value={branding.companyName}
            onChangeText={(v) => updateField("companyName", v)}
            placeholder="Firmenname"
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />
          <TextInput
            value={branding.companyAddress}
            onChangeText={(v) => updateField("companyAddress", v)}
            placeholder="Adresse"
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              value={branding.companyPhone}
              onChangeText={(v) => updateField("companyPhone", v)}
              placeholder="Telefon"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
            <TextInput
              value={branding.companyEmail}
              onChangeText={(v) => updateField("companyEmail", v)}
              placeholder="E-Mail"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>
          <TextInput
            value={branding.companyWebsite}
            onChangeText={(v) => updateField("companyWebsite", v)}
            placeholder="Website"
            placeholderTextColor={colors.muted}
            keyboardType="url"
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />
        </View>

        {/* Header/Footer Text */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Kopf- & Fußzeile</Text>

          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Kopfzeile (optional)</Text>
          <TextInput
            value={branding.headerText}
            onChangeText={(v) => updateField("headerText", v)}
            placeholder="z.B. Baustellenprotokoll - Vertraulich"
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Fußzeile</Text>
          <TextInput
            value={branding.footerText}
            onChangeText={(v) => updateField("footerText", v)}
            placeholder="z.B. Erstellt mit ProtoKI"
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          />
        </View>

        {/* Accent Color */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Akzentfarbe</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>Farbe der Kopfzeilen-Linie</Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            {ACCENT_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => updateField("accentColor", color)}
                style={({ pressed }) => [{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
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
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Optionen</Text>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>Seitenzahlen</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>Seite X / Y in der Fußzeile</Text>
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
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>Datum anzeigen</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>Aktuelles Datum in der Fußzeile</Text>
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
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>Projektname</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>Projektname in der Kopfzeile</Text>
            </View>
            <Switch
              value={branding.showProjectName}
              onValueChange={(v) => updateField("showProjectName", v)}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={branding.showProjectName ? colors.primary : colors.muted}
            />
          </View>
        </View>

        {/* Filename Schema */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Dateiname</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>Schema für den PDF-Dateinamen</Text>

          {([
            { key: "project_date_nr" as FilenameSchema, label: "Projekt_Datum_Nr", example: "Baustelle_2026-06-15_BST-004" },
            { key: "nr_project_date" as FilenameSchema, label: "Nr_Projekt_Datum", example: "BST-004_Baustelle_2026-06-15" },
            { key: "date_project_nr" as FilenameSchema, label: "Datum_Projekt_Nr", example: "2026-06-15_Baustelle_BST-004" },
            { key: "project_nr" as FilenameSchema, label: "Projekt_Nr", example: "Baustelle_BST-004" },
            { key: "date_nr" as FilenameSchema, label: "Datum_Nr", example: "2026-06-15_BST-004" },
          ]).map((schema) => (
            <Pressable
              key={schema.key}
              onPress={() => updateField("filenameSchema", schema.key)}
              style={({ pressed }) => [{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 10,
                marginBottom: 6,
                backgroundColor: branding.filenameSchema === schema.key ? colors.primary + "12" : colors.surface,
                borderWidth: branding.filenameSchema === schema.key ? 1.5 : 1,
                borderColor: branding.filenameSchema === schema.key ? colors.primary : colors.border,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: branding.filenameSchema === schema.key ? colors.primary : colors.muted, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                {branding.filenameSchema === schema.key && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{schema.label}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{schema.example}.pdf</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* PDF Template / Layout */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>PDF-Layout</Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>Wähle das Layout für den PDF-Export</Text>

          {([
            { key: "standard" as PdfTemplate, label: "Standard", desc: "Vollständiges Protokoll mit Fotos und Metadaten", icon: "description" as const },
            { key: "compact" as PdfTemplate, label: "Kompakt", desc: "Nur Protokolltext und Aufgaben, kleine Fotos", icon: "compress" as const },
            { key: "detailed" as PdfTemplate, label: "Detailliert", desc: "Alle Infos inkl. Transkription, große Fotos, Planverortung", icon: "article" as const },
            { key: "no_photos" as PdfTemplate, label: "Ohne Fotos", desc: "Nur Text, Aufgaben und Metadaten – kein Bildmaterial", icon: "text-snippet" as const },
          ]).map((template) => (
            <Pressable
              key={template.key}
              onPress={() => updateField("pdfTemplate", template.key)}
              style={({ pressed }) => [{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 10,
                marginBottom: 6,
                backgroundColor: branding.pdfTemplate === template.key ? colors.primary + "12" : colors.surface,
                borderWidth: branding.pdfTemplate === template.key ? 1.5 : 1,
                borderColor: branding.pdfTemplate === template.key ? colors.primary : colors.border,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: branding.pdfTemplate === template.key ? colors.primary : colors.muted, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                {branding.pdfTemplate === template.key && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
              </View>
              <MaterialIcons name={template.icon} size={20} color={branding.pdfTemplate === template.key ? colors.primary : colors.muted} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{template.label}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{template.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Preview */}
        <View style={[styles.previewBox, { backgroundColor: "#FFFFFF", borderColor: colors.border }]}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#666", marginBottom: 8 }}>Vorschau</Text>
          {/* Header Preview */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {branding.logoUri && <View style={{ width: 30, height: 20, backgroundColor: "#e5e7eb", borderRadius: 3 }} />}
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#1a1a1a" }}>{branding.companyName || "Firmenname"}</Text>
          </View>
          {(branding.headerText || branding.showProjectName) && (
            <Text style={{ fontSize: 9, color: "#666" }}>{branding.headerText || "Projekt: Beispielprojekt"}</Text>
          )}
          <View style={{ height: 2, backgroundColor: branding.accentColor, marginVertical: 8, borderRadius: 1 }} />
          {/* Content placeholder */}
          <View style={{ gap: 4, marginBottom: 12 }}>
            <View style={{ height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, width: "80%" }} />
            <View style={{ height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, width: "60%" }} />
            <View style={{ height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, width: "70%" }} />
          </View>
          {/* Footer Preview */}
          <View style={{ height: 1, backgroundColor: "#e5e7eb", marginBottom: 6 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 8, color: "#999" }}>{branding.footerText || "Erstellt mit ProtoKI"}</Text>
            <Text style={{ fontSize: 8, color: "#999" }}>
              {branding.showDate ? "15.06.2026" : ""}{branding.showDate && branding.showPageNumbers ? " | " : ""}{branding.showPageNumbers ? "Seite 1 / 3" : ""}
            </Text>
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
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    marginBottom: 10,
  },
  logoUpload: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  logoPreview: {
    borderRadius: 12,
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
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
});
