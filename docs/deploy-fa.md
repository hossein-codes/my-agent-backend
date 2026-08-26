# انتشار سایت: Vercel (فرانت) + Render (بک‌اند) + Neon (Postgres)

این راهنما برای deploy دو‌تکه است: فرانت‌اند روی Vercel، بک‌اند روی یک سرویس
Node/Docker (Render، Railway، Fly)، دیتابیس روی Neon.

> همهٔ «الزامی‌»های این سند از `backend/src/config/app-config.service.ts` آمده‌اند —
> اگر رعایت نشوند بک‌اند در production **اصلاً boot نمی‌شود** (fail-fast عمدی است).

---

## ۰) پیش‌نیازها

| چیز | وضعیت |
|---|---|
| Postgres (Neon) | داری ✔ — رشتهٔ اتصال بدون `-pooler` و بدون کوتیشن |
| Redis | **لازم است** — `REDIS_URL=memory` در production رد می‌شود. رایگان: Upstash یا Redis خودِ Render |
| دامنه/HTTPS | Render و Vercel هر دو HTTPS خودکار می‌دهند (برای کوکی `SameSite=None` ضروری است) |
| سرویس SMS | **اجباری** — `SMS_PROVIDER=console` در production رد می‌شود و API بالا نمی‌آید. پس `KAVENEGAR_API_KEY` لازم داری |

---

## ۱) بک‌اند روی Render

**Runtime:** Docker (از `backend/Dockerfile`) یا Node.

**Health check path:** `/health/live`
(دقت کن: این مسیر از prefix مستثناست، پس `/api/v1/health/live` **۴۰۴** می‌دهد.)

**Start command** (اگر runtime را Node انتخاب کردی، تا مهاجرت‌ها خودکار اعمال شوند):

```
npm run start:prod:migrate
```

که معادل `prisma migrate deploy && node dist/main.js` است. در حالت Docker،
مهاجرت را به‌صورت Pre-deploy command اجرا کن.

### متغیرهای محیطی

```env
NODE_ENV=production
PORT=10000                     # Render پورت را خودش تزریق می‌کند؛ 10000 مقدار متعارف آن است
API_PREFIX=api/v1

# --- آدرس‌ها (این دو همان چیزی‌اند که کوکی و ریدایرکت پرداخت را درست می‌کنند) ---
PUBLIC_BASE_URL=https://api-TO-MIDAN.onrender.com        # آدرس عمومی همین بک‌اند
FRONTEND_BASE_URL=https://shop-TO-MIDAN.vercel.app       # آدرس فرانت

# --- دیتابیس / کش ---
DATABASE_URL=postgresql://USER:PASS@HOST-REGION.aws.neon.tech/DB?schema=public
REDIS_URL=rediss://default:PASS@HOST.upstash.io:6379

# --- سکرت‌ها: هرکدام ≥۳۲ کاراکتر و بدون پیشوند change-me (openssl rand -hex 32) ---
JWT_ACCESS_SECRET=
OTP_HASH_PEPPER=
AUDIT_HASH_KEY=
DATA_ENCRYPTION_KEY=
ADMIN_BOOTSTRAP_SECRET=

# --- کوکی / CORS ---
AUTH_COOKIE_SECURE=auto        # در production → true (لازم برای SameSite=None)
AUTH_COOKIE_SAME_SITE=auto     # چون host فرانت و API فرق دارد → none می‌شود
CORS_ORIGINS=https://shop-TO-MIDAN.vercel.app

# --- بقیه ---
SWAGGER_ENABLED=false
LOG_LEVEL=info
STORAGE_PROVIDER=local         # ⚠️ به بخش «نکته‌ها» نگاه کن
PAYMENT_PROVIDER=mock

# ⚠️ این دو در production اجباری‌اند — بدون مقدار درست، API اصلاً boot نمی‌شود
SMS_PROVIDER=kavenegar         # console در production REJECT می‌شود
KAVENEGAR_API_KEY=             # اجباری
KAVENEGAR_SENDER=
EMAIL_PROVIDER=noop            # console در production REJECT می‌شود؛ smtp هنوز پیاده نشده

OTP_TTL_SECONDS=180
```

### چرا `AUTH_COOKIE_SAME_SITE` مهم است

