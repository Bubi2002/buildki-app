import * as FileSystem from "expo-file-system/legacy";

import { getFloorPlans } from "./floor-plan-store";
import { getPdfBranding } from "./pdf-branding-store";
import { RAUMBUCH_POSITIONS, RAUMBUCH_POSITION_LABEL_KEY, type RaumbuchEntry } from "./raumbuch-store";

async function toDataUri(uri?: string | null): Promise<string | null> {
  if (!uri) return null;
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const ext = uri.toLowerCase().includes(".png") ? "png" : "jpeg";
    return `data:image/${ext};base64,${b64}`;
  } catch {
    return null;
  }
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Build a Raumbuch PDF: one page per room, plan excerpt with marker + a photo
 *  per position (A/B/C/D, Boden, Decke). */
export async function generateRaumbuchPdf(
  projectName: string,
  entries: RaumbuchEntry[],
  t: (key: any) => string,
): Promise<string> {
  const branding = await getPdfBranding().catch(() => null);
  const NAVY = "#0F2744";
  const accent = branding?.accentColor || "#1E3A5F";
  const projectId = entries[0]?.projectId || "";
  const plans = await getFloorPlans(projectId).catch(() => [] as any[]);
  const planCache: Record<string, { uri: string | null; aspect: number }> = {};
  const now = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const co = esc(branding?.companyName || "BuildKI");

  const pages: string[] = [];
  for (let idx = 0; idx < entries.length; idx++) {
    const e = entries[idx];
    // Plan excerpt with marker.
    let planHtml = "";
    if (e.planId && e.planX != null && e.planY != null) {
      if (!(e.planId in planCache)) {
        const p = plans.find((x: any) => x.id === e.planId);
        planCache[e.planId] = { uri: await toDataUri(p?.imageUri), aspect: p && p.width > 0 && p.height > 0 ? p.width / p.height : 1.6 };
      }
      const pc = planCache[e.planId];
      if (pc.uri) {
        planHtml = `<div class="plan">
          <img src="${pc.uri}" />
          <div class="pin" style="left:${(e.planX * 100).toFixed(2)}%; top:${(e.planY * 100).toFixed(2)}%;"></div>
        </div>`;
      }
    }

    // Position tiles.
    const tiles: string[] = [];
    for (const pos of RAUMBUCH_POSITIONS) {
      const label = esc(t(RAUMBUCH_POSITION_LABEL_KEY[pos]));
      const photo = await toDataUri(e.photos?.[pos]);
      tiles.push(`<div class="tile">
        <div class="tile-label">${label}</div>
        ${photo ? `<img class="tile-img" src="${photo}" />` : `<div class="tile-empty">—</div>`}
      </div>`);
    }

    pages.push(`
      <section class="page${idx > 0 ? " brk" : ""}">
        <div class="room-head">
          <div>
            <div class="room-name">${esc(e.roomName)}</div>
            <div class="room-floor">${esc(e.floorName)}</div>
          </div>
          <div class="pageno">${idx + 1} / ${entries.length}</div>
        </div>
        ${planHtml}
        <div class="grid">${tiles.join("")}</div>
      </section>`);
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page { margin: 0 0 12mm 0; @bottom-left { content: "${esc(projectName)}"; font-size: 8px; color: #9aa6b4; padding: 0 0 6mm 14mm; } @bottom-right { content: "Seite " counter(page) " / " counter(pages); font-size: 8px; color: #9aa6b4; padding: 0 14mm 6mm 0; } }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; margin: 0; color: #253040; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .top { background: ${NAVY}; color: #fff; padding: 16px 14mm; display: flex; align-items: center; justify-content: space-between; }
    .top .co { font-size: 15px; font-weight: 800; letter-spacing: 0.3px; }
    .top .co small { display: block; font-size: 8px; font-weight: 700; color: #9db8d4; letter-spacing: 1.4px; text-transform: uppercase; margin-top: 3px; }
    .top .d { font-size: 12px; font-weight: 700; }
    .page { padding: 16px 14mm; }
    .brk { break-before: page; page-break-before: always; }
    .room-head { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid ${accent}; padding-bottom: 8px; margin-bottom: 12px; }
    .room-name { font-size: 22px; font-weight: 800; color: ${NAVY}; }
    .room-floor { font-size: 12px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
    .pageno { font-size: 11px; color: #94a3b8; }
    .plan { position: relative; width: 62%; margin: 0 0 14px; border: 1px solid #e6eaf0; border-radius: 8px; overflow: hidden; }
    .plan img { display: block; width: 100%; height: auto; }
    .plan .pin { position: absolute; width: 14px; height: 14px; margin-left: -7px; margin-top: -7px; border-radius: 50%; background: #DC2626; border: 2px solid #fff; box-shadow: 0 0 0 1px #DC2626; }
    .grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .tile { width: calc(50% - 5px); border: 1px solid #e6eaf0; border-radius: 10px; overflow: hidden; break-inside: avoid; }
    .tile-label { font-size: 12px; font-weight: 800; color: ${NAVY}; padding: 8px 10px; background: #f7f9fb; border-bottom: 1px solid #eef1f5; }
    .tile-img { display: block; width: 100%; height: 150px; object-fit: cover; }
    .tile-empty { height: 150px; display: flex; align-items: center; justify-content: center; color: #cbd5e1; font-size: 26px; background: #fafbfc; }
  </style></head><body>
    <div class="top"><div class="co">${co}<small>Raumbuch</small></div><div class="d">${now}</div></div>
    ${pages.join("")}
  </body></html>`;
}
