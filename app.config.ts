// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
const rawBundleId = "space.manus.protokoll.app.t20250614001800";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
    .split(".")
    .map((segment) => {
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";

const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  appName: "ProtoKI",
  appSlug: "protokoll-app",
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663729981946/C7amCXpPYwQNP8pDBUNaVq/icon-Brwx2xBR5aE7C6SDGZjqpj.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    appleTeamId: "TLHL2MRJB4",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: "ProtoKI benötigt Zugriff auf die Kamera, um Videos aufzunehmen.",
      NSMicrophoneUsageDescription: "ProtoKI benötigt Zugriff auf das Mikrofon, um Sprache aufzuzeichnen.",
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E53935",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS", "CAMERA", "RECORD_AUDIO"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-quick-actions",
    [
      "expo-camera",
      {
        cameraPermission: "ProtoKI benötigt Zugriff auf die Kamera, um Videos aufzunehmen.",
        microphonePermission: "ProtoKI benötigt Zugriff auf das Mikrofon, um Sprache aufzuzeichnen.",
        recordAudioAndroid: true,
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission: "ProtoKI benötigt Zugriff auf das Mikrofon.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "ProtoKI benötigt Zugriff auf deine Fotos, um ein Logo auszuwählen.",
      },
    ],
    [
      "expo-calendar",
      {
        calendarPermission: "ProtoKI benötigt Zugriff auf deinen Kalender, um Protokolle mit Terminen zu verknüpfen.",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "ProtoKI benötigt deinen Standort, um ihn dem Protokoll zuzuweisen.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission: "ProtoKI möchte Face ID verwenden, um die App zu entsperren.",
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
