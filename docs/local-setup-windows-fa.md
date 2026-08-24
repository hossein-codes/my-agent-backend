# راه‌اندازی محیط توسعه روی ویندوز

سندی برای بالا آوردن بک‌اند روی ویندوز (PowerShell). سه خطایی که در اولین
تلاش دیدی، هر سه ریشهٔ یکسان داشتند: `.env.development` هیچ‌وقت ساخته نشد.

---

## چه اتفاقی افتاد

`scripts/devbox.sh` سه کار پشت سر هم می‌کند:

1. بالا آوردن Postgres و Redis با داکر
2. ساختن `.env.development` از روی `.env.example` + تولید secret واقعی
3. `npm install` و `prisma generate`

روی ویندوز مرحلهٔ ۱ به‌خاطر WSL شکست خورد و چون اسکریپت `set -e` دارد،
همان‌جا متوقف شد. پس مرحلهٔ ۲ اجرا نشد و فایل `.env.development` ساخته نشد.
`DATABASE_URL` داخل همان فایل است — به همین دلیل `migrate dev` و `seed`
هر دو خطای `Environment variable not found: DATABASE_URL` دادند.

**نکتهٔ مهم:** `prisma generate` موفق بود، چون به دیتابیس نیاز ندارد.
یعنی آن ۱۰۳ خطای `tsc` الان صفر شده است.

---

## مرحله ۱ — WSL و داکر

خطای `wsl.exe --update` را باید در PowerShell **با دسترسی Administrator** حل کنی:

```powershell
wsl --update
wsl --shutdown
```

سپس ویندوز را ری‌استارت کن، Docker Desktop را باز کن و صبر کن تا آیکون نهنگ
پایین پنجره سبز شود و بنویسد **Engine running**.

تأیید:

```powershell
docker info
docker compose version
```

اگر Docker Desktop اصلاً نصب نیست، از `docker.com/products/docker-desktop`
بگیر و موقع نصب گزینهٔ **Use WSL 2 based engine** را تیک بزن.

---

## مرحله ۲ — اجرای setup

نسخهٔ PowerShell اسکریپت اضافه شده است:

```powershell
cd C:\Users\...\backend\backend
npm run infra:setup:win
```

این اسکریپت همان کارهای نسخهٔ bash را می‌کند، منتها:

- اول چک می‌کند موتور داکر واقعاً **جواب می‌دهد** (نه فقط نصب است) و اگر نه،
  پیام راهنمای WSL می‌دهد به‌جای خطای گنگ.
- secret ها را با `RandomNumberGenerator` ویندوز می‌سازد نه `openssl`.
- فایل را **UTF-8 بدون BOM** می‌نویسد. اگر با `Out-File` معمولی بنویسی،
  BOM سر خط اول می‌چسبد و کلید `NODE_ENV` خراب خوانده می‌شود.
- اگر `.env.development` از قبل باشد دست نمی‌زند.

---

## مرحله ۳ — migration و seed

```powershell
npm run prisma:migrate:dev
npm run seed
npm run start:dev
```

API روی `http://localhost:3000/api/v1` بالا می‌آید و Swagger روی `/docs`.

---

## چرا `prisma.config.ts` اضافه شد

حتی بعد از ساخته‌شدن `.env.development`، دستور `prisma migrate dev` باز هم
`DATABASE_URL` را پیدا نمی‌کرد. دلیلش این است:

> **Prisma CLI فقط فایلی به نام دقیقاً `.env` را خودکار می‌خواند.**

فایل‌های `.env.development` را در این ریپو دو جا می‌خوانند — NestJS از طریق
`ConfigModule.envFilePath`، و `prisma/seed.ts` از طریق `prisma/env-loader.ts`.
ولی خود CLI هیچ‌کدام را نمی‌بیند.

`prisma.config.ts` این شکاف را می‌بندد: قبل از هر دستور CLI، همان
`loadEnvFiles` را با ترتیب `env واقعی → .env.<NODE_ENV> → .env` صدا می‌زند.
ضمناً کلید `package.json#prisma` را جایگزین می‌کند و آن هشدار
«deprecated, removed in Prisma 7» هم از بین می‌رود.

### راه جایگزین (اگر خواستی)

می‌توانی به‌جای این، یک فایل `.env` کنار `.env.development` بسازی که فقط
همان یک خط را داشته باشد:

```
DATABASE_URL=postgresql://fashion:fashion@localhost:5432/fashion_dev
```

هر دو کار می‌کنند. `prisma.config.ts` تمیزتر است چون منبع حقیقت یکی می‌ماند.

---

## خطاهایی که ممکن است بعدی ببینی

### `P1001: Can't reach database server at localhost:5432`

کانتینر بالا نیست. `docker compose ps` بزن؛ اگر Postgres `Up` نیست:

```powershell
docker compose up -d
docker compose logs postgres
```

### پورت ۵۴۳۲ اشغال است

اگر Postgres را قبلاً مستقیم روی ویندوز نصب کرده‌ای، با کانتینر تداخل دارد.
یا سرویس ویندوزی را stop کن، یا در `docker-compose.yml` پورت را به
`'5433:5432'` عوض کن و در `.env.development` هم `5432` را به `5433` تغییر بده.

### `migrate dev` روی constraint ها خطا می‌دهد

این مورد **انتظار می‌رود** و کار بعدی ماست. schema پر از
partial unique index، CHECK constraint و trigger است که Prisma خودش تولید
نمی‌کند و باید دستی در SQL نوشته شوند. خروجی خطا را بفرست.

---

## یادآوری امنیتی

`.env.development` در `.gitignore` هست و نباید commit شود. اعتبارنامه‌های
`fashion:fashion` فقط برای داکر لوکال‌اند و هرگز نباید در staging یا
production استفاده شوند.
