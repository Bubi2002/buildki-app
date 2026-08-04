import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/lib/language-provider";
import {
  DEFAULT_PRIVACY_CHOICES,
  getPrivacyChoices,
  saveConsent,
  type OptionalPurpose,
  type PrivacyChoices,
} from "@/lib/privacy-consent";
import { initSyncManager, stopSyncManager } from "@/lib/offline-sync-manager";
import { trpc } from "@/lib/trpc";

interface Props {
  colors: {
    foreground: string;
    muted: string;
    primary: string;
    border: string;
    surface: string;
    error: string;
  };
}

const ITEMS: {
  purpose: OptionalPurpose;
  label: string;
  description: string;
  icon: "psychology" | "cloud-sync" | "location-on";
}[] = [
  {
    purpose: "aiProcessing",
    label: "privacy_choices_section_ai_label",
    description: "privacy_choices_section_ai_desc",
    icon: "psychology",
  },
  {
    purpose: "cloudSync",
    label: "privacy_choices_section_cloud_label",
    description: "privacy_choices_section_cloud_desc",
    icon: "cloud-sync",
  },
  {
    purpose: "gpsTracking",
    label: "privacy_choices_section_gps_label",
    description: "privacy_choices_section_gps_desc",
    icon: "location-on",
  },
];

export function PrivacyChoicesSection({ colors }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [choices, setChoices] = useState<PrivacyChoices>({
    ...DEFAULT_PRIVACY_CHOICES,
  });
  const [busyPurpose, setBusyPurpose] = useState<OptionalPurpose | null>(null);
  const [status, setStatus] = useState(t('privacy_choices_section_nur_lokal' as any));

  const remoteQuery = trpc.privacy.getChoices.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const saveRemote = trpc.privacy.saveChoices.useMutation();

  useEffect(() => {
    getPrivacyChoices().then(setChoices);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !remoteQuery.data) return;
    const remoteChoices = remoteQuery.data.choices;
    void Promise.resolve().then(() => {
      setChoices(remoteChoices);
      setStatus(t('privacy_choices_section_nachweis_synchronisiert' as any));
    });
    saveConsent(remoteChoices, "server-sync").catch(() => undefined);
  }, [isAuthenticated, remoteQuery.data]);

  const applyRuntimeState = async (next: PrivacyChoices) => {
    if (next.aiProcessing && next.cloudSync) {
      await initSyncManager();
    } else {
      stopSyncManager();
    }
  };

  const toggle = async (purpose: OptionalPurpose) => {
    if (busyPurpose) return;
    const previous = { ...choices };
    const next = { ...choices, [purpose]: !choices[purpose] };
    setBusyPurpose(purpose);
    setChoices(next);

    try {
      await saveConsent(next, "settings");
      if (isAuthenticated) {
        await saveRemote.mutateAsync({
          version: 2,
          choices: next,
          source: "settings",
        });
        setStatus(t('privacy_choices_section_nachweis_synchronisiert' as any));
      } else {
        setStatus(t('privacy_choices_section_lokal_gespeichert' as any));
      }
      await applyRuntimeState(next);
    } catch  {
      setChoices(previous);
      await saveConsent(previous, "settings-rollback");
      await applyRuntimeState(previous);
      Alert.alert(
        t('privacy_choices_section_option_nicht_geaendert' as any),
        t('privacy_choices_section_option_nicht_geaendert_msg' as any),
      );
    } finally {
      setBusyPurpose(null);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.error,
          padding: 12,
          backgroundColor: colors.error + "10",
        }}
      >
        <Text style={{ color: colors.error, fontWeight: "800", fontSize: 12 }}>
          {t('privacy_choices_section_compliance_hinweis' as any)}
        </Text>
      </View>

      {ITEMS.map((item) => {
        const enabled = choices[item.purpose];
        const busy = busyPurpose === item.purpose;
        return (
          <Pressable
            key={item.purpose}
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled, disabled: Boolean(busyPurpose) }}
            accessibilityLabel={t(item.label as any)}
            disabled={Boolean(busyPurpose)}
            onPress={() => toggle(item.purpose)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              padding: 14,
              borderWidth: 1,
              borderColor: enabled ? colors.primary : colors.border,
              backgroundColor: enabled ? colors.primary + "10" : colors.surface,
              opacity: pressed || busy ? 0.72 : 1,
            })}
          >
            <MaterialIcons
              name={item.icon}
              size={22}
              color={enabled ? colors.primary : colors.muted}
            />
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700" }}>
                {t(item.label as any)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                {t(item.description as any)}
              </Text>
            </View>
            <View
              style={{
                width: 44,
                height: 24,
                borderWidth: 1,
                borderColor: enabled ? colors.primary : colors.border,
                backgroundColor: enabled ? colors.primary : "transparent",
                justifyContent: "center",
                paddingHorizontal: 2,
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  backgroundColor: enabled ? "#FFFFFF" : colors.muted,
                  alignSelf: enabled ? "flex-end" : "flex-start",
                }}
              />
            </View>
          </Pressable>
        );
      })}

      <Text style={{ color: colors.muted, fontSize: 11 }}>{status}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>
        {t('privacy_choices_section_widerruf_hinweis' as any)}
      </Text>

      <Pressable
        onPress={() => router.push("/legal?section=dsgvo-export" as never)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <MaterialIcons name="manage-accounts" size={20} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontWeight: "600", marginLeft: 10, flex: 1 }}>
          {t('privacy_choices_section_export_loeschung' as any)}
        </Text>
        <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}
