import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { decodeUnicodeEscapes } from "@/lib/display-text";
import type { FloorPlan, PlanPin } from "@/lib/floor-plan-store";
import { getPdfBranding } from "@/lib/pdf-branding-store";

const PIN_HEX: Record<PlanPin["type"], string> = {
  photo: "#2196F3",
  defect: "#F44336",
  note: "#FF9800",
  protocol: "#4CAF50",
  chapter: "#9C27B0",
  task: "#818CF8",
};

async function fileToDataUri(uri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
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

function pinsHtml(pins: PlanPin[]): string {
  return pins
    .map((p) => {
      const color = p.color || PIN_HEX[p.type] || "#F44336";
      const left = Math.min(100, Math.max(0, p.x * 100)).toFixed(2);
      const top = Math.min(100, Math.max(0, p.y * 100)).toFixed(2);
      const label = esc(decodeUnicodeEscapes(p.label || ""));
      return `<div class="pin" style="left:${left}%;top:${top}%;">
        <span class="dot" style="background:${color};"></span>
        <span class="lbl" style="border-color:${color};">${label}</span>
      </div>`;
    })
    .join("");
}

function planPage(plan: FloorPlan, pins: PlanPin[], dataUri: string, isLast: boolean, company: string): string {
  const pinCount = pins.length;
  return `<section class="page" style="${isLast ? "" : "page-break-after:always;"}">
    <div class="head">
      <div>
        ${company ? `<div class="brand">${esc(company)}</div>` : ""}
        <div class="name">${esc(decodeUnicodeEscapes(plan.name))}</div>
      </div>
      <div class="meta">${pinCount} ${pinCount === 1 ? "Markierung" : "Markierungen"}</div>
    </div>
    <div class="wrap">
      <img src="${dataUri}" />
      ${pinsHtml(pins)}
    </div>
  </section>`;
}

const styleFor = (accent: string) => `
  @page { size: A4 landscape; margin: 12mm 12mm 12mm; @bottom-right { content: "Seite " counter(page) " / " counter(pages); font-size: 8px; color: #94a3b8; } }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1f2937; }
  .page { width: 100%; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 2px solid ${accent}; padding-bottom: 8px; margin-bottom: 10px; }
  .brand { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 2px; }
  .name { font-size: 19px; font-weight: 800; color: #0F2744; letter-spacing: -0.2px; }
  .meta { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
  .wrap { position: relative; width: 100%; border: 1px solid #e8ecf1; border-radius: 8px; overflow: hidden; }
  .wrap img { width: 100%; display: block; }
  .pin { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .pin .dot { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.25); flex: 0 0 auto; }
  .pin .lbl { font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.92); border: 1px solid; border-radius: 4px; padding: 1px 4px; color: #1f2937; }
`;

/**
 * Export one or more floor plans as a single PDF (one plan per page) with the
 * markings burned in, then open the share sheet.
 * @param plans      Plans to export, in tab order.
 * @param pinsByPlan Map of planId → its pins.
 * @param dialogTitle Share-sheet title.
 * @returns "shared" | "unavailable" | "empty"
 */
export async function exportFloorPlansPdf(
  plans: FloorPlan[],
  pinsByPlan: Record<string, PlanPin[]>,
  dialogTitle: string,
): Promise<"shared" | "unavailable" | "empty"> {
  const branding = await getPdfBranding().catch(() => null);
  const accent = branding?.accentColor || "#1E3A5F";
  const company = branding?.companyName || "";

  const pages: string[] = [];
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const dataUri = await fileToDataUri(plan.imageUri);
    if (!dataUri) continue;
    pages.push(planPage(plan, pinsByPlan[plan.id] || [], dataUri, i === plans.length - 1, company));
  }
  if (pages.length === 0) return "empty";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${styleFor(accent)}</style></head><body>${pages.join("")}</body></html>`;
  const { uri } = await Print.printToFileAsync({ html });

  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle,
    UTI: "com.adobe.pdf",
  });
  return "shared";
}
