import type { TranslationKey } from "./i18n";

/**
 * Resolve a localized label for a built-in item (protocol template, report type,
 * category). Built-in items carry i18n keys (ptpl_*, rtype_*, tplcat_*); when a
 * key is missing — e.g. a user-imported custom template — we fall back to the
 * German default that ships in the data file. `t(key)` returns the raw key when a
 * translation is absent, so comparing against the key detects that case.
 */
export function localizedLabel(
  t: (key: TranslationKey) => string,
  key: string,
  fallback: string,
): string {
  const value = t(key as TranslationKey);
  return !value || value === key ? fallback : value;
}

const sanitize = (id: string) => id.replace(/-/g, "_");

export const templateNameKey = (id: string) => `ptpl_${sanitize(id)}`;
export const templateDescKey = (id: string) => `ptpl_${sanitize(id)}_desc`;
export const reportTypeKey = (id: string) => `rtype_${sanitize(id)}`;
export const reportTypeDescKey = (id: string) => `rtype_${sanitize(id)}_desc`;
export const templateCategoryKey = (id: string) => `tplcat_${sanitize(id)}`;
