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
  photoDataUris: string[]
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

  // Convert protocol text to HTML (handle line breaks and bullet points)
  const protocolHtml = protocol.protocol
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
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

  const photosHtml =
    photoDataUris.length > 0
      ? `
    <div style="page-break-before: auto; margin-top: 24px;">
      <h3 style="font-size: 14px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px;">
        Fotodokumentation (${photoDataUris.length} ${photoDataUris.length === 1 ? "Bild" : "Bilder"})
      </h3>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-start;">
        ${photoDataUris
          .map(
            (uri, i) => `
          <div style="width: 48%; margin-bottom: 12px;">
            <img src="${uri}" style="width: 100%; max-height: 220px; object-fit: contain; border: 1px solid #eee; border-radius: 4px;" />
            <p style="font-size: 9px; color: #888; margin-top: 4px; text-align: center;">Foto ${i + 1}</p>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `
      : "";

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
      border-bottom: 2px solid #E53935;
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

  ${photosHtml}

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

  // Generate HTML
  const html = generatePdfHtml(protocol, company, photoDataUris);

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

  return uri;
}
