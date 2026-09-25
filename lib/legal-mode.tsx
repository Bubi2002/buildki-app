import { createContext } from "react";
import { LEGAL_DRAFT_MARKER } from "@/lib/legal-draft";

/**
 * Two legal modes: user-facing "Rechtliches" (clean) vs internal
 * compliance/release check (shows the draft banner + all open points).
 * Users must NEVER see the internal release warnings, so `false` (user) is the
 * default everywhere.
 */
export const LegalModeContext = createContext(false); // true = internal

/** Strip internal draft markers / "Prüfentwurf" wording for the user view. */
export function sanitizeLegal(text: string): string {
  return String(text)
    .split(LEGAL_DRAFT_MARKER).join("")
    .replace(/\s*\(\s*Prüfentwurf\s*\)\s*/gi, " ")
    .replace(/\s*[–-]\s*Prüfentwurf\b/gi, "")
    .replace(/\bPrüfentwurf\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s·:;,–-]+$/g, "")
    .trim();
}
