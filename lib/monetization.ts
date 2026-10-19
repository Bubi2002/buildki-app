import { Platform } from "react-native";

/**
 * Master switch for in-app purchases (Apple IAP / Google Play Billing via
 * RevenueCat).
 *
 * Keep this OFF until all of the following are done and tested on a real device
 * (IAP cannot be tested in the simulator):
 *   1. App Store Connect: Paid-Apps agreement signed + subscription products
 *      created (IDs in PRODUCT_IDS below).
 *   2. Google Play Console: merchant account + subscription products created.
 *   3. RevenueCat project: both stores linked, an entitlement named
 *      PREMIUM_ENTITLEMENT, an offering containing the products, and the public
 *      SDK keys set via EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY.
 *
 * While OFF: nothing is gated, the paywall shows a "coming soon" state and the
 * app behaves exactly as before. Flip to true for the monetized release.
 */
export const MONETIZATION_ENABLED = false;

/**
 * RevenueCat PUBLIC SDK key (safe to ship in the client). Set per platform via
 * EAS env / app config. Empty while not yet configured.
 */
export const RC_API_KEY = (Platform.select({
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY,
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
  default: "",
}) || "") as string;

/** RevenueCat entitlement identifier that unlocks premium features. */
export const PREMIUM_ENTITLEMENT = "premium";

/**
 * Store product identifiers. Create these in App Store Connect AND Google Play
 * (same IDs), then attach them to the RevenueCat offering. Listed here only for
 * reference/consistency — the paywall itself renders whatever the current
 * RevenueCat offering returns.
 */
export const PRODUCT_IDS = {
  monthly: "buildki_premium_monthly",
  yearly: "buildki_premium_yearly",
} as const;

/** Features that require the premium entitlement. */
export type PremiumFeature = "ai" | "unlimitedProjects";

/**
 * Free-tier project limit. Only enforced while MONETIZATION_ENABLED is true;
 * premium users have no limit.
 */
export const FREE_PROJECT_LIMIT = 2;
