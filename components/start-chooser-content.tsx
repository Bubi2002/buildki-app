import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { LAST_SELECTED_PROJECT_KEY } from "@/lib/project-context";

type RecentProject = { id: string; name: string; color?: string };

/**
 * The "Was möchtest du tun?" chooser body. Shared by the cold-start modal
 * (app/start-chooser.tsx, with a Skip action) and the permanent Start tab
 * (app/(tabs)/start.tsx, without it).
 */
export function StartChooserContent({ onSkip }: { onSkip?: () => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [recent, setRecent] = useState<RecentProject | null>(null);

  // Show a "continue where you left off" shortcut to the last-used project so
  // the user doesn't have to drill through several levels on site.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [lastId, projectsRaw] = await Promise.all([
            AsyncStorage.getItem(LAST_SELECTED_PROJECT_KEY),
            AsyncStorage.getItem("projects"),
          ]);
          if (!active) return;
          if (!lastId || !projectsRaw) {
            setRecent(null);
            return;
          }
          const projects = JSON.parse(projectsRaw) as RecentProject[];
          const match = projects.find((p) => p.id === lastId) || null;
          setRecent(match);
        } catch {
          if (active) setRecent(null);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const go = (path: string) => router.replace(path as any);

  const cards: { icon: string; tint: string; title: string; desc: string; onPress: () => void }[] = [
    {
      icon: "mic",
      tint: "#EF4444",
      title: t("neue_aufnahme" as any),
      desc: t("home_desc_record" as any),
      onPress: () => go("/(tabs)/record"),
    },
    {
      icon: "apps",
      tint: "#5DADE2",
      title: t("start_tile_tools_t" as any),
      desc: t("start_tile_tools_d" as any),
      onPress: () => go("/project-wizard"),
    },
    {
      icon: "directions-walk",
      tint: "#34D399",
      title: t("rundgang" as any),
      desc: t("home_desc_rundgang" as any),
      onPress: () => go("/(tabs)/projects"),
    },
  ];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("index_was_moechtest_du_tun" as any)}</Text>
          {onSkip && (
            <Pressable onPress={onSkip} hitSlop={8}>
              <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>{t("getstarted_skip" as any)}</Text>
            </Pressable>
          )}
        </View>

        {recent && (
          <Pressable
            onPress={() => go("/(tabs)/record")}
            style={({ pressed }) => [styles.recentCard, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "55", opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={[styles.recentDot, { backgroundColor: recent.color || colors.primary }]} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, letterSpacing: 0.3 }}>
                {t("start_recent_label" as any).toUpperCase()}
              </Text>
              <Text style={[styles.recentName, { color: colors.foreground }]} numberOfLines={1}>{recent.name}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{t("start_recent_continue" as any)}</Text>
            </View>
            <MaterialIcons name="play-circle-fill" size={30} color={colors.primary} />
          </Pressable>
        )}

        <View style={{ gap: 12, marginTop: 18 }}>
          {cards.map((c) => (
            <Pressable
              key={c.title}
              onPress={c.onPress}
              style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={[styles.cardIcon, { backgroundColor: c.tint + "22", borderColor: c.tint + "55" }]}>
                <MaterialIcons name={c.icon as any} size={28} color={c.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{c.title}</Text>
                <Text style={[styles.cardDesc, { color: colors.muted }]}>{c.desc}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5, flex: 1, paddingRight: 12 },
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
  },
  recentDot: { width: 14, height: 14, borderRadius: 7 },
  recentName: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  cardTitle: { fontSize: 18, fontWeight: "800" },
  cardDesc: { fontSize: 13, marginTop: 3 },
  cardIcon: { width: 56, height: 56, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
