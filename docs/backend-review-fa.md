# بررسی ساختار بک‌اند — وضعیت واقعی و آمادگی برای فرانت‌اند

> تاریخ بررسی: ۲۰۲۶-۰۸-۲۴
> کامیت مبنا: `1c11158` (شاخهٔ کاری `arena/01a032fb-my-agent-backend`)
> تمام اعداد و خطاهای این سند با اجرای واقعی دستور در همین مخزن به‌دست آمده، نه با حدس.

---

## ۱) خلاصهٔ یک‌خطی

**دیتامادل (Prisma schema) کامل و حرفه‌ای است، اما لایهٔ کد تقریباً نصفه‌نیمه است و بک‌اند در حال حاضر اصلاً کامپایل نمی‌شود.**
رفتن به فرانت‌اند در این وضعیت یعنی ساختن UI روی API‌ای که وجود خارجی ندارد.

---

## ۲) آنچه در مخزن هست

```
my-agent-backend/
└── backend/                     ← کل پروژه فقط همین یک پوشه است
    ├── prisma/schema.prisma     1914 خط — 74 مدل + 41 enum  ✅ کامل
    ├── prisma/seed.ts            513 خط — RBAC + دیتای مرجع کاتالوگ  ✅
    ├── src/                     24 فایل TypeScript (حدود 1400 خط)   ⚠️ ناقص
    ├── package.json             NestJS 11 + Prisma 6 + ioredis + helmet
    ├── Dockerfile               multi-stage، non-root، healthcheck
    ├── .env.example             بسیار کامل و مستند  ✅
    ├── nest-cli.json / tsconfig.json
    └── (بدون README، بدون docs، بدون test، بدون .gitignore)
```

**تعداد endpoint موجود: ۴۰ روت در ۱۲ کلاس کنترلر (۷ فایل)، فقط در ۷ دامنهٔ بیزینسی**
(auth, cart, wishlist, reviews, users, payments, notifications) + ۲ گروه مسیر `admin` و `catalog`.

---

## ۳) مشکل اصلی — ۶۱ فایل import شده ولی وجود ندارد

اجرای واقعی:

```
$ npx tsc --noEmit -p tsconfig.json
TOTAL ERRORS: 137
    110 error TS2307   ← Cannot find module
     19 error TS7006   ← implicitly has 'any' type (پیامد همان فایل‌های غایب)
      6 error TS2339   ← Property does not exist
      2 error TS2694   ← Prisma.ReviewWhereInput (client تولید نشده)

منحصربه‌فرد ماژول‌های گم‌شده: 61
فایل‌های دارای import شکسته: 21 از 24 فایل موجود
```

فقط ۳ فایل سالم‌اند: `auth/dto/auth.dto.ts`، `users/users.module.ts`، `common/interceptors/logging.interceptor.ts`.

### ۳-۱) زیرساخت کاملاً غایب (هیچ‌کدام وجود ندارند)

| مسیر | نقش |
|---|---|
| `src/config/app-config.service.ts` + `app-config.module.ts` | کل پیکربندی از env |
| `src/shared/prisma/prisma.service.ts` + `.module.ts` | اتصال دیتابیس |
| `src/shared/redis/redis.service.ts` + `.module.ts` | کش، OTP، rate limit |
| `src/app.setup.ts` | CORS، helmet، ValidationPipe، Swagger، پیشوند `api/v1` |
| `src/common/errors/app-error.ts` | کلاس خطای سراسری |
| `src/common/errors/error-codes.ts` | **۱۲ کلید** استفاده شده ولی تعریف نشده |
| `src/common/decorators/auth.decorators.ts` | `@Public`, `@CurrentUser`, `@Permissions`, `AuthenticatedUser` |
| `src/common/dto/pagination.dto.ts` | `PaginationDto` + تابع `paginated()` |
| `src/common/rate-limit/rate-limit.guard.ts` + `rate-limits.ts` | ۹ باکت rate limit |
| `src/common/guards/permissions.guard.ts` | guard سراسری مجوزها (در `app.module` ثبت شده) |

### ۳-۲) ماژول‌های بیزینسی غایب (۲۱ ماژول در `app.module.ts` ثبت شده‌اند ولی فایل ندارند)

`health`, `providers`, `audit`, `rbac`, `identity`, `files`, `pricing`, `campaigns`,
`inventory`, `catalog`, `shipping`, `refunds`, `checkout`, `returns`, `system`,
`reports`, `jobs`, `notifications/notification.module`, `coupons/coupon.service`,
`coupons/coupons-admin.controller`, `orders/order.service` + `order.controller`

و سرویس‌های غایب داخل ماژول‌های موجود:
`auth/otp.service.ts`, `auth/session.service.ts`, `auth/recovery.service.ts`,
`payments/payment.service.ts`, `notifications/notification.service.ts`,
`notifications/dispatcher.service.ts`, `providers/payment/*` (mock + zarinpal),
`providers/http.service.ts`, `system/features.service.ts`

