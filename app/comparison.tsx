/**
 * protoKI – Vergleichs-Screen
 * 
 * Compare before/after states:
 * - Photo comparison (side-by-side or slider)
 * - Matterport scan comparison (different dates)
 * - Progress tracking visualization
 */
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

// Need to import Alert
import { Alert } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type ComparisonMode = "side_by_side" | "overlay" | "slider";

interface ComparisonPair {
  id: string;
  label: string;
  beforeUri?: string;
  afterUri?: string;
  beforeDate: string;
  afterDate: string;
  room?: string;
  floor?: string;
  notes?: string;
}

export default function ComparisonScreen() {
  const router = useRouter();
  const colors = useColors();
  const [mode, setMode] = useState<ComparisonMode>("side_by_side");
  const [pairs, setPairs] = useState<ComparisonPair[]>([]);

  return (
    <ScreenContainer className="p-0">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Vergleich</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Mode Selector */}
      <View style={[styles.modeRow, { borderBottomColor: colors.border }]}>
        {([
          { id: "side_by_side", label: "Nebeneinander", icon: "view-column" },
          { id: "overlay", label: "Überlagert", icon: "layers" },
          { id: "slider", label: "Schieber", icon: "compare" },
        ] as const).map((m) => (
          <Pressable
            key={m.id}
            onPress={() => setMode(m.id)}
            style={[
              styles.modeBtn,
              { borderBottomColor: mode === m.id ? "#00B0FF" : "transparent" },
            ]}
          >
            <MaterialIcons
              name={m.icon as any}
              size={18}
              color={mode === m.id ? "#00B0FF" : colors.muted}
            />
            <Text style={[styles.modeBtnText, { color: mode === m.id ? "#00B0FF" : colors.muted }]}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {pairs.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="compare" size={56} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Keine Vergleiche
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Erstellen Sie Vorher/Nachher-Vergleiche aus Ihren Fotos oder Matterport-Scans.
            </Text>

            <View style={styles.featureList}>
              {[
                { icon: "photo-library", label: "Fotos vergleichen", desc: "Vorher/Nachher-Fotos nebeneinander" },
                { icon: "view-in-ar", label: "3D-Scans vergleichen", desc: "Matterport-Scans verschiedener Zeitpunkte" },
                { icon: "trending-up", label: "Fortschritt tracken", desc: "Baufortschritt visuell dokumentieren" },
              ].map((feature, i) => (
                <View key={i} style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialIcons name={feature.icon as any} size={24} color="#00B0FF" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.featureLabel, { color: colors.foreground }]}>{feature.label}</Text>
                    <Text style={[styles.featureDesc, { color: colors.muted }]}>{feature.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              onPress={() => {
                Alert.alert(
                  "Vergleich erstellen",
                  "Wählen Sie zwei Fotos oder Matterport-Scans zum Vergleichen aus.",
                  [{ text: "OK" }]
                );
              }}
              style={({ pressed }) => [styles.createBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.createBtnText}>Neuen Vergleich erstellen</Text>
            </Pressable>
          </View>
        ) : (
          pairs.map((pair) => (
            <View key={pair.id} style={[styles.pairCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.pairLabel, { color: colors.foreground }]}>{pair.label}</Text>
              <View style={styles.pairDates}>
                <Text style={[styles.pairDate, { color: colors.muted }]}>
                  Vorher: {pair.beforeDate}
                </Text>
                <Text style={[styles.pairDate, { color: colors.muted }]}>
                  Nachher: {pair.afterDate}
                </Text>
              </View>
              {pair.room && (
                <Text style={[styles.pairRoom, { color: colors.muted }]}>
                  {pair.floor} / {pair.room}
                </Text>
              )}
            </View>
          ))
        )}
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
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  modeRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: "500",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  featureList: {
    width: "100%",
    marginTop: 24,
    gap: 10,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
  },
  featureLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  featureDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#00B0FF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 0,
    marginTop: 24,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  pairCard: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 10,
  },
  pairLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 6,
  },
  pairDates: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pairDate: {
    fontSize: 12,
  },
  pairRoom: {
    fontSize: 12,
    marginTop: 4,
  },
});