کد قبلاً کوکی refresh را با `SameSite=Lax` می‌زد. وقتی فرانت روی
`shop.vercel.app` و API روی `api.onrender.com` است، مرورگر هر درخواست API را
**cross-site** می‌شمارد و کوکی `Lax` را ارسال نمی‌کند → نتیجه: لاگین کار می‌کند
ولی ~۱۵ دقیقه بعد (وقتی access token منقضی می‌شود) refresh بی‌صدا شکست می‌خورد
و کاربر بیرون انداخته می‌شود.

حالا `auto` خودش تصمیم می‌گیرد:

- host فرانت == host بک‌اند → `lax` (حالت لوکال ۳۰۰۰/۳۰۰۱ هم `lax` می‌ماند، چون
  پورت در SameSite ملاک نیست)
- host متفاوت → `none` + `Secure`

### seed یک‌بار

```bash
npm run seed          # نقش‌ها، دسته‌ها، رنگ‌ها
npm run seed:demo     # کاتالوگ دمو (۱۵ محصول فارسی)
npm run admin:grant   # اگر نیاز به super-admin داری
```

---

## ۲) فرانت‌اند روی Vercel

ریشهٔ پروژه: `frontend` · Build: `npm run build` · Output: Next.js استاندارد.

```env
NEXT_PUBLIC_API_URL=https://api-TO-MIDAN.onrender.com/api/v1
```

- این متغیر **زمان build** در باندل inline می‌شود؛ بعد از تغییرش حتماً Redeploy کن.
- `NEXT_PUBLIC_API_MOCKING` را در Vercel **نگذار** (در production بی‌اثر است، ولی
  دادهٔ mock را به باندل اضافه می‌کند — بخش نکته‌ها).
- اگر خواستی SSR از شبکهٔ داخلی برود، `API_BASE_URL` را هم بده؛ وگرنه همان
  `NEXT_PUBLIC_API_URL` استفاده می‌شود.

---

## ۳) تست نهایی (به همین ترتیب)

```bash
# 1) بک‌اند زنده است؟
curl https://api-TO-MIDAN.onrender.com/health/live
#    → {"status":"ok","uptimeSeconds":...}

# 2) دیتابیس و Redis وصل‌اند؟
curl https://api-TO-MIDAN.onrender.com/health/ready
#    → status: ready  (degraded یعنی Redis قطع است)

# 3) دیتا هست؟
curl https://api-TO-MIDAN.onrender.com/api/v1/catalog/categories

# 4) لاگین واقعی: در سایت شماره بزن، کد را بگیر، وارد شو،
#    سپس ۱۵ دقیقه صبر کن و مطمئن شو هنوز لاگینی (همان تست SameSite).
```

اگر قدم ۳ خطای `common.network_error` داد، بک‌اند بالا نیامده — لاگ Render را
ببین؛ معمولاً یکی از این پنج است: `DATABASE_URL` غلط، یکی از سکرت‌ها زیر ۳۲
کاراکتر، `REDIS_URL=memory`، `SMS_PROVIDER=console`، یا `EMAIL_PROVIDER=console`.

---

## نکته‌ها / بدهی‌های فنی

- **آپلود فایل‌ها:** `STORAGE_PROVIDER=local` روی دیسک کانتینر می‌نویسد که با هر
  deploy پاک می‌شود. عکس‌های کاتالوگ دمو داخل `frontend/public` هستند (پس ویترین
  سالم است)، ولی هر آپلودی از پنل ادمین بعد از redeploy از بین می‌رود. برای
  production واقعی به S3-سازگار (Cloudflare R2 / Liara) برو.
- **دادهٔ mock در باندل:** `frontend/src/mocks/data.ts` حتی در بیلد تمیز هم داخل
  باندل پروداکشن می‌رود (۴۵KB) — در runtime قابل دسترسی نیست، ولی اضافه است.
- **پیش‌نمایش‌های Vercel:** هر preview deployment یک origin جدید
  (`*.vercel.app`) دارد و `CORS_ORIGINS` لیستِ دقیق است؛ برای تست preview باید
  آن origin را هم اضافه کنی.
- **پرداخت:** `PAYMENT_PROVIDER=mock` صفحهٔ `/dev-payment-gateway` را باز می‌کند.
  برای زرین‌پال: `PAYMENT_PROVIDER=zarinpal` + `ZARINPAL_MERCHANT_ID`.
