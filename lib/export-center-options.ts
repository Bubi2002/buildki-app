export type ExportCenterType =
  | "protocol"
  | "defects"
  | "diary"
  | "photos"
  | "report"
  | "attendance";

export type ExportCenterOption = {
  id: ExportCenterType;
  label: string;
  description: string;
  icon: string;
  color: string;
  available: boolean;
};

export type ExportCenterAction =
  | {
      kind: "navigate";
      pathname: "/(tabs)/protocols" | "/defect-export";
      params?: Record<string, string>;
      dialogTitle?: string;
      dialogMessage?: string;
    }
  | {
      kind: "unavailable";
      reason: string;
    };

export const EXPORT_CENTER_OPTIONS: ExportCenterOption[] = [
  {
    id: "protocol",
    label: "Protokoll-PDF",
    description: "Protokoll auswählen und den echten PDF-Export öffnen",
    icon: "description",
    color: "#1E88E5",
    available: true,
  },
  {
    id: "defects",
    label: "Mängelbericht",
    description: "Projektmängel filtern und als PDF exportieren",
    icon: "warning",
    color: "#EF4444",
    available: true,
  },
  {
    id: "diary",
    label: "Bautagebuch",
    description: "PDF-Gesamtexport noch nicht verfügbar",
    icon: "menu-book",
    color: "#7B1FA2",
    available: false,
  },
  {
    id: "photos",
    label: "Fotodokumentation",
    description: "Protokoll mit Fotos auswählen und echte Fotos exportieren",
    icon: "photo-library",
    color: "#43A047",
    available: true,
  },
  {
    id: "report",
    label: "KI-Bericht",
    description: "Projektweiter PDF-Export noch nicht verfügbar",
    icon: "auto-awesome",
    color: "#00B0FF",
    available: false,
  },
  {
    id: "attendance",
    label: "Anwesenheitsliste",
    description: "PDF-Tabellenexport noch nicht verfügbar",
    icon: "people",
    color: "#FF9800",
    available: false,
  },
];

export function getExportCenterAction(
  type: ExportCenterType,
  projectId?: string,
): ExportCenterAction {
  switch (type) {
    case "protocol":
      return {
        kind: "navigate",
        pathname: "/(tabs)/protocols",
        dialogTitle: "Protokoll auswählen",
        dialogMessage:
          "Öffne ein Protokoll und nutze dort den PDF-Export. So enthält die Datei die tatsächlichen Protokolldaten.",
      };
    case "defects":
      if (!projectId) {
        return {
          kind: "unavailable",
          reason: "Bitte wähle zuerst auf der Startseite ein Projekt aus.",
        };
      }
      return {
        kind: "navigate",
        pathname: "/defect-export",
        params: { projectId },
      };
    case "photos":
      return {
        kind: "navigate",
        pathname: "/(tabs)/protocols",
        dialogTitle: "Protokoll mit Fotos auswählen",
        dialogMessage:
          "Öffne ein Protokoll mit Fotos und wähle dort „Fotos exportieren“. Es werden ausschließlich die tatsächlich hinterlegten Bilder angeboten.",
      };
    case "diary":
      return {
        kind: "unavailable",
        reason:
          "Der Bautagebuch-PDF-Gesamtexport ist noch nicht implementiert. Es wird bewusst kein Platzhalterdokument erzeugt.",
      };
    case "report":
      return {
        kind: "unavailable",
        reason:
          "Der projektweite KI-Bericht-PDF-Export ist noch nicht implementiert. Es wird bewusst kein Platzhalterdokument erzeugt.",
      };
    case "attendance":
      return {
        kind: "unavailable",
        reason:
          "Der PDF-Tabellenexport der Anwesenheit ist noch nicht implementiert. Es wird bewusst kein Platzhalterdokument erzeugt.",
      };
  }
}
