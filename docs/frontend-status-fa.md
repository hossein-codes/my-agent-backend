# وضعیت فرانت‌اند — اتصال به API واقعی برقرار شد

> تاریخ: ۲۰۲۶-۰۸-۲۶ · شاخهٔ `arena/01a039db-my-agent-backend`

## نتیجهٔ یک‌خطی

فرانت‌اند روی API واقعی بک‌اند سوار شد و در پیش‌نمایش Arena زنده است.
**زیرساخت کامل است؛ ۲۰ صفحه از ۲۲ صفحه هنوز Placeholder است و باید ساخته شوند.**

## آنچه در این مرحله انجام و تأیید شد

| مورد | نتیجه |
|---|---|
| `tsc --noEmit` فرانت | ۰ خطا |
| تست‌ها (vitest) | ۲۸/۲۸ پاس |
| صفحه اصلی با دیتای واقعی | دسته‌بندی‌ها، محصول و کمپین از API رندر شد ✅ |
| پروکسی same-origin | `/api/v1/*` از طریق سرور Next به بک‌اند می‌رود (بدون CORS) ✅ |
| لاگین OTP از طریق فرانت | request → verify → JWT + کوکی refresh ✅ |
| لاگین آزمایشی | `OTP_FIXED_CODE=123456` در بک‌اند (فقط dev) |

## تغییرات کد (کم و هدفمند)

1. **`src/lib/api/client.ts`** — سمت سرور (SSR/RSC) حالا از `API_BASE_URL` استفاده
   می‌کند و مرورگر از `NEXT_PUBLIC_API_URL`. قبلاً SSR هم آدرس عمومی را صدا
   می‌زد که در سناریوی «بک‌اند داخلی» (production) کار نمی‌کرد.
2. **`next.config.ts`** — با ست‌کردن `API_PROXY_TARGET`، روت‌های `/api/v1/*`
   توسط خود Next پروکسی می‌شوند؛ same-origin، بدون دردسر CORS و کوکی.
3. **`sandbox/`** — ابزارهای راه‌اندازی محیط پیش‌نمایش Arena (برای سیستم
   خودت لازم نیست؛ توضیح در `sandbox/README-fa.md`).

## env نمونه

```
# سیستم خودت (ویندوز):
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1
# یا برای پروکسی same-origin:  API_PROXY_TARGET=http://127.0.0.1:3000
```

## نقشهٔ صفحات — چی ساخته شده، چی مانده

| وضعیت | صفحه‌ها |
|---|---|
| ✅ کامل | `/` (خانه: هیرو، دسته‌ها، ریل محصولات، فلش‌سیل) |
| ⛔ Placeholder | `(auth)/login` · `(auth)/register` · `(auth)/verify` |
| ⛔ Placeholder | `products` (لیست+فیلتر) · `products/[slug]` (جزئیات) |
| ⛔ Placeholder | `categories` · `categories/[slug]` · `search` |
| ⛔ Placeholder | `campaigns/[slug]` · `wishlist` · `notifications` |
| ⛔ Placeholder | `cart` · `checkout` · `payment-result` |
| ⛔ Placeholder | `account` · `account/profile` · `account/orders` · `orders/[id]` · `account/addresses` · `account/wishlist` |

**زیرساخت آمادهٔ استفاده:** ۴۵ کامپوننت UI (شادکن/ردیکس)، لایهٔ feature کامل
(api + hooks + schemas) برای auth/cart/checkout/orders/products/…،
i18n فارسی، zustand + react-query، تست واکند و اسکلتون‌ها.

## پیشنهاد ترتیب ساخت

1. **احراز هویت** (`login` + `verify`) — همهٔ جریان‌های کاربر به آن وابسته‌اند؛
   لایهٔ auth (store/provider/api) از قبل کامل است.
2. **لیست محصولات + جزئیات** — بزرگ‌ترین ارزش فروشگاه؛ facets/فیلترها آماده است.
3. **سبد خرید** → **checkout** → **payment-result** — حلقهٔ پول.
4. حساب کاربری/سفارش‌ها/علاقه‌مندی‌ها.