> ⚠️ نکتهٔ ظریف: در پوشهٔ `notifications` دو ماژول متفاوت import شده —
> `notification.module` (core، غایب) و `notifications.module` (موجود).
> همین‌طور `notification.service` (سینگولار) در کنترلر و `dispatcher.service` در ماژول.
> احتمالاً خطای سهوی در نام‌گذاری است و باید یکدست شود.

---

## ۴) مشکلات بلوکه‌کنندهٔ ابزارها (جدا از کد)

| ابزار | وضعیت | علت تأییدشده |
|---|---|---|
| `npm run build` / `start:dev` | ❌ | `nest-cli.json` به `tsconfig.build.json` اشاره می‌کند که وجود نداشت → **در این بررسی ساخته شد** |
| `npm test` | ❌ | jest به `setupFiles: ["<rootDir>/test-setup.ts"]` اشاره می‌کند؛ `rootDir=src` و فایل `src/test-setup.ts` وجود ندارد. ضمناً **صفر فایل `.spec.ts`** در پروژه |
| `npm run infra:setup` | ❌ | `scripts/devbox.sh` وجود ندارد |
| `prisma migrate deploy` | ❌ | پوشهٔ `prisma/migrations/` وجود ندارد — هیچ migration ثبت نشده |
| `Dockerfile` HEALTHCHECK | ❌ | به `/api/v1/health/live` می‌زند ولی `HealthModule` غایب است → کانتینر همیشه unhealthy |
| `npm ci` در Docker | ⚠️ | به `package-lock.json` commit‌شده نیاز دارد که untracked بود |
| `Dockerfile` build | ❌ | `RUN npm run build` به‌خاطر ۱۳۷ خطای TS شکست می‌خورد |

---

## ۵) باگ‌های منطقی که با خواندن کد پیدا شد

1. **`review.moderate` در seed تعریف نشده.** کنترلر `AdminReviewsController` روی دو روت
   `@Permissions('review.moderate')` دارد، ولی در `PERMISSIONS` داخل `prisma/seed.ts`
   این slug وجود ندارد (`grep -n "review.moderate" prisma/seed.ts` → خالی).
   نتیجه: صف مدیریت نظرات برای **همه** حتی SUPER_ADMIN خطای 403 می‌دهد.
   (`user.manage` تأیید شد که در خط ۶۲ seed وجود دارد — آن یکی سالم است.)

2. **هدایت سخت‌کدشدهٔ فرانت داخل بک‌اند.**
   `payments.controller.ts:43`:
   ```ts
   res.redirect(302, `/payment-result?status=${base}${orderNumber ? `&order=${orderNumber}` : ''}`);
   ```
   مسیر نسبی است. اگر فرانت روی origin دیگری باشد (که در حالت توسعه هست: CORS روی
   `localhost:5173` باز است) ریدایرکت به دامنهٔ خود بک‌اند می‌رود و کاربر صفحهٔ نتیجهٔ
   پرداخت را نمی‌بیند. باید به `PUBLIC_BASE_URL` یا یک متغیر `FRONTEND_BASE_URL` وصل شود.

3. **متغیر مرده در `auth.controller.ts:30`.**
   `const secure = (req as Request & { secure?: boolean }).secure ?? false;` محاسبه می‌شود
   و هرگز استفاده نمی‌شود؛ دو خط بعد `secure: this.appConfig.authCookieSecure` پاس داده می‌شود.

4. **کد مرده در `AdminSessionController.revoke`.** یک `await import('../../shared/prisma/prisma.service')`
   انجام می‌شود و نتیجه به `revokeForUser(..., _Prisma)` پاس داده می‌شود که آن را نادیده می‌گیرد.

5. **هدر schema قدیمی و متناقض است.** بالای `prisma/schema.prisma` نوشته:
   «PHASE 1: IDENTITY + CATALOG … NO inventory/cart/orders/payments/shipping/returns/
   refunds/coupons/reviews/wishlist/notifications/reports models».
   در عمل schema **همهٔ اینها را دارد** (۷۴ مدل). کامنت گمراه‌کننده است.

6. **کامنت‌های SQL/trigger بدون پیاده‌سازی.** در schema بارها به «CHECK constraints»،
   «DB trigger» و «append-only (trigger)» ارجاع شده، ولی هیچ migration و هیچ
   `$executeRaw` مربوطه‌ای در `src` وجود ندارد. یعنی این تضمین‌ها فعلاً فقط روی کاغذند.

---

## ۶) شکاف حیاتی برای فرانت‌اند

از ۴۰ روت موجود، **هیچ‌کدام برای ویترین فروشگاهی کافی نیست**:

