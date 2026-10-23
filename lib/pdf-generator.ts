import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getProtocolText } from "@/lib/protocol-compat";
import { normalizeMaengelTables, isMaengelTemplate } from "@/lib/maengel-normalize";
import {
  createDocumentEvidenceSelection,
  formatMeasurementForDocument,
  type DocumentEvidenceSnapshot,
} from "@/lib/document-evidence";
import { renderLetterhead } from "@/lib/pdf-premium";

/**
 * Helper: wrap a promise with a timeout to prevent hanging
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => {
      console.warn(`[PDF-Gen] Operation timed out after ${ms}ms`);
      resolve(fallback);
    }, ms)),
  ]);
}

/**
 * Compress a photo for PDF embedding - resize to max 1200px width and compress to 60% JPEG quality.
 * This significantly reduces base64 size and PDF file size.
 */
async function compressPhotoForPdf(uri: string): Promise<string> {
  try {
    // Skip compression on web (ImageManipulator has limited web support)
    if (Platform.OS === "web") return uri;
    
    const manipResult = await withTimeout(
      ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }], // Max 800px width for PDF (good quality, less memory)
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      ),
      8000, // 8 second timeout
      null
    );
    return manipResult?.uri || uri;
  } catch (error) {
    console.warn("[PDF-Gen] Photo compression failed, using original:", error);
    return uri; // Fallback to original if compression fails
  }
}

type TodoItem = {
  task: string;
  assignee: string;
  priority: string;
  deadline: string;
  done: boolean;
};

type PdfTemplate = "standard" | "compact" | "detailed" | "no_photos";

type PdfProtocol = {
  title: string;
  protocol: string;
  templateName?: string;
  templateId?: string;
  photos?: string[];
  photoTimestamps?: number[]; // seconds since recording start for each photo
  transcriptionSegments?: { start: number; end: number; text: string }[]; // Whisper segments with timing
  photoCaptions?: string[]; // pre-computed captions per photo (fallback if segments unavailable)
  evidenceIds?: string[];
  evidenceSnapshots?: DocumentEvidenceSnapshot[];
  todos?: TodoItem[];
  duration: number;
  createdAt: string;
  transcription?: string; // raw transcription for detailed template
  location?: {
    latitude: number;
    longitude: number;
    address: string | null;
    city: string | null;
  } | null;
  weather?: string | null;
  protocolNumber?: string;
  projectName?: string;
  projectColor?: string; // hex color for accent line
  projectImageUri?: string; // project cover image shown as the hero on the cover page
  planData?: {
    planImageUri: string;
    planName: string;
    pinX: number; // 0-1 relative
    pinY: number; // 0-1 relative
    pinLabel: string;
    pinColor: string;
  } | null;
  signaturePaths?: string[];
  signatures?: { role: string; paths: string[]; signedAt: string }[];
  checklistResults?: {
    name: string;
    inspector: string;
    completedAt?: string;
    items: { text: string; checked: boolean; note?: string }[];
    completionRate: number;
  }[];
};

function escapeHtml(value?: string): string {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Renders inline Markdown for the PDF body: **bold** and *italic* become tags,
// and any leftover/unbalanced asterisks the AI produced are removed so the PDF
// never shows raw "*" or "**".
function formatInline(value?: string): string {
  return (value || "")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\*/g, "");
}

// Markdown tables render a [FOTO X] marker inside a cell as literal text. Lift
// those markers OUT of the table: strip them from the cells and re-insert each
// as its own line right after the table block, where the inline-photo renderer
// turns it into a real image instead of the literal "[FOTO 1]".
function liftTableRowPhotos(text: string): string {
  const src = (text || "").split("\n");
  const out: string[] = [];
  const fotoRe = /\[Foto\s*\d+(?:\s*[–\-—][^\]]*)?\]/gi;
  const isTableLine = (s: string) => {
    const t = s.trim();
    return t.startsWith("|") && t.endsWith("|");
  };
  let i = 0;
  while (i < src.length) {
    if (isTableLine(src[i])) {
      const block: string[] = [];
      while (i < src.length && isTableLine(src[i])) {
        block.push(src[i]);
        i++;
      }
      const lifted: string[] = [];
      const cleaned = block.map((row) =>
        row.replace(fotoRe, (m) => {
          lifted.push(m.trim());
          return "";
        }),
      );
      out.push(...cleaned);
      // Emit each referenced photo once, in order, on its own line.
      const seen = new Set<string>();
      for (const marker of lifted) {
        const key = marker.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push("");
        out.push(marker);
      }
      continue;
    }
    out.push(src[i]);
    i++;
  }
  return out.join("\n");
}

function formatEvidenceSource(snapshot: DocumentEvidenceSnapshot): string {
  const parts = [snapshot.sourceLabel];
  // A timecode is only meaningful for a real video frame. A still photo's
  // "offset" is often 0, so showing "Zeitcode 00:00" is wrong/noisy — omit it.
  if (snapshot.sourceType === "video_frame" && (snapshot.videoTimeSeconds ?? 0) > 0 && snapshot.videoTimecode) {
    parts.push(`Zeitcode ${snapshot.videoTimecode}`);
  }
  if (snapshot.sourceFilename) parts.push(snapshot.sourceFilename);
  return parts.filter(Boolean).join(" · ");
}

function formatMeasurementMethod(method: DocumentEvidenceSnapshot["measurements"][number]["method"]): string {
  const labels = {
    manual_on_site: "Vor-Ort-Messung",
    reference_scale: "Kalibriertes Referenzmaß",
    ar: "AR-Messung",
    lidar: "LiDAR-Messung",
    plan_scale: "Planmaßstab",
    image_estimate: "Bildbasierte Schätzung",
  } as const;
  return labels[method];
}

async function resolveEvidenceSnapshots(protocol: PdfProtocol): Promise<DocumentEvidenceSnapshot[]> {
  if (protocol.evidenceSnapshots?.length) return protocol.evidenceSnapshots;
  if (!protocol.evidenceIds?.length) return [];
  return (await createDocumentEvidenceSelection(protocol.evidenceIds)).snapshots;
}

type CompanySettings = {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  logoBase64?: string;
  watermarkEnabled?: boolean;
  watermarkText?: string;
};

// iOS assigns a new app-container UUID on every app update/reinstall, so an
// absolute path like file:///var/.../Application/<UUID>/Documents/… stops
// resolving even though the file still lives in Documents. Re-anchor any stored
// Documents-relative path onto the CURRENT documentDirectory before reading, so
// photos/logo/evidence don't silently disappear from the PDF after an update.
function resolveDocUri(uri: string): string {
  if (!uri || !uri.startsWith("file://")) return uri;
  const doc = FileSystem.documentDirectory;
  if (!doc) return uri;
  const marker = "/Documents/";
  const i = uri.indexOf(marker);
  if (i < 0) return uri;
  const base = doc.endsWith("/") ? doc : `${doc}/`;
  const rebuilt = `${base}${uri.slice(i + marker.length)}`;
  return rebuilt === uri ? uri : rebuilt;
}

/**
 * Convert a local file URI to a base64 data URI for embedding in HTML
 */
async function fileToBase64DataUri(rawUri: string): Promise<string | null> {
  try {
    const uri = resolveDocUri(rawUri);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // Determine mime type from extension
    const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    const mime = mimeMap[ext] || "image/jpeg";
    return `data:${mime};base64,${base64}`;
  } catch (error) {
    console.error("Error converting file to base64:", error);
    return null;
  }
}

/**
 * Load company settings from AsyncStorage
 */
async function loadCompanySettings(): Promise<CompanySettings> {
  try {
    const stored = await AsyncStorage.getItem("company-settings");
    const watermarkData = await AsyncStorage.getItem("watermark-settings");
    const companyData = stored ? JSON.parse(stored) : {};
    if (watermarkData) {
      const wm = JSON.parse(watermarkData);
      companyData.watermarkEnabled = wm.enabled;
      companyData.watermarkText = wm.text;
    }
    // Enrich from the canonical branding record so the letterhead has the same
    // contact person, mobile, website and logo size as every other PDF.
    try {
      const b = await AsyncStorage.getItem("pdf-branding");
      if (b) {
        const br = JSON.parse(b);
        companyData.companyContactPerson = companyData.companyContactPerson || br.companyContactPerson;
        companyData.companyMobile = companyData.companyMobile || br.companyMobile;
        companyData.companyEmail = companyData.companyEmail || br.companyEmail;
        companyData.companyWebsite = companyData.companyWebsite || br.companyWebsite;
        companyData.logoSize = companyData.logoSize || br.logoSize;
      }
    } catch {}
    return companyData;
  } catch  {
    // Ignore
  }
  return {};
}

/**
 * Generate professional PDF HTML from protocol data
 */
interface LayoutOptions {
  showTranscription?: boolean;
  showTodos?: boolean;
  showMetadata?: boolean;
  showSignatures?: boolean;
  photoSize?: "klein" | "mittel" | "gro\u00df";
  /** A separate cover page is prepended \u2192 the body drops the duplicate
   *  metadata table and KPI band (same info already on the Titelblatt). */
  hasCoverPage?: boolean;
  /** Show "Seite X von Y" in the footer (from branding.showPageNumbers). */
  showPageNumbers?: boolean;
}

