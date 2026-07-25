import { useState, useEffect, useCallback } from "react";
import {
  getFeatureToggles,
  setFeatureEnabled,
  isFeatureEnabledSync,
  type FeatureKey,
  type FeatureToggle,
} from "@/lib/feature-toggles";

export function useFeatureToggles() {
  const [toggles, setToggles] = useState<FeatureToggle[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadToggles();
  }, []);

  async function loadToggles() {
    const t = await getFeatureToggles();
    setToggles([...t]);
    setLoaded(true);
  }

  const toggle = useCallback(async (key: FeatureKey, enabled: boolean) => {
    await setFeatureEnabled(key, enabled);
    const updated = await getFeatureToggles();
    setToggles([...updated]);
  }, []);

  const isEnabled = useCallback((key: FeatureKey): boolean => {
    return isFeatureEnabledSync(key);
  }, [toggles]);

  return { toggles, loaded, toggle, isEnabled, reload: loadToggles };
}
