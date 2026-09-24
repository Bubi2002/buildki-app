import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

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

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

  const rowsHtml = params.rows
    .filter((r) => r.value && r.value.trim())
    .map((r) => `<tr><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`)
    .join("");

  const findingHtml =
    params.findingText && params.findingText.trim()
      ? `<div class="block"><div class="blabel">${esc(params.findingLabel || "")}</div><div class="btext">${esc(params.findingText)}</div></div>`
      : "";
  const noteHtml =
    params.note && params.note.trim()
      ? `<div class="block"><div class="blabel">${esc(params.noteLabel || "")}</div><div class="btext">${esc(params.note)}</div></div>`
      : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 28px; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; }
    .head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #00ACC1; padding-bottom: 8px; margin-bottom: 14px; }
    .title { font-size: 20px; font-weight: 800; }
    .heading { font-size: 13px; color: #555; }
    .imgwrap { width: 100%; border: 1px solid #ddd; margin-bottom: 16px; text-align: center; background: #f6f6f6; }
    .imgwrap img { max-width: 100%; max-height: 420px; display: inline-block; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
    td.k { color: #666; width: 40%; }
    td.v { font-weight: 700; }
    .block { margin-bottom: 12px; }
    .blabel { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #888; margin-bottom: 3px; }
    .btext { font-size: 13px; line-height: 1.4; white-space: pre-wrap; }
  </style></head><body>
    <div class="head"><div class="title">${esc(params.title)}</div><div class="heading">${esc(params.heading)}</div></div>
    <div class="imgwrap"><img src="${dataUri}" /></div>
    ${findingHtml}
    <table>${rowsHtml}</table>
    ${noteHtml}
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: params.dialogTitle, UTI: "com.adobe.pdf" });
  return "shared";
}