// Status / priority label → colour, for rendering coloured pills in tables.
const PILL_COLORS: Record<string, string> = {
  "offen": "#DC2626",
  "zugewiesen": "#EA580C",
  "in arbeit": "#2563EB",
  "in bearbeitung": "#D97706",
  "nachbesserung": "#DB2777",
  "prüfung": "#7C3AED",
  "pruefung": "#7C3AED",
  "erledigt": "#5E8B6F",
  "abgelehnt": "#78716C",
  "geschlossen": "#475569",
  "hoch": "#B91C1C",
  "mittel": "#B45309",
  "niedrig": "#6B7280",
};

export function generatePdfHtml(
  protocol: PdfProtocol,
  company: CompanySettings,
  photoDataUris: string[],
  evidenceDataUris: string[],
  planImageBase64?: string | null,
  accentColor?: string,
  pdfTemplate: PdfTemplate = "standard",
  photoWatermark: boolean = true,
  watermarkText: string = "",
  layoutOptions: LayoutOptions = {}
): string {
  // Brand accent (warm brown by default): themes headings, bars and dividers.
  const accent = accentColor || "#8A6E52";
  // Layout options with defaults
  const layoutShowTranscription = layoutOptions.showTranscription !== false;
  const layoutShowTodos = layoutOptions.showTodos !== false;
  // When a cover page is prepended it already carries Projekt/Datum/Standort and
  // the key figures, so the body omits the duplicate metadata table + KPI band.
  const hasCoverPage = layoutOptions.hasCoverPage === true;
  const layoutShowMetadata = layoutOptions.showMetadata !== false && !hasCoverPage;
  const layoutShowSignatures = layoutOptions.showSignatures !== false;
  const layoutPhotoSize = layoutOptions.photoSize || "mittel";
  
  // Photo size mapping to max-width
  const photoMaxWidth = layoutPhotoSize === "klein" ? "250px" : layoutPhotoSize === "gro\u00df" ? "100%" : "450px";
  const photoGridMaxWidth = layoutPhotoSize === "klein" ? "150px" : layoutPhotoSize === "gro\u00df" ? "300px" : "200px";

  // Template-specific overrides
  const showPhotos = pdfTemplate !== "no_photos";
  const isCompact = pdfTemplate === "compact";
  const isDetailed = pdfTemplate === "detailed";
  const isGutachten = protocol.templateId === "gutachterliche-bewertung";
  const todos = protocol.todos || [];
  const date = new Date(protocol.createdAt).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = new Date(protocol.createdAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const durationMins = Math.floor(protocol.duration / 60);
  const durationSecs = protocol.duration % 60;
  const durationStr = `${durationMins}:${durationSecs.toString().padStart(2, "0")} Min.`;
  const evidenceSnapshots = protocol.evidenceSnapshots || [];

  // Footer rendered via the @page bottom margin boxes (reliable in expo-print),
  // instead of a position:fixed div that iOS mis-positions onto the content.
  // Three-part layout: company left · "Erstellt am …" centre · page nums right
  // (page numbers only when enabled, so the Titelblatt never shows a duplicate).
  // A raw newline inside a CSS @page margin-box content string is a parse error
  // that kills the WHOLE @page rule — footer text AND page number silently vanish.
  // So collapse all newlines to spaces before inserting (besides escaping \ and ").
  const cssStr = (s: string) => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
  const footerLeftContent = company.companyName ? cssStr(company.companyName) : "BuildKI";
  const footerContent = cssStr(`Erstellt am ${date} um ${time}`);
  const showFooterPageNumbers = layoutOptions.showPageNumbers !== false;

  // ── Cover key figures (Kennzahlen-Karten) ─────────────────────────────────
  // Built from the data a single protocol actually has: tasks, photos, evidence.
  const kpiPhotoCount = photoDataUris.filter(Boolean).length;
  const kpiEvidenceCount = evidenceSnapshots.length;
  const kpiTodosTotal = (protocol.todos || []).length;
  const kpiTodosOpen = (protocol.todos || []).filter((tdo) => !tdo.done).length;
  const kpiCards: { value: string | number; label: string; color: string }[] = [];
  if (kpiTodosTotal > 0) {
    kpiCards.push({ value: kpiTodosOpen, label: "Offene Aufgaben", color: kpiTodosOpen > 0 ? "#B0763F" : "#5E8B6F" });
    kpiCards.push({ value: kpiTodosTotal - kpiTodosOpen, label: "Erledigt", color: "#5E8B6F" });
  }
  if (kpiPhotoCount > 0) kpiCards.push({ value: kpiPhotoCount, label: "Fotos", color: accent });
  if (kpiEvidenceCount > 0) kpiCards.push({ value: kpiEvidenceCount, label: kpiEvidenceCount === 1 ? "Beleg" : "Belege", color: "#64748B" });
  const kpiBandHtml = (kpiCards.length > 0 && !hasCoverPage)
    ? `<div class="stat-band">${kpiCards.map((cd) => `<div class="stat-card"><span class="num" style="color:${cd.color};">${cd.value}</span><span class="lbl">${cd.label}</span></div>`).join("")}</div>`
    : "";

  // Inhaltsverzeichnis der begangenen Räume — aus den tatsächlichen Kapitel-
  // Überschriften (# …) des Protokolltexts, die unten zu Kapiteln (document-
  // chapter) werden. So passt das Verzeichnis immer zum Inhalt und füllt die
  // sonst fast leere erste Inhaltsseite, wenn ein Deckblatt vorangestellt ist.
  const roomChapters: string[] = [];
  for (const rawLine of getProtocolText(protocol).split("\n")) {
    const m = rawLine.trim().match(/^#\s+(.+)$/);
    if (m) {
      const label = formatInline(m[1]).replace(/<[^>]+>/g, "").trim();
      if (label) roomChapters.push(label);
    }
  }
  const tocHtml = (hasCoverPage && roomChapters.length >= 2)
    ? `<div class="doc-toc"><div class="doc-toc-h">Inhalt</div>${roomChapters
        .map((r: string, i: number) => `<div class="doc-toc-row"><span class="doc-toc-n">${i + 1}</span><span class="doc-toc-t">${escapeHtml(r)}</span></div>`)
        .join("")}</div>`
    : "";

  // Which legacy photos are placed inline via [FOTO X]? (used for evidence de-duplication + the
  // Fotodokumentation appendix further below). Computed once up front so the evidence section can
  // avoid re-rendering an image that already appears inline.
  const inlinePlacedPhotos = new Set<number>();
  {
    const inlineRegex = /\[Foto\s*(\d+)(?:\s*[–\-–][^\]]*)?\]/gi;
    let inlineMatch: RegExpExecArray | null;
    const protocolText = getProtocolText(protocol);
    while ((inlineMatch = inlineRegex.exec(protocolText)) !== null) {
      inlinePlacedPhotos.add(parseInt(inlineMatch[1], 10) - 1);
    }
  }

  // Normalise a URI to its filename (drop query + path) so an evidence snapshot and a legacy
  // photo entry pointing at the same underlying file compare equal.
  const normalizePhotoUri = (u?: string): string => {
    if (!u) return "";
    const noQuery = u.split("?")[0];
    return (noQuery.split("/").pop() || noQuery).toLowerCase();
  };
  // URIs of photos that were rendered inline via [FOTO X] and have valid image data.
  const inlinePlacedPhotoUris = new Set<string>();
  inlinePlacedPhotos.forEach((idx) => {
    const u = protocol.photos?.[idx];
    if (u && photoDataUris[idx]) inlinePlacedPhotoUris.add(normalizePhotoUri(u));
  });
  // BUG 4: an evidence snapshot whose underlying image is already shown inline must NOT be
  // repeated in the trailing evidence section.
  const isEvidenceShownInline = (snapshot: DocumentEvidenceSnapshot): boolean => {
    const key = normalizePhotoUri(snapshot.mediaUri);
    return key !== "" && inlinePlacedPhotoUris.has(key);
  };

  // BUG 3a: derive a spoken caption for an evidence video frame from the transcript segments,
  // mirroring the [FOTO X] segment matcher. Returns "" when no usable segment exists.
  const getCaptionFromSegmentsAtTime = (timeSeconds?: number): string => {
    if (timeSeconds == null || timeSeconds <= 0) return "";
    const segments = protocol.transcriptionSegments;
    if (!segments || segments.length === 0) return "";
    const exact = segments.find((seg) => seg.start <= timeSeconds && seg.end >= timeSeconds);
    if (exact) return exact.text.trim();
    const before = segments.filter((seg) => seg.start <= timeSeconds);
    if (before.length > 0) return before[before.length - 1].text.trim();
    return "";
  };

  // TODO: full inline anchoring — render each referenced evidence <article> at its first
  // "Abbildung N" mention in the body instead of the trailing section. Kept conservative for now:
  // de-duplicate against inline [FOTO X] photos and drop the trailing section when nothing remains.
  const evidenceArticles = evidenceSnapshots
    .map((snapshot, index) => {
      // De-dup: skip snapshots already shown inline via the [FOTO X] path.
      if (isEvidenceShownInline(snapshot)) return "";
      const dataUri = evidenceDataUris[index];
      const source = escapeHtml(formatEvidenceSource(snapshot));
      const measurements = snapshot.measurements || [];
      // A final customer document must never contain a technical error. When the
      // image can't be loaded, keep the finding text and use a neutral note
      // instead of an alarming "konnte nicht geladen werden" line.
      // BUG 3a: resolve a finding caption. Fall back to the spoken sentence (video frames), then a
      // neutral room · trade line, and finally omit the finding line entirely — never the alarming
      // "Beleg ohne Befundtext" literal.
      let findingText = (snapshot.findingText || "").trim();
      if (!findingText && snapshot.sourceType === "video_frame" && (snapshot.videoTimeSeconds ?? 0) > 0) {
        findingText = getCaptionFromSegmentsAtTime(snapshot.videoTimeSeconds);
      }
      if (!findingText) {
        findingText = [snapshot.room, snapshot.trade].filter(Boolean).join(" · ");
      }
      const findingHtml = findingText
        ? `<p class="evidence-finding"><strong>${escapeHtml(findingText)}</strong></p>`
        : "";
      const wmContent = watermarkText || `${date}${protocol.projectName ? ` | ${protocol.projectName}` : ""}`;
      const watermarkOverlay = photoWatermark
        ? `<div class="evidence-watermark"><strong>${escapeHtml(wmContent)}</strong></div>`
        : "";
      const hasMeas = measurements.length > 0;
      const ortLine = [snapshot.floor, snapshot.room].filter(Boolean).join(" · ");
      const measurementsHtml = hasMeas
        ? `<div class="evidence-measurements">
                  <p class="meas-title">Messung</p>
                  ${ortLine ? `<p class="meas-row"><span class="meas-k">Ort</span><span class="meas-v">${escapeHtml(ortLine)}</span></p>` : ""}
                  ${measurements
                    .map((measurement) => `
                      <p class="meas-row"><span class="meas-k">Messwert</span><span class="meas-v">${escapeHtml(formatMeasurementForDocument(measurement))}</span></p>
                      <p class="meas-row"><span class="meas-k">Methode</span><span class="meas-v">${escapeHtml(formatMeasurementMethod(measurement.method))}</span></p>
                      ${measurement.note ? `<p class="meas-row"><span class="meas-k">Hinweis</span><span class="meas-v">${escapeHtml(measurement.note)}</span></p>` : ""}`)
                    .join("")}
                </div>`
        : "";
      const badge = `<span class="evidence-badge">${String(index + 1).padStart(2, "0")}</span>`;
      const imageBlock = dataUri
        ? `<div class="evidence-image-wrap${hasMeas ? " evidence-image-wrap-tall" : ""}">
                  ${badge}
                  <img src="${dataUri}" class="evidence-image${hasMeas ? " evidence-image-contain" : ""}" />
                  ${watermarkOverlay}
                </div>`
        : `<p class="evidence-no-image">Zum Mangel liegt kein Bildnachweis vor.</p>`;
      return `
              <article class="evidence-block${dataUri ? "" : " evidence-block-noimage"}${hasMeas ? " evidence-block-measure" : ""}" data-evidence-id="${escapeHtml(snapshot.evidenceId)}">
                ${findingHtml}
                ${imageBlock}
                <p class="evidence-number"><strong>Abbildung ${index + 1}</strong></p>
                <p class="evidence-source"><strong>${source}</strong></p>
                ${measurementsHtml}
              </article>`;
    })
    .filter((html) => html !== "");

  const evidenceHtml = evidenceArticles.length > 0
    ? `
      <section class="document-chapter evidence-section">
        <h2>Fotodokumentation &amp; Messungen</h2>
        <div class="evidence-grid">${evidenceArticles.join("")}</div>
      </section>`
    : "";

  // ── Freigabe / Unterschriften ──────────────────────────────────────────────
  // Always render a signing block (created-by + acknowledged), with signature
  // lines to sign by hand when no digital signature is present.
  const sigSvg = (paths: string[]) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="70" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet" style="max-width:100%;overflow:visible;">${paths.map((d) => `<path d="${d}" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}</svg>`;
  const coSuffix = company.companyName ? ` ${escapeHtml(company.companyName)}` : "";
  const sigCols: { role: string; svg: string; caption: string }[] = [];
  if (protocol.signatures && protocol.signatures.length > 0) {
    for (const sig of protocol.signatures) {
      sigCols.push({ role: escapeHtml(sig.role || `Erstellt durch${coSuffix}`), svg: sig.paths?.length ? sigSvg(sig.paths) : "", caption: escapeHtml(sig.signedAt || "Ort, Datum") });
    }
  } else if (protocol.signaturePaths && protocol.signaturePaths.length > 0) {
    sigCols.push({ role: `Erstellt durch${coSuffix}`, svg: sigSvg(protocol.signaturePaths), caption: date });
  } else {
    sigCols.push({ role: `Erstellt durch${coSuffix}`, svg: "", caption: "Ort, Datum" });
  }
  sigCols.push({ role: "Zur Kenntnis genommen", svg: "", caption: "Ort, Datum" });
  const freigabeHtml = layoutShowSignatures
    ? `<section class="freigabe-section">
        <h2>Freigabe</h2>
        <div class="sign-grid">
          ${sigCols.map((c) => `<div class="sign-col"><div class="sign-role">${c.role}</div><div class="sign-area">${c.svg}</div><div class="sign-line"></div><div class="sign-caption">${c.caption}</div></div>`).join("")}
        </div>
      </section>`
    : "";

  // Shared letterhead (logo left + compact company block right). Only when there
  // is NO cover page — the Deckblatt already carries the full letterhead, and the
  // content pages intentionally have no running header, so we don't repeat it.
  const letterhead = hasCoverPage
    ? ""
    : renderLetterhead({
        companyName: company.companyName,
        companyContactPerson: (company as any).companyContactPerson,
        companyAddress: company.companyAddress,
        companyPhone: company.companyPhone,
        companyMobile: (company as any).companyMobile,
        companyEmail: (company as any).companyEmail,
        companyWebsite: (company as any).companyWebsite,
        logoDataUri: company.logoBase64,
        logoSize: (company as any).logoSize,
        marginBottom: 14,
      });

  // Helper: Get caption text for a photo based on its timestamp and transcription segments
  // Returns HTML with the exact sentence at photo time highlighted in bold
  const getPhotoCaptionFromSegments = (photoIndex: number): string => {
    // Only use an explicitly set/edited caption. Do NOT auto-insert the raw
    // spoken sentence from the transcript (e.g. "Vom Tischler liegen 13 Uhr") —
    // the user doesn't want their raw speech dumped under each photo.
    if (protocol.photoCaptions && protocol.photoCaptions[photoIndex]) {
      return protocol.photoCaptions[photoIndex];
    }
    return "";
  };

  // Convert protocol text to HTML (handle line breaks, bullet points, inline photo placeholders, and markdown tables)
  // Lift any [FOTO X] markers OUT of markdown table cells first, so the photo
  // renders as an image below the table instead of showing as literal "[FOTO 1]".
  const lines = liftTableRowPhotos(getProtocolText(protocol)).split("\n");
  const processedLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    // Detect start of a markdown table (line starts and ends with |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Collect all consecutive table lines
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      // Parse the table: first row is header, second is separator (skip), rest are data
      if (tableLines.length >= 2) {
        const headerCells = tableLines[0].split('|').filter(c => c.trim() !== '');
        // Find separator row index (usually row 1)
        let separatorIdx = 1;
        for (let s = 1; s < tableLines.length; s++) {
          const cells = tableLines[s].split('|').filter(c => c.trim() !== '');
          if (cells.every(c => /^[-:]+$/.test(c.trim()))) {
            separatorIdx = s;
            break;
          }
        }
        // Build HTML table
        let tableHtml = '<table class="doc-table">';
        // Header
        tableHtml += '<thead><tr>';
        for (const cell of headerCells) {
          tableHtml += `<th>${cell.trim().replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</th>`;
        }
        tableHtml += '</tr></thead><tbody>';
        // Data rows (skip header and separator)
        for (let r = 0; r < tableLines.length; r++) {
          if (r === 0 || r === separatorIdx) continue; // skip header and separator
          const cells = tableLines[r].split('|').filter(c => c.trim() !== '');
          if (cells.every(c => /^[-:]+$/.test(c.trim()))) continue; // skip any additional separator
          tableHtml += '<tr>';
          for (let c = 0; c < headerCells.length; c++) {
            const cellText = (cells[c] || '').trim().replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            const headerName = (headerCells[c] || '').trim().toLowerCase();
            let cellHtml = cellText;
            // Colour-code status / priority cells as pills (like the reference layout).
            if (headerName.includes('status') || headerName.includes('priorit')) {
              const plain = cellText.replace(/<[^>]+>/g, '').trim();
              const pc = PILL_COLORS[plain.toLowerCase()];
              if (pc) cellHtml = `<span class="pill" style="background:${pc}1A;color:${pc};border:1px solid ${pc}44;">${plain}</span>`;
            }
            tableHtml += `<td>${cellHtml}</td>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';
        processedLines.push(tableHtml);
      } else {
        // Single pipe line, just add as-is
        processedLines.push(tableLines[0]);
      }
      continue;
    }
    processedLines.push(lines[i]);
    i++;
  }

  const protocolHtml = processedLines
    .map((line) => {
      // If line is already a full HTML table, pass through
      if (line.trim().startsWith('<table')) return line;
      const trimmed = line.trim();
      // Check for inline photo placeholder [FOTO X] or [Foto X – siehe Fotodokumentation]
      const photoMatch = trimmed.match(/^\*?\s*\[Foto\s*(\d+)(?:\s*[\u2013\-–]\s*[^\]]*)?\]\s*$/i);
      if (photoMatch) {
        const photoIdx = parseInt(photoMatch[1], 10) - 1;
        if (photoIdx >= 0 && photoIdx < photoDataUris.length && photoDataUris[photoIdx]) {
          const caption = getPhotoCaptionFromSegments(photoIdx);
          const timestamp = protocol.photoTimestamps && protocol.photoTimestamps[photoIdx] != null
            ? `${Math.floor(protocol.photoTimestamps[photoIdx] / 60)}:${(protocol.photoTimestamps[photoIdx] % 60).toString().padStart(2, '0')} Min.`
            : null;
          const wmContent = watermarkText || `${new Date(protocol.createdAt).toLocaleDateString("de-DE")} ${timestamp || ""}${protocol.projectName ? " | " + protocol.projectName : ""}`;
          const watermarkOverlay = photoWatermark ? `<div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:9px;padding:2px 6px;border-radius:3px;">${wmContent}</div>` : "";
          return `
          <div class="photo-block" style="margin: 12px 0; border: 1px solid #eee; border-radius: 6px; padding: 10px; background: #fafafa;">
            <div style="position:relative;display:inline-block;width:100%;">
              <img src="${photoDataUris[photoIdx]}" style="width: 100%; max-width: ${photoMaxWidth}; max-height: 240px; object-fit: contain; border-radius: 4px;" />
              ${watermarkOverlay}
            </div>
            <p style="font-size: 10px; color: #555; font-weight: 600; margin: 8px 0 2px 0;">Foto ${photoIdx + 1}${timestamp ? ` \u2013 ${timestamp}` : ''}</p>
            ${caption ? `<p style="font-size: 11px; color: #333; line-height: 1.4; margin: 0;">${caption}</p>` : ''}
          </div>`;
        }
      }
      // Also handle inline [FOTO X] or [Foto X – ...] within a text line - embed images after the text
      const inlinePhotoRegex = /\[Foto\s*(\d+)(?:\s*[\u2013\-–][^\]]*)?\]/gi;
      if (inlinePhotoRegex.test(trimmed) && !photoMatch) {
        // Collect all photo indices referenced in this line
        const referencedPhotos: number[] = [];
        let inlineM;
        const regex2 = /\[Foto\s*(\d+)(?:\s*[\u2013\-–][^\]]*)?\]/gi;
        while ((inlineM = regex2.exec(trimmed)) !== null) {
          referencedPhotos.push(parseInt(inlineM[1], 10) - 1);
        }
        // Remove [Foto X ...] from text and render the text
        let cleanedText = trimmed.replace(/\[Foto\s*\d+(?:\s*[\u2013\-–][^\]]*)?\]/gi, '').trim();
        // Handle **bold**/*italic* and drop stray asterisks in the cleaned text
        cleanedText = formatInline(cleanedText);
        let htmlResult = cleanedText ? `<p style="margin: 4px 0; line-height: 1.6;">${cleanedText}</p>` : '';
        // Embed referenced photos as a grid below the text
        const validPhotos = referencedPhotos.filter(idx => idx >= 0 && idx < photoDataUris.length && photoDataUris[idx]);
        if (validPhotos.length > 0) {
          const cols = validPhotos.length >= 3 ? 3 : validPhotos.length;
          htmlResult += `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px 0;">`;
          for (const idx of validPhotos) {
            const caption = getPhotoCaptionFromSegments(idx);
            const timestamp = protocol.photoTimestamps && protocol.photoTimestamps[idx] != null
              ? `${Math.floor(protocol.photoTimestamps[idx] / 60)}:${(protocol.photoTimestamps[idx] % 60).toString().padStart(2, '0')}`
              : null;
            const gridWmContent = watermarkText || `${new Date(protocol.createdAt).toLocaleDateString("de-DE")}${protocol.projectName ? " | " + protocol.projectName : ""}`;
            const gridWatermark = photoWatermark ? `<div style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.55);color:#fff;font-size:8px;padding:1px 4px;border-radius:2px;">${gridWmContent}</div>` : "";
            htmlResult += `
              <div class="photo-block" style="flex: 1; min-width: ${cols >= 3 ? '30%' : cols === 2 ? '45%' : '100%'}; max-width: ${cols >= 3 ? '32%' : cols === 2 ? '48%' : '100%'};">
                <div style="position:relative;">
                  <img src="${photoDataUris[idx]}" style="width: 100%; max-width: ${photoGridMaxWidth}; max-height: 180px; object-fit: contain; border: 1px solid #eee; border-radius: 4px;" />
                  ${gridWatermark}
                </div>
                <p style="font-size: 9px; color: #666; margin: 4px 0 0 0;">Foto ${idx + 1}${timestamp ? ` (${timestamp})` : ''}</p>
                ${caption ? `<p style="font-size: 9px; color: #444; margin: 2px 0 0 0;">${caption}</p>` : ''}
              </div>`;
          }
          htmlResult += `</div>`;
        }
        return htmlResult;
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        return `<li>${formatInline(trimmed.substring(2))}</li>`;
      }
      // Gutachten-specific: numbered chapter headings
      if (isGutachten && /^\d+\.\s+\*\*/.test(trimmed)) {
        const chapterText = trimmed.replace(/\*\*/g, '');
        return `<div class="gutachten-chapter">${chapterText}</div>`;
      }
      // Gutachten-specific: Bewertungsbox markers
      if (isGutachten && /^\*\*Gutachterliche Bewertung/i.test(trimmed)) {
        return `<div class="gutachten-bewertungsbox"><div class="gutachten-bewertungsbox-title">Gutachterliche Bewertung</div>`;
      }
      if (isGutachten && /^\*\*Fazit|^\*\*Gesamturteil|^\*\*Gutachterliches Gesamturteil/i.test(trimmed)) {
        const title = trimmed.replace(/\*\*/g, '').replace(/:$/, '');
        return `<div class="gutachten-fazitbox"><div class="gutachten-fazitbox-title">${title}</div>`;
      }
      if (isGutachten && /^\*\*Empfehlung|^\*\*Sanierungskonzept|^\*\*Ma\u00dfnahmen/i.test(trimmed)) {
        const title = trimmed.replace(/\*\*/g, '').replace(/:$/, '');
        return `<div class="gutachten-empfehlungsbox"><div class="gutachten-empfehlungsbox-title">${title}</div>`;
      }
      // Longest heading prefix first: "### "/"#### " would otherwise fail the
      // "## " check (third char is '#', not a space) and fall through to <p>,
      // printing the literal "###".
      if (trimmed.startsWith("#### ")) {
        return `<h4 style="margin-top: 14px; margin-bottom: 6px; color: #222; font-size: 12px; font-weight: 600;">${formatInline(trimmed.substring(5))}</h4>`;
      }
      if (trimmed.startsWith("### ")) {
        return `<h4 style="margin-top: 16px; margin-bottom: 6px; color: #111; font-size: 13px; font-weight: 600;">${formatInline(trimmed.substring(4))}</h4>`;
      }
      if (trimmed.startsWith("## ")) {
        return `<h3 style="margin-top: 18px; margin-bottom: 8px; color: #111; font-size: 14px; font-weight: 600;">${formatInline(trimmed.substring(3))}</h3>`;
      }
      if (trimmed.startsWith("# ")) {
        return `<section class="document-chapter"><h2>${formatInline(trimmed.substring(2))}</h2></section>`;
      }
      if (trimmed === "") return "<br/>";
      // Horizontal rule (---, ***, ___)
      if (/^([-*_])\1{2,}$/.test(trimmed)) return '<hr style="border:none;border-top:1px solid #E2E8F0;margin:14px 0;" />';
      // Handle **bold** / *italic* inline, then drop any stray asterisks
      let processed = formatInline(trimmed);
      // Handle | table rows (fallback for any remaining pipe rows not caught by pre-processing)
      if (processed.startsWith('|') && processed.endsWith('|')) {
        const cells = processed.split('|').filter(c => c.trim() !== '');
        if (cells.every(c => /^[-:]+$/.test(c.trim()))) return ''; // separator row
        return `<tr>${cells.map(c => `<td style="padding: 5px 8px; border: 1px solid #ddd; font-size: 10px;">${c.trim()}</td>`).join('')}</tr>`;
      }
      // If the entire line is bold (starts and ends with **), render as a section sub-heading with divider
      if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.includes('**', 2)) {
        // Skip - already handled by the inline bold replacement above
      }
      // Lines that start with a number followed by a dot (e.g. "1. Datum und Wetter") = numbered section heading
      if (/^\d+\.\s/.test(trimmed)) {
        return `<div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #ddd;"><p style="margin: 0; font-size: 13px; font-weight: 700; color: #111; line-height: 1.6;">${processed}</p></div>`;
      }
      return `<p style="margin: 5px 0; line-height: 1.7; color: #222;">${processed}</p>`;
    })
    .join("\n");

  // `inlinePlacedPhotos` (inline [FOTO X] photo indices) is computed once above, near the
  // evidence section, and reused here for the Fotodokumentation appendix.
  // Only show photos in Fotodokumentation that were NOT already placed inline.
  // Photos that have a [Foto X] marker in the text AND have a valid base64 data URI
  // are considered "inline rendered" and excluded from the appendix.
  const validPhotoCount = photoDataUris.filter(u => u).length;
  let remainingPhotoIndices = photoDataUris
    .map((_, i) => i)
    .filter(i => photoDataUris[i]) // must have valid data URI
    .filter(i => !inlinePlacedPhotos.has(i)); // exclude those already inline

  const photosHtml =
    evidenceSnapshots.length === 0 && remainingPhotoIndices.length > 0
      ? `
    <div style="page-break-before: auto; margin-top: 24px;">
      <h3 style="font-size: 14px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px;">
        Fotodokumentation (${remainingPhotoIndices.length} ${remainingPhotoIndices.length === 1 ? "Bild" : "Bilder"})
      </h3>
      ${remainingPhotoIndices
        .map((i) => {
          const uri = photoDataUris[i];
          const timestamp = protocol.photoTimestamps && protocol.photoTimestamps[i] != null
            ? `${Math.floor(protocol.photoTimestamps[i] / 60)}:${(protocol.photoTimestamps[i] % 60).toString().padStart(2, '0')} Min.`
            : null;
          const caption = getPhotoCaptionFromSegments(i);
          const docWmContent = watermarkText || `${new Date(protocol.createdAt).toLocaleDateString("de-DE")} ${timestamp || ""}${protocol.projectName ? " | " + protocol.projectName : ""}`;
          const docWatermark = photoWatermark ? `<div style="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,0.55);color:#fff;font-size:9px;padding:2px 6px;border-radius:3px;">${docWmContent}</div>` : "";
          return `
          <div class="photo-block" style="width: 100%; margin-bottom: 20px;">
            <div style="display: flex; align-items: flex-start; gap: 16px;">
              <div style="flex: 0 0 55%; position:relative;">
                <img src="${uri}" style="width: 100%; max-width: ${photoMaxWidth}; max-height: 280px; object-fit: contain; border: 1px solid #eee; border-radius: 4px;" />
                ${docWatermark}
              </div>
              <div style="flex: 1; padding-top: 4px;">
                <p style="font-size: 10px; color: #555; font-weight: 600; margin: 0 0 4px 0;">Foto ${i + 1}${timestamp ? ` – ${timestamp}` : ''}</p>
                ${caption ? `<p style="font-size: 11px; color: #333; line-height: 1.5; margin: 0; white-space: pre-wrap;">${caption}</p>` : '<p style="font-size: 10px; color: #999; margin: 0; font-style: italic;">Kein zugeordneter Text</p>'}
              </div>
            </div>
          </div>`;
        })
        .join("")}
    </div>
  `
      : "";

  // Plan marking section (Gesamtplan + Ausschnitt mit Pin)
  const planHtml = (protocol.planData && planImageBase64) ? `
    <div style="page-break-before: always; margin-top: 24px;">
      <h3 style="font-size: 14px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px;">
        Planverortung – ${protocol.planData.planName}
      </h3>
      
      <!-- Gesamtplan mit Markierung -->
      <div style="margin-bottom: 20px;">
        <p style="font-size: 11px; color: #555; margin-bottom: 8px; font-weight: 600;">Übersicht (Gesamtplan)</p>
        <div style="position: relative; display: inline-block; width: 100%; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
          <img src="${planImageBase64}" style="width: 100%; display: block;" />
          <div style="position: absolute; top: ${protocol.planData.pinY * 100}%; left: ${protocol.planData.pinX * 100}%; transform: translate(-50%, -100%); z-index: 10;">
            <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="${protocol.planData.pinColor}"/>
              <circle cx="12" cy="12" r="5" fill="white"/>
            </svg>
          </div>
        </div>
        <p style="font-size: 9px; color: #888; margin-top: 4px; text-align: center;">${protocol.planData.pinLabel}</p>
      </div>

      <!-- Ausschnitt/Zoom der markierten Stelle -->
      <div style="margin-bottom: 12px;">
        <p style="font-size: 11px; color: #555; margin-bottom: 8px; font-weight: 600;">Detailausschnitt</p>
        <div style="width: 100%; height: 280px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; position: relative;">
          <img src="${planImageBase64}" style="position: absolute; width: 300%; height: 300%; object-fit: cover; left: ${-protocol.planData.pinX * 300 + 50}%; top: ${-protocol.planData.pinY * 300 + 50}%;" />
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -100%); z-index: 10;">
            <svg width="32" height="42" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="${protocol.planData.pinColor}"/>
              <circle cx="12" cy="12" r="5" fill="white"/>
            </svg>
          </div>
        </div>
        <p style="font-size: 9px; color: #888; margin-top: 4px; text-align: center;">Zoom: ${protocol.planData.pinLabel}</p>
      </div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    /* Horizontal spacing comes from body + fixed-element padding, NOT from @page
       side margins: iOS expo-print does not reliably honor horizontal @page
       margins, so content got stuck to (and clipped at) the right edge. @page
       keeps only the vertical margins; the footer margin-boxes get side padding. */
    @page {
      margin: 20mm 0 20mm 0;
      @bottom-left {
        content: "${footerLeftContent}";
        font-size: 8px;
        color: #94a3b8;
        padding-left: 18mm;
      }
      @bottom-center {
        content: "${footerContent}";
        font-size: 8px;
        color: #94a3b8;
      }
      ${showFooterPageNumbers ? `@bottom-right {
        content: "Seite " counter(page) " von " counter(pages);
        font-size: 8px;
        color: #94a3b8;
        padding-right: 18mm;
      }` : ""}
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 11.5px;
      color: #1f2937;
      line-height: 1.6;
      margin: 0;
      padding: 0 18mm;
      counter-reset: chapter;
    }
    /* Intelligent page breaks */
    h2, h3 {
      page-break-after: avoid;
    }
    img {
      page-break-inside: avoid;
      page-break-before: auto;
    }
    .photo-block {
      page-break-inside: avoid;
      margin-bottom: 16px;
    }
    .section-block {
      page-break-inside: avoid;
    }
    /* Rooms FLOW continuously (no forced page break per room): a room with no
       findings no longer wastes a whole page, and a new room no longer starts
       glued to the very top edge. A generous top margin + the h2 divider keep
       the rooms clearly separated. */
    .document-chapter {
      margin-top: 38px;
      counter-increment: chapter;
    }
    /* Clear gap + a divider above the FIRST room so its heading reads as the
       start of that room's content, not as another entry of the table of
       contents right above it. */
    .document-chapter:first-of-type {
      margin-top: 30px;
      padding-top: 26px;
      border-top: 2px solid ${accent};
    }
    .document-chapter > h2 {
      position: relative;
      margin: 0 0 16px 0;
      padding: 1px 0 11px 34px;
      border-bottom: 1px solid #e5e7eb;
      color: ${accent};
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.2px;
    }
    .document-chapter > h2::before {
      content: counter(chapter);
      position: absolute;
      left: 0;
      top: 0;
      width: 24px;
      height: 24px;
      background: ${accent};
      border-radius: 6px;
      color: #ffffff;
      font-size: 12px;
      font-weight: 800;
      text-align: center;
      line-height: 24px;
    }
    .evidence-section {
      break-before: page;
      page-break-before: always;
    }
    .evidence-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }
    .evidence-block {
      break-inside: avoid;
      page-break-inside: avoid;
      width: calc(50% - 7px);
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      border: 1px solid #e8ecf1;
      border-radius: 12px;
      background: #fff;
      overflow: hidden;
    }
    .evidence-block-noimage {
      background: #fafbfc;
    }
    /* A measured photo gets the full page width and a large, uncropped image so
       the drawn measurement line and value chip stay fully visible. */
    .evidence-block-measure {
      width: 100%;
    }
    .evidence-image-wrap {
      order: 1;
      position: relative;
      width: 100%;
      height: 155px;
      background: #f4f6f8;
    }
    .evidence-image-wrap-tall {
      height: 340px;
      background: #0f1b2b;
    }
    .evidence-image {
      display: block;
      width: 100%;
      height: 155px;
      object-fit: cover;
    }
    .evidence-image-contain {
      height: 340px;
      object-fit: contain;
    }
    .evidence-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 2;
      background: rgba(15,39,68,0.92);
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .evidence-no-image {
      order: 1;
      margin: 0;
      padding: 24px 12px;
      font-size: 11px;
      font-style: italic;
      color: #64748b;
      text-align: center;
      background: #f4f6f8;
    }
    .evidence-finding {
      order: 2;
      margin: 10px 12px 0;
      font-size: 11px;
      line-height: 1.4;
      color: #1f2937;
    }
    .evidence-watermark {
      position: absolute;
      left: 8px;
      bottom: 8px;
      padding: 3px 7px;
      background: rgba(0,0,0,0.62);
      color: #fff;
      font-size: 8px;
    }
    .evidence-number {
      order: 3;
      margin: 6px 12px 0;
      color: #94a3b8;
      font-size: 9px;
      line-height: 1.4;
    }
    .evidence-source {
      order: 4;
      margin: 2px 12px 10px;
      color: #64748b;
      font-size: 9.5px;
      line-height: 1.4;
    }
    .evidence-measurements {
      order: 5;
      margin: 0 12px 12px;
      padding: 9px 11px;
      border: 1px solid #e8ecf1;
      border-radius: 8px;
      background: #f8fafc;
    }
    .evidence-measurements .meas-title {
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #64748b;
      margin: 0 0 4px 0;
    }
    .evidence-measurements p {
      margin: 2px 0;
      color: #334155;
      font-size: 9.5px;
      line-height: 1.4;
    }
    .evidence-measurements .meas-row {
      display: flex;
      gap: 8px;
      margin: 3px 0;
    }
    .evidence-measurements .meas-k {
      flex: 0 0 64px;
      color: #64748b;
      font-weight: 700;
    }
    .evidence-measurements .meas-v {
      flex: 1;
      color: #1f2937;
      font-weight: 700;
    }
    .freigabe-section {
      margin-top: 26px;
      page-break-inside: avoid;
      break-inside: avoid;
      counter-increment: chapter;
    }
    .freigabe-section > h2 {
      position: relative;
      margin: 0 0 16px 0;
      padding: 1px 0 11px 34px;
      border-bottom: 1px solid #e5e7eb;
      color: ${accent};
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.2px;
    }
    .freigabe-section > h2::before {
      content: counter(chapter);
      position: absolute;
      left: 0;
      top: 0;
      width: 24px;
      height: 24px;
      background: ${accent};
      border-radius: 6px;
      color: #ffffff;
      font-size: 12px;
      font-weight: 800;
      text-align: center;
      line-height: 24px;
    }
    .sign-grid {
      display: flex;
      gap: 22px;
      margin-top: 10px;
    }
    .sign-col {
      flex: 1;
    }
    .sign-role {
      font-size: 11px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 6px;
    }
    .sign-area {
      height: 68px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .sign-line {
      border-bottom: 1px solid #94a3b8;
      margin-top: 2px;
    }
    .sign-caption {
      font-size: 9.5px;
      color: #64748b;
      margin-top: 5px;
    }
    tr {
      page-break-inside: avoid;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      margin-bottom: 8px;
    }
    .header-left {
      flex: 1.4;
    }
    .header-right {
      flex: 1;
      text-align: right;
    }
    .doc-title {
      font-size: 30px;
      font-weight: 800;
      color: ${accent};
      letter-spacing: -0.6px;
      line-height: 1.1;
      margin: 8px 0 2px 0;
    }
    .doc-subtitle {
      font-size: 12.5px;
      color: #64748b;
      font-weight: 600;
      margin: 0;
    }
    .title-rule {
      width: 56px;
      height: 4px;
      border-radius: 2px;
      background: ${accentColor || protocol.projectColor || '#8A6E52'};
      margin: 12px 0 18px 0;
    }
    .doc-toc { margin: 8px 0 6px; }
    .doc-toc-h { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: ${accent}; margin: 0 0 10px; }
    .doc-toc-row { display: flex; align-items: baseline; gap: 10px; padding: 7px 0; border-bottom: 1px solid #eef1f5; font-size: 12.5px; }
    .doc-toc-n { min-width: 22px; height: 22px; border-radius: 6px; background: ${accent}; color: #fff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
    .doc-toc-t { color: #1b2430; font-weight: 600; }
    .meta-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-bottom: 22px;
      font-size: 11px;
      background: #f8fafc;
      border: 1px solid #e8ecf1;
      border-radius: 10px;
      overflow: hidden;
    }
    .meta-table td {
      padding: 9px 14px;
      border-bottom: 1px solid #eef1f5;
    }
    .meta-table tr:last-child td {
      border-bottom: none;
    }
    .meta-table td:first-child {
      font-weight: 700;
      width: 150px;
      color: #64748b;
      text-transform: uppercase;
      font-size: 9.5px;
      letter-spacing: 0.4px;
      vertical-align: top;
    }
    .meta-table td:last-child {
      color: #1f2937;
      font-weight: 600;
    }
    .doc-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 10.5px;
    }
    .doc-table th {
      background: #f8fafc;
      color: #334155;
      padding: 8px 10px;
      text-align: left;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.3px;
      border-bottom: 2px solid #e2e8f0;
    }
    .doc-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #eef1f5;
      color: #334155;
      vertical-align: top;
      word-wrap: break-word;
    }
    .doc-table tr:nth-child(even) td {
      background: #fbfcfd;
    }
    .pill {
      display: inline-block;
      padding: 2px 9px;
      border-radius: 11px;
      font-size: 9px;
      font-weight: 700;
      white-space: nowrap;
    }
    .stat-band {
      display: flex;
      align-items: stretch;
      margin: 0 0 20px 0;
      background: #f8fafc;
      border: 1px solid #e8ecf1;
      border-radius: 10px;
      overflow: hidden;
    }
    .stat-card {
      flex: 1;
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 6px;
      padding: 11px 8px;
      border-left: 1px solid #eef1f5;
    }
    .stat-card:first-child {
      border-left: none;
    }
    .stat-card .num {
      font-size: 19px;
      font-weight: 800;
      line-height: 1;
    }
    .stat-card .lbl {
      font-size: 8.5px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      font-weight: 700;
    }
    .content {
      margin-bottom: 20px;
    }
    .content ul {
      padding-left: 20px;
      margin: 8px 0;
    }
    .content li {
      margin-bottom: 6px;
      line-height: 1.6;
      color: #222;
    }
    .content p {
      color: #222;
    }
    .footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 8.5px;
      color: #94a3b8;
      border-top: 1px solid #e8ecf1;
      padding: 7px 18mm 0;
    }
    /* Running page header is rendered via @page @top-left/@top-right margin
       boxes (see above), not a fixed div, so it never glues to the top edge or
       repeats on the cover. */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 48px;
      font-weight: 700;
      color: rgba(200, 200, 200, 0.15);
      white-space: nowrap;
      pointer-events: none;
      z-index: 0;
      letter-spacing: 4px;
    }
    /* Gutachterliche Bewertung styles */
    .gutachten-bewertungsbox {
      border: 2px solid #B8860B;
      background-color: #FFFDE7;
      border-radius: 4px;
      padding: 12px 16px;
      margin: 12px 0;
    }
    .gutachten-bewertungsbox-title {
      font-size: 12px;
      font-weight: 700;
      color: #B8860B;
      margin-bottom: 6px;
    }
    .gutachten-fazitbox {
      border: 2px solid #C62828;
      background-color: #FFEBEE;
      border-radius: 4px;
      padding: 14px 16px;
      margin: 16px 0;
    }
    .gutachten-fazitbox-title {
      font-size: 13px;
      font-weight: 700;
      color: #C62828;
      margin-bottom: 8px;
    }
    .gutachten-empfehlungsbox {
      border: 2px solid #2E7D32;
      background-color: #E8F5E9;
      border-radius: 4px;
      padding: 14px 16px;
      margin: 16px 0;
    }
    .gutachten-empfehlungsbox-title {
      font-size: 13px;
      font-weight: 700;
      color: #2E7D32;
      margin-bottom: 8px;
    }
    .gutachten-normenbox {
      border: 1px solid #1565C0;
      background-color: #E3F2FD;
      border-radius: 4px;
      padding: 10px 14px;
      margin: 10px 0;
    }
    .gutachten-chapter {
      break-before: page;
      page-break-before: always;
      font-size: 16px;
      font-weight: 700;
      color: ${accent};
      margin-top: 24px;
      margin-bottom: 12px;
      border-bottom: 2px solid ${accent};
      padding-bottom: 6px;
    }
  </style>
</head>
<body>
  ${isGutachten ? `
  ${letterhead}
  <div style="margin-bottom: 24px;">
    <h1 style="font-size: 24px; font-weight: 800; color: ${accent}; margin: 10px 0 4px 0;">${escapeHtml(protocol.projectName || "Projekt")}</h1>
    <p style="font-size: 11px; color: #666; margin: 0;"><strong>${escapeHtml(protocol.templateName || "Gutachterliche Bewertung")}</strong></p>
  </div>
  ` : `
  ${letterhead}
  <div class="header-titles">
    <p class="doc-subtitle"><strong>${escapeHtml(protocol.templateName || "Protokoll")}</strong></p>
    <h1 class="doc-title">${escapeHtml(protocol.projectName || "Projekt")}</h1>
  </div>
  <div class="title-rule"></div>
  `}

  ${layoutShowMetadata ? `<table class="meta-table">
    ${protocol.protocolNumber ? `<tr><td>Protokoll-Nr.</td><td><strong>${protocol.protocolNumber}</strong></td></tr>` : ''}
    ${protocol.projectName ? `<tr><td>Projekt</td><td><strong>${protocol.projectName}</strong></td></tr>` : ''}
    <tr>
      <td>Datum</td>
      <td>${date}</td>
    </tr>
    <tr>
      <td>Uhrzeit</td>
      <td>${time}</td>
    </tr>
    <tr>
      <td>Aufnahmedauer</td>
      <td>${durationStr}</td>
    </tr>
    <tr>
      <td>Vorlage</td>
      <td>${protocol.templateName || "Freies Protokoll"}</td>
    </tr>
    ${
      evidenceSnapshots.length > 0 || photoDataUris.filter(Boolean).length > 0
        ? `<tr><td>Anh\u00e4nge</td><td>${evidenceSnapshots.length || photoDataUris.filter(Boolean).length} Beleg${(evidenceSnapshots.length || photoDataUris.filter(Boolean).length) !== 1 ? "e" : ""}</td></tr>`
        : ""
    }
    ${
      protocol.location
        ? `<tr><td>Standort</td><td>${protocol.location.address || `${protocol.location.latitude.toFixed(5)}, ${protocol.location.longitude.toFixed(5)}`}</td></tr>`
        : ""
    }
  </table>` : ''}

  ${kpiBandHtml}

  ${tocHtml}

  ${todos.length > 0 && layoutShowTodos ? `
  <div class="section-block" style="margin: 24px 0;">
    <h3 style="font-size:15px;font-weight:800;color:#1b2430;letter-spacing:-0.2px;margin:0 0 12px;padding-bottom:10px;border-bottom:1px solid #E6EBF1;">Mängel &amp; Aufgaben <span style="font-weight:600;color:#6B7A8D;font-size:11px;">(${todos.filter(t => t.done).length}/${todos.length} erledigt)</span></h3>
    <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
      <thead><tr>
        <th style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#6B7A8D;font-weight:700;padding:8px 10px;border:1px solid #E6EBF1;background:#F4F7FA;width:34px;">Nr.</th>
        <th style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#6B7A8D;font-weight:700;padding:8px 10px;border:1px solid #E6EBF1;background:#F4F7FA;">Beschreibung</th>
        <th style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#6B7A8D;font-weight:700;padding:8px 10px;border:1px solid #E6EBF1;background:#F4F7FA;width:78px;">Status</th>
        <th style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#6B7A8D;font-weight:700;padding:8px 10px;border:1px solid #E6EBF1;background:#F4F7FA;width:72px;">Priorität</th>
        <th style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#6B7A8D;font-weight:700;padding:8px 10px;border:1px solid #E6EBF1;background:#F4F7FA;">Verantwortlich</th>
        <th style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#6B7A8D;font-weight:700;padding:8px 10px;border:1px solid #E6EBF1;background:#F4F7FA;width:82px;">Frist</th>
      </tr></thead>
      <tbody>
        ${todos.map((todo, i) => {
          const tds = 'padding:9px 10px;border:1px solid #E6EBF1;color:#1b2430;vertical-align:middle;';
          const st = todo.done ? { t: 'Erledigt', c: '#2F855A', b: '#E4F3EA' } : ((todo as any).status === 'in_arbeit' ? { t: 'In Arbeit', c: '#2B6CB0', b: '#E7F0FB' } : { t: 'Offen', c: '#D64545', b: '#FBE9E9' });
          const pr = todo.priority === 'hoch' ? { t: 'Hoch', c: '#D64545', b: '#FBE9E9' } : todo.priority === 'mittel' ? { t: 'Mittel', c: '#B7791F', b: '#FBF0DD' } : { t: 'Niedrig', c: '#6B7A8D', b: '#EEF1F5' };
          const pill = (x: { t: string; c: string; b: string }) => `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:800;background:${x.b};color:${x.c};">${x.t}</span>`;
          const frist = (todo.deadline && String(todo.deadline).trim() && todo.deadline !== 'offen') ? String(todo.deadline) : '–';
          const resp = (todo.assignee && todo.assignee !== 'Nicht zugewiesen') ? todo.assignee : '–';
          return `<tr>
            <td style="${tds}">${i + 1}</td>
            <td style="${tds}">${escapeHtml(todo.task)}</td>
            <td style="${tds}">${pill(st)}</td>
            <td style="${tds}">${pill(pr)}</td>
            <td style="${tds}">${escapeHtml(resp)}</td>
            <td style="${tds}">${escapeHtml(frist)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="content">
    ${protocolHtml}
  </div>

  ${evidenceHtml}

  ${planHtml}

  ${photosHtml}

  ${protocol.checklistResults && protocol.checklistResults.length > 0 ? `
  <div style="margin-top: 30px; page-break-inside: avoid;">
    <h3 style="font-size: 14px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px;">Checklisten-Ergebnisse</h3>
    ${protocol.checklistResults.map(cl => `
      <div style="margin-bottom: 16px; border: 1px solid #eee; border-radius: 8px; padding: 12px; background: #fafafa;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-weight: 600; font-size: 13px; color: #333;">${cl.name}</div>
          <div style="font-size: 11px; color: ${cl.completionRate === 100 ? '#22c55e' : '#f59e0b'}; font-weight: 600;">${cl.completionRate}%</div>
        </div>
        <div style="font-size: 11px; color: #666; margin-bottom: 8px;">Pr\u00fcfer: ${cl.inspector}${cl.completedAt ? ` \u2022 ${new Date(cl.completedAt).toLocaleDateString('de-DE')}` : ''}</div>
        <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
          ${cl.items.map(item => `
            <tr style="border-bottom: 1px solid #f0f0f0;">
              <td style="padding: 4px 8px 4px 0; width: 20px; color: ${item.checked ? '#22c55e' : '#ef4444'};">${item.checked ? '\u2713' : '\u2717'}</td>
              <td style="padding: 4px 0;">${item.text}${item.note ? ` <span style="color: #888; font-style: italic;">\u2013 ${item.note}</span>` : ''}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${freigabeHtml}

  ${company.watermarkEnabled && company.watermarkText ? `<div class="watermark">${company.watermarkText}</div>` : ''}
</body>
</html>`;
}

/**
 * Generate a PDF file from a protocol and return the local file URI
 */
/**
 * Generate HTML preview string (for in-app web preview without creating a PDF file)
 */
export async function generateProtocolHtmlPreview(protocol: PdfProtocol): Promise<string> {
  const company = await loadCompanySettings();
  const evidenceSnapshots = await resolveEvidenceSnapshots(protocol);
  const resolvedProtocol: PdfProtocol = { ...protocol, evidenceSnapshots };
  // Safety net: if a Mängelliste slipped through as a bullet list, turn it into
  // a Markdown table so the PDF renders the Mangel table (same as in-app cards).
  if (isMaengelTemplate(protocol.templateId)) resolvedProtocol.protocol = normalizeMaengelTables(getProtocolText(protocol));
  const photoDataUris: string[] = [];
  if (protocol.photos && protocol.photos.length > 0) {
    for (const photoUri of protocol.photos) {
      const dataUri = await fileToBase64DataUri(photoUri);
      photoDataUris.push(dataUri || "");
    }
  }
  const evidenceDataUris: string[] = [];
  for (const snapshot of evidenceSnapshots) {
    const dataUri = await fileToBase64DataUri(snapshot.mediaUri);
    evidenceDataUris.push(dataUri || "");
  }
  let planImageBase64: string | null = null;
  if (protocol.planData?.planImageUri) {
    planImageBase64 = await fileToBase64DataUri(protocol.planData.planImageUri);
  }
  let accentColor: string | undefined;
  let pdfTemplate: PdfTemplate = "standard";
  try {
    const brandingStr = await AsyncStorage.getItem("pdf-branding");
    if (brandingStr) {
      const branding = JSON.parse(brandingStr);
      if (branding.accentColor) accentColor = branding.accentColor;
      if (branding.pdfTemplate) pdfTemplate = branding.pdfTemplate;
    }
  } catch {}
  return generatePdfHtml(resolvedProtocol, company, photoDataUris, evidenceDataUris, planImageBase64, accentColor, pdfTemplate);
}

export async function generateProtocolPdf(protocol: PdfProtocol): Promise<string> {
  // Load company settings
  const company = await loadCompanySettings();
  const evidenceSnapshots = await resolveEvidenceSnapshots(protocol);
  const resolvedProtocol: PdfProtocol = { ...protocol, evidenceSnapshots };
  // Safety net: if a Mängelliste slipped through as a bullet list, turn it into
  // a Markdown table so the PDF renders the Mangel table (same as in-app cards).
  if (isMaengelTemplate(protocol.templateId)) resolvedProtocol.protocol = normalizeMaengelTables(getProtocolText(protocol));

  // Convert photos to base64 data URIs
  const photoDataUris: string[] = [];
  if (protocol.photos && protocol.photos.length > 0) {
    for (let i = 0; i < protocol.photos.length; i++) {
      // Re-anchor a possibly stale absolute Documents path onto the current
      // container first, so a photo that survived an app update still loads.
      const photoUri = resolveDocUri(protocol.photos[i]);

      // Step 1: Compress the photo for smaller PDF size
      const compressedUri = await compressPhotoForPdf(photoUri);
      const uriToRead = compressedUri || photoUri;
      
      let dataUri = await fileToBase64DataUri(uriToRead);
      // If compressed version fails, try original
      if (!dataUri && compressedUri !== photoUri) {
        dataUri = await fileToBase64DataUri(photoUri);
      }
      // If direct read fails, try copying to a temp location first (handles iOS ph:// and picker URIs)
      if (!dataUri && photoUri) {
        try {
          const tempPath = `${FileSystem.cacheDirectory}pdf-photo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.jpg`;
          await FileSystem.copyAsync({ from: photoUri, to: tempPath });
          // Compress the copied file too
          const compressedTemp = await compressPhotoForPdf(tempPath);
          dataUri = await fileToBase64DataUri(compressedTemp || tempPath);
          // Clean up temp files
          try { await FileSystem.deleteAsync(tempPath, { idempotent: true }); } catch {}
          if (compressedTemp && compressedTemp !== tempPath) {
            try { await FileSystem.deleteAsync(compressedTemp, { idempotent: true }); } catch {}
          }
        } catch (copyErr) {
          console.warn(`[PDF-Gen] Photo ${i + 1}: Copy fallback also failed:`, copyErr);
        }
      }
      if (dataUri) {
        photoDataUris.push(dataUri);
      } else {
        console.warn(`[PDF-Gen] Photo ${i + 1}: ✗ FAILED to convert - will be missing from PDF`);
        // Push empty placeholder to keep indices aligned with protocol text [FOTO X] references
        photoDataUris.push("");
      }
    }
  }

  // Convert stable document evidence while preserving one output slot per snapshot.
  const evidenceDataUris: string[] = [];
  for (let index = 0; index < evidenceSnapshots.length; index++) {
    const snapshot = evidenceSnapshots[index];
    const compressedUri = await compressPhotoForPdf(snapshot.mediaUri);
    let dataUri = await fileToBase64DataUri(compressedUri || snapshot.mediaUri);
    if (!dataUri && compressedUri !== snapshot.mediaUri) {
      dataUri = await fileToBase64DataUri(snapshot.mediaUri);
    }
    evidenceDataUris.push(dataUri || "");
  }

  // Convert plan image to base64 if available
  let planImageBase64: string | null = null;
  if (protocol.planData?.planImageUri) {
    planImageBase64 = await fileToBase64DataUri(protocol.planData.planImageUri);
  }

  // Load PDF branding accent color and template
  let accentColor: string | undefined;
  let pdfTemplate: PdfTemplate = "standard";
  let photoWatermark = true;
  let showCoverPage = true;
  let watermarkText = "";
  let showTranscription = true;
  let showTodos = true;
  let showMetadata = true;
  let showSignatures = true;
  let photoSize: "klein" | "mittel" | "gro\u00df" = "mittel";
  let brandingData: any = null;
  try {
    const brandingStr = await AsyncStorage.getItem("pdf-branding");
    if (brandingStr) {
      const branding = JSON.parse(brandingStr);
      brandingData = branding;
      if (branding.accentColor) accentColor = branding.accentColor;
      if (branding.pdfTemplate) pdfTemplate = branding.pdfTemplate;
      if (branding.photoWatermark === false) photoWatermark = false;
      if (branding.showCoverPage === false) showCoverPage = false;
      if (branding.watermarkText) watermarkText = branding.watermarkText;
      if (branding.showTranscription === false) showTranscription = false;
      if (branding.showTodos === false) showTodos = false;
      if (branding.showMetadata === false) showMetadata = false;
      if (branding.showSignatures === false) showSignatures = false;
      if (branding.photoSize) photoSize = branding.photoSize;
    }
  } catch {}
  const showPageNumbers = brandingData?.showPageNumbers !== false;

  // Generate cover page FIRST (if enabled) so the body can drop the duplicate
  // metadata table + KPI band only when a cover is actually produced.
  let coverPageHtml = "";
  if (showCoverPage) {
    try {
      const { getPdfBranding, generateCoverPage } = await import("./pdf-branding-store");
      const fullBranding = await getPdfBranding();
      // Convert logo to base64 if available (with timeout to prevent hanging)
      let logoBase64: string | null = null;
      if (fullBranding.logoUri) {
        logoBase64 = await withTimeout(
          fileToBase64DataUri(fullBranding.logoUri),
          5000, // 5 second timeout for logo
          null
        );
        if (!logoBase64) {
          console.warn("[PDF-Gen] Logo conversion failed or timed out, skipping logo");
        }
      }
      // Cover KPIs + hero image from this protocol's own data.
      const _todos = resolvedProtocol.todos || [];
      const _open = _todos.filter((x: any) => !x.done).length;
      const _photoN = photoDataUris.filter(Boolean).length;
      const _durMin = Math.round((resolvedProtocol.duration || 0) / 60);
      const kpiCards: any[] = [];
      if (_todos.length > 0) {
        kpiCards.push({ value: _open, label: "Offene Aufgaben", sub: _open > 0 ? `${_open} offen` : undefined, subWarn: _open > 0, color: _open > 0 ? "#B7791F" : "#2F855A", bg: _open > 0 ? "#FBF0DD" : "#E4F3EA", icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' });
        kpiCards.push({ value: _todos.length - _open, label: "Erledigt", color: "#2F855A", bg: "#E4F3EA", icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>' });
      }
      // "Fotos" and "Dauer" cards dropped on purpose — not useful on a cover.
      void _photoN; void _durMin;
      // Hero = the project's own image (not the first/Mangel photo). No project
      // image → no hero, rather than a random evidence photo.
      let heroDataUri: string | null = null;
      if (resolvedProtocol.projectImageUri) {
        heroDataUri = await withTimeout(fileToBase64DataUri(resolvedProtocol.projectImageUri), 5000, null);
      }
      coverPageHtml = generateCoverPage(fullBranding, resolvedProtocol, logoBase64, { kpiCards, heroDataUri });
    } catch (e) {
      console.warn("[PDF-Gen] Cover page generation failed:", e);
    }
  }

  // Generate the body HTML — dropping the duplicate metadata/KPIs when a cover exists.
  const html = generatePdfHtml(resolvedProtocol, company, photoDataUris, evidenceDataUris, planImageBase64, accentColor, pdfTemplate, photoWatermark, watermarkText, { showTranscription, showTodos, showMetadata, showSignatures, photoSize, hasCoverPage: !!coverPageHtml, showPageNumbers });

  // Insert cover page before the body content if available
  const finalHtml = coverPageHtml
    ? html.replace("<body>", `<body>\n${coverPageHtml}`)
    : html;

  // Generate PDF (with timeout to prevent hanging)
  const printResult = await withTimeout(
    // No native `margins` here on purpose: they override the CSS @page rule and
    // disable its margin boxes — i.e. the footer + page number silently vanish.
    // The CSS @page (margin: 17mm 18mm 20mm 18mm) is the single source of truth,
    // consistent with every other PDF, so the footer page number renders.
    Print.printToFileAsync({
      html: finalHtml,
    }),
    30000, // 30 second timeout for PDF generation
    null
  );
  if (!printResult) {
    throw new Error("PDF-Generierung hat zu lange gedauert. Bitte versuche es erneut.");
  }
  const { uri } = printResult;

  // Rename to meaningful filename using configured schema
  try {
    const { generateFilename, getPdfBranding } = await import("./pdf-branding-store");
    const branding = await getPdfBranding();
    const filename = generateFilename(
      branding.filenameSchema,
      protocol.projectName,
      new Date(protocol.createdAt),
      protocol.protocolNumber,
      protocol.templateName || "Protokoll"
    ) + ".pdf";
    const dir = uri.substring(0, uri.lastIndexOf("/") + 1);
    const newUri = dir + filename;
    await FileSystem.moveAsync({ from: uri, to: newUri });
    return newUri;
  } catch {
    // Fallback to original URI if rename fails
    return uri;
  }
}
