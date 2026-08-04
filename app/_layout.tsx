import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack , useRouter as useQuickRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { AppState, Platform, View, Text, TouchableOpacity } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { LanguageProvider, useTranslation } from "@/lib/language-provider";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import {
  authenticate,
  isBiometricLockEnabled,
  getBiometricStatus,
  getBiometricLabel,
  getLockTimeout,
} from "@/lib/biometric-lock";
import { NetworkBanner } from "@/components/network-banner";
import { ErrorBoundary } from "@/components/error-boundary";
import { PrivacyConsentDialog } from "@/components/privacy-consent-dialog";
import { PrivacyConsentSync } from "@/components/privacy-consent-sync";
import * as QuickActions from "expo-quick-actions";
// ShareIntentProvider temporarily disabled - share extension removed for TestFlight build
// import { ShareIntentProvider } from "expo-share-intent";
const ShareIntentProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
  initialRouteName: "(tabs)",
};

function BiometricLockOverlay({
  onUnlock,
  biometricLabel,
}: {
  onUnlock: () => void;
  biometricLabel: string;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const handleAuthenticate = async () => {
    setError(null);
    const result = await authenticate();
    if (result.success) {
      onUnlock();
    } else if (result.error !== 'cancelled') {
      setError(result.error || t('_layout_auth_failed' as any));
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      handleAuthenticate();
    });
  }, []);

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#1a1a2e',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
      }}
    >
      <View style={{ alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 8 }}>
          {t('_layout_app_locked' as any)}
        </Text>
        <Text style={{ fontSize: 15, color: '#9ca3af', textAlign: 'center', marginBottom: 32 }}>
          {t('_layout_authenticate_prompt_prefix' as any)}{biometricLabel}{t('_layout_authenticate_prompt_suffix' as any)}
        </Text>
        {error && (
          <Text style={{ fontSize: 14, color: '#ef4444', marginBottom: 16, textAlign: 'center' }}>
            {error}
          </Text>
        )}
        <TouchableOpacity
          onPress={handleAuthenticate}
          style={{
            backgroundColor: '#E53935',
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>
            {t('_layout_unlock' as any)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function QuickActionsSetup() {
  const { t } = useTranslation();
  const quickRouter = useQuickRouter();

  function handleQuickAction(action: QuickActions.Action) {
    if (action.id === "quick_record_audio" || action.id === "quick_record_photo") {
      // Navigate to recording tab with mode parameter
      quickRouter.replace({
        pathname: "/(tabs)",
        params: { quickAction: action.id },
      });
    }
  }

  // Setup Quick Actions (iOS 3D Touch / Android App Shortcuts)
  useEffect(() => {
    if (Platform.OS === "web") return;
    QuickActions.setItems([
      {
        id: "quick_record_audio",
        title: t('_layout_quick_audio_title' as any),
        subtitle: t('_layout_quick_audio_subtitle' as any),
        icon: "audio",
      },
      {
        id: "quick_record_photo",
        title: t('_layout_quick_photo_title' as any),
        subtitle: t('_layout_quick_photo_subtitle' as any),
        icon: "capturePhoto",
      },
    ]);

    // Handle quick action if app was launched from one
    if (QuickActions.initial) {
      handleQuickAction(QuickActions.initial);
    }

    const subscription = QuickActions.addListener((action) => {
      handleQuickAction(action);
    });
    return () => subscription.remove();
  }, [t]);

  return null;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);
  const [isLocked, setIsLocked] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrie');
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(true);
  const [showConsent, setShowConsent] = useState(false);
  const backgroundTimeRef = useRef<number | null>(null);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
    // Run data migrations before any data access
    (async () => {
      try {
        const { runMigrations, runIntegrityCheck } = require("@/lib/data-versioning");
        const { ran, errors } = await runMigrations();
        if (errors > 0) console.warn(`[Startup] ${errors} migration error(s)`);
        const { errors: integrityErrors } = await runIntegrityCheck();
        if (integrityErrors.length > 0) console.warn("[Startup] Integrity issues:", integrityErrors);
      } catch (e) {
        console.warn("[Startup] Migration error:", e);
      }
    })();
    // Load feature toggles
    (async () => {
      const { isFeatureEnabled } = require("@/lib/feature-toggles");
      setOfflineModeEnabled(await isFeatureEnabled("offlineMode"));
    })();
    // Present the current privacy choices before any optional transfer starts.
    (async () => {
      const { needsConsentUpdate } = require("@/lib/privacy-consent");
      if (await needsConsentUpdate()) setShowConsent(true);
    })();
    // The manager itself fails closed unless Cloud + AI purposes are enabled.
    if (Platform.OS !== "web") {
      const { initSyncManager } = require("@/lib/offline-sync-manager");
      initSyncManager();
    }
    // Initialize daily summary & defect deadline reminders
    if (Platform.OS !== "web") {
      const { initDailySummary } = require("@/lib/daily-summary");
      initDailySummary();
    }
  }, []);

  // Biometric lock on app start
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') return;
      const enabled = await isBiometricLockEnabled();
      if (!enabled) return;

      const status = await getBiometricStatus();
      if (!status.available || !status.enrolled) return;

      setBiometricLabel(getBiometricLabel(status.type));
      setIsLocked(true);
    })();
  }, []);

  // Biometric lock on app resume from background
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = AppState.addEventListener('change', async (state) => {
      if (state === 'background' || state === 'inactive') {
        backgroundTimeRef.current = Date.now();
      } else if (state === 'active' && backgroundTimeRef.current) {
        const elapsed = Date.now() - backgroundTimeRef.current;
        const timeout = await getLockTimeout();
        backgroundTimeRef.current = null;

        if (elapsed > timeout) {
          const enabled = await isBiometricLockEnabled();
          if (!enabled) return;

          const status = await getBiometricStatus();
          if (!status.available || !status.enrolled) return;

          setBiometricLabel(getBiometricLabel(status.type));
          setIsLocked(true);
        }
      }
    });

    return () => subscription.remove();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ShareIntentProvider>
      <LanguageProvider>
      <QuickActionsSetup />
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="oauth/callback" />
          </Stack>
          {offlineModeEnabled && <NetworkBanner />}
          <PrivacyConsentSync />
          <PrivacyConsentDialog
            visible={showConsent}
            onAccept={(choices) => {
              setShowConsent(false);
              if (Platform.OS !== "web" && choices.cloudSync && choices.aiProcessing) {
                const { initSyncManager } = require("@/lib/offline-sync-manager");
                initSyncManager();
              }
            }}
          />
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
      {isLocked && (
        <BiometricLockOverlay
          onUnlock={() => setIsLocked(false)}
          biometricLabel={biometricLabel}
        />
      )}
      </LanguageProvider>
      </ShareIntentProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
