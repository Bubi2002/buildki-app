import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { translations, type Language, type TranslationKey } from "@/lib/i18n";

const LANGUAGE_KEY = "app_language";
const SUPPORTED_LANGUAGES: Language[] = ["de", "en", "fr"];

function detectDeviceLanguage(): Language {
  try {
    const locales = getLocales();
    if (locales && locales.length > 0) {
      const code = locales[0].languageCode?.toLowerCase();
      if (code && SUPPORTED_LANGUAGES.includes(code as Language)) {
        return code as Language;
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
  t: (key) => translations.de[key] || key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<Language>(detectDeviceLanguage());

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (stored && SUPPORTED_LANGUAGES.includes(stored as Language)) {
          setLang(stored as Language);
        }
      } catch {}
    })();
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLang(lang);
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return (translations[language] as any)?.[key] || (translations.de as any)[key] || key;
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
