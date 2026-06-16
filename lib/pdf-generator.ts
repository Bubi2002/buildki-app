import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";

type TodoItem = {
  task: string;
  assignee: string;
  priority: string;
  deadline: string;
  done: boolean;
};

type PdfProtocol = {
  title: string;
  protocol: string;
  templateName?: string;
  photos?: string[];
  photoTimestamps?: number[]; // seconds since recording start for each photo
  transcriptionSegments?: Array<{ start: number; end: number; text: string }>; // Whisper segments with timing
  photoCaptions?: string[]; // pre-computed captions per photo (fallback if segments unavailable)
  todos?: TodoItem[];
  duration: number;
  createdAt: string;
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
function generatePdfHtml(
  protocol: PdfProtocol,
  company: CompanySettings,
  photoDataUris: string[],
  planImageBase64?: string | null,
  accentColor?: string
): string {
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
    ? `<img src="${company.logoBase64}" style="max-height: 50px; max-width: 180px; object-fit: contain;" />`
    : "";

  const companyInfoHtml = company.companyName
    ? `<div style="text-align: right; font-size: 10px; color: #666;">
        <strong>${company.companyName}</strong><br/>
        ${company.companyAddress ? company.companyAddress.replace(/\n/g, "<br/>") : ""}
        ${company.companyPhone ? `<br/>Tel: ${company.companyPhone}` : ""}
      </div>`
    : "";

  // Convert protocol text to HTML (handle line breaks, bullet points, and inline photo placeholders)
  const protocolHtml = protocol.protocol
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      // Check for inline photo placeholder [FOTO X]
      const photoMatch = trimmed.match(/^\[FOTO\s*(\d+)\]$/i);
      if (photoMatch) {
        const photoIdx = parseInt(photoMatch[1], 10) - 1;
        if (photoIdx >= 0 && photoIdx < photoDataUris.length) {
          const caption = getPhotoCaptionFromSegments(photoIdx);
          const timestamp = protocol.photoTimestamps && protocol.photoTimestamps[photoIdx] != null
            ? `${Math.floor(protocol.photoTimestamps[photoIdx] / 60)}:${(protocol.photoTimestamps[photoIdx] % 60).toString().padStart(2, '0')} Min.`
            : null;
          return `
          <div style="margin: 12px 0; page-break-inside: avoid; border: 1px solid #eee; border-radius: 6px; padding: 10px; background: #fafafa;">
            <img src="${photoDataUris[photoIdx]}" style="width: 100%; max-height: 240px; object-fit: contain; border-radius: 4px;" />
            <p style="font-size: 10px; color: #555; font-weight: 600; margin: 8px 0 2px 0;">Foto ${photoIdx + 1}${timestamp ? ` \u2013 ${timestamp}` : ''}</p>
            ${caption ? `<p style="font-size: 11px; color: #333; line-height: 1.4; margin: 0;">${caption}</p>` : ''}
          </div>`;
        }
      }
      // Also handle inline [FOTO X] within a text line
      const inlinePhotoRegex = /\[FOTO\s*(\d+)\]/gi;
      if (inlinePhotoRegex.test(trimmed) && !photoMatch) {
        let result = trimmed;
        result = result.replace(/\[FOTO\s*(\d+)\]/gi, (match, num) => {
          const idx = parseInt(num, 10) - 1;
          if (idx >= 0 && idx < photoDataUris.length) {
            return `<span style="color: ${accentColor || '#0a7ea4'}; font-weight: 600;">[Foto ${idx + 1} \u2013 siehe Fotodokumentation]</span>`;
          }
          return match;
        });
        return `<p style="margin: 4px 0; line-height: 1.6;">${result}</p>`;
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        return `<li>${trimmed.substring(2)}</li>`;
      }
      if (trimmed.startsWith("## ")) {
        return `<h3 style="margin-top: 16px; margin-bottom: 8px; color: #1a1a1a; font-size: 14px;">${trimmed.substring(3)}</h3>`;
      }
      if (trimmed.startsWith("# ")) {
        return `<h2 style="margin-top: 20px; margin-bottom: 10px; color: #1a1a1a; font-size: 16px;">${trimmed.substring(2)}</h2>`;
      }
      if (trimmed === "") return "<br/>";
      return `<p style="margin: 4px 0; line-height: 1.6;">${trimmed}</p>`;
    })
    .join("\n");

  // Helper: Get caption text for a photo based on its timestamp and transcription segments
  // Returns HTML with the exact sentence at photo time highlighted in bold
  const getPhotoCaptionFromSegments = (photoIndex: number): string => {
    // Priority 1: Pre-computed captions (no highlight for manually edited captions)
    if (protocol.photoCaptions && protocol.photoCaptions[photoIndex]) {
      return protocol.photoCaptions[photoIndex];
    }
    // Priority 2: Match segments by timestamp with highlight
    if (protocol.transcriptionSegments && protocol.transcriptionSegments.length > 0 && protocol.photoTimestamps && protocol.photoTimestamps[photoIndex] != null) {
      const photoTime = protocol.photoTimestamps[photoIndex];
      // Find segments that overlap with a window around the photo time (±15 seconds before, +5 after)
      const windowStart = Math.max(0, photoTime - 15);
      const windowEnd = photoTime + 5;
      const matchingSegments = protocol.transcriptionSegments.filter(
        (seg) => seg.end >= windowStart && seg.start <= windowEnd
      );
      if (matchingSegments.length > 0) {
        // Find the exact segment that contains the photo timestamp (spoken at that moment)
        const exactSegment = protocol.transcriptionSegments.find(
          (seg) => seg.start <= photoTime && seg.end >= photoTime
        );
        // Build caption with highlight on the exact sentence
        const captionParts = matchingSegments.map(s => {
          const text = s.text.trim();
          if (exactSegment && s.start === exactSegment.start && s.end === exactSegment.end) {
            return `<strong style="background-color: rgba(255, 235, 59, 0.3); padding: 1px 3px; border-radius: 2px;">${text}</strong>`;
          }
          return text;
        });
        return captionParts.join(" ").trim();
      }
      // Fallback: find the closest segment before the photo
      const beforeSegments = protocol.transcriptionSegments.filter(seg => seg.start <= photoTime);
      if (beforeSegments.length > 0) {
        const closest = beforeSegments[beforeSegments.length - 1];
        return `<strong style="background-color: rgba(255, 235, 59, 0.3); padding: 1px 3px; border-radius: 2px;">${closest.text.trim()}</strong>`;
      }
    }
    // Priority 3: No segments available – use empty
    return "";
  };

  const photosHtml =
    photoDataUris.length > 0
      ? `
    <div style="page-break-before: auto; margin-top: 24px;">
      <h3 style="font-size: 14px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px;">
        Fotodokumentation (${photoDataUris.length} ${photoDataUris.length === 1 ? "Bild" : "Bilder"})
      </h3>
      ${photoDataUris
        .map((uri, i) => {
          const timestamp = protocol.photoTimestamps && protocol.photoTimestamps[i] != null
            ? `${Math.floor(protocol.photoTimestamps[i] / 60)}:${(protocol.photoTimestamps[i] % 60).toString().padStart(2, '0')} Min.`
            : null;
          const caption = getPhotoCaptionFromSegments(i);
          return `
          <div style="width: 100%; margin-bottom: 20px; page-break-inside: avoid;">
            <div style="display: flex; align-items: flex-start; gap: 16px;">
              <div style="flex: 0 0 55%;">
                <img src="${uri}" style="width: 100%; max-height: 280px; object-fit: contain; border: 1px solid #eee; border-radius: 4px;" />
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
      color: #333;
      line-height: 1.5;
      margin: 0;
      padding: 0;
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
      font-size: 22px;
      font-weight: 700;
      color: #1a1a1a;
      margin: 0 0 4px 0;
    }
    .doc-subtitle {
      font-size: 12px;
      color: #666;
      margin: 0;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 11px;
    }
    .meta-table td {
      padding: 6px 10px;
      border: 1px solid #e0e0e0;
    }
    .meta-table td:first-child {
      font-weight: 600;
      width: 140px;
      background-color: #f8f8f8;
      color: #555;
    }
    .content {
      margin-bottom: 20px;
    }
    .content ul {
      padding-left: 20px;
      margin: 8px 0;
    }
    .content li {
      margin-bottom: 4px;
      line-height: 1.6;
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
  </style>
</head>
<body>
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

  <table class="meta-table">
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
        ? `<tr><td>Anhänge</td><td>${photoDataUris.length} Foto${photoDataUris.length !== 1 ? "s" : ""}</td></tr>`
        : ""
    }
    ${
      protocol.location
        ? `<tr><td>Standort</td><td>${protocol.location.address || `${protocol.location.latitude.toFixed(5)}, ${protocol.location.longitude.toFixed(5)}`}</td></tr>`
        : ""
    }
    ${
      protocol.weather
        ? `<tr><td>Wetter</td><td>${protocol.weather}</td></tr>`
        : ""
    }
  </table>

  ${todos.length > 0 ? `
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

  ${protocol.signatures && protocol.signatures.length > 0 ? `
  <div style="margin-top: 30px; page-break-inside: avoid;">
    <h3 style="font-size: 14px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px;">Unterschriften</h3>
    <div style="display: flex; flex-wrap: wrap; gap: 20px;">
      ${protocol.signatures.map(sig => `
        <div style="border: 1px solid #eee; border-radius: 8px; padding: 12px; background: #fafafa;">
          <div style="font-size: 12px; font-weight: 600; color: #333; margin-bottom: 6px;">${sig.role}</div>
          <svg xmlns="http://www.w3.org/2000/svg" width="250" height="100" viewBox="0 0 340 200" style="max-width: 100%; border-bottom: 1px solid #ddd;">
            ${sig.paths.map(d => `<path d="${d}" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n            ')}
          </svg>
          <div style="font-size: 10px; color: #888; margin-top: 6px;">${sig.signedAt}</div>
        </div>
      `).join('')}
    </div>
  </div>
  ` : protocol.signaturePaths && protocol.signaturePaths.length > 0 ? `
  <div style="margin-top: 30px; page-break-inside: avoid;">
    <h3 style="font-size: 14px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px;">Unterschrift</h3>
    <div style="border: 1px solid #eee; border-radius: 8px; padding: 12px; background: #fafafa; display: inline-block;">
      <svg xmlns="http://www.w3.org/2000/svg" width="300" height="120" viewBox="0 0 340 200" style="max-width: 100%;">
        ${protocol.signaturePaths.map(d => `<path d="${d}" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n        ')}
      </svg>
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
  try {
    const brandingStr = await AsyncStorage.getItem("pdf-branding");
    if (brandingStr) {
      const branding = JSON.parse(brandingStr);
      if (branding.accentColor) accentColor = branding.accentColor;
    }
  } catch {}
  return generatePdfHtml(protocol, company, photoDataUris, planImageBase64, accentColor);
}

export async function generateProtocolPdf(protocol: PdfProtocol): Promise<string> {
  // Load company settings
  const company = await loadCompanySettings();

  // Convert photos to base64 data URIs
  const photoDataUris: string[] = [];
  if (protocol.photos && protocol.photos.length > 0) {
    for (const photoUri of protocol.photos) {
      const dataUri = await fileToBase64DataUri(photoUri);
      if (dataUri) {
        photoDataUris.push(dataUri);
      }
    }
  }

  // Convert plan image to base64 if available
  let planImageBase64: string | null = null;
  if (protocol.planData?.planImageUri) {
    planImageBase64 = await fileToBase64DataUri(protocol.planData.planImageUri);
  }

  // Load PDF branding accent color
  let accentColor: string | undefined;
  try {
    const brandingStr = await AsyncStorage.getItem("pdf-branding");
    if (brandingStr) {
      const branding = JSON.parse(brandingStr);
      if (branding.accentColor) accentColor = branding.accentColor;
    }
  } catch {}

  // Generate HTML
  const html = generatePdfHtml(protocol, company, photoDataUris, planImageBase64, accentColor);

  // Generate PDF
  const { uri } = await Print.printToFileAsync({
    html,
    margins: {
      left: 20,
      top: 20,
      right: 20,
      bottom: 30,
    },
  });

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
