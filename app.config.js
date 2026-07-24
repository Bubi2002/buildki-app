// Simple app config that doesn't require tsx
const config = {
  name: "BuildKI",
  slug: "protokoll-app",
  owner: "iserlohs-team",
  version: "1.0.42",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "manus20250614001800",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "space.manus.protokoll.app.t20250614001800",
    backgroundColor: "#0B1622",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: "BuildKI benötigt Zugriff auf die Kamera, um Fotos und Videos von Mängeln aufzunehmen.",
      NSMicrophoneUsageDescription: "BuildKI benötigt Zugriff auf das Mikrofon, um Sprachnotizen aufzuzeichnen.",
      NSPhotoLibraryUsageDescription: "BuildKI benötigt Zugriff auf deine Fotos, um Bilder für Mängel und Protokolle auszuwählen.",
      NSLocationWhenInUseUsageDescription: "BuildKI benötigt deinen Standort, um ihn dem Protokoll zuzuweisen.",
      NSCalendarsUsageDescription: "BuildKI benötigt Zugriff auf deinen Kalender, um Nachprüfungstermine zu erstellen.",
      NSContactsUsageDescription: "BuildKI benötigt Zugriff auf deine Kontakte, um Empfänger schnell auszuwählen.",
      NSFaceIDUsageDescription: "BuildKI möchte Face ID verwenden, um die App zu entsperren.",
      UIViewControllerBasedStatusBarAppearance: true,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#0B1622",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: "space.manus.protokoll.app.t20250614001800",
    permissions: ["POST_NOTIFICATIONS", "CAMERA", "RECORD_AUDIO"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "manus20250614001800", host: "*" }],
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
    ["expo-audio", { microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone." }],
    ["expo-video", { supportsBackgroundPlayback: true, supportsPictureInPicture: true }],
    ["expo-splash-screen", {
      image: "./assets/images/splash-icon.png",
      imageWidth: 200,
      resizeMode: "contain",
      backgroundColor: "#0B1622",
      dark: { backgroundColor: "#000000" },
    }],
    ["expo-build-properties", {
      android: { buildArchs: ["armeabi-v7a", "arm64-v8a"], minSdkVersion: 24 },
    }],
    ["expo-camera", { cameraPermission: "Allow $(PRODUCT_NAME) to access your camera." }],
    ["expo-location", { locationWhenInUsePermission: "Allow $(PRODUCT_NAME) to use your location." }],
    ["expo-calendar", { calendarPermission: "Allow $(PRODUCT_NAME) to access your calendar." }],
    ["expo-contacts", { contactsPermission: "Allow $(PRODUCT_NAME) to access your contacts." }],
    ["expo-local-authentication", { faceIDPermission: "Allow $(PRODUCT_NAME) to use Face ID." }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "1928b42a-1649-4093-95f5-12060d8da8c5",
    },
  },
};

module.exports = config;
