import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { decodeUnicodeEscapes } from "@/lib/display-text";
import type { FloorPlan, PlanPin } from "@/lib/floor-plan-store";
import { getPdfBranding } from "@/lib/pdf-branding-store";
import { getDefects } from "@/lib/defect-store";

const PIN_HEX: Record<PlanPin["type"], string> = {
  photo: "#2196F3",
  defect: "#F44336",
  note: "#FF9800",
  protocol: "#2E7D32", // kräftigeres Grün (vorher #4CAF50 war zu hell)
  chapter: "#9C27B0",
  task: "#818CF8",
};

// Map of pin id → embedded photo data URIs (filled before rendering).
type PhotoMap = Record<string, string[]>;

const TYPE_LABEL: Record<PlanPin["type"], string> = {
  photo: "Foto",
  defect: "Mangel",
  note: "Notiz",
  protocol: "Protokoll",
  chapter: "Kapitel",
  task: "Aufgabe",
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

// Numbered teardrop markers (like the app) — no floating label on the plan; the
// text goes into the Mängel-/Markierungsliste below the plan instead.
function pinsHtml(pins: PlanPin[]): string {
  return pins
    .map((p, i) => {
      // Type colour first, so e.g. the darker protocol green also applies to
      // pins that stored the old light green.
      const color = PIN_HEX[p.type] || p.color || "#F44336";
      const left = Math.min(100, Math.max(0, p.x * 100)).toFixed(2);
      const top = Math.min(100, Math.max(0, p.y * 100)).toFixed(2);
      return `<div class="pin" style="left:${left}%;top:${top}%;">
        <svg width="24" height="31" viewBox="0 0 24 31">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 19 12 19s12-10.6 12-19C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
          <circle cx="12" cy="12" r="7.5" fill="#ffffff"/>
          <text x="12" y="16" text-anchor="middle" font-size="11" font-weight="bold" fill="${color}">${i + 1}</text>
        </svg>
      </div>`;
    })
    .join("");
}

// Boxed list of the markings below the plan ("drunter Mängelliste im Kasten").
function marksHtml(pins: PlanPin[], photoMap: PhotoMap): string {
  if (pins.length === 0) return "";
  const rows = pins
    .map((p, i) => {
      const color = PIN_HEX[p.type] || p.color || "#F44336";
      const label = esc(decodeUnicodeEscapes(p.label || "")) || `${TYPE_LABEL[p.type]} ${i + 1}`;
      const desc = esc(decodeUnicodeEscapes(p.description || ""));
      const photos = photoMap[p.id] || [];
      const photosHtml = photos.length
        ? `<div class="mphotos">${photos.map((d) => `<img src="${d}" />`).join("")}</div>`
        : "";
      return `<div class="mark">
        <span class="mnum" style="background:${color};">${i + 1}</span>
        <div class="mtxt">
          <div class="mlabel">${label} <span class="mtype" style="color:${color};">${TYPE_LABEL[p.type]}</span></div>
          ${desc ? `<div class="mdesc">${desc}</div>` : ""}
          ${photosHtml}
        </div>
      </div>`;
    })
    .join("");
  return `<div class="marks"><div class="marks-h">Markierungen</div>${rows}</div>`;
}

function planPage(plan: FloorPlan, pins: PlanPin[], dataUri: string, isLast: boolean, company: string, photoMap: PhotoMap): string {
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
    ${marksHtml(pins, photoMap)}
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
  /* Teardrop marker: its tip (bottom centre) sits exactly on the point. */
  .pin { position: absolute; transform: translate(-50%, -100%); }
  .pin svg { display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.3)); }
  /* Markings list below the plan — each in its own box. */
  .marks { margin-top: 12px; }
  .marks-h { font-size: 11px; font-weight: 800; color: #0F2744; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .mark { display: flex; align-items: flex-start; gap: 10px; border: 1px solid #e6eaf0; border-radius: 8px; padding: 9px 11px; margin-bottom: 7px; break-inside: avoid; page-break-inside: avoid; }
  .mnum { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
  .mtxt { flex: 1; }
  .mlabel { font-size: 12.5px; font-weight: 700; color: #1b2430; }
  .mtype { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; margin-left: 6px; }
  .mdesc { font-size: 11px; color: #475569; line-height: 1.45; margin-top: 2px; }
  .mphotos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .mphotos img { width: 110px; height: 82px; object-fit: cover; border: 1px solid #e6eaf0; border-radius: 6px; }
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

  // Defect photos (for Mangel pins) live on the defect, not the pin.
  let defectPhotosById: Record<string, string[]> = {};
  try {
    const projectId = plans[0]?.projectId;
    const defs = await getDefects(projectId || undefined);
    defectPhotosById = Object.fromEntries(defs.map((d) => [d.id, d.photos || []]));
  } catch {}

  // Embed every marking's photos (Foto pin + Mangel pin) as data URIs once.
  const photoMap: PhotoMap = {};
  for (const plan of plans) {
    for (const pin of pinsByPlan[plan.id] || []) {
      const srcs = [
        ...((pin as any).photos || []),
        ...((pin as any).photoUri ? [(pin as any).photoUri] : []),
        ...((pin as any).defectId ? (defectPhotosById[(pin as any).defectId] || []) : []),
      ];
      const seen = new Set<string>();
      const uris: string[] = [];
      for (const s of srcs) {
        if (!s || seen.has(s)) continue;
        seen.add(s);
        const d = await fileToDataUri(s);
        if (d) uris.push(d);
      }
      if (uris.length) photoMap[pin.id] = uris;
    }
  }

  const pages: string[] = [];
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const dataUri = await fileToDataUri(plan.imageUri);
    if (!dataUri) continue;
    pages.push(planPage(plan, pinsByPlan[plan.id] || [], dataUri, i === plans.length - 1, company, photoMap));
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
