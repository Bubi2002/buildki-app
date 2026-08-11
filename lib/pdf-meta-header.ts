import type { ExportDetails } from "@/components/export-details-box";

/**
 * Build an HTML header block (project / floor / room / notes) for a PDF export.
 * Returns "" when the user entered nothing, so exports stay clean by default.
 * `labels` are passed in already localized (via t()) so the header matches the
 * current app language.
 */
export function buildExportDetailsHeaderHtml(
  info: ExportDetails | null | undefined,
  labels: { bauvorhaben: string; adresse: string; etage: string; raum: string; notizen: string },
): string {
  if (!info) return "";
  const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows: string[] = [];
  const add = (label: string, value: string) => {
    if (value && value.trim()) {
      rows.push(
        `<tr><td style="padding:2px 10px 2px 0; color:#6B7280; white-space:nowrap; vertical-align:top;">${esc(label)}</td>` +
        `<td style="padding:2px 0; color:#1F2937;">${esc(value.trim()).replace(/\n/g, "<br/>")}</td></tr>`,
      );
    }
  };
  add(labels.bauvorhaben, info.bauvorhaben);
  add(labels.adresse, info.adresse);
  add(labels.etage, info.etage);
  add(labels.raum, info.raum);
  add(labels.notizen, info.notizen);
  if (rows.length === 0) return "";
  return `<table style="border-collapse:collapse; margin:0 0 16px; font-size:12px; border-left:3px solid #E5E7EB; padding-left:10px;">${rows.join("")}</table>`;
}
