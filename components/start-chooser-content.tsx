import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

/**
 * The "Was möchtest du tun?" chooser body. Shared by the cold-start modal
 * (app/start-chooser.tsx, with a Skip action) and the permanent Start tab
 * (app/(tabs)/start.tsx, without it).
 */
export function StartChooserContent({ onSkip }: { onSkip?: () => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();

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
