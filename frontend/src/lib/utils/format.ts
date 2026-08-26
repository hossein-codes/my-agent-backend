/**
 * Formatting utilities.
 *
 * Money rule (non-negotiable): the backend stores and returns all money as
 * INTEGER TOMAN. The frontend must NEVER perform authoritative financial math
 * on these values (no `price * 0.1`, no floating-point discounts). This module
 * only DISPLAYS the integer the backend sends.
 */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert ASCII digits in a string to Persian digits. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] as string);
}

/** Reference color names (seeded catalog data) → Persian labels. */
const COLOR_FA: Record<string, string> = {
  black: "مشکی",
  white: "سفید",
  red: "قرمز",
  navy: "سرمه‌ای",
  gray: "طوسی",
  green: "سبز",
  beige: "بژ",
  brown: "قهوه‌ای",
  pink: "صورتی",
  yellow: "زرد",
};

/** Persian presentation for a color name; unknown names pass through. */
export function colorNameFa(name: string | null | undefined): string {
  if (!name) return "";
  return COLOR_FA[name.trim().toLowerCase()] ?? name;
}

/**
 * Group thousands for the default Persian display:
 * 1250000 → "۱٬۲۵۰٬۰۰۰" (Persian digits + Arabic thousands separator U+066C).
 */
function groupThousandsFa(value: number): string {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(
    value,
  );
}

/** Group thousands with Latin digits for English locale. */
function groupThousandsEn(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

/**
 * Format an integer Toman amount as a localized number string.
 * Persian (default): "۱٬۲۵۰٬۰۰۰" — English: "1,250,000".
 * Use when the "تومان" suffix is rendered separately.
 */
export function formatToman(value: number, locale: "fa" | "en" = "fa"): string {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    // Never silently render a fractional/NaN price — it signals a bug.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[formatToman] expected integer Toman, got: ${value}`);
    }
    const safe = Math.trunc(value || 0);
    return locale === "fa" ? toPersianDigits(safe) : String(safe);
  }
  return locale === "fa" ? groupThousandsFa(value) : groupThousandsEn(value);
}

/** Full localized Toman label: fa → "۱٬۲۵۰٬۰۰۰ تومان", en → "1,250,000 Toman". */
export function formatTomanWithCurrency(
  value: number,
  locale: "fa" | "en" = "fa",
): string {
  const unit = locale === "fa" ? "تومان" : "Toman";
  return `${formatToman(value, locale)} ${unit}`;
}

/**
 * Format a discount percentage (0–100) as a localized label.
 * Only display values the backend provides; never derive percentages here for
 * authoritative use.
 */
export function formatPercent(value: number, locale: "fa" | "en" = "fa"): string {
  return locale === "fa" ? `${toPersianDigits(value)}٪` : `${value}%`;
}

/** Format a plain integer (quantity, count) with localized digits. */
export function formatNumber(value: number, locale: "fa" | "en" = "fa"): string {
  return locale === "fa" ? toPersianDigits(value) : String(value);
}

/** Phone in E.164 → human-readable Iranian mobile: +989121234567 → "0912 123 4567". */
export function formatPhone(input: string): string {
  const normalized = input.replace(/\s+/g, "");
  const match = normalized.match(/^\+98(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `0${match[1]} ${match[2]} ${match[3]}`;
  }
  return input;
}

/** ISO date → localized Persian date string. */
export function formatDate(
  value: string | Date,
  locale = "fa-IR",
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/** ISO date → localized date + time. */
export function formatDateTime(
  value: string | Date,
  locale = "fa-IR",
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
