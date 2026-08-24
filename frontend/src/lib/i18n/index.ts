// Client-safe exports only. Server helpers (which import next/headers) must
// be imported directly from "@/lib/i18n/server" so they never enter a client
// bundle through this barrel.
export { I18nProvider, useI18n, useT } from "./i18n-provider";
export {
  locales,
  defaultLocale,
  localeDirection,
  isLocale,
  getLocale,
  type Locale,
} from "./locales";
export { getDictionary, type MessageKey } from "./dictionaries/common";
