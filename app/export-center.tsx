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
  type CompanyInfo,
} from "@/lib/pdf-professional";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getExportCenterAction,
  EXPORT_CENTER_OPTIONS,
  type ExportCenterType,
} from "@/lib/export-center-options";
import {
  LAST_SELECTED_PROJECT_KEY,
  PROJECTS_STORAGE_KEY,
  resolveSelectedProject,
  type ProjectContextItem,
} from "@/lib/project-context";

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
  const [activeProject, setActiveProject] = useState<ProjectContextItem | null>(null);

  async function loadCompanyInfo() {
    const info = await getCompanyInfo();
    if (info) {
      setCompanyInfo(info);
      setEditName(info.name);
      setEditAddress(info.address || "");
      setEditPhone(info.phone || "");
      setEditEmail(info.email || "");
      setEditWebsite(info.website || "");
    }
  }

  async function loadActiveProject() {
    try {
      const [projectsRaw, selectedProjectId] = await Promise.all([
        AsyncStorage.getItem(PROJECTS_STORAGE_KEY),
        AsyncStorage.getItem(LAST_SELECTED_PROJECT_KEY),
      ]);
      const projects: ProjectContextItem[] = projectsRaw ? JSON.parse(projectsRaw) : [];
      setActiveProject(resolveSelectedProject(projects, selectedProjectId));
    } catch {
      setActiveProject(null);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadCompanyInfo();
      void loadActiveProject();
    });
  }, []);

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

  const navigateToExportTarget = (type: ExportCenterType) => {
    const action = getExportCenterAction(type, activeProject?.id);

    if (action.kind === "unavailable") {
      Alert.alert("Projekt erforderlich", action.reason);
      return;
    }

    const navigate = () => {
      if (action.params) {
        router.push({ pathname: action.pathname, params: action.params } as any);
      } else {
        router.push(action.pathname as any);
      }
    };

    if (action.dialogTitle && action.dialogMessage) {
      Alert.alert(action.dialogTitle, action.dialogMessage, [
        { text: "Abbrechen", style: "cancel" },
        { text: "Öffnen", onPress: navigate },
      ]);
      return;
    }

    navigate();
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

        <View
          style={[
            styles.projectBadge,
            {
              backgroundColor: activeProject ? colors.primary + "15" : colors.warning + "15",
              borderColor: activeProject ? colors.primary : colors.warning,
            },
          ]}
        >
          <MaterialIcons
            name={activeProject ? "folder" : "folder-off"}
            size={18}
            color={activeProject ? colors.primary : colors.warning}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.projectBadgeLabel, { color: colors.muted }]}>AKTIVES PROJEKT</Text>
            <Text style={[styles.projectBadgeName, { color: colors.foreground }]}>
              {activeProject?.name || "Kein Projekt ausgewählt"}
            </Text>
          </View>
        </View>

        {/* Export Options */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>
          Export-Optionen
        </Text>

        {EXPORT_CENTER_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => navigateToExportTarget(option.id)}
            style={({ pressed }) => [
              styles.exportCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={[styles.exportIcon, { backgroundColor: option.color + "15" }]}>
              <MaterialIcons name={option.icon as any} size={24} color={option.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.exportTitleRow}>
                <Text style={[styles.exportLabel, { color: colors.foreground }]}>{option.label}</Text>
              </View>
              <Text style={[styles.exportDesc, { color: colors.muted }]}>{option.description}</Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={20}
              color={colors.muted}
            />
          </Pressable>
        ))}

        {/* Info */}
        <View style={[styles.infoBox, { backgroundColor: "rgba(0,176,255,0.05)", borderColor: "#00B0FF" }]}>
          <MaterialIcons name="verified" size={18} color="#00B0FF" />
          <Text style={[styles.infoText, { color: colors.muted }]}>
            Jede Exportkarte führt ausschließlich zu einem vorhandenen Ablauf mit realen Projekt- oder Protokolldaten.
          </Text>
        </View>

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
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    marginTop: 12,
  },
  projectBadgeLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  projectBadgeName: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
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
  exportTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 2,
  },
  exportLabel: {
    fontSize: 15,
    fontWeight: "600",
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

});
