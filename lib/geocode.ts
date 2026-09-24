/**
 * Lightweight address autocomplete via Photon (photon.komoot.io), an
 * OpenStreetMap-based geocoder purpose-built for type-ahead search. It is free
 * and needs no API key. Results are only used to help the user fill an address
 * field they are already typing — no personal data is sent beyond that query.
 */
export type AddressSuggestion = { label: string };

const PHOTON_LANGS = new Set(["de", "en", "fr", "it"]);

export async function searchAddress(
  query: string,
  language = "de",
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 4) return [];
  const lang = PHOTON_LANGS.has(language) ? `&lang=${language}` : "";
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5${lang}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (!res.ok) return [];
    const data = await res.json();
    const features: any[] = Array.isArray(data?.features) ? data.features : [];
    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    for (const f of features) {
      const p = f?.properties || {};
      const street = [p.street, p.housenumber].filter(Boolean).join(" ");
      const city = [p.postcode, p.city || p.town || p.village || p.county].filter(Boolean).join(" ");
      const parts = [street || p.name, city, p.country].filter(Boolean);
      const label = parts.join(", ");
      if (label && !seen.has(label)) {
        seen.add(label);
        out.push({ label });
      }
    }
    return out;
  } catch {
    return [];
  }
}
