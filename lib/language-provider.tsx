import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { translations, type Language, type TranslationKey } from "@/lib/i18n";
import { decodeUnicodeEscapes } from "@/lib/display-text";

const LANGUAGE_KEY = "app_language";
const SUPPORTED_LANGUAGES: Language[] = ["de", "en", "fr", "es", "uk", "pl", "ru", "ro", "bg", "tr"];

// Map a device region/country code to a supported app language, used when the
// phone's UI language itself isn't one we support.
const REGION_TO_LANGUAGE: Record<string, Language> = {
  DE: "de", AT: "de", CH: "de", LI: "de",
  GB: "en", US: "en", IE: "en", AU: "en", CA: "en", NZ: "en",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es",
  EC: "es", GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es",
  SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es",
  UA: "uk",
  PL: "pl",
  RU: "ru", BY: "ru", KZ: "ru",
  RO: "ro", MD: "ro",
  BG: "bg",
  TR: "tr", CY: "tr",
};

function detectDeviceLanguage(): Language {
  try {
    const locales = getLocales();
    if (locales && locales.length > 0) {
      // 1) Prefer the phone's UI language when we support it.
      const code = locales[0].languageCode?.toLowerCase();
      if (code && SUPPORTED_LANGUAGES.includes(code as Language)) {
        return code as Language;
      }
      // 2) Otherwise fall back to the country/region the device is set to.
      const region = (locales[0].regionCode || "").toUpperCase();
      if (region && REGION_TO_LANGUAGE[region]) {
        return REGION_TO_LANGUAGE[region];
      }
    }
  } catch {}
  return "de";
}

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "de",
  setLanguage: async () => {},
  t: (key) => decodeUnicodeEscapes(translations.de[key] || key),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Standard immer Deutsch; eine zuvor gespeicherte Auswahl ueberschreibt dies im Effect unten.
  const [language, setLang] = useState<Language>("de");

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (stored && SUPPORTED_LANGUAGES.includes(stored as Language)) {
          // A previously chosen language always wins.
          setLang(stored as Language);
        } else {
          // First launch: auto-select by device language/country. Not persisted
          // yet, so the onboarding language step can still confirm or change it.
          setLang(detectDeviceLanguage());
        }
      } catch {}
    })();
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    if (SUPPORTED_LANGUAGES.includes(lang)) {
      setLang(lang);
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return decodeUnicodeEscapes(
        (translations[language] as any)?.[key] || (translations.de as any)[key] || key,
      );
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}

export { SUPPORTED_LANGUAGES };
