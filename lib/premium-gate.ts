import { Alert } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { FREE_PROJECT_LIMIT, MONETIZATION_ENABLED, type PremiumFeature } from "./monetization";
import { hasPremiumAccess } from "@/hooks/use-premium";

type T = (key: any) => string;

function showPaywallAlert(messageKey: string, t: T) {
  Alert.alert(t("premium_required_title"), t(messageKey), [
    { text: t("btn_abbrechen"), style: "cancel" },
    { text: t("premium_see"), onPress: () => router.push("/subscription" as any) },
  ]);
}

/**
 * Gate a premium feature inside an event handler. Returns true if the action
 * may proceed; otherwise shows the paywall alert and returns false.
 * While monetization is disabled, always returns true (nothing is gated).
 */
export function ensurePremium(feature: PremiumFeature, t: T): boolean {
  if (hasPremiumAccess()) return true;
  showPaywallAlert(feature === "ai" ? "premium_required_ai" : "premium_required_projects", t);
  return false;
}

/**
 * Gate project creation by the free-tier limit. Returns true if a new project
 * may be created. Premium users and disabled monetization bypass the limit.
 */
export async function ensureCanCreateProject(t: T): Promise<boolean> {
  if (!MONETIZATION_ENABLED || hasPremiumAccess()) return true;
  try {
    const raw = await AsyncStorage.getItem("projects");
    const count = (raw ? JSON.parse(raw) : []).filter((p: any) => !p?.archived).length;
    if (count < FREE_PROJECT_LIMIT) return true;
  } catch {
    return true; // never block creation on a storage read error
  }
  showPaywallAlert("premium_required_projects", t);
  return false;
}
