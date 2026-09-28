import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { buildPremiumHtml, resolveBrandingLogo, escHtml } from "./pdf-premium";
import { getPdfBranding } from "./pdf-branding-store";

async function fileToDataUri(uri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const ext = uri.split(".").pop()?.toLowerCase() || "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

export type MeasureExportRow = { label: string; value: string };

/**
 * Export a single measurement record as a PDF: the annotated image, a details
 * table (value, method, quality, tolerance, date …) and optional free text.
 */
export async function exportMeasurementPdf(params: {
  imageUri: string;
  title: string;
  heading: string;
  findingLabel?: string;
  findingText?: string;
  rows: MeasureExportRow[];
  noteLabel?: string;
  note?: string;
  dialogTitle: string;
}): Promise<"shared" | "unavailable" | "empty"> {
  const dataUri = await fileToDataUri(params.imageUri);
  if (!dataUri) return "empty";

  const branding = await getPdfBranding();
  const accent = branding.accentColor || "#1E3A5F";
  const logoDataUri = await resolveBrandingLogo(branding);

  const sub = (label: string) =>
    `<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.4px;color:#94a3b8;font-weight:700;margin:20px 0 6px;">${escHtml(label)}</div>`;

  const rowsHtml = params.rows
    .filter((r) => r.value && r.value.trim())
    .map((r) => `<tr><td style="color:#64748b;width:42%;">${escHtml(r.label)}</td><td><strong>${escHtml(r.value)}</strong></td></tr>`)
    .join("");

  const findingHtml =
    params.findingText && params.findingText.trim()
      ? `${sub(params.findingLabel || "")}<div class="note" style="white-space:pre-wrap;">${escHtml(params.findingText)}</div>`
      : "";
  const noteHtml =
    params.note && params.note.trim()
      ? `${sub(params.noteLabel || "")}<div class="note" style="white-space:pre-wrap;">${escHtml(params.note)}</div>`
      : "";

  const body = `
    <div class="card" style="text-align:center;padding:12px;background:#f8fafc;">
      <img src="${dataUri}" style="max-width:100%;max-height:430px;object-fit:contain;display:inline-block;" />
    </div>
    ${findingHtml}
    <table class="prem-table" style="margin-top:14px;"><tbody>${rowsHtml}</tbody></table>
    ${noteHtml}`;

  const html = buildPremiumHtml({
    branding,
    accentColor: accent,
    title: params.title,
    subtitle: escHtml(params.heading),
    body,
    logoDataUri,
  });

  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: params.dialogTitle, UTI: "com.adobe.pdf" });
  return "shared";
}
