import { Platform } from "react-native";

export type PdfPageImage = { uri: string; width: number; height: number };

/**
 * Render every page of a PDF into an image using the native
 * `react-native-pdf-thumbnail` module (iOS PDFKit / Android PdfRenderer).
 *
 * Returns [] when the module isn't available (e.g. Expo Go / web / not yet in
 * the native build) or on any error, so callers can fall back to the
 * single-page expo-image rasterizer.
 */
export async function generatePdfPageImages(pdfUri: string): Promise<PdfPageImage[]> {
  if (Platform.OS === "web") return [];
  try {
    const mod: any = await import("react-native-pdf-thumbnail");
    const PdfThumbnail = mod?.default ?? mod;
    if (!PdfThumbnail?.generateAllPages) return [];
    // Android sometimes needs a plain path; iOS accepts the file:// URI.
    const path = Platform.OS === "android" ? pdfUri.replace(/^file:\/\//, "") : pdfUri;
    const results = await PdfThumbnail.generateAllPages(path, 80);
    if (!Array.isArray(results)) return [];
    return results
      .map((r: any) => ({
        uri: String(r?.uri || ""),
        width: Number(r?.width) || 0,
        height: Number(r?.height) || 0,
      }))
      .filter((r: PdfPageImage) => r.uri);
  } catch {
    return [];
  }
}
