/**
 * BuildKI – Stripe Client Helper
 * Communicates with our server's Stripe endpoints
 */
import { Platform } from "react-native";
import Constants from "expo-constants";

function getApiBaseUrl(): string {
  if (Platform.OS === "web") {
    return "";
  }
  // For native, use the server URL
  const debuggerHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (debuggerHost) {
    return `http://${debuggerHost}:3000`;
  }
  return "https://protokollapp-c7amcxpp.manus.space";
}

const API_BASE = getApiBaseUrl();

export interface StripeCheckoutResponse {
  sessionId: string;
  url: string;
}

export interface StripeSubscriptionStatus {
  active: boolean;
  status: string;
  plan: "monthly" | "yearly" | null;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  message?: string;
}

export interface StripePortalResponse {
  url: string;
}

/**
 * Create a Stripe Checkout Session
 */
export async function createCheckoutSession(
  email: string,
  plan: "monthly" | "yearly"
): Promise<StripeCheckoutResponse> {
  const response = await fetch(`${API_BASE}/api/stripe/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, plan }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create checkout session");
  }

  return response.json();
}

/**
 * Create a Stripe Customer Portal session for managing subscription
 */
export async function createPortalSession(email: string): Promise<StripePortalResponse> {
  const response = await fetch(`${API_BASE}/api/stripe/create-portal-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create portal session");
  }

  return response.json();
}

/**
 * Check subscription status for a user
 */
export async function getSubscriptionStatus(email: string): Promise<StripeSubscriptionStatus> {
  const response = await fetch(
    `${API_BASE}/api/stripe/subscription-status?email=${encodeURIComponent(email)}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to check subscription status");
  }

  return response.json();
}

/**
 * Check if Stripe is configured on the server
 */
export async function checkStripeStatus(): Promise<{ configured: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/api/stripe/status`);
    if (!response.ok) return { configured: false };
    return response.json();
  } catch {
    return { configured: false };
  }
}
