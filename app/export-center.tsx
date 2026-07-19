/**
 * protoKI – Export Center
 * 
 * Central export hub for all document types:
 * - PDF reports with company branding
 * - Excel spreadsheets
 * - Photo documentation
 * - Defect reports
 * - Company info management
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getCompanyInfo,
  saveCompanyInfo,
  generateAndSharePdf,
  type CompanyInfo,
  type ProfessionalPdfOptions,
} from "@/lib/pdf-professional";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ExportType = "protocol" | "defects" | "diary" | "photos" | "report" | "attendance";

interface ExportOption {
  id: ExportType;
  label: string;
  description: string;
  icon: string;
  color: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  { id: "protocol", label: "Protokoll-PDF", description: "Einzelnes Protokoll als professionelles PDF", icon: "description", color: "#1E88E5" },
  { id: "defects", label: "Mängelbericht", description: "Alle Mängel mit Fotos und Status", icon: "warning", color: "#EF4444" },
  { id: "diary", label: "Bautagebuch", description: "Tagesberichte als zusammenhängendes Dokument", icon: "menu-book", color: "#7B1FA2" },
  { id: "photos", label: "Fotodokumentation", description: "Alle Fotos mit Beschriftung und Zuordnung", icon: "photo-library", color: "#43A047" },
  { id: "report", label: "KI-Bericht", description: "Generierter Bericht als formatiertes PDF", icon: "auto-awesome", color: "#00B0FF" },
  { id: "attendance", label: "Anwesenheitsliste", description: "Anwesenheitsdokumentation als Tabelle", icon: "people", color: "#FF9800" },
];

export default function ExportCenterScreen() {
  const router = useRouter();
  const colors = useColors();
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [showCompanyEditor, setShowCompanyEditor] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadCompanyInfo();
  }, []);

  const loadCompanyInfo = async () => {
    const info = await getCompanyInfo();
    if (info) {
      setCompanyInfo(info);
      setEditName(info.name);
      setEditAddress(info.address || "");
      setEditPhone(info.phone || "");
      setEditEmail(info.email || "");
      setEditWebsite(info.website || "");
    }
  };

  const handleSaveCompany = async () => {
    if (!editName.trim()) {
      Alert.alert("Fehler", "Firmenname ist erforderlich.");
      return;
    }
    const info: CompanyInfo = {
      name: editName.trim(),
      address: editAddress.trim() || undefined,
      phone: editPhone.trim() || undefined,
      email: editEmail.trim() || undefined,
      website: editWebsite.trim() || undefined,
    };
    await saveCompanyInfo(info);
    setCompanyInfo(info);
    setShowCompanyEditor(false);
    Alert.alert("Gespeichert", "Firmendaten wurden aktualisiert.");
  };

  const handleExport = async (type: ExportType) => {
    setIsExporting(true);
    try {
      // Get active project name
      let projektName = "";
      try {
        const stored = await AsyncStorage.getItem("active_project");
        if (stored) { const p = JSON.parse(stored); projektName = p.name || p.id || ""; }
      } catch {}

      const options: ProfessionalPdfOptions = {
        title: getExportTitle(type),
        datum: new Date().toLocaleDateString("de-DE"),
        projekt: projektName || undefined,
        companyInfo: companyInfo || undefined,
        accentColor: EXPORT_OPTIONS.find(o => o.id === type)?.color || "#0a7ea4",
        sections: [
          {
            title: "Übersicht",
            content: `Dieser ${getExportTitle(type)} wurde mit protoKI erstellt.\n\nBitte wählen Sie ein spezifisches Protokoll oder Projekt aus, um einen vollständigen Export zu generieren.`,
          },
          {
            title: "Hinweis",
            content: "Für einen vollständigen Export navigieren Sie zum jeweiligen Protokoll oder Projekt und nutzen Sie die Export-Funktion dort.",
          },
        ],
      };

      await generateAndSharePdf(options);
    } catch (error: any) {
      Alert.alert("Export-Fehler", error.message || "Export fehlgeschlagen");
    } finally {
      setIsExporting(false);
    }
  };

  const getExportTitle = (type: ExportType): string => {
    switch (type) {
      case "protocol": return "Protokoll";
      case "defects": return "Mängelbericht";
      case "diary": return "Bautagebuch";
      case "photos": return "Fotodokumentation";
      case "report": return "KI-Bericht";
      case "attendance": return "Anwesenheitsliste";
      default: return "Export";
    }
  };

  return (
    <ScreenContainer className="p-0">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Export-Center</Text>
        <Pressable
          onPress={() => setShowCompanyEditor(!showCompanyEditor)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <MaterialIcons name="business" size={22} color="#00B0FF" />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Company Info Card */}
        {showCompanyEditor && (
          <View style={[styles.companyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Firmendaten (PDF-Header)</Text>

            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Firmenname *"
              placeholderTextColor={colors.muted}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={editAddress}
              onChangeText={setEditAddress}
              placeholder="Adresse"
              placeholderTextColor={colors.muted}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Telefon"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="E-Mail"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={editWebsite}
              onChangeText={setEditWebsite}
              placeholder="Website"
              placeholderTextColor={colors.muted}
            />

            <Pressable
              onPress={handleSaveCompany}
              style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.saveBtnText}>Firmendaten speichern</Text>
            </Pressable>
          </View>
        )}

        {companyInfo && !showCompanyEditor && (
          <View style={[styles.companyBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="business" size={18} color="#00B0FF" />
            <Text style={[styles.companyBadgeText, { color: colors.foreground }]}>
              {companyInfo.name}
            </Text>
            <Pressable onPress={() => setShowCompanyEditor(true)}>
              <MaterialIcons name="edit" size={16} color={colors.muted} />
            </Pressable>
          </View>
        )}

        {/* Export Options */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>
          Export-Optionen
        </Text>

        {EXPORT_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => handleExport(option.id)}
            disabled={isExporting}
            style={({ pressed }) => [
              styles.exportCard,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[styles.exportIcon, { backgroundColor: option.color + "15" }]}>
              <MaterialIcons name={option.icon as any} size={24} color={option.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.exportLabel, { color: colors.foreground }]}>{option.label}</Text>
              <Text style={[styles.exportDesc, { color: colors.muted }]}>{option.description}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        ))}

        {/* Info */}
        <View style={[styles.infoBox, { backgroundColor: "rgba(0,176,255,0.05)", borderColor: "#00B0FF" }]}>
          <MaterialIcons name="info-outline" size={18} color="#00B0FF" />
          <Text style={[styles.infoText, { color: colors.muted }]}>
            Für projektspezifische Exporte navigieren Sie zum jeweiligen Protokoll und nutzen Sie den Export-Button dort. Hier können Sie allgemeine Einstellungen wie Firmendaten verwalten.
          </Text>
        </View>

        {isExporting && (
          <View style={styles.exportingOverlay}>
            <ActivityIndicator size="small" color="#00B0FF" />
            <Text style={[styles.exportingText, { color: colors.muted }]}>PDF wird erstellt...</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
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
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  companyCard: {
    padding: 16,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 16,
  },
  companyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
  },
  companyBadgeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  saveBtn: {
    backgroundColor: "#00B0FF",
    paddingVertical: 12,
    borderRadius: 0,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  exportCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  exportIcon: {
    width: 44,
    height: 44,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  exportLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  exportDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  exportingOverlay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  exportingText: {
    fontSize: 13,
  },
});
