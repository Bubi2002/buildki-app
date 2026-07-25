import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { LANGUAGE_OPTIONS, type Language } from "@/lib/i18n";
import { useTranslation } from "@/lib/language-provider";

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { language: currentLang, setLanguage } = useTranslation();

  const selectLanguage = async (lang: Language) => {
    await setLanguage(lang);
    Alert.alert(
      t('sprache_geaendert'),
      lang === "de"
        ? "Die App-Sprache wurde auf Deutsch umgestellt. Alle Texte werden jetzt auf Deutsch angezeigt."
        : lang === "en"
        ? "The app language has been changed to English. All texts will now be displayed in English."
        : "La langue de l'application a été changée en français. Tous les textes seront affichés en français.",
      [{ text: t('ok') }]
    );
  };

  return (
    <ScreenContainer className="flex-1">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>{t('sprache_language')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{t('appsprache_auswaehlen')}</Text>
          </View>
        </View>

        {/* Language Options */}
        <View style={{ borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          {LANGUAGE_OPTIONS.map((option, index) => (
            <Pressable
              key={option.id}
              onPress={() => selectLanguage(option.id)}
              style={({ pressed }) => [{
                flexDirection: "row",
                alignItems: "center",
                padding: 16,
                borderBottomWidth: index < LANGUAGE_OPTIONS.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
                backgroundColor: currentLang === option.id ? colors.primary + "08" : "transparent",
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{ fontSize: 28, marginRight: 14 }}>{option.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>{option.name}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {option.id === "de" ? "Deutsch" : option.id === "en" ? "English" : "Français"}
                </Text>
              </View>
              {currentLang === option.id && (
                <MaterialIcons name="check-circle" size={22} color={colors.primary} />
              )}
            </Pressable>
          ))}
        </View>

        {/* Info */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 0, backgroundColor: colors.primary + "08", marginTop: 20 }}>
          <MaterialIcons name="info-outline" size={18} color={colors.primary} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            Die Spracheinstellung ändert sofort die gesamte App-Oberfläche (Tabs, Buttons, Menüs). Die KI-generierte Protokoll-Sprache wird separat in den Vorlagen-Einstellungen konfiguriert.
          </Text>
        </View>

        {/* Protocol Language Note */}
        <View style={{ marginTop: 20, padding: 16, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>{t('protokollsprache')}</Text>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
            Die Sprache der generierten Protokolle kann unabhängig von der App-Sprache eingestellt werden. Gehe dazu in Einstellungen → Allgemein → Protokoll-Sprache.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="settings" size={16} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{t('zu_den_einstellungen')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