| فرانت نیاز دارد | وضعیت بک‌اند |
|---|---|
| لیست/جستجوی محصولات، فیلتر، صفحهٔ محصول | ❌ `CatalogModule` غایب — **صفر endpoint** |
| دسته‌بندی‌ها، برندها، کالکشن‌ها | ❌ غایب (فقط در seed هست) |
| رنگ/سایز/ویژگی‌های محصول | ❌ غایب |
| قیمت (campaign/sale) | ❌ `PricingService` غایب |
| ثبت سفارش / checkout | ❌ `CheckoutModule` و `OrderService` غایب |
| لیست سفارش‌های من / جزئیات سفارش | ❌ `order.controller` غایب |
| آدرس‌ها و روش‌های ارسال | ❌ `ShippingModule` غایب |
| مرجوعی / بازپرداخت | ❌ غایب |
| آپلود تصویر | ❌ `FilesModule` غایب |
| پنل ادمین کاتالوگ (CRUD) | ❌ غایب |
| Health check | ❌ غایب |

تنها endpoint کاتالوگی که هست: `GET /catalog/products/:productId/reviews` (نظرات یک محصول).

---

## ۷) قراردادهایی که فرانت باید بداند (از کد موجود استخراج شد)

**پیشوند API:** `api/v1` (از healthcheck داکر: `/api/v1/health/live`) — ولی چون `app.setup.ts`
غایب است، این هنوز در کد پیاده نشده و باید قطعی شود.

**احراز هویت:** `Authorization: Bearer <accessToken>`، سشن با JWT.
- `POST /auth/otp/request` → `{ phone }` (فرمت `+989xxxxxxxxx`)
- `POST /auth/otp/verify` → `{ phone, code(6 رقم), deviceKind?, deviceName? }`
  → خروجی `{ accessToken, expiresIn, refreshToken?, userId, roles[] }`
  → در وب، refresh token در کوکیٔ HttpOnly با `path=/api/v1/auth` و `sameSite=lax`
- `POST /auth/refresh` (بدون body در وب — کوکی خوانده می‌شود)

**shape لازم برای `AppConfigService`** (اعضایی که کد موجود واقعاً صدا می‌زند):
`port`, `nodeEnv`, `isProduction`, `swaggerEnabled`, `jwtAccessSecret`, `authCookieSecure`,
`paymentProvider`, `business.maxQtyPerOrderLine`, `business.maxCartItems`, `uploads.maxImagesPerReview`

