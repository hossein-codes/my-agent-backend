export const locales = ["fa", "en"] as const;
export const defaultLocale = "fa";
export type Locale = (typeof locales)[number];

export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  fa: "rtl",
  en: "ltr",
};

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}

/**
 * Read the active locale from the NEXT_LOCALE cookie set by the locale
 * switcher. Falls back to Persian (the primary product language).
 */
export function getLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  return isLocale(match?.[1]) ? match[1] : defaultLocale;
}
