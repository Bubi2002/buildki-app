import * as FileSystem from "expo-file-system/legacy";

/**
 * iOS assigns a NEW app-container UUID on every app update/reinstall, so an
 * absolute path like file:///var/.../Application/<UUID>/Documents/… stops
 * resolving even though the file still lives in Documents. Re-anchor any stored
 * Documents-relative path onto the CURRENT documentDirectory before reading it,
 * so images (plans, photos, measurements, before/after) don't silently vanish
 * from the app and the PDFs after an update.
 *
 * No-op when the path already matches, isn't a file:// URI, or isn't under a
 * /Documents/ directory (e.g. a cache path, which can't be healed this way).
 */
export function resolveDocUri(uri: string): string {
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
