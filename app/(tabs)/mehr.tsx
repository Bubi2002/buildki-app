import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

type Item = { labelKey: string; icon: string; route: string };

/**
 * "Mehr" is an admin / settings hub — NOT the old tool grid. The construction
 * tools (Messen, Grundriss, Fotos, Checklisten …) belong in the project /
 * inspection context; they only appear here as a secondary shortcut section
 * during the restructure so nothing is unreachable.
 */
export default function MehrScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const router = useRouter();

  const sections: { titleKey: string; items: Item[]; muted?: boolean }[] = [
    {
      titleKey: "mehr_sec_docs",
      items: [
        { labelKey: "nav_protocols", icon: "description", route: "/protocols" },
        { labelKey: "export_center_title", icon: "ios-share", route: "/export-center" },
      ],
    },
    {
      // Single entry point into the central settings — every item here opens the
      // same Einstellungen screen at the matching category (no parallel area).
      titleKey: "nav_settings",
      items: [
        { labelKey: "cat_company_title", icon: "business", route: "/settings?section=unternehmen" },
        { labelKey: "cat_reports_title", icon: "description", route: "/settings?section=berichte" },
        { labelKey: "cat_dispatch_title", icon: "send", route: "/settings?section=versand" },
        { labelKey: "cat_notif_title", icon: "notifications", route: "/settings?section=benachrichtigungen" },
        { labelKey: "cat_account_title", icon: "cloud", route: "/settings?section=konto" },
        { labelKey: "cat_app_title", icon: "settings", route: "/settings?section=app" },
      ],
    },
  ];

  return (
    <ScreenContainer className="flex-1">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("nav_mehr" as any)}</Text>
        {sections.map((sec) => (
          <View key={sec.titleKey} style={{ marginTop: 18 }}>
            <Text style={[styles.secTitle, { color: colors.muted }]}>{t(sec.titleKey as any)}</Text>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {sec.items.map((it, i) => (
                <Pressable
                  key={it.route}
                  onPress={() => router.push(it.route as any)}
                  style={({ pressed }) => [styles.row, { borderTopColor: colors.border, borderTopWidth: i === 0 ? 0 : 1, opacity: pressed ? 0.6 : 1 }]}
                >
                  <MaterialIcons name={it.icon as any} size={22} color={sec.muted ? colors.muted : colors.primary} />
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>{t(it.labelKey as any)}</Text>
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: "800", marginTop: 8 },
  secTitle: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
});
