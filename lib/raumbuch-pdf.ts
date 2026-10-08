import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getFloorPlans } from "./floor-plan-store";
import { getPdfBranding } from "./pdf-branding-store";
import { RAUMBUCH_POSITIONS, RAUMBUCH_POSITION_LABEL_KEY, type RaumbuchEntry, type RaumbuchWallKey } from "./raumbuch-store";

const WALL_KEYS: RaumbuchWallKey[] = ["A", "B", "C", "D"];
// Distinct colour per wall: A = Blau, B = Grün, C = Rot, D = Orange.
const WALL_COLOR: Record<RaumbuchWallKey, string> = { A: "#2563EB", B: "#16A34A", C: "#DC2626", D: "#EA580C" };
const PLAN_W = 240; // px width of the plan excerpt box in the PDF

// iOS can change the app's Documents container path between installs/updates, so a
// file:// path saved by an earlier build may no longer resolve. Re-home such a
// stale path onto the CURRENT container so old photos/plans are still found.
async function resolveLocalUri(uri: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) return uri;
  } catch {}
  const marker = "/Documents/";
  const idx = uri.indexOf(marker);
  if (idx >= 0 && FileSystem.documentDirectory) {
    const rehomed = FileSystem.documentDirectory.replace(/\/$/, "/") + uri.slice(idx + marker.length);
    try { const i2 = await FileSystem.getInfoAsync(rehomed); if (i2.exists) return rehomed; } catch {}
  }
  return uri;
}

// Read an image as a base64 data URI. Converts through ImageManipulator to a
// web-safe JPEG first — iOS photos are often HEIC (which a PDF can't render) and
// can be huge; this makes them display reliably and keeps the PDF small.
async function toDataUri(uri?: string | null, maxWidth = 1400): Promise<string | null> {
  if (!uri) return null;
  try {
    const resolved = await resolveLocalUri(uri);
    let src = resolved;
    if (Platform.OS !== "web") {
      try {
        const m = await ImageManipulator.manipulateAsync(
          resolved,
          [{ resize: { width: maxWidth } }],
          { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
        );
        if (m?.uri) src = m.uri;
      } catch {}
    }
    const b64 = await FileSystem.readAsStringAsync(src, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${b64}`;
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

  // Resolve the plan image (once per plan).
  const resolvePlan = async (e: RaumbuchEntry): Promise<{ uri: string | null; aspect: number } | null> => {
    if (!e.planId) return null;
    if (!(e.planId in planCache)) {
      const p = plans.find((x: any) => x.id === e.planId);
      planCache[e.planId] = { uri: await toDataUri(p?.imageUri, 2000), aspect: p && p.width > 0 && p.height > 0 ? p.width / p.height : 1.6 };
    }
    return planCache[e.planId];
  };

  // Build the plan excerpt, applying the optional crop and drawing the labelled
  // wall lines (the wall for the current page is highlighted).
  const buildPlanExcerpt = (e: RaumbuchEntry, pc: { uri: string | null; aspect: number }, highlight?: RaumbuchWallKey): string => {
    if (!pc.uri) return "";
    const A = pc.aspect || 1.6;
    const cr = e.planCrop;
    const cx = cr?.x ?? 0, cy = cr?.y ?? 0, cw = cr?.w ?? 1, ch = cr?.h ?? 1;
    const contAspect = (cw * A) / ch;
    const W = PLAN_W, contH = W / contAspect;
    const imgW = W / cw, imgH = imgW / A;
    const toX = (px: number) => (((px - cx) / cw) * W);
    const toY = (py: number) => (((py - cy) / ch) * contH);
    const walls = e.walls || {};
    // Clamp into the box so lines/labels never spill past the frame.
    const R = 8;
    const clX = (x: number) => Math.max(0, Math.min(W, x));
    const clY = (y: number) => Math.max(0, Math.min(contH, y));
    const wallSvg = Object.keys(walls).length
      ? `<svg width="${W}" height="${contH.toFixed(1)}" viewBox="0 0 ${W} ${contH.toFixed(1)}" style="position:absolute;left:0;top:0;">${WALL_KEYS.map((k) => {
          const wl = walls[k]; if (!wl) return "";
          const hot = highlight === k;
          const x1 = clX(toX(wl.x1)), y1 = clY(toY(wl.y1)), x2 = clX(toX(wl.x2)), y2 = clY(toY(wl.y2));
          // Badge at the line midpoint, kept fully inside the frame.
          const bx = Math.max(R + 1, Math.min(W - R - 1, (x1 + x2) / 2));
          const by = Math.max(R + 1, Math.min(contH - R - 1, (y1 + y2) / 2));
          const col = WALL_COLOR[k] || "#2563EB";
          return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${hot ? 4 : 2.5}" stroke-linecap="round"/><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${R}" fill="${col}" stroke="#ffffff" stroke-width="1.5"/><text x="${bx.toFixed(1)}" y="${(by + 3.3).toFixed(1)}" font-size="10" font-weight="bold" text-anchor="middle" fill="#ffffff">${k}</text>`;
        }).join("")}</svg>`
      : "";
    const hasPin = e.planX != null && e.planY != null;
    return `<div class="plan" style="width:${W}px;height:${contH.toFixed(1)}px;">
      <img src="${pc.uri}" style="position:absolute;width:${imgW.toFixed(1)}px;height:${imgH.toFixed(1)}px;left:${(-cx * imgW).toFixed(1)}px;top:${(-cy * imgH).toFixed(1)}px;max-width:none;" />
      ${wallSvg}
      ${hasPin ? `<div class="pin" style="left:${toX(e.planX!).toFixed(1)}px;top:${toY(e.planY!).toFixed(1)}px;"></div>` : ""}
    </div>`;
  };

  // One page per (room × position-with-photo).
  const pages: string[] = [];
  let pageNo = 0;
  // Count total pages first (positions that actually have a photo).
  const total = entries.reduce((sum, e) => sum + RAUMBUCH_POSITIONS.filter((p) => e.photos?.[p]).length, 0);

  for (const e of entries) {
    const pc = await resolvePlan(e);
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
      const plan = pc ? buildPlanExcerpt(e, pc, isWall ? (pos as RaumbuchWallKey) : undefined) : "";
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
    pages.push(`<section class="page"><div class="empty">Keine Fotos erfasst.</div></section>`);
  }

  const bandMeta = [esc(projectName), projectAddress ? esc(projectAddress) : "", now].filter(Boolean).join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page { margin: 0 0 12mm 0; @bottom-left { content: "${esc(projectName)}"; font-size: 8px; color: #9aa6b4; padding: 0 0 6mm 14mm; } @bottom-right { content: "Seite " counter(page) " / " counter(pages); font-size: 8px; color: #9aa6b4; padding: 0 14mm 6mm 0; } }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; margin: 0; color: #253040; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .top { background: ${NAVY}; color: #fff; padding: 11px 14mm; display: flex; align-items: center; justify-content: space-between; }
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
    /* Page 1 also carries the title band, so its photo gets a smaller cap to
       stay on the SAME page instead of spilling onto the next one. */
    section.page:first-of-type .photo { max-height: 150mm; }
    .wall-label { font-size: 16px; font-weight: 800; color: ${accent}; letter-spacing: 0.5px; margin: 10px 0 0; }
    .empty { padding: 40px; text-align: center; color: #94a3b8; font-size: 14px; }
  </style></head><body>
    <div class="top"><div class="co">${co}<small>Raumbuch</small></div><div class="d">${bandMeta}</div></div>
    ${pages.join("")}
  </body></html>`;
}
