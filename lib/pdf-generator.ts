import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
        [{ resize: { width: 1200 } }], // Max 1200px width for PDF (plenty for print quality)
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      ),
      10000, // 10 second timeout
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
  transcriptionSegments?: Array<{ start: number; end: number; text: string }>; // Whisper segments with timing
  photoCaptions?: string[]; // pre-computed captions per photo (fallback if segments unavailable)
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
  checklistResults?: Array<{
    name: string;
    inspector: string;
    completedAt?: string;
    items: Array<{ text: string; checked: boolean; note?: string }>;
    completionRate: number;
  }>;
};

type CompanySettings = {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  logoBase64?: string;
  watermarkEnabled?: boolean;
  watermarkText?: string;
};

/**
 * Convert a local file URI to a base64 data URI for embedding in HTML
 */
async function fileToBase64DataUri(uri: string): Promise<string | null> {
  try {
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
    return companyData;
  } catch (error) {
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
}

function generatePdfHtml(
  protocol: PdfProtocol,
  company: CompanySettings,
  photoDataUris: string[],
  planImageBase64?: string | null,
  accentColor?: string,
  pdfTemplate: PdfTemplate = "standard",
  photoWatermark: boolean = true,
  watermarkText: string = "",
  layoutOptions: LayoutOptions = {}
): string {
  // Layout options with defaults
  const layoutShowTranscription = layoutOptions.showTranscription !== false;
  const layoutShowTodos = layoutOptions.showTodos !== false;
  const layoutShowMetadata = layoutOptions.showMetadata !== false;
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

  const logoHtml = company.logoBase64
    ? `<img src="${company.logoBase64}" style="max-height: 50px; max-width: 180px; object-fit: contain; display: block;" />`
    : "";

  const companyInfoHtml = company.companyName
    ? `<div style="text-align: right; font-size: 10px; color: #444;">
        <strong style="color: #222;">${company.companyName}</strong><br/>
        ${company.companyAddress ? company.companyAddress.replace(/\n/g, "<br/>") : ""}
        ${company.companyPhone ? `<br/>Tel: ${company.companyPhone}` : ""}
      </div>`
    : "";

  // Helper: Get caption text for a photo based on its timestamp and transcription segments
  // Returns HTML with the exact sentence at photo time highlighted in bold
  const getPhotoCaptionFromSegments = (photoIndex: number): string => {
    // Priority 1: Pre-computed captions (no highlight for manually edited captions)
    if (protocol.photoCaptions && protocol.photoCaptions[photoIndex]) {
      return protocol.photoCaptions[photoIndex];
    }
    // Priority 2: Match segments by timestamp - only show the exact sentence at photo time (bold only)
    if (protocol.transcriptionSegments && protocol.transcriptionSegments.length > 0 && protocol.photoTimestamps && protocol.photoTimestamps[photoIndex] != null) {
      const photoTime = protocol.photoTimestamps[photoIndex];
      // Find the exact segment that contains the photo timestamp (spoken at that moment)
      const exactSegment = protocol.transcriptionSegments.find(
        (seg) => seg.start <= photoTime && seg.end >= photoTime
      );
      if (exactSegment) {
        return `<strong>${exactSegment.text.trim()}</strong>`;
      }
      // Fallback: find the closest segment before the photo
      const beforeSegments = protocol.transcriptionSegments.filter(seg => seg.start <= photoTime);
      if (beforeSegments.length > 0) {
        const closest = beforeSegments[beforeSegments.length - 1];
        return `<strong>${closest.text.trim()}</strong>`;
      }
    }
    // Priority 3: No segments available – use empty
    return "";
  };

  // Convert protocol text to HTML (handle line breaks, bullet points, and inline photo placeholders)
  const protocolHtml = protocol.protocol
    .split("\n")
    .map((line) => {
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
        // Handle **bold** in the cleaned text
        cleanedText = cleanedText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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
        return `<li>${trimmed.substring(2)}</li>`;
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
      if (trimmed.startsWith("## ")) {
        return `<h3 style="margin-top: 18px; margin-bottom: 8px; color: #111; font-size: 14px; font-weight: 600;">${trimmed.substring(3)}</h3>`;
      }
      if (trimmed.startsWith("# ")) {
        return `<div style="margin-top: 28px; margin-bottom: 14px; border-bottom: 2px solid #333; padding-bottom: 6px;"><h2 style="margin: 0; color: #111; font-size: 18px; font-weight: 700;">${trimmed.substring(2)}</h2></div>`;
      }
      if (trimmed === "") return "<br/>";
      // Handle **bold** inline
      let processed = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Handle | table rows for gutachten
      if (isGutachten && processed.startsWith('|') && processed.endsWith('|')) {
        const cells = processed.split('|').filter(c => c.trim() !== '');
        if (cells.every(c => /^[-:]+$/.test(c.trim()))) return ''; // separator row
        return `<tr>${cells.map(c => `<td style="padding: 6px 10px; border: 1px solid #e0e0e0; font-size: 11px;">${c.trim()}</td>`).join('')}</tr>`;
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

  // Check which photos were already placed inline via [FOTO X] or [Foto X – ...] placeholders
  const inlinePlacedPhotos = new Set<number>();
  const inlineRegex = /\[Foto\s*(\d+)(?:\s*[\u2013\-–][^\]]*)?\]/gi;
  let inlineMatch;
  while ((inlineMatch = inlineRegex.exec(protocol.protocol)) !== null) {
    inlinePlacedPhotos.add(parseInt(inlineMatch[1], 10) - 1);
  }
  // Only show remaining (non-inline) photos in the Fotodokumentation section
  // Also filter out empty entries (photos that couldn't be read)
  let remainingPhotoIndices = photoDataUris.map((_, i) => i).filter(i => !inlinePlacedPhotos.has(i) && photoDataUris[i]);
  // If ALL photos were "inline placed" but the inline rendering couldn't embed them (because photoDataUris was empty at render time),
  // show all valid photos in the Fotodokumentation section as fallback
  const validPhotoCount = photoDataUris.filter(u => u).length;
  if (remainingPhotoIndices.length === 0 && validPhotoCount > 0 && inlinePlacedPhotos.size > 0) {
    // Check if any inline photos were actually rendered (they need valid photoDataUris)
    const inlineRenderedCount = Array.from(inlinePlacedPhotos).filter(i => i >= 0 && i < photoDataUris.length && photoDataUris[i]).length;
    if (inlineRenderedCount === 0) {
      // None were actually rendered inline, show all in Fotodokumentation
      remainingPhotoIndices = photoDataUris.map((_, i) => i).filter(i => photoDataUris[i]);
    }
  }

  const photosHtml =
    remainingPhotoIndices.length > 0
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
    @page {
      margin: 20mm 15mm 25mm 15mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 12px;
      color: #222;
      line-height: 1.6;
      margin: 0;
      padding: 0;
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
    tr {
      page-break-inside: avoid;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid ${accentColor || protocol.projectColor || '#0a7ea4'};
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .header-left {
      flex: 1;
    }
    .header-right {
      flex: 1;
      text-align: right;
    }
    .doc-title {
      font-size: 24px;
      font-weight: 700;
      color: #111;
      margin: 0 0 4px 0;
    }
    .doc-subtitle {
      font-size: 12px;
      color: #444;
      margin: 0;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 11px;
    }
    .meta-table td {
      padding: 8px 12px;
      border: 1px solid #d0d0d0;
      color: #222;
    }
    .meta-table td:first-child {
      font-weight: 600;
      width: 140px;
      background-color: #f5f5f5;
      color: #333;
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
      font-size: 9px;
      color: #999;
      border-top: 1px solid #eee;
      padding-top: 8px;
    }
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
      font-size: 16px;
      font-weight: 700;
      color: #1A237E;
      margin-top: 24px;
      margin-bottom: 12px;
      border-bottom: 2px solid #1A237E;
      padding-bottom: 6px;
    }
  </style>
</head>
<body>
  ${isGutachten ? `
  <div style="border-bottom: 3px solid #1A237E; padding-bottom: 16px; margin-bottom: 24px;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        ${logoHtml}
        <h1 style="font-size: 24px; font-weight: 800; color: #1A237E; margin: 8px 0 4px 0;">Gutachterliche Bewertung</h1>
        <p style="font-size: 11px; color: #666; margin: 0;">Erstellt mit ProtoKI</p>
      </div>
      <div style="text-align: right;">
        ${companyInfoHtml}
      </div>
    </div>
  </div>
  ` : `
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <h1 class="doc-title">${protocol.templateName || "Protokoll"}</h1>
      <p class="doc-subtitle">Erstellt mit ProtoKI</p>
    </div>
    <div class="header-right">
      ${companyInfoHtml}
    </div>
  </div>
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
      photoDataUris.length > 0
        ? `<tr><td>Anh\u00e4nge</td><td>${photoDataUris.length} Foto${photoDataUris.length !== 1 ? "s" : ""}</td></tr>`
        : ""
    }
    ${
      protocol.location
        ? `<tr><td>Standort</td><td>${protocol.location.address || `${protocol.location.latitude.toFixed(5)}, ${protocol.location.longitude.toFixed(5)}`}</td></tr>`
        : ""
    }
  </table>` : ''}

  ${todos.length > 0 && layoutShowTodos ? `
  <div style="margin-bottom: 20px;">
    <h3 style="font-size: 14px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px;">
      Aufgaben (${todos.filter(t => t.done).length}/${todos.length} erledigt)
    </h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <thead>
        <tr style="background-color: #f8f8f8;">
          <th style="padding: 8px; border: 1px solid #e0e0e0; text-align: left; width: 30px;">✓</th>
          <th style="padding: 8px; border: 1px solid #e0e0e0; text-align: left;">Aufgabe</th>
          <th style="padding: 8px; border: 1px solid #e0e0e0; text-align: left; width: 100px;">Verantwortlich</th>
          <th style="padding: 8px; border: 1px solid #e0e0e0; text-align: center; width: 70px;">Priorit\u00e4t</th>
          <th style="padding: 8px; border: 1px solid #e0e0e0; text-align: left; width: 80px;">Frist</th>
        </tr>
      </thead>
      <tbody>
        ${todos.map(todo => `
          <tr style="${todo.done ? 'opacity: 0.6;' : ''}">
            <td style="padding: 8px; border: 1px solid #e0e0e0; text-align: center;">${todo.done ? '☑' : '☐'}</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0; ${todo.done ? 'text-decoration: line-through;' : ''}">${todo.task}</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${todo.assignee}</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0; text-align: center; color: ${todo.priority === 'hoch' ? '#E53935' : todo.priority === 'mittel' ? '#FF9800' : '#666'};">${todo.priority}</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${todo.deadline}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="content">
    ${protocolHtml}
  </div>

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

  ${protocol.signatures && protocol.signatures.length > 0 && layoutShowSignatures ? `
  <div style="margin-top: 30px; page-break-inside: avoid;">
    <h3 style="font-size: 14px; color: #333; margin-bottom: 16px;">Unterschriften</h3>
    <div style="display: flex; flex-wrap: wrap; gap: 16px;">
      ${protocol.signatures.map(sig => `
        <div style="border: 2px solid #000000; padding: 12px; background: #ffffff; width: 45%; box-sizing: border-box;">
          <div style="font-size: 12px; font-weight: 600; color: #333; margin-bottom: 8px;">${sig.role}</div>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 100px; overflow: visible;">
            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet" style="max-width: 100%; overflow: visible;">
              ${sig.paths.map(d => `<path d="${d}" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n              ')}
            </svg>
          </div>
          <div style="border-top: 1px solid #000; margin-top: 8px; padding-top: 4px; font-size: 10px; color: #555;">${sig.signedAt}</div>
        </div>
      `).join('')}
    </div>
  </div>
  ` : protocol.signaturePaths && protocol.signaturePaths.length > 0 && layoutShowSignatures ? `
  <div style="margin-top: 30px; page-break-inside: avoid;">
    <h3 style="font-size: 14px; color: #333; margin-bottom: 16px;">Unterschrift</h3>
    <div style="border: 2px solid #000000; padding: 12px; background: #ffffff; display: inline-block; min-width: 300px;">
      <div style="display: flex; align-items: center; justify-content: center; min-height: 100px; overflow: visible;">
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet" style="max-width: 100%; overflow: visible;">
          ${protocol.signaturePaths.map(d => `<path d="${d}" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n          ')}
        </svg>
      </div>
    </div>
  </div>
  ` : ''}

  ${company.watermarkEnabled && company.watermarkText ? `<div class="watermark">${company.watermarkText}</div>` : ''}

  <div class="footer">
    ${company.companyName ? company.companyName + " | " : ""}Erstellt am ${date} um ${time} | ProtoKI Protokoll-App
  </div>
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
  const photoDataUris: string[] = [];
  if (protocol.photos && protocol.photos.length > 0) {
    for (const photoUri of protocol.photos) {
      const dataUri = await fileToBase64DataUri(photoUri);
      if (dataUri) {
        photoDataUris.push(dataUri);
      }
    }
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
  return generatePdfHtml(protocol, company, photoDataUris, planImageBase64, accentColor, pdfTemplate);
}

export async function generateProtocolPdf(protocol: PdfProtocol): Promise<string> {
  // Load company settings
  const company = await loadCompanySettings();

  // Convert photos to base64 data URIs
  const photoDataUris: string[] = [];
  if (protocol.photos && protocol.photos.length > 0) {
    console.log(`[PDF-Gen] Processing ${protocol.photos.length} photos...`);
    for (let i = 0; i < protocol.photos.length; i++) {
      const photoUri = protocol.photos[i];
      console.log(`[PDF-Gen] Photo ${i + 1}: ${photoUri}`);
      
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
        console.log(`[PDF-Gen] Photo ${i + 1}: Direct read failed, trying copy fallback...`);
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
        console.log(`[PDF-Gen] Photo ${i + 1}: ✓ Converted to base64 (${Math.round(dataUri.length / 1024)}KB)`);
        photoDataUris.push(dataUri);
      } else {
        console.warn(`[PDF-Gen] Photo ${i + 1}: ✗ FAILED to convert - will be missing from PDF`);
        // Push empty placeholder to keep indices aligned with protocol text [FOTO X] references
        photoDataUris.push("");
      }
    }
    console.log(`[PDF-Gen] Successfully converted ${photoDataUris.filter(u => u).length}/${protocol.photos.length} photos`);
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

  // Generate HTML
  const html = generatePdfHtml(protocol, company, photoDataUris, planImageBase64, accentColor, pdfTemplate, photoWatermark, watermarkText, { showTranscription, showTodos, showMetadata, showSignatures, photoSize });

  // Generate cover page if enabled
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
      coverPageHtml = generateCoverPage(fullBranding, protocol, logoBase64);
    } catch (e) {
      console.warn("[PDF-Gen] Cover page generation failed:", e);
    }
  }

  // Insert cover page before the body content if available
  const finalHtml = coverPageHtml
    ? html.replace("<body>", `<body>\n${coverPageHtml}`)
    : html;

  // Generate PDF (with timeout to prevent hanging)
  console.log("[PDF-Gen] Generating PDF file...");
  const printResult = await withTimeout(
    Print.printToFileAsync({
      html: finalHtml,
      margins: {
        left: 20,
        top: 20,
        right: 20,
        bottom: 30,
      },
    }),
    30000, // 30 second timeout for PDF generation
    null
  );
  if (!printResult) {
    throw new Error("PDF-Generierung hat zu lange gedauert. Bitte versuche es erneut.");
  }
  const { uri } = printResult;
  console.log("[PDF-Gen] PDF generated:", uri);

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
