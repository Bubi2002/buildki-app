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
import { useTranslation } from "@/lib/language-provider";

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
  const { t } = useTranslation();
  const [mode, setMode] = useState<ComparisonMode>("side_by_side");
  const [pairs, setPairs] = useState<ComparisonPair[]>([]);

  return (
    <ScreenContainer className="p-0">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('comparison_title' as any)}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Mode Selector */}
      <View style={[styles.modeRow, { borderBottomColor: colors.border }]}>
        {([
          { id: "side_by_side", label: t('comparison_mode_side_by_side' as any), icon: "view-column" },
          { id: "overlay", label: t('comparison_mode_overlay' as any), icon: "layers" },
          { id: "slider", label: t('comparison_mode_slider' as any), icon: "compare" },
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
              {t('comparison_empty_title' as any)}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              {t('comparison_empty_subtitle' as any)}
            </Text>

            <View style={styles.featureList}>
              {[
                { icon: "photo-library", label: t('comparison_feature_photos_label' as any), desc: t('comparison_feature_photos_desc' as any) },
                { icon: "view-in-ar", label: t('comparison_feature_scans_label' as any), desc: t('comparison_feature_scans_desc' as any) },
                { icon: "trending-up", label: t('comparison_feature_progress_label' as any), desc: t('comparison_feature_progress_desc' as any) },
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
                  t('comparison_create_title' as any),
                  t('comparison_create_msg' as any),
                  [{ text: t('ok') }]
                );
              }}
              style={({ pressed }) => [styles.createBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.createBtnText}>{t('comparison_create_new' as any)}</Text>
            </Pressable>
          </View>
        ) : (
          pairs.map((pair) => (
            <View key={pair.id} style={[styles.pairCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.pairLabel, { color: colors.foreground }]}>{pair.label}</Text>
              <View style={styles.pairDates}>
                <Text style={[styles.pairDate, { color: colors.muted }]}>
                  {t('comparison_before_prefix' as any)}{pair.beforeDate}
                </Text>
                <Text style={[styles.pairDate, { color: colors.muted }]}>
                  {t('comparison_after_prefix' as any)}{pair.afterDate}
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
