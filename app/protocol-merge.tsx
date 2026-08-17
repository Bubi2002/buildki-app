import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Switch } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { mergeProtocols, type MergeOptions } from "@/lib/protocol-merge";
import * as Sharing from "expo-sharing";
import { hasProtocolText } from "@/lib/protocol-compat";
import { useTranslation } from "@/lib/language-provider";

type Protocol = {
  id: string;
  projectId?: string;
  title: string;
  createdAt: string;
  protocol?: string;
  content?: string;
  transcription?: string;
  summary?: string;
  photos?: string[];
  protocolNumber?: string;
};

export default function ProtocolMergeScreen() {
  const { t } = useTranslation();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const colors = useColors();
  const [project, setProject] = useState<any>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [selectedProtocols, setSelectedProtocols] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeTodos, setIncludeTodos] = useState(true);
  const [includeWeather, setIncludeWeather] = useState(true);

  async function loadData() {
    try {
      const [projectsData, protocolsData] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("protocols"),
      ]);
      const allProjects = JSON.parse(projectsData || "[]");
      const proj = allProjects.find((p: any) => p.id === projectId);
      setProject(proj);

      const allProtocols: Protocol[] = JSON.parse(protocolsData || "[]");
      const projectProtocols = allProtocols
        .filter((p) => p.projectId === projectId && hasProtocolText(p))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setProtocols(projectProtocols);
      // Pre-select all
      setSelectedProtocols(new Set(projectProtocols.map((p) => p.id)));
    } catch {}
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadData();
    });
  }, [projectId]);

  const toggleProtocol = (protocolId: string) => {
    setSelectedProtocols((prev) => {
      const next = new Set(prev);
      if (next.has(protocolId)) next.delete(protocolId);
      else next.add(protocolId);
      return next;
    });
  };

  const selectAll = () => setSelectedProtocols(new Set(protocols.map((p) => p.id)));
  const deselectAll = () => setSelectedProtocols(new Set());

  const handleMerge = async () => {
    if (selectedProtocols.size < 2) {
      Alert.alert(t('alert_mindestens_2'), t('msg_bitte_waehle_mindestens_2_protokolle'));
      return;
    }

    setIsExporting(true);
    try {
      const options: MergeOptions = {
        projectId: projectId!,
        protocolIds: Array.from(selectedProtocols),
        includePhotos,
        includeTodos,
        includeWeather,
      };

      const result = await mergeProtocols(options);
      if (!result.success || !result.filePath) {
        Alert.alert(t('alert_fehler'), result.error || t('msg_gesamtbericht_konnte_nicht_erstellt_werden'));
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.filePath, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), e.message || t('protocol_merge_unbekannter_fehler' as any));
    } finally {
      setIsExporting(false);
    }
  };

  // Group protocols by date
  const groupedByDate = protocols.reduce<Record<string, Protocol[]>>((acc, p) => {
    const date = new Date(p.createdAt).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(p);
    return acc;
  }, {});

  const selectToday = () => {
    const today = new Date().toISOString().split("T")[0];
    const todayProtocols = protocols.filter(p => p.createdAt.startsWith(today));
    setSelectedProtocols(new Set(todayProtocols.map(p => p.id)));
  };

  if (!project) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>{t('gesamtbericht_erstellen')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{project.name}</Text>
          </View>
        </View>

        {/* Options */}
        <View style={{ marginBottom: 16, backgroundColor: colors.surface, borderRadius: 0, padding: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{t('optionen')}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ fontSize: 13, color: colors.foreground }}>{t('fotos_referenzieren')}</Text>
            <Switch value={includePhotos} onValueChange={setIncludePhotos} trackColor={{ true: colors.primary }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ fontSize: 13, color: colors.foreground }}>{t('aufgaben_zusammenfassen')}</Text>
            <Switch value={includeTodos} onValueChange={setIncludeTodos} trackColor={{ true: colors.primary }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: colors.foreground }}>{t('wetterdaten_einbeziehen')}</Text>
            <Switch value={includeWeather} onValueChange={setIncludeWeather} trackColor={{ true: colors.primary }} />
          </View>
        </View>

        {/* Selection Controls */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, flex: 1 }}>
            {selectedProtocols.size}/{protocols.length} {t('protocol_merge_ausgewaehlt' as any)}
          </Text>
          <Pressable onPress={selectToday} style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.primary + "10", opacity: pressed ? 0.6 : 1, marginRight: 8 }]}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.primary }}>{t('heute')}</Text>
          </Pressable>
          <Pressable onPress={selectAll} style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0, opacity: pressed ? 0.6 : 1 }]}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>{t('all')}</Text>
          </Pressable>
          <Text style={{ color: colors.border, marginHorizontal: 4 }}>|</Text>
          <Pressable onPress={deselectAll} style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0, opacity: pressed ? 0.6 : 1 }]}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>{t('none')}</Text>
          </Pressable>
        </View>

        {/* Protocol List grouped by date */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          {Object.entries(groupedByDate).map(([date, dateProtocols]) => (
            <View key={date} style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{date}</Text>
              {dateProtocols.map((protocol) => {
                const isSelected = selectedProtocols.has(protocol.id);
                return (
                  <Pressable
                    key={protocol.id}
                    onPress={() => toggleProtocol(protocol.id)}
                    style={({ pressed }) => [{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 0,
                      marginBottom: 6,
                      backgroundColor: isSelected ? colors.primary + "08" : colors.surface,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    }]}
                  >
                    <MaterialIcons name={isSelected ? "check-box" : "check-box-outline-blank"} size={22} color={isSelected ? colors.primary : colors.border} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                        {protocol.protocolNumber ? `${protocol.protocolNumber} – ` : ""}{protocol.title}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                        {new Date(protocol.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        {protocol.photos && protocol.photos.length > 0 ? ` · ${protocol.photos.length} ${t('protocol_merge_fotos' as any)}` : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {protocols.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <MaterialIcons name="merge-type" size={48} color={colors.border} />
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>{t('protocol_no_protocols')}</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                {t('protocol_merge_keine_fertigen_protokolle' as any)}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Merge Button */}
        <View style={{ position: "absolute", bottom: 24, left: 20, right: 20 }}>
          <Pressable
            onPress={handleMerge}
            disabled={isExporting || selectedProtocols.size < 2}
            style={({ pressed }) => [{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 16,
              borderRadius: 0,
              backgroundColor: selectedProtocols.size >= 2 ? colors.primary : colors.border,
              opacity: pressed || isExporting ? 0.8 : 1,
            }]}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="merge-type" size={20} color="#FFF" />
                <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700" }}>
                  {selectedProtocols.size < 2
                    ? t('min_2_protokolle')
                    : t('n_protokolle_zusammenfuehren').replace('{count}', String(selectedProtocols.size))}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}
