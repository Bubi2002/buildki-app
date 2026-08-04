import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "@/lib/language-provider";

type Protocol = {
  id: string;
  title: string;
  protocol: string;
  templateName?: string;
  createdAt: string;
  protocolNumber?: string;
};

type DiffLine = {
  type: "same" | "added" | "removed" | "changed";
  left: string;
  right: string;
};

function computeDiff(textA: string, textB: string): DiffLine[] {
  const linesA = textA.split("\n");
  const linesB = textB.split("\n");
  const result: DiffLine[] = [];
  const maxLen = Math.max(linesA.length, linesB.length);

  for (let i = 0; i < maxLen; i++) {
    const a = linesA[i] ?? "";
    const b = linesB[i] ?? "";

    if (a === b) {
      result.push({ type: "same", left: a, right: b });
    } else if (!a && b) {
      result.push({ type: "added", left: "", right: b });
    } else if (a && !b) {
      result.push({ type: "removed", left: a, right: "" });
    } else {
      result.push({ type: "changed", left: a, right: b });
    }
  }

  return result;
}

export default function ProtocolCompareScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [selectedA, setSelectedA] = useState<Protocol | null>(null);
  const [selectedB, setSelectedB] = useState<Protocol | null>(null);
  const [selecting, setSelecting] = useState<"A" | "B" | null>(null);

  async function loadProtocols() {
    try {
      const data = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
      setProtocols(data.filter((p: any) => p.status === "ready"));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadProtocols();
    });
  }, []);

  const diff = useMemo(
    () => (selectedA && selectedB ? computeDiff(selectedA.protocol, selectedB.protocol) : []),
    [selectedA, selectedB],
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const stats = {
    same: diff.filter((d) => d.type === "same").length,
    changed: diff.filter((d) => d.type === "changed").length,
    added: diff.filter((d) => d.type === "added").length,
    removed: diff.filter((d) => d.type === "removed").length,
  };

  if (selecting) {
    return (
      <ScreenContainer className="p-4">
        <View style={styles.header}>
          <Pressable onPress={() => setSelecting(null)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {t('protocol_compare_protokoll_waehlen' as any).replace('{slot}', selecting)}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          data={protocols}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const isSelected = (selecting === "A" && selectedA?.id === item.id) || (selecting === "B" && selectedB?.id === item.id);
            const isOther = (selecting === "A" && selectedB?.id === item.id) || (selecting === "B" && selectedA?.id === item.id);
            return (
              <Pressable
                onPress={() => {
                  if (selecting === "A") setSelectedA(item);
                  else setSelectedB(item);
                  setSelecting(null);
                }}
                disabled={isOther}
                style={({ pressed }) => [
                  styles.protocolItem,
                  {
                    backgroundColor: isSelected ? colors.primary + "15" : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                    opacity: isOther ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.protocolTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {item.protocolNumber ? `${item.protocolNumber} – ` : ""}{item.templateName || t('protokoll')}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{formatDate(item.createdAt)}</Text>
                </View>
                {isSelected && <MaterialIcons name="check-circle" size={20} color={colors.primary} />}
                {isOther && <Text style={{ fontSize: 11, color: colors.muted }}>{t('bereits_gewaehlt')}</Text>}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: colors.muted, marginTop: 40 }}>
              {t('protocol_compare_keine_protokolle' as any)}
            </Text>
          }
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-4">
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('protokollvergleich')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Selection */}
      <View style={styles.selectionRow}>
        <Pressable
          onPress={() => setSelecting("A")}
          style={({ pressed }) => [
            styles.selectBtn,
            { backgroundColor: selectedA ? colors.primary + "15" : colors.surface, borderColor: selectedA ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>A</Text>
          <Text style={{ fontSize: 12, color: colors.foreground, flex: 1 }} numberOfLines={1}>
            {selectedA ? (selectedA.protocolNumber || selectedA.templateName || t('protokoll')) : t('auswaehlen')}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
        </Pressable>

        <MaterialIcons name="compare-arrows" size={24} color={colors.muted} />

        <Pressable
          onPress={() => setSelecting("B")}
          style={({ pressed }) => [
            styles.selectBtn,
            { backgroundColor: selectedB ? colors.primary + "15" : colors.surface, borderColor: selectedB ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>B</Text>
          <Text style={{ fontSize: 12, color: colors.foreground, flex: 1 }} numberOfLines={1}>
            {selectedB ? (selectedB.protocolNumber || selectedB.templateName || t('protokoll')) : t('auswaehlen')}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
        </Pressable>
      </View>

      {/* Stats */}
      {diff.length > 0 && (
        <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.success }}>{stats.same}</Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>{t('gleich')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.warning }}>{stats.changed}</Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>{t('geaendert')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#22C55E" }}>{stats.added}</Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>{t('hinzugefuegt')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.error }}>{stats.removed}</Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>{t('entfernt')}</Text>
          </View>
        </View>
      )}

      {/* Diff view */}
      {diff.length > 0 ? (
        <ScrollView style={{ flex: 1, marginTop: 12 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {diff.map((line, i) => (
            <View
              key={i}
              style={[
                styles.diffRow,
                {
                  backgroundColor:
                    line.type === "same" ? "transparent" :
                    line.type === "added" ? "#22C55E10" :
                    line.type === "removed" ? colors.error + "10" :
                    colors.warning + "10",
                  borderLeftColor:
                    line.type === "same" ? "transparent" :
                    line.type === "added" ? "#22C55E" :
                    line.type === "removed" ? colors.error :
                    colors.warning,
                },
              ]}
            >
              <View style={styles.diffLineNum}>
                <Text style={{ fontSize: 9, color: colors.muted }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                {line.type === "same" ? (
                  <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 18 }}>{line.left}</Text>
                ) : line.type === "added" ? (
                  <Text style={{ fontSize: 12, color: "#22C55E", lineHeight: 18 }}>+ {line.right}</Text>
                ) : line.type === "removed" ? (
                  <Text style={{ fontSize: 12, color: colors.error, lineHeight: 18 }}>- {line.left}</Text>
                ) : (
                  <View>
                    <Text style={{ fontSize: 12, color: colors.error, lineHeight: 18, textDecorationLine: "line-through" }}>{line.left}</Text>
                    <Text style={{ fontSize: 12, color: "#22C55E", lineHeight: 18 }}>{line.right}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name="compare-arrows" size={48} color={colors.border} />
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12, textAlign: "center" }}>
            {t('protocol_compare_zwei_waehlen' as any)}
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    marginTop: 12,
  },
  statItem: {
    alignItems: "center",
  },
  protocolItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    gap: 10,
  },
  protocolTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  diffRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderLeftWidth: 3,
    minHeight: 22,
  },
  diffLineNum: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
