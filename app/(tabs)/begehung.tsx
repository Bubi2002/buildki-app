import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

/**
 * Entry chooser for the "+ Begehung" tab. The camera inspection is the big
 * primary action (one tap → camera already recording via ?quickAction=start),
 * so the main feature stays fast while the user can still clearly pick a mode.
 */
export default function BegehungStartScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <ScreenContainer className="flex-1">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("begehung_pick_title" as any)}</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>{t("begehung_pick_sub" as any)}</Text>

        {/* Primary: camera inspection — one tap, recording starts immediately */}
        <Pressable
          onPress={() => router.push("/record?quickAction=start" as any)}
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
        >
          <View style={styles.primaryIcon}>
            <MaterialIcons name="photo-camera" size={30} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.primaryTitle}>{t("begehung_cam_title" as any)}</Text>
            <Text style={styles.primarySub}>{t("begehung_cam_sub" as any)}</Text>
          </View>
          <MaterialIcons name="arrow-forward" size={24} color="#FFFFFF" />
        </Pressable>

        {/* Secondary modes */}
        <SecondaryCard
          colors={colors}
          icon="meeting-room"
          title={t("begehung_rooms_title" as any)}
          sub={t("begehung_rooms_sub" as any)}
          onPress={() => router.push("/record?quickAction=start&rooms=1" as any)}
        />
        <SecondaryCard
          colors={colors}
          icon="checklist"
          title={t("begehung_check_title" as any)}
          sub={t("begehung_check_sub" as any)}
          onPress={() => router.push("/checklists" as any)}
        />

        {/* Small: just a photo / note */}
        <Pressable
          onPress={() => router.push("/quick-note" as any)}
          style={({ pressed }) => [styles.quicknote, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="add-a-photo" size={20} color={colors.muted} />
          <Text style={[styles.quicknoteLabel, { color: colors.muted }]}>{t("begehung_quicknote" as any)}</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function SecondaryCard({ colors, icon, title, sub, onPress }: { colors: any; icon: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.cardIcon, { backgroundColor: colors.background }]}>
        <MaterialIcons name={icon as any} size={24} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.cardSub, { color: colors.muted }]}>{sub}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: "800", marginTop: 8 },
  sub: { fontSize: 14, marginTop: 4, marginBottom: 20 },
  primary: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 18 },
  primaryIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  primaryTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  primarySub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardSub: { fontSize: 12.5, marginTop: 2 },
  quicknote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderRadius: 12, paddingVertical: 12, marginTop: 18 },
  quicknoteLabel: { fontSize: 14, fontWeight: "600" },
});
