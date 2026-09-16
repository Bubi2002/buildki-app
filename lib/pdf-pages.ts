import * as FileSystem from "expo-file-system/legacy";

/**
 * Split a multi-page PDF into individual single-page PDF files (pure JS via
 * pdf-lib — no native module). Each returned file can then be rasterized to a
 * sharp image with the existing expo-image based PdfRasterizer.
 *
 * Returns [] on any failure so callers can fall back to single-page import.
 */
export async function splitPdfIntoPages(pdfUri: string): Promise<string[]> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const base64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const src = await PDFDocument.load(base64, { ignoreEncryption: true });
    const count = src.getPageCount();
    if (count <= 1) return []; // single page → let the normal path handle it

    const dir = `${FileSystem.cacheDirectory}pdf-pages/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

    const stamp = Date.now();
    const uris: string[] = [];
    for (let i = 0; i < count; i++) {
      const out = await PDFDocument.create();
      const [page] = await out.copyPages(src, [i]);
      out.addPage(page);
      const pageB64 = await out.saveAsBase64();
      const uri = `${dir}page-${stamp}-${i}.pdf`;
      await FileSystem.writeAsStringAsync(uri, pageB64, { encoding: FileSystem.EncodingType.Base64 });
      uris.push(uri);
    }
    return uris;
  } catch {
    return [];
  }
}

/** Number of pages in a PDF (0 on failure). */
export async function getPdfPageCount(pdfUri: string): Promise<number> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const base64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const src = await PDFDocument.load(base64, { ignoreEncryption: true });
    return src.getPageCount();
  } catch {
    return 0;
  }
}
