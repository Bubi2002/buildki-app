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
      items: [{ labelKey: "nav_protocols", icon: "description", route: "/protocols" }],
    },
    {
      titleKey: "mehr_sec_admin",
      items: [
        { labelKey: "index_tool_team", icon: "groups", route: "/team" },
        { labelKey: "mehr_pdf_branding", icon: "palette", route: "/pdf-branding" },
        { labelKey: "send_auto_title", icon: "send", route: "/send-automation" },
        { labelKey: "export_center_title", icon: "ios-share", route: "/export-center" },
        { labelKey: "mehr_cloud_backup", icon: "cloud", route: "/cloud-import" },
      ],
    },
    {
      titleKey: "mehr_sec_tools",
      muted: true,
      items: [
        { labelKey: "index_tool_fotos", icon: "photo-library", route: "/photo-gallery" },
        { labelKey: "index_tool_messen", icon: "straighten", route: "/measure" },
        { labelKey: "index_tool_grundriss", icon: "map", route: "/floor-plan" },
        { labelKey: "index_tool_checklisten", icon: "checklist", route: "/checklists" },
        { labelKey: "index_tool_bautagebuch", icon: "menu-book", route: "/bautagebuch" },
        { labelKey: "index_tool_anwesenheit", icon: "how-to-reg", route: "/attendance" },
        { labelKey: "index_tool_zeiterfassung", icon: "timer", route: "/time-tracking" },
        { labelKey: "index_tool_kalender", icon: "calendar-today", route: "/calendar-view" },
      ],
    },
    {
      titleKey: "mehr_sec_app",
      items: [
        { labelKey: "nav_settings", icon: "settings", route: "/settings" },
        { labelKey: "mehr_legal", icon: "gavel", route: "/legal" },
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
