import { defaultLocale, type Locale } from "../locales";

/**
 * Shared/transversal translation dictionary. Feature-specific strings live
 * alongside features in later phases. Keep keys flat and namespaced.
 * Using `as const` gives full key-safety without a heavy i18n dependency.
 */
const fa: Record<string, string> = {
  "app.name": "فروشگاه",
  "common.loading": "در حال بارگذاری…",
  "common.retry": "تلاش دوباره",
  "common.save": "ذخیره",
  "common.cancel": "انصراف",
  "common.confirm": "تأیید",
  "common.close": "بستن",
  "common.back": "بازگشت",
  "common.home": "خانه",
  "common.next": "بعدی",
  "common.previous": "قبلی",
  "common.search": "جستجو",
  "common.seeAll": "مشاهده همه",
  "common.yes": "بله",
  "common.no": "خیر",
  "state.empty.title": "موردی یافت نشد",
  "state.empty.description": "در حال حاضر چیزی برای نمایش وجود ندارد.",
  "state.error.title": "خطایی پیش آمد",
  "state.error.description": "لطفاً دوباره تلاش کنید.",
  "state.network.title": "اتصال برقرار نیست",
  "state.network.description": "اتصال اینترنت خود را بررسی کنید.",
  "state.forbidden.title": "دسترسی ندارید",
  "state.forbidden.description": "برای مشاهده این صفحه اجازه‌ی دسترسی ندارید.",
  "state.notfound.title": "صفحه پیدا نشد",
  "state.notfound.description": "صفحه‌ای که دنبالش بودید وجود ندارد یا جابه‌جا شده است.",
  "validation.required": "تکمیل این فیلد الزامی است.",
  "validation.invalid": "مقدار وارد شده معتبر نیست.",
  "validation.phone": "شماره موبایل باید با +98 شروع شود (مثال: +989121234567)",
  "validation.postalCode": "کد پستی باید ۱۰ رقم باشد.",
  "currency.toman": "تومان",
};

const en: Record<string, string> = {
  "app.name": "Store",
  "common.loading": "Loading…",
  "common.retry": "Retry",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.close": "Close",
  "common.back": "Back",
  "common.home": "Home",
  "common.next": "Next",
  "common.previous": "Previous",
  "common.search": "Search",
  "common.seeAll": "See all",
  "common.yes": "Yes",
  "common.no": "No",
  "state.empty.title": "Nothing found",
  "state.empty.description": "There is nothing to display right now.",
  "state.error.title": "Something went wrong",
  "state.error.description": "Please try again.",
  "state.network.title": "No connection",
  "state.network.description": "Check your internet connection.",
  "state.forbidden.title": "Access denied",
  "state.forbidden.description": "You are not allowed to view this page.",
  "state.notfound.title": "Page not found",
  "state.notfound.description": "The page you were looking for does not exist or has moved.",
  "validation.required": "This field is required.",
  "validation.invalid": "The entered value is invalid.",
  "validation.phone": "Phone must start with +98 (e.g. +989121234567)",
  "validation.postalCode": "Postal code must be 10 digits.",
  "currency.toman": "Toman",
};

/** Canonical set of translation keys (derived from the Persian dictionary). */
export type MessageKey =
  | "app.name"
  | "common.loading"
  | "common.retry"
  | "common.save"
  | "common.cancel"
  | "common.confirm"
  | "common.close"
  | "common.back"
  | "common.home"
  | "common.next"
  | "common.previous"
  | "common.search"
  | "common.seeAll"
  | "common.yes"
  | "common.no"
  | "state.empty.title"
  | "state.empty.description"
  | "state.error.title"
  | "state.error.description"
  | "state.network.title"
  | "state.network.description"
  | "state.forbidden.title"
  | "state.forbidden.description"
  | "state.notfound.title"
  | "state.notfound.description"
  | "validation.required"
  | "validation.invalid"
  | "validation.phone"
  | "validation.postalCode"
  | "currency.toman";

export const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  fa: fa as Record<MessageKey, string>,
  en: en as Record<MessageKey, string>,
};

export function getDictionary(locale: Locale = defaultLocale) {
  return dictionaries[locale];
}

export function translate(locale: Locale, key: MessageKey): string {
  return dictionaries[locale][key] ?? dictionaries[defaultLocale][key] ?? key;
}
