import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Modal } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getProtocolVersions,
  generateSimpleDiff,
  formatVersionDate,
  type ProtocolVersion,
} from "@/lib/protocol-versions";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useTranslation } from "@/lib/language-provider";

export default function ProtocolVersionsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ protocolId?: string; protocolTitle?: string }>();
  const protocolId = params.protocolId || "";
  const protocolTitle = params.protocolTitle || "Protokoll";

  const [versions, setVersions] = useState<ProtocolVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ProtocolVersion | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diffData, setDiffData] = useState<{ added: string[]; removed: string[]; unchanged: number } | null>(null);

  useEffect(() => {
    loadVersions();
  }, [protocolId]);

  const loadVersions = async () => {
    const v = await getProtocolVersions(protocolId);
    setVersions(v);
  };

  const viewVersion = (version: ProtocolVersion) => {
    setSelectedVersion(version);
  };

  const compareToCurrent = (version: ProtocolVersion) => {
    // Get the latest version to compare
    const latest = versions[0];
    if (!latest || latest.id === version.id) {
      Alert.alert(t('hinweis'), t('msg_dies_ist_bereits_die_aktuelle'));
      return;
    }
    const diff = generateSimpleDiff(version.content, latest.content);
    setDiffData(diff);
    setSelectedVersion(version);
    setShowDiff(true);
  };

  const restoreVersion = (version: ProtocolVersion) => {
    Alert.alert(
      "Version wiederherstellen",
      `Möchten Sie Version ${version.version} vom ${formatVersionDate(version.createdAt)} wiederherstellen?`,
      [
        { text: t('btn_abbrechen'), style: "cancel" },
        {
          text: t('btn_wiederherstellen'),
          onPress: async () => {
            try {
              // Load protocols and update the content
              const raw = await AsyncStorage.getItem("protocols");
              const protocols = raw ? JSON.parse(raw) : [];
              const idx = protocols.findIndex((p: any) => p.id === protocolId);
              if (idx >= 0) {
                // Find the active version and update its content
                if (protocols[idx].generatedVersions) {
                  const activeId = protocols[idx].activeVersionId;
                  const vIdx = protocols[idx].generatedVersions.findIndex((v: any) => v.id === activeId);
                  if (vIdx >= 0) {
                    protocols[idx].generatedVersions[vIdx].text = version.content;
                  }
                }
                await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(t('alert_wiederhergestellt'), t('msg_die_version_wurde_erfolgreich_wiederhergestellt'));
                router.back();
              }
            } catch (e: any) {
              Alert.alert(t('alert_fehler'), e?.message || "Wiederherstellung fehlgeschlagen.");
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer className="p-4">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('versionen')}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{protocolTitle}</Text>
        </View>
      </View>

      {versions.length === 0 ? (
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <MaterialIcons name="history" size={48} color={colors.muted} />
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>{t('keine_versionen')}</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, textAlign: "center" }}>
            Versionen werden automatisch beim Bearbeiten und Generieren erstellt.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {versions.map((v, idx) => (
            <Pressable
              key={v.id}
              onPress={() => viewVersion(v)}
              style={({ pressed }) => [
                styles.versionCard,
                { backgroundColor: colors.surface, borderColor: idx === 0 ? colors.primary : colors.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 0, backgroundColor: idx === 0 ? colors.primary + "20" : colors.border + "40", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: idx === 0 ? colors.primary : colors.muted }}>V{v.version}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                      {v.changeNote || `Version ${v.version}`}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      {formatVersionDate(v.createdAt)}
                      {v.templateName ? ` • ${v.templateName}` : ""}
                      {v.isAutoSave ? " • Auto" : ""}
                    </Text>
                  </View>
                </View>
                {idx === 0 && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 0, backgroundColor: colors.primary + "15" }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: colors.primary }}>{t('aktuell')}</Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                {idx > 0 && (
                  <>
                    <Pressable
                      onPress={() => compareToCurrent(v)}
                      style={({ pressed }) => [styles.actionBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name="compare-arrows" size={14} color={colors.muted} />
                      <Text style={{ fontSize: 11, color: colors.muted }}>{t('vergleichen')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => restoreVersion(v)}
                      style={({ pressed }) => [styles.actionBtn, { borderColor: colors.primary + "40", opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons name="restore" size={14} color={colors.primary} />
                      <Text style={{ fontSize: 11, color: colors.primary }}>{t('project_unarchive')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Version Content Modal */}
      <Modal visible={selectedVersion !== null && !showDiff} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {selectedVersion && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                    Version {selectedVersion.version}
                  </Text>
                  <Pressable onPress={() => setSelectedVersion(null)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                    <MaterialIcons name="close" size={24} color={colors.muted} />
                  </Pressable>
                </View>
                <ScrollView style={{ maxHeight: 400 }}>
                  <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20 }}>
                    {selectedVersion.content}
                  </Text>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Diff Modal */}
      <Modal visible={showDiff} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {diffData && selectedVersion && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                    Vergleich: V{selectedVersion.version} → Aktuell
                  </Text>
                  <Pressable onPress={() => { setShowDiff(false); setSelectedVersion(null); }} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                    <MaterialIcons name="close" size={24} color={colors.muted} />
                  </Pressable>
                </View>

                <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                  <View style={{ flex: 1, padding: 10, borderRadius: 0, backgroundColor: "#22C55E10" }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: "#22C55E" }}>+{diffData.added.length}</Text>
                    <Text style={{ fontSize: 11, color: "#22C55E" }}>{t('hinzugefuegt')}</Text>
                  </View>
                  <View style={{ flex: 1, padding: 10, borderRadius: 0, backgroundColor: "#EF444410" }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: "#EF4444" }}>-{diffData.removed.length}</Text>
                    <Text style={{ fontSize: 11, color: "#EF4444" }}>{t('entfernt')}</Text>
                  </View>
                  <View style={{ flex: 1, padding: 10, borderRadius: 0, backgroundColor: colors.border + "20" }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: colors.muted }}>{diffData.unchanged}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{t('unveraendert')}</Text>
                  </View>
                </View>

                <ScrollView style={{ maxHeight: 300 }}>
                  {diffData.removed.slice(0, 10).map((line, i) => (
                    <Text key={`r-${i}`} style={{ fontSize: 12, color: "#EF4444", backgroundColor: "#EF444408", padding: 4, marginBottom: 2, borderRadius: 4 }}>
                      - {line}
                    </Text>
                  ))}
                  {diffData.added.slice(0, 10).map((line, i) => (
                    <Text key={`a-${i}`} style={{ fontSize: 12, color: "#22C55E", backgroundColor: "#22C55E08", padding: 4, marginBottom: 2, borderRadius: 4 }}>
                      + {line}
                    </Text>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 20, fontWeight: "700" },
  versionCard: { borderWidth: 1, borderRadius: 0, padding: 14, marginBottom: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0, borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: "80%" },
});
