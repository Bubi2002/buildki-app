import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Share, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

type Protocol = {
  id: string;
  projectId?: string;
  title: string;
  createdAt: string;
  content?: string;
  summary?: string;
  weather?: { temp?: number; condition?: string };
  photos?: string[];
};

export default function ProjectExportScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const [project, setProject] = useState<any>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [selectedProtocols, setSelectedProtocols] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"text" | "summary" | "full">("full");

  async function loadData() {
    try {
      const [projectsData, protocolsData] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("protocols"),
      ]);
      const allProjects = JSON.parse(projectsData || "[]");
      const proj = allProjects.find((p: any) => p.id === id);
      setProject(proj);

      const allProtocols: Protocol[] = JSON.parse(protocolsData || "[]");
      const projectProtocols = allProtocols
        .filter((p) => p.projectId === id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setProtocols(projectProtocols);
      setSelectedProtocols(new Set(projectProtocols.map((p) => p.id)));
    } catch {}
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadData();
    });
  }, [id]);

  const toggleProtocol = (protocolId: string) => {
    setSelectedProtocols((prev) => {
      const next = new Set(prev);
      if (next.has(protocolId)) next.delete(protocolId);
      else next.add(protocolId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedProtocols(new Set(protocols.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedProtocols(new Set());
  };

  const exportProject = async () => {
    if (selectedProtocols.size === 0) {
      Alert.alert(t('alert_keine_auswahl'), t('msg_bitte_waehle_mindestens_ein_protokoll'));
      return;
    }

    setIsExporting(true);
    try {
      const selected = protocols.filter((p) => selectedProtocols.has(p.id));
      let exportText = "";

      // Header
      exportText += `═══════════════════════════════════════\n`;
      exportText += `PROJEKT-EXPORT: ${project.name}\n`;
      exportText += `═══════════════════════════════════════\n\n`;
      exportText += `Exportiert am: ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}\n`;
      exportText += `Projekt: ${project.name}\n`;
      if (project.description) exportText += `Beschreibung: ${project.description}\n`;
      if (project.protocolPrefix) exportText += `${t('praefix_export').replace('\{prefix\}', project.protocolPrefix)}\n`;
      exportText += `Anzahl Protokolle: ${selected.length}\n`;
      exportText += `\n───────────────────────────────────────\n\n`;

      // Protocols
      selected.forEach((protocol, index) => {
        exportText += `▸ PROTOKOLL ${index + 1}/${selected.length}\n`;
        exportText += `  Titel: ${protocol.title}\n`;
        exportText += `  Datum: ${new Date(protocol.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}\n`;
        if (protocol.weather?.temp) {
          exportText += `  Wetter: ${protocol.weather.temp}°C, ${protocol.weather.condition || ""}\n`;
        }
        if (protocol.photos && protocol.photos.length > 0) {
          exportText += `  Fotos: ${protocol.photos.length} Aufnahmen\n`;
        }
        exportText += `\n`;

        if (exportFormat === "summary" && protocol.summary) {
          exportText += `  Zusammenfassung:\n  ${protocol.summary}\n`;
        } else if (exportFormat === "full" && protocol.content) {
          exportText += `  Inhalt:\n  ${protocol.content.replace(/\n/g, "\n  ")}\n`;
        } else if (protocol.summary) {
          exportText += `  ${protocol.summary}\n`;
        }

        exportText += `\n───────────────────────────────────────\n\n`;
      });

      exportText += `\n═══════════════════════════════════════\n`;
      exportText += `Ende des Exports\n`;
      exportText += `Generiert mit BuildKI\n`;
      exportText += `═══════════════════════════════════════\n`;

      // Share
      if (Platform.OS === "web") {
        // On web, copy to clipboard
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(exportText);
          Alert.alert(t('alert_exportiert'), t('msg_der_export_wurde_in_die'));
        }
      } else {
        await Share.share({
          message: exportText,
          title: `Projekt-Export: ${project.name}`,
        });
      }
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_export_konnte_nicht_erstellt_werden'));
    } finally {
      setIsExporting(false);
    }
  };

  if (!project) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text style={{ color: colors.muted }}>{t('projekt_nicht_gefunden')}</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>{t('projekt_exportieren')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{project.name}</Text>
          </View>
        </View>

        {/* Export Format */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>{t('exportformat')}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([
              { key: "full", label: t('export_vollstaendig'), icon: "article" },
              { key: "summary", label: "Zusammenfassung", icon: "summarize" },
              { key: "text", label: "Nur Titel", icon: "title" },
            ] as const).map((fmt) => (
              <Pressable
                key={fmt.key}
                onPress={() => setExportFormat(fmt.key)}
                style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 0, backgroundColor: exportFormat === fmt.key ? colors.primary + "15" : colors.surface, borderWidth: 1, borderColor: exportFormat === fmt.key ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name={fmt.icon as any} size={16} color={exportFormat === fmt.key ? colors.primary : colors.muted} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: exportFormat === fmt.key ? colors.primary : colors.muted }}>{fmt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Selection Controls */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, flex: 1 }}>
            {selectedProtocols.size}/{protocols.length} Protokolle ausgewählt
          </Text>
          <Pressable onPress={selectAll} style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0, opacity: pressed ? 0.6 : 1 }]}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>{t('all')}</Text>
          </Pressable>
          <Text style={{ color: colors.border, marginHorizontal: 4 }}>|</Text>
          <Pressable onPress={deselectAll} style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0, opacity: pressed ? 0.6 : 1 }]}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>{t('none')}</Text>
          </Pressable>
        </View>

        {/* Protocol List */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          {protocols.map((protocol) => {
            const isSelected = selectedProtocols.has(protocol.id);
            return (
              <Pressable
                key={protocol.id}
                onPress={() => toggleProtocol(protocol.id)}
                style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 0, marginBottom: 8, backgroundColor: isSelected ? colors.primary + "08" : colors.surface, borderWidth: 1, borderColor: isSelected ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name={isSelected ? "check-box" : "check-box-outline-blank"} size={22} color={isSelected ? colors.primary : colors.border} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>{protocol.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {new Date(protocol.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}
                    {protocol.photos && protocol.photos.length > 0 ? ` · ${protocol.photos.length} Fotos` : ""}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {protocols.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <MaterialIcons name="description" size={48} color={colors.border} />
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>{t('protocol_no_protocols')}</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>{t('dieses_projekt_hat_noch')}</Text>
            </View>
          )}
        </ScrollView>

        {/* Export Button */}
        <View style={{ position: "absolute", bottom: 24, left: 20, right: 20 }}>
          <Pressable
            onPress={exportProject}
            disabled={isExporting || selectedProtocols.size === 0}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 0, backgroundColor: selectedProtocols.size > 0 ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="ios-share" size={20} color="#FFF" />
                <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700" }}>
                  {selectedProtocols.size} Protokolle exportieren
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}
