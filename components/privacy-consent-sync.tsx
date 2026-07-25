import { useEffect, useRef } from "react";

import { useAuth } from "@/hooks/use-auth";
import { getPrivacyChoices, saveConsent } from "@/lib/privacy-consent";
import { initSyncManager, stopSyncManager } from "@/lib/offline-sync-manager";
import { trpc } from "@/lib/trpc";

export function PrivacyConsentSync() {
  const { isAuthenticated } = useAuth();
  const synchronizedRef = useRef(false);
  const remoteQuery = trpc.privacy.getChoices.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const saveRemote = trpc.privacy.saveChoices.useMutation();

  useEffect(() => {
    if (!isAuthenticated) {
      synchronizedRef.current = false;
      return;
    }
    if (!remoteQuery.data || synchronizedRef.current) return;
    synchronizedRef.current = true;

    (async () => {
      try {
        let effectiveChoices;
        if (remoteQuery.data.exists) {
          effectiveChoices = remoteQuery.data.choices;
          await saveConsent(effectiveChoices, "server-authoritative");
        } else {
          effectiveChoices = await getPrivacyChoices();
          await saveRemote.mutateAsync({
            version: 2,
            choices: effectiveChoices,
            source: "login-sync",
          });
        }

        if (effectiveChoices.aiProcessing && effectiveChoices.cloudSync) {
          await initSyncManager();
        } else {
          stopSyncManager();
        }
      } catch (error) {
        synchronizedRef.current = false;
        console.warn("[PrivacyConsentSync] Purpose choices not synchronized:", error);
      }
    })();
  }, [isAuthenticated, remoteQuery.data]);

  return null;
}
