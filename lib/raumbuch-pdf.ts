import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getFloorPlans } from "./floor-plan-store";
import { getPdfBranding } from "./pdf-branding-store";
import { RAUMBUCH_POSITIONS, RAUMBUCH_POSITION_LABEL_KEY, type RaumbuchEntry, type RaumbuchPosition } from "./raumbuch-store";

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

/** Build a Raumbuch PDF: ONE PAGE PER WALL/position (A/B/C/D, Boden, Decke) with
 *  the full, uncropped photo, plus the room metadata and a plan excerpt. */
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

  // Project address for the header band ("Straße, Datum, Projekt …").
  let projectAddress = "";
  try {
    const raw = await AsyncStorage.getItem("projects");
    const proj = (raw ? JSON.parse(raw) : []).find((p: any) => p.id === projectId);
    projectAddress = proj?.address || proj?.location || proj?.strasse || "";
  } catch {}

  // Pre-resolve plan excerpts once per plan.
  const planExcerpt = async (e: RaumbuchEntry): Promise<string> => {
    if (!e.planId || e.planX == null || e.planY == null) return "";
    if (!(e.planId in planCache)) {
      const p = plans.find((x: any) => x.id === e.planId);
      planCache[e.planId] = { uri: await toDataUri(p?.imageUri), aspect: p && p.width > 0 && p.height > 0 ? p.width / p.height : 1.6 };
    }
    const pc = planCache[e.planId];
    if (!pc.uri) return "";
    return `<div class="plan">
      <img src="${pc.uri}" />
      <div class="pin" style="left:${(e.planX * 100).toFixed(2)}%; top:${(e.planY * 100).toFixed(2)}%;"></div>
    </div>`;
  };

  // One page per (room × position-with-photo).
  const pages: string[] = [];
  let pageNo = 0;
  // Count total pages first (positions that actually have a photo).
  const total = entries.reduce((sum, e) => sum + RAUMBUCH_POSITIONS.filter((p) => e.photos?.[p]).length, 0);

  for (const e of entries) {
    const plan = await planExcerpt(e);
    for (const pos of RAUMBUCH_POSITIONS) {
      const uri = e.photos?.[pos];
      if (!uri) continue; // no empty pages
      const photo = await toDataUri(uri);
      if (!photo) continue;
      pageNo++;
      const label = esc(t(RAUMBUCH_POSITION_LABEL_KEY[pos]));
      const note = esc(e.notes?.[pos] || "");
      const isWall = pos === "A" || pos === "B" || pos === "C" || pos === "D";
      const posRow = isWall
        ? `<div class="m"><span>Wand:</span> ${pos}</div>`
        : `<div class="m"><span>Bereich:</span> ${label}</div>`;
      pages.push(`
        <section class="page${pageNo > 1 ? " brk" : ""}">
          <div class="meta-row">
            <div class="meta">
              <div class="m"><span>Geschoss:</span> ${esc(e.floorName)}</div>
              <div class="m"><span>Raum:</span> ${esc(e.roomName)}</div>
              ${posRow}
              ${note ? `<div class="m note"><span>Notiz:</span> ${note}</div>` : ""}
            </div>
            ${plan}
          </div>
          <div class="photo-wrap"><img class="photo" src="${photo}" /></div>
          <div class="wall-label">${label}</div>
        </section>`);
    }
  }

  if (pages.length === 0) {
    pages.push(`<section class="page"><div class="empty">${esc(t("raumbuch_empty" as any) || "Keine Fotos erfasst.")}</div></section>`);
  }

  const bandMeta = [esc(projectName), projectAddress ? esc(projectAddress) : "", now].filter(Boolean).join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page { margin: 0 0 12mm 0; @bottom-left { content: "${esc(projectName)}"; font-size: 8px; color: #9aa6b4; padding: 0 0 6mm 14mm; } @bottom-right { content: "Seite " counter(page) " / " counter(pages); font-size: 8px; color: #9aa6b4; padding: 0 14mm 6mm 0; } }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; margin: 0; color: #253040; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .top { background: ${NAVY}; color: #fff; padding: 16px 14mm; display: flex; align-items: center; justify-content: space-between; }
    .top .co { font-size: 15px; font-weight: 800; letter-spacing: 0.3px; }
    .top .co small { display: block; font-size: 8px; font-weight: 700; color: #9db8d4; letter-spacing: 1.4px; text-transform: uppercase; margin-top: 3px; }
    .top .d { font-size: 10.5px; font-weight: 600; color: #cfe0f2; text-align: right; max-width: 60%; }
    .page { padding: 18px 14mm 0; }
    .brk { break-before: page; page-break-before: always; }
    .meta-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .meta { font-size: 14px; line-height: 1.7; color: #253040; }
    .meta .m span { font-weight: 800; color: ${NAVY}; }
    .meta .note { font-size: 12.5px; color: #475569; margin-top: 4px; max-width: 380px; }
    .plan { position: relative; width: 240px; max-width: 42%; border: 1px solid #e6eaf0; border-radius: 8px; overflow: hidden; flex-shrink: 0; }
    .plan img { display: block; width: 100%; height: auto; }
    .plan .pin { position: absolute; width: 14px; height: 14px; margin-left: -7px; margin-top: -7px; border-radius: 50%; background: #DC2626; border: 2px solid #fff; box-shadow: 0 0 0 1px #DC2626; }
    .photo-wrap { text-align: center; break-inside: avoid; page-break-inside: avoid; }
    /* Full, uncropped photo: contain inside a generous box so it always fits one page. */
    .photo { display: block; width: 100%; max-height: 185mm; object-fit: contain; border: 1px solid #e6eaf0; border-radius: 8px; }
    .wall-label { font-size: 16px; font-weight: 800; color: ${accent}; letter-spacing: 0.5px; margin: 10px 0 0; }
    .empty { padding: 40px; text-align: center; color: #94a3b8; font-size: 14px; }
  </style></head><body>
    <div class="top"><div class="co">${co}<small>Raumbuch</small></div><div class="d">${bandMeta}</div></div>
    ${pages.join("")}
  </body></html>`;
}
