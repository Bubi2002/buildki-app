import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

export default function TabLayout() {
  const colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tabs
      initialRouteName="projects"
      screenOptions={{
        tabBarActiveTintColor: "#5DADE2",
        tabBarInactiveTintColor: "#7F8C9B",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: "#0A1220",
          borderTopColor: "#1E3A5F",
          borderTopWidth: 0.5,
        },
      }}
    >
      {/* ── The 4 main tabs: Projekte · Begehung · Aufgaben · Mehr ── */}
      <Tabs.Screen
        name="projects"
        options={{
          title: t("nav_projekte" as any),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="folder.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: t("nav_begehung" as any),
          tabBarIcon: ({ color }) => <IconSymbol size={32} name="camera.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="aufgaben"
        options={{
          title: t("nav_aufgaben" as any),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="checklist" color={color} />,
        }}
      />
      <Tabs.Screen
        name="mehr"
        options={{
          title: t("nav_mehr" as any),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="square.grid.2x2.fill" color={color} />,
        }}
      />

      {/* ── Still routable, but no longer their own bottom-bar tab ── */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="start" options={{ href: null }} />
      <Tabs.Screen name="protocols" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
