import * as Linking from "expo-linking";
import * as ReactNative from "react-native";
import * as WebBrowser from "expo-web-browser";

// Extract scheme from bundle ID (last segment timestamp, prefixed with "manus")
// Must match the scheme generated in app.config.ts from rawBundleId
const rawBundleId = "space.manus.protokoll.app.t20250614001800";
const bundleId = rawBundleId
  .replace(/[-_]/g, ".")
  .replace(/[^a-zA-Z0-9.]/g, "")
  .replace(/\.+/g, ".")
  .replace(/^\.+|\.+$/g, "")
  .toLowerCase()
  .split(".")
  .map((s) => (/^[a-zA-Z]/.test(s) ? s : "x" + s))
  .join(".") || "space.manus.app";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL || "https://manus.im",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL || "https://api.manus.im",
  appId: process.env.EXPO_PUBLIC_APP_ID || "C7amCXpPYwQNP8pDBUNaVq",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID || "cSfHAnJJ9YxVvFQDKLf5gm",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME || "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: schemeFromBundleId,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

// The deployed production domain for this app
// This is used as fallback when the app runs natively (TestFlight/App Store)
// and the build-time API_BASE_URL points to a sandbox that's not reachable
const DEPLOYED_DOMAIN = "https://protokollapp-c7amcxpp.manus.space";

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 */
export function getApiBaseUrl(): string {
  // If API_BASE_URL is set, check if it's usable
  if (API_BASE_URL) {
    const url = API_BASE_URL.replace(/\/$/, "");
    
    // On native devices (iOS/Android), sandbox URLs (*.manus.computer) are NOT reachable
    // Use the deployed production domain instead
    if (ReactNative.Platform.OS !== "web" && url.includes("manus.computer")) {
      return DEPLOYED_DOMAIN;
    }
    
    return url;
  }

  // On web, derive from current hostname by replacing port 8081 with 3000
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
    // If on deployed domain (manus.space), use same origin
    if (hostname.includes("manus.space")) {
      return `${protocol}//${hostname}`;
    }
  }

  // On native without any URL set, use deployed domain
  if (ReactNative.Platform.OS !== "web") {
    return DEPLOYED_DOMAIN;
  }

  // Fallback to empty (will use relative URL)
  return "";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

const encodeState = (value: string) => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }
  const BufferImpl = (globalThis as Record<string, any>).Buffer;
  if (BufferImpl) {
    return BufferImpl.from(value, "utf-8").toString("base64");
  }
  return value;
};

/**
 * Get the redirect URI for OAuth callback.
 * - Web: uses API server callback endpoint
 * - Native: uses deep link scheme
 */
export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    return `${getApiBaseUrl()}/api/oauth/callback`;
  } else {
    return Linking.createURL("/oauth/callback", {
      scheme: env.deepLinkScheme,
    });
  }
};

export const getLoginUrl = () => {
  const redirectUri = getRedirectUri();
  const state = encodeState(redirectUri);

  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

/**
 * Start OAuth login flow.
 *
 * On native platforms (iOS/Android), uses openAuthSessionAsync which handles
 * the redirect back to the app automatically via ASWebAuthenticationSession (iOS)
 * or Chrome Custom Tabs (Android).
 *
 * On web, this simply redirects to the login URL.
 *
 * @returns The redirect URL with auth params, or null if cancelled/failed.
 */
export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = getLoginUrl();
  const redirectUri = getRedirectUri();

  console.log("[OAuth] Starting login flow...");
  console.log("[OAuth] Login URL:", loginUrl);
  console.log("[OAuth] Redirect URI:", redirectUri);

  if (ReactNative.Platform.OS === "web") {
    // On web, just redirect
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  try {
    // Use openAuthSessionAsync for reliable OAuth on iOS/Android
    // This handles the redirect back to the app automatically
    const result = await WebBrowser.openAuthSessionAsync(loginUrl, redirectUri);
    console.log("[OAuth] Auth session result:", result);

    if (result.type === "success" && result.url) {
      // The URL contains the auth params - parse and handle them
      console.log("[OAuth] Success URL:", result.url);
      return result.url;
    } else if (result.type === "cancel" || result.type === "dismiss") {
      console.log("[OAuth] User cancelled login");
      return null;
    }

    return null;
  } catch (error) {
    console.error("[OAuth] Failed to open auth session:", error);
    // Fallback: try opening URL directly
    try {
      await Linking.openURL(loginUrl);
    } catch (linkError) {
      console.error("[OAuth] Fallback also failed:", linkError);
    }
    return null;
  }
}