**۱۲ کلید لازم در `ErrorCodes`:**
`UNAUTHORIZED`, `SESSION_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `USER_BLOCKED`,
`PRODUCT_NOT_AVAILABLE`, `CART_ITEM_LIMIT`, `REVIEW_DUPLICATE`, `REVIEW_PURCHASE_REQUIRED`,
`FILE_REJECTED`, `SYSTEM_FEATURE_DISABLED` (+ رشتهٔ `'common.validation_error'`)

**۹ باکت rate limit:** `otp.request`, `otp.verify`, `session.refresh`, `recovery.request`,
`recovery.confirm`, `coupon.validate`, `payment.callback`, `payment.initiate`, `review.create`

**پول:** همیشه `Integer` به **تومان** (نه ریال، نه اعشار). در سبد خرید قیمت‌ها
`displayOnly: true` هستند و هرگز منبع حقیقت نیستند — مبلغ نهایی فقط در تراکنش checkout.

---

## ۸) محدودیت‌های این محیط (صادقانه)

- شبکهٔ این سندباکس **فقط به npm registry** می‌رسد. تأییدشده:
  `registry.npmjs.org → 200`، ولی `binaries.prisma.sh → SSL_ERROR_SYSCALL`.
  بنابراین **`prisma validate` / `prisma generate` / `prisma migrate` اینجا قابل اجرا نیست**
  و سلامت schema تأیید نشد (فقط با خواندن متن بررسی شد).
- `psql`, `postgres`, `redis-server`, `docker` — هیچ‌کدام روی PATH نیستند. پس اجرای واقعی
  سرور و تست endpoint‌ها در این محیط ممکن نبود.
- آنچه **اجرا و تأیید شد**: `npm install` (۷۳۲ پکیج، موفق) و `npx tsc --noEmit` (۱۳۷ خطا).

---

## ۹) کارهایی که در همین بررسی انجام شد

1. **`.gitignore` ریشه ساخته شد.** پیش از این هیچ `.gitignore` وجود نداشت و
   `node_modules` (۴۰۶ مگابایت، ۳۲٬۵۵۵ فایل)، `dist/` و `package-lock.json` همگی
   untracked بودند. بعد از افزودن، `git status` فقط سه فایل جدید را نشان می‌دهد.
2. **`backend/tsconfig.build.json` ساخته شد.** `nest-cli.json` از قبل به آن ارجاع
   می‌داد؛ با `npx tsc --noEmit -p tsconfig.build.json` تأیید شد که معتبر است
   و `src` را پوشش می‌دهد (همان ۱۳۷ خطا را گزارش می‌کند).

---

## ۱۰) پیشنهاد مسیر

**گزینه A — اول بک‌اند را قابل‌اجرا کنیم (پیشنهاد من).**
ساخت ۶۱ فایل در ۴ لایهٔ ترتیبی:
1. زیرساخت: `app-config`, `prisma`, `redis`, `errors`, `decorators`, `pagination`, `rate-limit`, `app.setup` → هدف: `tsc` سبز و سرور بالا بیاید
2. `health` + `audit` + `providers` + `system` → هدف: healthcheck داکر کار کند
3. `pricing` + `inventory` + `catalog` → هدف: **فرانت ویترین** بتواند شروع شود
4. `checkout` + `orders` + `payments` + `shipping` + بقیه

**گزینه B — قرارداد API را فریز کنیم و موازی پیش برویم.**
من یک `openapi.yaml` کامل می‌نویسم (شامل همهٔ endpoint‌های آینده)، فرانت روی آن با
mock server ساخته می‌شود، و بک‌اند بعداً به همان قرارداد پیاده می‌شود.
ریسک: drift بین قرارداد و پیاده‌سازی.

**گزینه C — فقط حداقلِ ویترین.**
زیرساخت + `catalog` + `pricing` + `health` ساخته شود تا فرانت صفحهٔ اصلی، لیست و
جزئیات محصول را بسازد؛ بقیهٔ بک‌اند بعداً.

---

# پیوست — گزارش پیشرفت (مسیر A انتخاب شد)

> انتخاب‌های قطعی‌شده: **مسیر A** (اول بک‌اند قابل‌اجرا شود) · فرانت **Next.js App Router** · دامنه **ویترین + پنل ادمین**

## اندازه‌گیری واقعی پیشرفت

| سنجه | قبل | بعد |
|---|---|---|
| خطای `npx tsc --noEmit -p tsconfig.json` | **137** | **63** |
| ماژول گم‌شده (TS2307) | **61** | **36** |
| خطای غیر از «ماژول گم‌شده» | 27 | 22 |

**28 فایل جدید، 2153 خط کد.**

نکتهٔ مهم دربارهٔ ۲۲ خطای باقی‌مانده: **همه** یا `TS7006` هستند (۲۰ مورد) یا `TS2694` (۲ مورد)
و همگی روی پارامترهای callback پریزما نشسته‌اند — دقیقاً `tx` (۷)، `r` (۶)، `c` (۲)، و
`e`, `i`, `m`, `p`, `u` (هرکدام ۱). علتش این است که `@prisma/client` هنوز `generate` نشده،
پس `PrismaClient` هیچ تایپ مدلی ندارد و نتیجهٔ کوئری‌ها `any` است.
**این خطاها در کد من نیستند و با `npm run prisma:generate` روی ماشین دارای شبکه حذف می‌شوند** —
اما چون در این سندباکس قابل اجرا نیست، این ادعا **تأییدشده نیست** و فقط استنتاج است.

## لایهٔ ۱ — زیرساخت (کامل ✅)

| فایل | نقش |
|---|---|
| `config/app-config.service.ts` | نمای تایپ‌شدهٔ env؛ در production اگر secret کمتر از ۳۲ کاراکتر یا `change-me` باشد **در boot خطا می‌دهد** |
| `config/app-config.module.ts` | بارگذاری `.env.<NODE_ENV>` سپس `.env` |
| `shared/prisma/prisma.{service,module}.ts` | یک `PrismaClient` برای کل پروسه + لاگ کوئری کند (>۲۰۰ms) |
| `shared/redis/redis.{service,module}.ts` | با سیاست تنزیل صریح: `lazyConnect`، `enableOfflineQueue:false`، و جدا کردن fail-open از fail-closed |
| `common/errors/error-codes.ts` | ۵۸ کد خطا به‌صورت **قرارداد عمومی** (فرانت روی `code` سوییچ می‌کند، نه `message`) |
| `common/errors/app-error.ts` | کلاس خطا + کارخانه‌های 400/401/403/404/409/422/429/500/503 |
| `common/filters/all-exceptions.filter.ts` | پاکت یکتای خطا؛ خطاهای 5xx هرگز جزئیات داخلی را لو نمی‌دهند؛ `P2002/P2025/P2003/P2012` پریزما به کد دامنه ترجمه می‌شوند |
| `common/decorators/auth.decorators.ts` | `@Public`, `@Permissions`, `@CurrentUser`, `AuthenticatedUser` |
| `common/dto/pagination.dto.ts` | `PaginationDto` + `paginated()` با پاکت `{items,total,page,pageSize,totalPages,hasNext,hasPrev}` |
| `common/rate-limit/rate-limits.ts` | ۹ باکت + `default`، هرکدام با scope مشخص (`ip`/`user`/`phone`) |
| `common/rate-limit/rate-limit.guard.ts` | ثابت‌پنجره روی Redis؛ **fail-open** با لاگ (rate limit کنترل abuse است نه authorization) |
| `common/guards/permissions.guard.ts` | **بازنویسی‌شده** — نقش و مجوز از هم تفکیک شدند (توضیح پایین) |
| `common/middleware/request-id.middleware.ts` | `x-request-id`؛ ورودی معتبر بازاستفاده می‌شود، وگرنه UUIDv4 |
| `src/types/express.d.ts` | augmentation برای `request.user` و `request.requestId` |
| `src/app.setup.ts` | ترتیب deliberate: trust proxy → request id → helmet → CORS → cookies → prefix → validation → filter → logging → Swagger → static |
| `src/test-setup.ts` | فایل setup جِست که وجود نداشت و `npm test` را می‌شکست |

### سه تصمیم طراحی که عمداً گرفته شد

1. **`PermissionsGuard` در کد اصلی غلط بود.** نسخهٔ اولیه `user.roles.includes(permission)`
   را چک می‌کرد، ولی `roles` داخل JWT شامل `CUSTOMER`/`SUPER_ADMIN` است نه `user.manage`.
   یعنی هر روت ادمین برای همه 403 می‌شد. حالا مجوزها از گراف
   `Role → RolePermission → Permission` خوانده و ۶۰ ثانیه در Redis کش می‌شوند،
   با `invalidate(userId)` برای اعمال فوری تغییرات.
2. **خواندن خام `x-forwarded-for` حذف شد.** نسخهٔ اولیهٔ rate-limit هدر را مستقیم
   می‌خواند که به هر کلاینت اجازه می‌داد با یک هدر جعلی از محدودیت فرار کند.
   حالا فقط `request.ip` استفاده می‌شود که Express آن را تنها در صورت تنظیم
   `trust proxy` از هدر می‌گیرد.
3. **Redis fail-open فقط برای rate limit.** OTP و lockها fail-closed هستند:
   اگر Redis نباشد، OTP با 503 رد می‌شود چون بدون Redis نمی‌توان «یک‌بارمصرف بودن» را تضمین کرد.

## لایهٔ ۲ — احراز هویت و provider‌ها (کامل ✅)

`providers/http.service.ts` (fetch با timeout و JSON parse که throw نمی‌کند)،
`providers/sms/*` (port + console + kavenegar)، `providers/email/*` (port + console)،
`providers/providers.module.ts` (انتخاب provider در boot؛ `console` در production **خطا می‌دهد**)،
`auth/otp.service.ts`، `auth/session.service.ts`، `auth/recovery.service.ts`.

- **OTP:** کد فقط در Redis، HMAC با pepper، TTL؛ verify اتمیک و یک‌بارمصرف؛
  شمارندهٔ تلاش جدا از خود کد؛ مقایسه با `timingSafeEqual`.
- **Session:** چرخش refresh token + **تشخیص استفادهٔ مجدد** — اگر توکنِ چرخش‌یافته
  ارائه شود، کل family باطل می‌شود.
- **Recovery:** `request()` همیشه موفق برمی‌گردد (امکان enumerate کردن حساب وجود ندارد)؛
  در `confirm()` همهٔ سشن‌ها باطل می‌شوند چون شمارهٔ قبلی ممکن است لو رفته باشد.

## باگ‌های گزارش‌شده که اصلاح شدند

| # | باگ | وضعیت |
|---|---|---|
| 1 | `review.moderate` در seed نبود → صف نظرات برای همه 403 | ✅ اضافه شد (+ `review.read`) |
| 2 | ریدایرکت نسبی `/payment-result` داخل بک‌اند | ✅ به `FRONTEND_BASE_URL` وصل شد + `encodeURIComponent` روی شمارهٔ سفارش |
| 3 | متغیر مردهٔ `secure` در `auth.controller.ts` | ✅ حذف شد |
| 4 | `await import()` مرده در `AdminSessionController` | ✅ حذف شد + مالکیت حالا در خود کوئری اعمال می‌شود |
| 5 | `tsconfig.build.json` غایب → `nest build` شکست | ✅ ساخته شد |
| 6 | `src/test-setup.ts` غایب → `npm test` شکست | ✅ ساخته شد |
| 7 | نبود `.gitignore` (۴۰۶MB در معرض commit) | ✅ ساخته شد |
| 8 | `API_PREFIX=api` با healthcheck داکر (`/api/v1/...`) و مسیر کوکی (`/api/v1/auth`) نمی‌خواند | ✅ به `api/v1` اصلاح شد |
| 9 | `path` کوکی و `maxAge` هاردکد بودند | ✅ از config خوانده می‌شوند |

## چه چیزی هنوز مانده (۳۶ ماژول)

**اولویت برای ویترین Next.js:**
`health` → `audit` → `system` (FeatureFlag) → `pricing` → `inventory` → `catalog`

**بعد از آن:** `checkout`, `orders`, `payments` (+ provider‌ها), `shipping`, `coupons`,
`campaigns`, `notifications` (core + dispatcher), `rbac`, `identity`, `files`,
`refunds`, `returns`, `reports`, `jobs`

**یادآوری:** تا وقتی `catalog` ساخته نشود، فرانت هیچ دادهٔ محصولی برای نمایش ندارد.

---

# پیوست ۲ — پایان ساخت ۶۱ فایل غایب

## نتیجهٔ اندازه‌گیری‌شده

| سنجه | ابتدای جلسه | حالا |
|---|---|---|
| خطای `tsc --noEmit` | 137 | **103** |
| ماژول غایب (TS2307) | 61 (۱۱۰ خطا) | **۰** |
| خطای نحوی | ۵ | **۰** |
| کنترلر | 12 | **34** |
| endpoint | 40 | **111** |
| فایل TypeScript در `src` | 24 | **103** |

**۷۹ فایل جدید، ۸۱۴۹ خط کد** در این جلسه نوشته شد.

## ۱۰۳ خطای باقی‌مانده — همه از یک منشأ

```
84 × TS7006   پارامتر callback پریزما implicit any
14 × TS2694   Prisma.ProductWhereInput / JsonValue / InputJsonValue …
 4 × TS2305   import enum از @prisma/client (AuditActorType, NotificationType, …)
 1 × TS2339   Prisma.DbNull
────
103          ← هیچ‌کدام منطق برنامه نیستند
```

علت: `@prisma/client` هنوز `generate` نشده، پس `PrismaClient` هیچ تایپ مدلی ندارد.
**این با `npm run prisma:generate` برطرف می‌شود** — اما:

> ⚠️ **تأیید نشده.** در این سندباکس اجرا نشد. چهار روش امتحان شد و همه به
> `binaries.prisma.sh` خوردند (بسته است):
> `prisma generate` · `--no-engine` · `engineType="wasm"` ·
> `PRISMA_GENERATE_NO_ENGINE=1 PRISMA_CLIENT_FORCE_WASM=1`
> موتورهای WASM داخل خود پکیج هستند (`node_modules/prisma/build/*.wasm`) ولی
> Prisma 6.19.3 همچنان برای اعتبارسنجی schema اصرار به دانلود `schema-engine` دارد.

## سه انتخاب طراحی که بعد از نوشتن، خودم اصلاح کردم

1. **`PrismaReader` با `Pick` نوشته شده بود** → شکننده. به
   `PrismaService | Prisma.TransactionClient` تغییر کرد (اتحاد دو نوع واقعی در
   محل فراخوانی). این ۷ خطای TS2345 را حذف کرد.
2. **`reduce<T>()` روی آرایهٔ بدون تایپ** → TS2347. با `filter/map` تایپ‌شده
   جایگزین شد (۳ محل).
3. **`@Type()` روی پارامتر `@Query()`** → TS1239. این decorator یک
   `PropertyDecorator` است و روی پارامتر متد کار نمی‌کند. **دو بار این اشتباه را
   تکرار کردم** (اول در `catalog`، بعد دوباره در `reports`)؛ هر دو با بردن
   `limit` داخل یک DTO حل شدند.

## چهار باگی که با خواندن schema کشف و اصلاح شد

این‌ها را نمی‌شد با حدس نوشت — هر چهار مورد با مقایسهٔ کد و `schema.prisma` پیدا شدند:

| باگ | واقعیت schema |
|---|---|
| `IdempotencyRecord.responseRef` استفاده شده بود | چنین فیلدی نیست؛ `responseBody` (Json) و `expiresAt` **اجباری** است |
| `IdentityVerificationRequest.firstName/nationalCodeEncrypted/reviewedById` | واقعی: `nationalIdEncrypted` + `nationalIdHash` + `failureReason` + `requestedAt`/`verifiedAt`؛ **بدون هیچ فیلد نام** |
| `ReturnRequest` با `type: RETURN`، `status: PENDING`، `note`، `reviewNote` | واقعی: `type: REFUND\|EXCHANGE`، `status: REQUESTED`، `description`، `adminNote`، و `returnNumber` **اجباری و یکتا** |
| `ReturnItem.quantity` | واقعی: `requestedQuantity` + `approvedQuantity` |

## دو نکتهٔ مهم که حین کار یاد گرفتم

**۱. `npx tsc` در این محیط قابل اعتماد نیست.** یک بار خروجی «۰ خطا» داد که
کاملاً جعلی بود: `npx` به پکیج بی‌ربطی به نام `tsc` رسیده بود
(«This is not the tsc command you are looking for»). از آن لحظه به بعد همهٔ
اعداد با `./node_modules/.bin/tsc` گرفته شده‌اند.

**۲. `node_modules` بین tool call‌ها هم پاک می‌شود**، نه فقط بین turn‌ها.
پس هر بررسی‌ای که «سبز» به نظر می‌رسد باید با `ls node_modules/typescript`
تأیید شود.

**۳. تایپ‌اسکریپت وقتی خطای نحوی دارد، بررسی معنایی را رد می‌کند.**
یک بار به دلیل دو `}` اضافی، گزارش «۰ ماژول غایب» داد در حالی که ۳۶ ماژول
غایب بود. پس **اول خطای نحوی را صفر کن، بعد بقیه را بشمار.**

## چه چیزی ساخته شد (۲۰ ماژول)

**زیرساخت:** `config` · `shared/prisma` · `shared/redis` · `common/errors` ·
`common/decorators` · `common/dto` · `common/rate-limit` · `common/filters` ·
`common/middleware` · `permissions.guard` · `app.setup`

**بیزینس:** `health` · `audit` (hash-chained) · `system` (FeatureFlag + Settings) ·
`notifications` (core + dispatcher) · `providers` (http/sms/email/payment) ·
`auth` (otp/session/recovery) · `pricing` · `inventory` · `catalog` · `coupons` ·
`campaigns` · `shipping` · `orders` · `checkout` · `payments` · `returns` ·
`refunds` · `rbac` · `identity` (AES-256-GCM) · `files` · `reports` · `jobs`

## قدم بعدی — چیزهایی که هنوز **تأیید نشده‌اند**

1. `npm run prisma:generate` روی ماشین تو → باید ۱۰۳ خطا صفر شود
2. `prisma migrate dev` → هیچ migration‌ای وجود ندارد؛ باید ساخته شود
3. بالا آمدن واقعی سرور با Postgres + Redis
4. اجرای `npm run seed`
5. هیچ تستی نوشته نشده — `test/` خالی است

---

# پیوست ۳ — اولین اجرای واقعی کد (تست‌ها)

تا این نقطه هیچ‌کدام از کد **اجرا** نشده بود، فقط کامپایل. حالا:

```
$ npm test
Test Suites: 8 passed, 8 total
Tests:       80 passed, 80 total
```

| suite | چه چیزی را واقعاً اجرا می‌کند |
|---|---|
| `pricing.service.spec` | گردکردن نیمه‌بالا در تومان صحیح، `salePrice === basePrice` یعنی تخفیف نیست، `salePrice > basePrice` نادیده گرفته می‌شود، مسیر قیمت‌گذاری 409 می‌دهد |
| `shipping.service.spec` | FLAT در برابر WEIGHT_BASED، آستانهٔ ارسال رایگان در نقطهٔ دقیق، اولویت نرخ استانی بر نرخ کشوری |
| `coupon.service.spec` | سقف `maxDiscountAmount`، محدودیت هر کاربر، محدودیت سراسری، **یکسان بودن خطا برای کد نامعتبر/منقضی/تمام‌شده** (جلوگیری از enumeration) |
| `phone.spec` | هر شکل ورودی شمارهٔ موبایل → E.164، و idempotent بودن |
| `pagination.spec` | پاکت `{items,total,page,pageSize,totalPages,hasNext,hasPrev}` و تقسیم‌بر‌صفر |
| `app-error.spec` | جفت status/code هر کارخانه، و اینکه علت 500 به کلاینت نرسد |
| `rate-limits.spec` | **تست معماری**: هر `@RateLimit('x')` باید باکت داشته باشد (وگرنه در runtime همهٔ درخواست‌ها رد می‌شوند) |
| `env-loader.spec` | پارسر `.env` — و روی **فایل واقعی `.env.example`** اجرا می‌شود، نه نمونهٔ ساختگی |

## دو باگی که تست‌ها در کد خودم پیدا کردند

۱. **ترتیب آرگومان‌های `CouponService(prisma, config)` را برعکس پاس داده بودم.**
   تست‌های `validate` سبز می‌ماندند چون آن متد از `client` پارامتری استفاده می‌کند نه
   `this.prisma` — فقط `consume()` لو می‌داد. و **`as never` این خطا را از
   تایپ‌اسکریپت پنهان کرده بود.** نتیجه: `as never` در تست ممنوع.

۲. **تستِ slug‌ها مثال داخل JSDoc را هم پیدا می‌کرد** (`@Permissions('a','b')`
   در داکیومنتِ `permissions.guard`). حالا کامنت‌ها قبل از اسکن پاک می‌شوند.

## تغییر در پیکربندی jest

`ts-jest` با `diagnostics.warnOnly` تنظیم شد. دلیل: دروازهٔ واقعی تایپ،
`tsc --noEmit` است (که `npm run build` اجرا می‌کند) و آن به کلاینتِ generate‌شدهٔ
پریزما نیاز دارد. اگر ts-jest هم تایپ‌ها را چک کند، هر اجرای تست به‌خاطر
تایپ‌های پریزما شکست می‌خورد نه به‌خاطر رفتارِ تحت تست.

## ابزار راه‌اندازی ساخته شد

- **`backend/docker-compose.yml`** — Postgres 16 + Redis 7 با healthcheck
- **`backend/scripts/devbox.sh`** — همان چیزی که `npm run infra:setup` از قبل
  به آن ارجاع می‌داد ولی **وجود نداشت**. حالا: کانتینرها را بالا می‌آورد،
  `.env.development` را از example می‌سازد و **secret‌های واقعی با
  `openssl rand -hex 32` تولید می‌کند** (به‌جای ماندن `change-me`).
- **`prisma/env-loader.ts`** — پارسر `.env` از دل `seed.ts` بیرون کشیده شد تا
  قابل تست باشد. باگ قبلی: کامنت درون‌خطی را بخشی از مقدار می‌خواند، پس
  `DATABASE_URL` خراب از آب درمی‌آمد.

## وضعیت فعلی

```
tsc --noEmit     103 خطا  ← همه از @prisma/client generate‌نشده (بدون تغییر)
ماژول غایب         ۰
خطای نحوی          ۰
npm test          80/80 سبز  ← اولین اجرای واقعی کد
```

---

# پیوست ۴ — وضعیت نهایی (آماده برای فرانت)

```
tsc --noEmit        103 خطا  ← ۱۰۰٪ از @prisma/client generate‌نشده
  خطا در فایل تست       ۰
  ماژول غایب            ۰
  خطای نحوی             ۰

npm test             149/149 سبز در 13 suite
```

## تست‌های اضافه‌شده برای مسیر پول و امنیت

| suite | چه چیزی ثابت می‌شود |
|---|---|
| `payment.service.spec` | دو callback همزمان دو بار شارژ نمی‌کنند · **ریدایرکت درگاه به‌تنهایی پرداخت را قطعی نمی‌کند** · مبلغ متفاوت از سمت درگاه → رد · درگاه unreachable → سفارش OPEN می‌ماند نه حدس |
| `order.service.spec` | ماشین حالت: ۸ انتقال مجاز و ۷ انتقال غیرمجاز (مثل `PENDING_PAYMENT → SHIPPED`) · سفارش دیگری 404 می‌گیرد نه 403 |
| `inventory.service.spec` | اگر UPDATE شرطی هیچ سطری نگیرد → `INSUFFICIENT_STOCK` و هیچ رکوردی نوشته نمی‌شود · release دوبار اجرا شود فقط یک‌بار آزاد می‌کند · `available` هرگز منفی نیست |
| `permissions.guard.spec` | SUPER_ADMIN bypass · نقش‌ها با slug مجوز اشتباه گرفته نمی‌شوند · وقتی Redis خاموش است هم authorization درست کار می‌کند |
| `all-exceptions.filter.spec` | پیام 500 هرگز به کلاینت نمی‌رسد (حتی اگر شامل `password=` باشد) · `P2002/P2025` به کد دامنه ترجمه می‌شوند |

## سند قرارداد API ساخته شد

**`docs/api-reference-fa.md`** — از سورس واقعی استخراج شده:
۱۱۱ endpoint در ۱۹ گروه، با سطح دسترسی، DTO هر endpoint، و جدول فیلدها.
به‌علاوهٔ جریان لاگین، پاکت خطا، پاکت صفحه‌بندی، و ۶ نکتهٔ حیاتی برای فرانت.

## ۵ نکته‌ای که فرانت باید بداند

۱. **refresh token یک‌بارمصرف است.** اگر همزمان دو درخواست refresh بفرستید،
   کل خانوادهٔ سشن باطل می‌شود. در کلاینت mutex بگذارید.
۲. **`sizes` با LABEL فرستاده می‌شود نه slug** — مدل `Size` ستون slug ندارد.
۳. **کوکی فقط به `/api/v1/auth` می‌رود** → `fetch` باید `credentials: 'include'` داشته باشد.
۴. **ریدایرکت پرداخت را باور نکنید** — صفحهٔ نتیجه باید `POST /payments/verify`
   را صدا بزند و `orderStatus` را از پاسخ بخواند، نه از پارامتر URL.
۵. **روی `code` سوییچ کنید نه `message`.**

## تنها کار باقی‌مانده — روی ماشین تو

```bash
npm run infra:setup          # docker + generate + .env با secret واقعی
npm run prisma:migrate:dev   # ← هیچ migration‌ای وجود ندارد
npm run seed
npm run start:dev
```

**انتظار:** آن ۱۰۳ خطا صفر شود. **تأیید نشده** — `binaries.prisma.sh` در این
سندباکس بسته است و ۴ راه برای دور زدنش شکست خورد.

`prisma migrate dev` احتمالاً خطا می‌دهد: schema پر است از «partial unique
index»، «CHECK constraint» و «DB trigger» که Prisma خودش تولید نمی‌کند و باید
دستی در migration SQL نوشته شوند.
