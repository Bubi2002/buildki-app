export type VideoUploadGateReason =
  | "checking-auth"
  | "auth-required"
  | "offline"
  | "ready";

export type VideoUploadGate = {
  allowed: boolean;
  reason: VideoUploadGateReason;
  title?: string;
  message?: string;
  actionLabel?: string;
};

type VideoUploadGateInput = {
  authLoading: boolean;
  isAuthenticated: boolean;
  isConnected: boolean;
};

export function getVideoUploadGate({
  authLoading,
  isAuthenticated,
  isConnected,
}: VideoUploadGateInput): VideoUploadGate {
  if (authLoading) {
    return {
      allowed: false,
      reason: "checking-auth",
      title: "Anmeldung wird geprüft",
      message: "Bitte einen Moment warten.",
    };
  }

  if (!isAuthenticated) {
    return {
      allowed: false,
      reason: "auth-required",
      title: "Anmeldung erforderlich",
      message: "Für die Verarbeitung ist eine gültige Anmeldung erforderlich.",
      actionLabel: "Anmelden",
    };
  }

  if (!isConnected) {
    return {
      allowed: false,
      reason: "offline",
      title: "Keine Internetverbindung",
      message:
        "Die Auswahl bleibt nur geöffnet, solange du auf diesem Bildschirm bleibst. Bleibe hier und starte die Verarbeitung erneut, sobald du online bist.",
    };
  }

  return {
    allowed: true,
    reason: "ready",
  };
}
