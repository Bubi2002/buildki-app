/**
 * Single functional color system for status/urgency across the app, so a color
 * always means the same thing (not "sometimes function, sometimes category").
 *
 *  Rot   = kritisch / überfällig
 *  Orange= offener Mangel (aktiv, in Bearbeitung …)
 *  Blau  = Aufgabe / allgemeine Aktion
 *  Grün  = erledigt
 *  Grau  = archiviert / inaktiv / geschlossen
 *
 * The project's own accent color exists separately and must not compete with
 * these status colors.
 */
export const STATUS_COLORS = {
  critical: "#DC2626",
  open: "#F59E0B",
  action: "#2563EB",
  done: "#16A34A",
  inactive: "#9CA3AF",
} as const;

type DefectStatusLike =
  | "offen" | "zugewiesen" | "in_bearbeitung" | "nachbesserung" | "pruefung"
  | "erledigt" | "abgelehnt" | "geschlossen" | string;

/** Color for a defect based on its status and (optionally) whether it is overdue. */
export function defectStatusColor(status: DefectStatusLike, opts?: { dueDate?: string; today?: string }): string {
  if (status === "erledigt") return STATUS_COLORS.done;
  if (status === "geschlossen" || status === "abgelehnt") return STATUS_COLORS.inactive;
  // Any open/active state:
  const today = opts?.today ?? new Date().toISOString().slice(0, 10);
  if (opts?.dueDate && opts.dueDate <= today) return STATUS_COLORS.critical;
  return STATUS_COLORS.open;
}
