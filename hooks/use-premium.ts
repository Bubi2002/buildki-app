import { useEffect, useState } from "react";

import { MONETIZATION_ENABLED } from "@/lib/monetization";
import { getPremium, subscribePremium } from "@/lib/purchases";

/**
 * True when the user may use premium features. While monetization is disabled
 * everyone counts as premium (nothing is gated), so the app behaves as before
 * until the stores and RevenueCat are live.
 */
export function usePremium(): boolean {
  const [premium, setPremium] = useState(getPremium());
  useEffect(() => subscribePremium(setPremium), []);
  if (!MONETIZATION_ENABLED) return true;
  return premium;
}

/**
 * Imperative variant for event handlers / non-render code. Returns true when
 * the premium feature may run.
 */
export function hasPremiumAccess(): boolean {
  return !MONETIZATION_ENABLED || getPremium();
}
