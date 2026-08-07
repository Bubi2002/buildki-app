/**
 * Team-Beitritt ueber Einladungs-Link (Deep-Link-Ziel: .../join?token=...).
 * Loest den Token ueber die Collaboration-Schicht ein. Geraeteuebergreifend
 * funktioniert das erst mit dem Server – bis dahin nur auf demselben Geraet.
 */
import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { collaboration, getOrCreateLocalUser, parseInviteToken } from "@/lib/collaboration";

type JoinState = "working" | "joined" | "invalid";

export default function JoinScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; url?: string }>();
  const [state, setState] = useState<JoinState>("working");
  const [teamRole, setTeamRole] = useState<string>("");

  useEffect(() => {
    (async () => {
      const token =
        (typeof params.token === "string" && params.token) ||
        (typeof params.url === "string" ? parseInviteToken(params.url) : null);
      if (!token) {
        setState("invalid");
        return;
      }
      try {
        const user = await getOrCreateLocalUser();
        const result = await collaboration.acceptInvite(token, {
          userId: user.userId,
          name: user.name,
          email: user.email,
        });
        if (result) {
          setTeamRole(result.role);
          setState("joined");
        } else {
          setState("invalid");
        }
      } catch {
        setState("invalid");
      }
    })();
  }, [params.token, params.url]);

  return (
    <ScreenContainer className="p-0" edges={["left", "right"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Team beitreten",
          headerStyle: { backgroundColor: "#0F1A2E" },
          headerTintColor: "#F0F4F8",
          headerTitleStyle: { color: "#F0F4F8" },
        }}
      />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        {state === "working" && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.muted, marginTop: 16 }}>Einladung wird geprüft …</Text>
          </>
        )}

        {state === "joined" && (
          <>
            <MaterialIcons name="groups" size={56} color={colors.success} />
            <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", marginTop: 14, textAlign: "center" }}>
              Willkommen im Team!
            </Text>
            <Text style={{ color: colors.muted, marginTop: 8, textAlign: "center" }}>
              Du wurdest als „{teamRole}" hinzugefügt.
            </Text>
            <Pressable
              onPress={() => router.replace("/(tabs)" as any)}
              style={{ marginTop: 24, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 28 }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Zur App</Text>
            </Pressable>
          </>
        )}

        {state === "invalid" && (
          <>
            <MaterialIcons name="link-off" size={56} color={colors.error} />
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", marginTop: 14, textAlign: "center" }}>
              Einladung nicht gültig
            </Text>
            <Text style={{ color: colors.muted, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
              Der Einladungs-Link konnte nicht bestätigt werden. Die geräteübergreifende Team-Funktion wird
              mit dem Server aktiviert – bis dahin funktionieren Einladungen nur auf demselben Gerät.
            </Text>
            <Pressable
              onPress={() => router.replace("/(tabs)" as any)}
              style={{ marginTop: 24, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 28 }}
            >
              <Text style={{ color: colors.muted, fontWeight: "700" }}>Zur App</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScreenContainer>
  );
}
