import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getFloorPlans } from "./floor-plan-store";
import { getPdfBranding } from "./pdf-branding-store";
import { resolveBrandingLogo } from "./pdf-premium";
import { RAUMBUCH_POSITIONS, RAUMBUCH_POSITION_LABEL_KEY, RAUMBUCH_SURVEY, raumbuchPhotosFor, type RaumbuchEntry, type RaumbuchWallKey } from "./raumbuch-store";

const WALL_KEYS: RaumbuchWallKey[] = ["A", "B", "C", "D", "E", "F", "G", "H"];
// Distinct colour per wall: A = Blau, B = Grün, C = Rot, D = Orange.
const WALL_COLOR: Record<RaumbuchWallKey, string> = { A: "#2563EB", B: "#16A34A", C: "#DC2626", D: "#EA580C", E: "#9333EA", F: "#0891B2", G: "#CA8A04", H: "#DB2777" };
const PLAN_W = 190; // px width of the plan excerpt box in the PDF (kept small so
                    // the meta row stays short and the photo fits on the SAME page)

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
async function toDataUri(uri?: string | null, maxWidth = 1000, compress = 0.6): Promise<string | null> {
  if (!uri) return null;
  try {
    const resolved = await resolveLocalUri(uri);
    let src = resolved;
    if (Platform.OS !== "web") {
      try {
        const m = await ImageManipulator.manipulateAsync(
          resolved,
          [{ resize: { width: maxWidth } }],
          { compress, format: ImageManipulator.SaveFormat.JPEG },
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

// CSS class for a plan's background image (one definition per plan in <style>).
const planClass = (id: string) => "planbg-" + String(id).replace(/[^a-zA-Z0-9_-]/g, "_");

/** Build a Raumbuch PDF: ONE PAGE PER WALL/position (A/B/C/D, Boden, Decke) with
 *  the full, uncropped photo, plus the room metadata and a plan excerpt. */
export type RaumbuchTemplate = "standard" | "fragenkatalog";

export async function generateRaumbuchPdf(
  projectName: string,
  entries: RaumbuchEntry[],
  t: (key: any) => string,
  template: RaumbuchTemplate = "standard",
): Promise<string> {
  const branding = await getPdfBranding().catch(() => null);
  const accent = branding?.accentColor || "#8A6E52";
  // Headings/dividers follow the brand accent (warm brown); beige tints for blocks.
  const NAVY = accent;
  const beigeBg = `${accent}12`;
  const beigeBorder = `${accent}30`;
  const logoDataUri = await resolveBrandingLogo(branding).catch(() => "");
  const projectId = entries[0]?.projectId || "";
  const plans = await getFloorPlans(projectId).catch(() => [] as any[]);
  const planCache: Record<string, { uri: string | null; aspect: number }> = {};
  const now = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const co = esc(branding?.companyName || "BuildKI");

  // Project meta for the cover page.
  let projectAddress = "";
  let projectBuilder = ""; // Bauherr / Auftraggeber
  let heroDataUri: string | null = null;
  try {
    const raw = await AsyncStorage.getItem("projects");
    const proj = (raw ? JSON.parse(raw) : []).find((p: any) => p.id === projectId);
    projectAddress = proj?.address || proj?.location || proj?.strasse || "";
    projectBuilder = proj?.client || proj?.bauherr || proj?.builder || proj?.auftraggeber || proj?.customer || "";
    if (proj?.imageUri) heroDataUri = await toDataUri(proj.imageUri, 1600);
  } catch {}
  const companyAddress = esc(branding?.companyAddress || "").replace(/\n/g, "<br>");
  // Firma-Kontaktzeilen für den Ersteller-Block: Telefon, Mail, Website.
  const companyContact = [
    branding?.companyPhone ? `Tel: ${esc(branding.companyPhone)}` : "",
    branding?.companyEmail ? esc(branding.companyEmail) : "",
    branding?.companyWebsite ? esc(branding.companyWebsite) : "",
  ].filter(Boolean).join("<br>");

  // Resolve the plan image (once per plan).
  const resolvePlan = async (e: RaumbuchEntry): Promise<{ uri: string | null; aspect: number } | null> => {
    if (!e.planId) return null;
    if (!(e.planId in planCache)) {
      const p = plans.find((x: any) => x.id === e.planId);
      // The plan excerpt is embedded on EVERY wall page, so its base64 is
      // repeated many times in the HTML. Keep it small (displayed at ~190px) to
      // avoid blowing up the HTML size and the iOS PDF renderer's memory.
      planCache[e.planId] = { uri: await toDataUri(p?.imageUri, 700, 0.55), aspect: p && p.width > 0 && p.height > 0 ? p.width / p.height : 1.6 };
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
    // Keep the excerpt box from getting too TALL (a tall/portrait crop) — a tall
    // meta row would push the photo onto the next page. Scale the whole excerpt
    // down (no cropping) when it would exceed the height cap.
    const MAX_CONT_H = 200; // px (~53mm)
    let W = PLAN_W, contH = W / contAspect;
    if (contH > MAX_CONT_H) { W = W * (MAX_CONT_H / contH); contH = MAX_CONT_H; }
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
          return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${hot ? 5 : 3.5}" stroke-linecap="round"/><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${R}" fill="${col}" stroke="#ffffff" stroke-width="1.5"/><text x="${bx.toFixed(1)}" y="${(by + 3.3).toFixed(1)}" font-size="10" font-weight="bold" text-anchor="middle" fill="#ffffff">${k}</text>`;
        }).join("")}</svg>`
      : "";
    const hasPin = e.planX != null && e.planY != null;
    // Use the plan image as a CSS background via a per-plan class (defined ONCE
    // in <style>) instead of repeating the base64 <img> on every wall page. For
    // large room books the same plan appears on 100+ pages — repeating the
    // base64 blew up the HTML and made the iOS PDF renderer run out of memory.
    const cls = planClass(e.planId || "");
    return `<div class="plan ${cls}" style="width:${W}px;height:${contH.toFixed(1)}px;background-size:${imgW.toFixed(1)}px ${imgH.toFixed(1)}px;background-position:${(-cx * imgW).toFixed(1)}px ${(-cy * imgH).toFixed(1)}px;background-repeat:no-repeat;">
      ${wallSvg}
      ${hasPin ? `<div class="pin" style="left:${toX(e.planX!).toFixed(1)}px;top:${toY(e.planY!).toFixed(1)}px;"></div>` : ""}
    </div>`;
  };

  // ── Group rooms by floor, ordered KG/UG → EG → OG → DG. ──
  const floorRank = (name: string): number => {
    const n = (name || "").toUpperCase();
    if (/KELLER|\bKG\b|\bUG\b/.test(n)) return 0;
    if (/ERDGESCH|\bEG\b/.test(n)) return 1;
    const og = n.match(/(\d+)\s*\.?\s*OG/); if (og) return 10 + parseInt(og[1], 10);
    if (/DACH|\bDG\b/.test(n)) return 100;
    return 50;
  };
  const floorCode = (name: string): string => {
    const n = (name || "").toUpperCase();
    if (/KELLER|\bKG\b|\bUG\b/.test(n)) return "KG";
    if (/ERDGESCH|\bEG\b/.test(n)) return "EG";
    const og = n.match(/(\d+)\s*\.?\s*OG/); if (og) return `${og[1]}OG`;
    if (/DACH|\bDG\b/.test(n)) return "DG";
    return (name || "R").replace(/[^A-Za-zÄÖÜ]/g, "").slice(0, 2).toUpperCase() || "R";
  };
  // Total photo pages for a room (each photo gets its own page; a position can
  // hold several photos for a long wall).
  const wallCount = (e: RaumbuchEntry) => RAUMBUCH_POSITIONS.reduce((n, p) => n + raumbuchPhotosFor(e.photos, p).length, 0);
  const pad2 = (n: number) => String(n).padStart(2, "0");

  // Only rooms with at least one photo produce content pages.
  const withPhotos = entries.filter((e) => wallCount(e) > 0);
  const floorNames = Array.from(new Set(withPhotos.map((e) => e.floorName || "—")))
    .sort((a, b) => floorRank(a) - floorRank(b) || a.localeCompare(b, "de"));
  const floors = floorNames.map((fname) => ({
    name: fname,
    code: floorCode(fname),
    rooms: withPhotos.filter((e) => (e.floorName || "—") === fname)
      .sort((a, b) => (a.roomName || "").localeCompare(b.roomName || "", "de")),
  }));

  // Page numbers for the table of contents: cover = 1, TOC = 2, then each floor
  // gets 1 divider page followed by its rooms' wall pages.
  // The Fragenkatalog template adds one questionnaire page per room.
  const roomPages = (e: RaumbuchEntry) => (template === "fragenkatalog" ? 1 : 0) + wallCount(e);
  let pageCursor = 3;
  const tocFloors = floors.map((fl) => {
    pageCursor += 1; // divider page
    const rooms = fl.rooms.map((e, i) => {
      const startPage = pageCursor; pageCursor += roomPages(e);
      return { no: `${fl.code} ${pad2(i + 1)}`, name: e.roomName || "—", page: startPage };
    });
    return { name: fl.name, rooms };
  });

  // Questionnaire + Freigabe/Änderung block — reflects the room's filled-in
  // answers (☑ checked / ☐ unchecked), or stays blank to tick off by hand.
  const BOX_OFF = "&#9744;"; // ☐
  const BOX_ON = "&#9745;";  // ☑
  const buildQuiz = (survey?: RaumbuchEntry["survey"]): string => {
    const s = survey || {};
    const rows = RAUMBUCH_SURVEY.map((q) => {
      const checked = new Set(s.checked?.[q.key] || []);
      const opts = q.options.map((o) => {
        const on = checked.has(o);
        const box = on ? BOX_ON : BOX_OFF;
        if (o === "Sonstiges") {
          const txt = (s.other?.[q.key] || "").trim();
          return `<span class="${on ? "on" : ""}">${box} ${esc(o)} ${txt ? esc(txt) : "______________"}</span>`;
        }
        return `<span class="${on ? "on" : ""}">${box} ${esc(o)}</span>`;
      });
      // User-added custom points — ticked state mirrors the checked set.
      const customOpts = (s.custom?.[q.key] || []).map((c) => {
        const on = checked.has(c);
        return `<span class="${on ? "on" : ""}">${on ? BOX_ON : BOX_OFF} ${esc(c)}</span>`;
      });
      const allOpts = [...opts, ...customOpts].join("&nbsp;&nbsp;&nbsp;");
      return `<div class="quiz-row"><div class="quiz-label">${esc(q.label)}</div><div class="quiz-opts">${allOpts}</div></div>`;
    }).join("");
    const freiOn = s.decision === "freigabe";
    const aendOn = s.decision === "aenderung";
    const note = (s.decisionNote || "").trim();
    return `
      <div class="quiz">${rows}</div>
      <div class="freigabe"><b>BITTE ANKREUZEN:</b> &nbsp; <span class="${freiOn ? "on" : ""}">${freiOn ? BOX_ON : BOX_OFF} <b>Freigabe</b></span> &nbsp;&nbsp;oder&nbsp;&nbsp; <span class="${aendOn ? "on" : ""}">${aendOn ? BOX_ON : BOX_OFF} <b>Änderung</b></span> <span class="freigabe-hint">(bitte hier angeben)</span> ${note ? esc(note) : "___________________________"}</div>`;
  };

  const content: string[] = [];

  // ── Cover page ──
  content.push(`
    <section class="page cover">
      ${logoDataUri ? `<img class="cover-logo" src="${logoDataUri}" />` : `<div class="cover-co">${co}</div>`}
      ${heroDataUri ? `<img class="cover-hero" src="${heroDataUri}" />` : `<div class="cover-hero ph"></div>`}
      <div class="cover-body">
        <div class="cover-kicker">Raumbuch</div>
        <div class="cover-title">${esc(projectName)}</div>
        <div class="cover-meta">
          ${projectAddress ? `<div class="cover-block"><b>Baugrundstück</b><br>${esc(projectAddress)}</div>` : ""}
          ${projectBuilder ? `<div class="cover-block"><b>Bauherr</b><br>${esc(projectBuilder)}</div>` : ""}
          <div class="cover-block"><b>Ersteller</b><br>${co}${companyAddress ? `<br>${companyAddress}` : ""}${companyContact ? `<br>${companyContact}` : ""}</div>
        </div>
        <div class="cover-date">${now}</div>
      </div>
    </section>`);

  // ── Table of contents ──
  content.push(`
    <section class="page brk toc">
      <h1 class="toc-head">Inhalt</h1>
      ${tocFloors.map((fl) => `
        <div class="toc-floor">${esc(fl.name).toUpperCase()}</div>
        ${fl.rooms.map((r) => `<div class="toc-row"><span class="toc-no">${esc(r.no)}</span><span class="toc-name">${esc(r.name)}</span><span class="toc-dots"></span><span class="toc-pg">${r.page}</span></div>`).join("")}
      `).join("")}
    </section>`);

  // ── Per floor: divider page (with plan) + room wall pages ──
  for (const fl of floors) {
    let floorPlanUri: string | null = null;
    for (const e of fl.rooms) { const pc = await resolvePlan(e); if (pc?.uri) { floorPlanUri = pc.uri; break; } }
    content.push(`
      <section class="page brk floor-divider">
        <h1 class="floor-title">${esc(fl.name)}</h1>
        ${floorPlanUri ? `<div class="floor-plan"><img src="${floorPlanUri}" /></div>` : ""}
      </section>`);

    for (let ri = 0; ri < fl.rooms.length; ri++) {
      const e = fl.rooms[ri];
      const pc = await resolvePlan(e);
      const roomNo = `${fl.code}-${pad2(ri + 1)}`;

      // Fragenkatalog: a questionnaire/overview page per room (plan + up to 2
      // photos + the checklist to tick off + Freigabe/Änderung).
      if (template === "fragenkatalog") {
        const thumbSrc = RAUMBUCH_POSITIONS.flatMap((p) => raumbuchPhotosFor(e.photos, p)).slice(0, 2);
        const thumbs: string[] = [];
        for (const u of thumbSrc) { const d = await toDataUri(u as string); if (d) thumbs.push(`<img class="rp" src="${d}" />`); }
        const planFull = pc ? buildPlanExcerpt(e, pc) : "";
        content.push(`
          <section class="page brk room-overview">
            <div class="meta-row">
              <div class="meta">
                <div class="m"><span>Geschoss:</span> ${esc(e.floorName)}</div>
                <div class="m"><span>Raumnummer:</span> ${esc(roomNo)}</div>
                <div class="m"><span>Bezeichnung:</span> ${esc(e.roomName)}</div>
              </div>
              ${planFull}
            </div>
            ${thumbs.length ? `<div class="room-photos">${thumbs.join("")}</div>` : ""}
            ${buildQuiz(e.survey)}
          </section>`);
      }

      for (const pos of RAUMBUCH_POSITIONS) {
        const uris = raumbuchPhotosFor(e.photos, pos);
        if (uris.length === 0) continue;
        const label = esc(t(RAUMBUCH_POSITION_LABEL_KEY[pos]));
        const note = esc(e.notes?.[pos] || "");
        const isWall = pos !== "boden" && pos !== "decke";
        const plan = pc ? buildPlanExcerpt(e, pc, isWall ? (pos as RaumbuchWallKey) : undefined) : "";
        // One page per photo — a long wall can have several shots, numbered 1/n.
        for (let pi = 0; pi < uris.length; pi++) {
          const photo = await toDataUri(uris[pi], 900, 0.55);
          if (!photo) continue;
          const suffix = uris.length > 1 ? ` (${pi + 1}/${uris.length})` : "";
          const posRow = isWall
            ? `<div class="m"><span>Wand:</span> ${pos}${suffix}</div>`
            : `<div class="m"><span>Bereich:</span> ${label}${suffix}</div>`;
          content.push(`
            <section class="page brk">
              <div class="meta-row">
                <div class="meta">
                  <div class="m"><span>Geschoss:</span> ${esc(e.floorName)}</div>
                  ${template === "fragenkatalog" ? `<div class="m"><span>Raumnummer:</span> ${esc(roomNo)}</div>` : ""}
                  <div class="m"><span>Raum:</span> ${esc(e.roomName)}</div>
                  ${posRow}
                  ${note ? `<div class="m note"><span>Notiz:</span> ${note}</div>` : ""}
                </div>
                ${plan}
              </div>
              <div class="photo-wrap"><img class="photo" src="${photo}" /></div>
              <div class="wall-label" style="color:${isWall ? WALL_COLOR[pos as RaumbuchWallKey] : accent};">${label}${suffix}</div>
            </section>`);
        }
      }
    }
  }

  if (floors.length === 0) {
    content.push(`<section class="page cover"><div class="cover-body"><div class="cover-title">${esc(projectName)}</div><div class="empty">Keine Fotos erfasst.</div></div></section>`);
  }

  // Each plan's base64 is defined ONCE here and referenced by class on every
  // wall page (no per-page repetition of the large image).
  const planCss = Object.entries(planCache)
    .map(([id, pc]) => (pc.uri ? `.${planClass(id)} { background-image: url("${pc.uri}"); }` : ""))
    .join("\n");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${planCss}
    @page { margin: 0 0 12mm 0; @bottom-left { content: "${esc(projectName)}"; font-size: 8px; color: #9aa6b4; padding: 0 0 6mm 14mm; } @bottom-right { content: "Seite " counter(page) " von " counter(pages); font-size: 8px; color: #9aa6b4; padding: 0 14mm 6mm 0; } }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; margin: 0; color: #253040; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 18px 14mm 0; }
    .brk { break-before: page; page-break-before: always; }
    /* ── Cover ── */
    .cover { padding: 0; }
    .cover-co { font-size: 22px; font-weight: 800; letter-spacing: 0.5px; color: ${NAVY}; padding: 22mm 14mm 10px; }
    .cover-logo { display: block; max-height: 120px; max-width: 320px; object-fit: contain; padding: 20mm 14mm 10px; }
    .cover-hero { display: block; width: 100%; height: 95mm; object-fit: cover; }
    .cover-hero.ph { height: 2mm; background: ${NAVY}; }
    .cover-body { padding: 16px 14mm 0; }
    .cover-kicker { font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: ${accent}; }
    .cover-title { font-size: 26px; font-weight: 800; color: ${NAVY}; margin: 4px 0 0; }
    .cover-meta { margin-top: 18px; font-size: 12.5px; line-height: 1.6; color: #253040; }
    .cover-block { margin-bottom: 10px; background: ${beigeBg}; border: 1px solid ${beigeBorder}; border-radius: 10px; padding: 10px 12px; }
    .cover-block b { color: ${NAVY}; }
    .cover-date { margin-top: 14px; font-size: 10px; color: #9aa6b4; letter-spacing: 1px; }
    /* ── Table of contents ── */
    .toc-head { font-size: 26px; font-weight: 800; letter-spacing: 1px; color: ${NAVY}; text-transform: uppercase; margin: 6px 0 14px; }
    .toc-floor { font-size: 13px; font-weight: 800; color: ${NAVY}; text-transform: uppercase; letter-spacing: 0.5px; border-top: 2px solid ${NAVY}; padding-top: 8px; margin: 16px 0 4px; }
    .toc-row { display: flex; align-items: baseline; gap: 8px; font-size: 13px; padding: 4px 0; }
    .toc-no { width: 56px; color: #475569; font-weight: 700; flex-shrink: 0; }
    .toc-name { color: #253040; }
    .toc-dots { flex: 1; border-bottom: 1px dotted #c7d0db; transform: translateY(-3px); }
    .toc-pg { color: #475569; font-weight: 700; }
    /* ── Floor divider ── */
    .floor-divider { display: flex; flex-direction: column; align-items: center; padding-top: 38mm; }
    .floor-title { font-size: 30px; font-weight: 800; letter-spacing: 1px; color: ${NAVY}; text-transform: uppercase; text-align: center; margin: 0 0 18px; }
    .floor-plan { width: 100%; text-align: center; }
    .floor-plan img { max-width: 100%; max-height: 185mm; object-fit: contain; border: 1px solid #e6eaf0; border-radius: 8px; }
    /* ── Room / wall pages ── */
    .meta-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .meta { font-size: 14px; line-height: 1.7; color: #253040; }
    .meta .m span { font-weight: 800; color: ${NAVY}; }
    .meta .note { font-size: 12.5px; color: #475569; margin-top: 4px; max-width: 380px; }
    .plan { position: relative; max-width: 40%; border: 1px solid #e6eaf0; border-radius: 8px; overflow: hidden; flex-shrink: 0; }
    .plan img { display: block; width: 100%; height: auto; }
    .plan .pin { position: absolute; width: 14px; height: 14px; margin-left: -7px; margin-top: -7px; border-radius: 50%; background: #DC2626; border: 2px solid #fff; box-shadow: 0 0 0 1px #DC2626; }
    .photo-wrap { text-align: center; break-inside: avoid; page-break-inside: avoid; }
    .photo { display: block; width: 100%; max-height: 150mm; object-fit: contain; border: 1px solid #e6eaf0; border-radius: 8px; }
    .wall-label { font-size: 16px; font-weight: 800; color: ${accent}; letter-spacing: 0.5px; margin: 10px 0 0; }
    .empty { padding: 40px; text-align: center; color: #94a3b8; font-size: 14px; }
    /* ── Fragenkatalog (questionnaire) ── */
    .room-photos { display: flex; gap: 10px; margin: 2px 0 14px; }
    .room-photos .rp { width: 50%; height: 52mm; object-fit: cover; border: 1px solid #e6eaf0; border-radius: 6px; }
    .quiz { border-top: 2px solid ${NAVY}; }
    .quiz-row { display: flex; gap: 14px; padding: 9px 0; border-bottom: 1px solid #e6eaf0; }
    .quiz-label { width: 110px; flex-shrink: 0; font-size: 12.5px; font-weight: 800; color: ${NAVY}; }
    .quiz-opts { flex: 1; font-size: 11.5px; line-height: 1.8; color: #253040; }
    .quiz-opts .on, .freigabe .on { font-weight: 800; color: ${NAVY}; }
    .freigabe { margin-top: 16px; font-size: 12.5px; color: #253040; }
    .freigabe-hint { color: #64748b; }
  </style></head><body>
    ${content.join("")}
  </body></html>`;
}
