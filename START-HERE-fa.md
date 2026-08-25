# از اینجا شروع کن

این نسخه شامل همهٔ اصلاحات راه‌اندازی است: بدون Docker، بدون WSL، بدون Redis.

---

## قدم ۰ — جایگزینی فایل‌ها

پوشهٔ فعلی پروژه‌ات را کنار بگذار (پاکش نکن) و محتویات این زیپ را جایش بگذار.

> `node_modules` داخل زیپ نیست — با `npm install` نصب می‌شود.
> فایل `.env` هم نیست، چون secret دارد و در قدم ۲ ساخته می‌شود.

---

## قدم ۱ — نصب پکیج‌ها

```powershell
cd backend
npm install
```

---

## قدم ۲ — ساخت فایل env

```powershell
npm run env:setup
```

خروجی مورد انتظار:

```
==> Created .env from .env.example
    generated real secrets for: JWT_ACCESS_SECRET, OTP_HASH_PEPPER, ...
```

---

## قدم ۳ — گذاشتن آدرس Neon

فایل `backend/.env` را با Notepad باز کن. خط `DATABASE_URL` را پیدا کن و
**کل خط** را با آدرس Neon عوض کن:

```
DATABASE_URL=postgresql://neondb_owner:رمز@ep-winter-mode-b2drax5i.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

چهار نکته:

- بدون `-pooler` در آدرس (برای `migrate` مشکل می‌سازد)
- بدون `[` و `]` و `mailto:` — فقط متن خام
- `&amp;` باید `&` باشد
- همه در **یک خط**، بدون کوتیشن، بدون فاصله دور `=`

ذخیره کن.

---

## قدم ۴ — تست اتصال

```powershell
npm run db:check
```

خروجی مورد انتظار:

```
==> PostgreSQL  ep-winter-mode-....aws.neon.tech:5432/neondb
✓ accepting connections
==> Redis       in-memory store (REDIS_URL=memory) — nothing to install
```

اگر خطا داد، اینجا توقف کن و خروجی را بفرست.

---

## قدم ۵ — ساخت جدول‌ها ⚠️

```powershell
npm run prisma:migrate:dev
```

**حساس‌ترین مرحله.** schema پر از partial unique index و CHECK و trigger است
که Prisma خودش تولید نمی‌کند. اگر خطا داد، متوقف شو و **کل خروجی** را بفرست
تا فایل `integrity.sql` نوشته شود.

---

## قدم ۶ — داده‌های پایه

```powershell
npm run seed
```

نقش‌ها، مجوزها، رنگ و سایز، دسته‌بندی، برند و یک محصول نمونه ساخته می‌شوند.

---

## قدم ۷ — اجرای API

```powershell
npm run start:dev
```

**این ترمینال را باز نگه دار** — کد OTP اینجا چاپ می‌شود.

---

## قدم ۸ — تست نهایی

مرورگر را باز کن: **http://localhost:3000/docs**

اگر Swagger با لیست endpoint ها آمد، **بک‌اندت زنده است.** 🎉

---

## قدم ۹ — ادمین کردن خودت

`seed` فقط یک مشتری می‌سازد، هیچ ادمینی نه. بدون نقش ادمین، افزودن محصول
خطای ۴۰۳ می‌دهد.

اول یک بار لاگین کن تا حسابت ساخته شود. در Swagger:

**`POST /api/v1/auth/otp/request`**
```json
{ "phone": "+989121112233", "purpose": "LOGIN" }
```

کد در **ترمینال بک‌اند** چاپ می‌شود. بعد:

**`POST /api/v1/auth/otp/verify`**
```json
{ "phone": "+989121112233", "purpose": "LOGIN", "code": "۶ رقمی" }
```

حالا در یک ترمینال دیگر:

```powershell
cd backend
npm run admin:grant -- 09121112233
```

و **دوباره لاگین کن** — توکن قبلی هنوز نقش قدیمی را دارد.

---

## چه چیزی در این نسخه اصلاح شده

| مشکل | راه‌حل |
|---|---|
| `devbox.sh` به bash و WSL نیاز داشت | `scripts/setup-env.mjs` با Node خالص |
| فایل `.env.development` را Prisma نمی‌خواند | حالا `.env` ساخته می‌شود |
| `prisma.config.ts` جلوی خواندن env را می‌گرفت | خودش `.env` را اول می‌خواند |
| Redis روی ویندوز نسخه ندارد | `REDIS_URL=memory` — بدون نصب |
| هیچ ادمینی وجود نداشت | `npm run admin:grant` |
| `localhost` روی ویندوز به IPv6 می‌رفت | همه‌جا `127.0.0.1` |

---

## خطاهای رایج

| خطا | راه‌حل |
|---|---|
| `DATABASE_URL not found` | `npm run env:setup` |
| `P1001` / `ETIMEDOUT` | VPN را خاموش کن؛ `-pooler` را از آدرس بردار |
| `ECONNREFUSED` | آدرس Neon اشتباه است |
| OTP خطای 503 | در `.env` مقدار `REDIS_URL=memory` باشد |
| خطای ۴۰۳ در ادمین | قدم ۹ |

راهنمای کامل‌تر: `docs/local-setup-fa.md`

---

## قدم بعدی

بعد از قدم ۸، به من بگو تا فرانت را به API واقعی وصل کنیم. سه تنظیم لازم
است: پورت فرانت (چون ۳۰۰۰ اشغال است)، آدرس API، و خاموش کردن MSW.
