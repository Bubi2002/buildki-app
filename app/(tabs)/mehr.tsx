import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

type Item = { labelKey: string; icon: string; route: string };

/**
 * "Mehr" is a lean admin hub: Team, PDF/Branding & Versand and service
 * connections (Dropbox/Cloud) open the central Einstellungen at the right
 * place, plus Hilfe/FAQ, Einstellungen and Rechtliches. Documents (Protokolle)
 * and the Export-Center live in the project context, not here.
 */
export default function MehrScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const router = useRouter();

  const sections: { titleKey: string; items: Item[]; muted?: boolean }[] = [
    {
      // Verwaltung: Team-Kontaktbuch, PDF/Branding & Versand (in den zentralen
      // Einstellungen), Dienste verbinden (Dropbox/Cloud) und Hilfe.
      titleKey: "mehr_sec_admin",
      items: [
        { labelKey: "index_tool_team", icon: "groups", route: "/team" },
        { labelKey: "mehr_pdf_branding", icon: "palette", route: "/settings?section=berichte" },
        { labelKey: "mehr_cloud_connect", icon: "cloud", route: "/settings?section=konto" },
        { labelKey: "mehr_faq", icon: "help-outline", route: "/faq" },
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
