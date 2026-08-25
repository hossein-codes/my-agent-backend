# راه‌اندازی محیط توسعه روی ویندوز

> **این سند منسوخ شده است.** مسیر درست و به‌روز در
> **[`local-setup-fa.md`](./local-setup-fa.md)** است — بدون Docker و بدون WSL.
>
> دو چیز از این سند دیگر درست نیست و اگر دنبالش بروی دوباره به همان خطاهای قبلی
> می‌خوری:
>
> ۱. **`.env.development` نام اشتباهی است.** Prisma CLI فقط فایلی به نام
>    دقیقاً `.env` را می‌خواند. الان `npm run env:setup` فایل `.env` می‌سازد و
>    `prisma.config.ts` هم `.env` را **اول** بار می‌کند:
>    `loadEnvFiles(['.env', '.env.<NODE_ENV>'], 'DATABASE_URL')`.
>
> ۲. **Docker و WSL لازم نیستند.** `scripts/devbox.ps1` و `scripts/devbox.sh`
>    منسوخ شده‌اند (فقط راهنما چاپ می‌کنند و با کد ۱ خارج می‌شوند). جای آن‌ها
>    `npm run env:setup` و `npm run db:check` آمده که Node خالص‌اند.
>
> Redis هم لازم نیست: `.env` به‌صورت پیش‌فرض `REDIS_URL=memory` دارد و مسیر
> لاگین OTP بدون سرور Redis کار می‌کند.

---

## مسیر فعلی، خلاصه

```powershell
cd backend
npm install
npm run env:setup          # backend/.env با secret های واقعی
# Postgres: ابری (Neon/Supabase) یا نصب مستقیم PostgreSQL 16 یا Docker
npm run db:check
npm run prisma:migrate:dev
npm run seed
npm run start:dev          # API روی http://localhost:3000/api/v1 ، Swagger روی /docs
```

جزئیات هر سه گزینهٔ Postgres، محدودیت‌های `REDIS_URL=memory` و جدول خطاهای
رایج (`ETIMEDOUT`، `ECONNREFUSED`، `P1001`، `DATABASE_URL not found`، خطای ۵۰۳
در OTP) همه در [`local-setup-fa.md`](./local-setup-fa.md) هست.

---

## یادآوری امنیتی

`.env` و `.env.*` در `.gitignore` هستند (به‌جز `.env.example`) و نباید commit
شوند. اعتبارنامه‌های `fashion:fashion` فقط برای محیط لوکال‌اند.
