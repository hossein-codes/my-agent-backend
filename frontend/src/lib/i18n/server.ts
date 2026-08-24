import "server-only";
import { cookies } from "next/headers";
import {
  defaultLocale,
  isLocale,
  localeDirection,
  type Locale,
} from "./locales";
import { getDictionary, type MessageKey } from "./dictionaries/common";

/**
 * Server-side locale reader (Server Components / route handlers).
 * The locale is persisted in the NEXT_LOCALE cookie by the client provider.
 */
export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get("NEXT_LOCALE")?.value;
  return isLocale(value) ? value : defaultLocale;
}

export function getServerDirection(locale: Locale) {
  return localeDirection[locale];
}

export function getServerTranslator(locale: Locale) {
  const dict = getDictionary(locale);
  return (key: MessageKey) => dict[key];
}
