"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultLocale,
  isLocale,
  localeDirection,
  type Locale,
} from "./locales";
import { getDictionary, type MessageKey } from "./dictionaries/common";

interface I18nValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: (key: MessageKey) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

const COOKIE = "NEXT_LOCALE";

function readInitialLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  return isLocale(match?.[1]) ? match[1] : defaultLocale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);
  const dict = useMemo(() => getDictionary(locale), [locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: localeDirection[locale],
      t: (key) => dict[key],
      setLocale: (next) => {
        document.cookie = `${COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
        document.documentElement.lang = next;
        document.documentElement.dir = localeDirection[next];
        setLocaleState(next);
      },
    }),
    [locale, dict],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Convenience hook for just the translator. */
export function useT() {
  return useI18n().t;
}
