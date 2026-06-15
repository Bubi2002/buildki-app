import { useState, useEffect, useCallback } from "react";
import { getLanguage, setLanguage as setLangStorage, t as translate, type Language, type TranslationKey } from "@/lib/i18n";

/**
 * Hook for language management.
 * Returns current language, setter, and translation function.
 */
export function useLanguage() {
  const [language, setLang] = useState<Language>("de");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    const lang = await getLanguage();
    setLang(lang);
    setIsLoaded(true);
  };

  const setLanguage = useCallback(async (lang: Language) => {
    setLang(lang);
    await setLangStorage(lang);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translate(key, language);
  }, [language]);

  return { language, setLanguage, t, isLoaded };
}
