import { View, Text, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { NotificationsSettingsBody } from "@/components/notifications-settings-body";

export default function NotificationsSettingsScreen() {
  const { t } = useTranslation();
  const colors = useColors();

  return (
    <ScreenContainer className="flex-1">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>{t("settings_notifications")}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{t("erinnerungen_konfigurieren")}</Text>
          </View>
        </View>

        <NotificationsSettingsBody />
      </ScrollView>
    </ScreenContainer>
  );
}
