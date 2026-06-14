import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import {
  authenticate,
  isBiometricLockEnabled,
  getBiometricStatus,
  getBiometricLabel,
  getLockTimeout,
} from "@/lib/biometric-lock";
import { NetworkBanner } from "@/components/network-banner";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function BiometricLockOverlay({
  onUnlock,
  biometricLabel,
}: {
  onUnlock: () => void;
  biometricLabel: string;
}) {
  const [error, setError] = useState<string | null>(null);

  const handleAuthenticate = async () => {
    setError(null);
    const result = await authenticate();
    if (result.success) {
      onUnlock();
    } else if (result.error !== 'cancelled') {
      setError(result.error || 'Authentifizierung fehlgeschlagen');
    }
  };

  useEffect(() => {
    handleAuthenticate();
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
          ProtoKI gesperrt
        </Text>
        <Text style={{ fontSize: 15, color: '#9ca3af', textAlign: 'center', marginBottom: 32 }}>
          Bitte authentifiziere dich mit {biometricLabel}, um fortzufahren.
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
            Entsperren
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);
  const [isLocked, setIsLocked] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrie');
  const backgroundTimeRef = useRef<number | null>(null);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="oauth/callback" />
          </Stack>
          <NetworkBanner />
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
      {isLocked && (
        <BiometricLockOverlay
          onUnlock={() => setIsLocked(false)}
          biometricLabel={biometricLabel}
        />
      )}
    </GestureHandlerRootView>
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
