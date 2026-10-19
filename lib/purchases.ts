import { Platform } from "react-native";

import {
  MONETIZATION_ENABLED,
  PREMIUM_ENTITLEMENT,
  RC_API_KEY,
} from "./monetization";

// Thin wrapper around react-native-purchases (RevenueCat). Every call degrades
// to a safe no-op when the SDK is unavailable (web), not yet configured, or
// monetization is still disabled — so the app never crashes before the stores
// and the RevenueCat project are set up.

let premium = false;
let configured = false;
const listeners = new Set<(value: boolean) => void>();

function emit() {
  for (const cb of listeners) {
    try {
      cb(premium);
    } catch {}
  }
}

/** Subscribe to premium-entitlement changes; returns an unsubscribe function. */
export function subscribePremium(cb: (value: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Last known premium state (synchronous). */
export function getPremium(): boolean {
  return premium;
}

// Lazy require so a missing native module (e.g. on web) never breaks the bundle.
function getPurchases(): any | null {
  try {
    return require("react-native-purchases").default;
  } catch {
    return null;
  }
}

function hasEntitlement(info: any): boolean {
  return Boolean(info?.entitlements?.active?.[PREMIUM_ENTITLEMENT]);
}

/** Configure RevenueCat once at app start (native only, when enabled). */
export async function initPurchases(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!MONETIZATION_ENABLED || !RC_API_KEY) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    Purchases.configure({ apiKey: RC_API_KEY });
    configured = true;
    Purchases.addCustomerInfoUpdateListener((info: any) => {
      premium = hasEntitlement(info);
      emit();
    });
    await refreshPremium();
  } catch {}
}

/** Re-read the customer info and update the cached premium state. */
export async function refreshPremium(): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases || !configured) return premium;
  try {
    const info = await Purchases.getCustomerInfo();
    premium = hasEntitlement(info);
    emit();
  } catch {}
  return premium;
}

/** The purchasable packages of the current RevenueCat offering. */
export async function getOfferingPackages(): Promise<any[]> {
  const Purchases = getPurchases();
  if (!Purchases || !configured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings?.current?.availablePackages ?? [];
  } catch {
    return [];
  }
}

/** Buy a package. Returns true if premium is now active, false if cancelled. */
export async function purchasePackage(pkg: any): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases || !configured) return false;
  try {
    const result = await Purchases.purchasePackage(pkg);
    premium = hasEntitlement(result?.customerInfo);
    emit();
    return premium;
  } catch (e: any) {
    if (e?.userCancelled) return false;
    throw e;
  }
}

/** Restore previous purchases (required by Apple). Returns premium state. */
export async function restorePurchases(): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases || !configured) return false;
  try {
    const info = await Purchases.restorePurchases();
    premium = hasEntitlement(info);
    emit();
  } catch {}
  return premium;
}
