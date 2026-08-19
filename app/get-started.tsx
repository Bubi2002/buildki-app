import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

const SEEN_KEY = "getstarted_seen";

export default function GetStartedScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();

  const done = async () => {
    try { await AsyncStorage.setItem(SEEN_KEY, "true"); } catch {}
  };

  const go = async (path: string, replace = false) => {
    await done();
    if (replace) router.replace(path as any);
    else router.push(path as any);
  };

  const cards: { icon: string; tint: string; title: string; desc: string; onPress: () => void }[] = [
    {
      icon: "add-business",
      tint: "#5DADE2",
      title: t("getstarted_project_t" as any),
      desc: t("getstarted_project_d" as any),
      onPress: () => go("/(tabs)", true),
    },
    {
      icon: "group-add",
      tint: "#4ADE80",
      title: t("getstarted_team_t" as any),
      desc: t("getstarted_team_d" as any),
      onPress: () => go("/team"),
    },
    {
      icon: "menu-book",
      tint: "#A78BFA",
      title: t("getstarted_guide_t" as any),
      desc: t("getstarted_guide_d" as any),
      onPress: () => go("/tutorial"),
    },
    {
      icon: "support-agent",
      tint: "#F59E0B",
      title: t("getstarted_support_t" as any),
      desc: t("getstarted_support_d" as any),
      onPress: () => go("/support-chat"),
    },
  ];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("getstarted_title" as any)}</Text>
          <Pressable onPress={() => go("/(tabs)", true)} hitSlop={8}>
            <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>{t("getstarted_skip" as any)}</Text>
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{t("getstarted_subtitle" as any)}</Text>

        <View style={{ gap: 12, marginTop: 8 }}>
          {cards.map((c) => (
            <Pressable
              key={c.title}
              onPress={c.onPress}
              style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{c.title}</Text>
                <Text style={[styles.cardDesc, { color: colors.muted }]}>{c.desc}</Text>
              </View>
              <View style={[styles.cardIcon, { backgroundColor: c.tint + "22", borderColor: c.tint + "55" }]}>
                <MaterialIcons name={c.icon as any} size={26} color={c.tint} />
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
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 4, marginBottom: 18 },
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
  cardIcon: { width: 54, height: 54, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
