# راه‌اندازی محیط توسعه — ساده‌ترین مسیر

هدف: یک API واقعاً بالا آمده، **بدون Docker، بدون WSL، بدون BIOS**، تا بتوانی
فرانت را با داده واقعی جلو ببری.

---

## آخرین وضعیت

| مرحله | وضعیت |
|---|---|
| `npm install` | ✅ |
| `prisma generate` | ✅ (۱۰۳ خطای tsc رفع شد) |
| `npm run env:setup` | ✅ فایل `.env` ساخته می‌شود |
| **Redis** | ✅ **دیگر لازم نیست نصب شود** — `REDIS_URL=memory` |
| **PostgreSQL** | ⬅ **تنها چیزی که مانده** |

پس فقط **یک** قطعه باقی مانده: یک PostgreSQL.

---

## Redis دیگر مانع نیست

قبلاً برای لاگین OTP باید Redis نصب می‌کردی. حالا `.env` به‌صورت پیش‌فرض روی
`REDIS_URL=memory` تنظیم است که یک پیاده‌سازی درون‌حافظه‌ای را جای Redis
می‌گذارد. همان دستورات (`get/set/EX/NX/incr/ttl/multi`) با همان معنای دقیق
پیاده شده و ۱۲ تست برایش نوشته شده.

محدودیت‌ها (عمدی): تک‌پروسه است و با ری‌استارت پاک می‌شود. برای همین اگر
`NODE_ENV=production` باشد اپلیکیشن **عمداً بالا نمی‌آید** تا کسی اشتباهی روی
production استفاده نکند. برای توسعهٔ فرانت کاملاً کافی است.

هر وقت خواستی Redis واقعی داشته باشی، فقط این خط را عوض کن.

---

## PostgreSQL — سه گزینه، از ساده به سخت

### گزینه ۱ (پیشنهاد من): Postgres ابری رایگان — ۳ دقیقه، هیچ نصبی

نه Docker، نه WSL، نه installer.

۱. برو به [neon.com](https://neon.com) (یا [supabase.com](https://supabase.com))
   و با GitHub ثبت‌نام کن — رایگان است و کارت اعتباری نمی‌خواهد.
۲. یک پروژه بساز.
۳. **Connection string** را کپی کن. چیزی شبیه این است:

```
postgresql://user:pass@ep-xxx-123.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

۴. فایل `backend/.env` را باز کن و خط `DATABASE_URL` را با آن جایگزین کن.

مزیت‌ها: چیزی روی ویندوز نصب نمی‌شود، از هر جا در دسترس است، بکاپ خودکار
دارد، و وقتی بخواهی فرانت را روی Vercel دیپلوی کنی همین دیتابیس کار می‌کند.

عیب: به اینترنت نیاز دارد و کمی کندتر از لوکال است (برای توسعه محسوس نیست).

### گزینه ۲: نصب مستقیم روی ویندوز — ۱۵ دقیقه، آفلاین

۱. PostgreSQL 16 را از
   [enterprisedb.com/downloads/postgres-postgresql-downloads](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)
   نصب کن. پورت `5432`، و رمز کاربر `postgres` را یادداشت کن.
۲. از منوی استارت **SQL Shell (psql)** را باز کن، همهٔ سؤالات را Enter بزن،
   رمز را وارد کن، سپس:

```sql
CREATE USER fashion WITH PASSWORD 'fashion';
CREATE DATABASE fashion_dev OWNER fashion;
GRANT ALL PRIVILEGES ON DATABASE fashion_dev TO fashion;
\q
```

`DATABASE_URL` پیش‌فرض بدون تغییر کار می‌کند.

### گزینه ۳: Docker

فقط اگر WSL2 را درست کنی. جزئیات در انتهای همین سند.

---

## دستور کمکی: ادمین کردن خودت

`seed` فقط یک مشتری دمو می‌سازد. برای کار با پنل ادمین (افزودن محصول) به نقش
`SUPER_ADMIN` نیاز داری، وگرنه همهٔ درخواست‌های ادمین ۴۰۳ می‌گیرند.

اول یک بار با شمارهٔ خودت لاگین کن تا حسابت ساخته شود (کد OTP در ترمینال
بک‌اند چاپ می‌شود چون `SMS_PROVIDER=console`)، بعد:

```powershell
npm run admin:grant -- 09121112233
```

بعد از آن **دوباره لاگین کن** — توکن قبلی هنوز نقش قدیمی را دارد.

---

## بعد از اینکه دیتابیس آماده شد

در پوشهٔ `backend/`:

```powershell
npm run env:setup             # اگر .env نداری
npm run db:check              # ✓ PostgreSQL + Redis(memory)
npm run prisma:migrate:dev    # ساخت جدول‌ها
npm run seed                  # نقش‌ها، مجوزها، رنگ/سایز، دسته‌بندی، محصول نمونه
npm run start:dev
```

تست نهایی:

```powershell
curl http://localhost:3000/api/v1/health
```

- Swagger: `http://localhost:3000/docs`
- مرور داده‌ها: `npx prisma studio`

از این لحظه فرانت می‌تواند به `http://localhost:3000/api/v1` وصل شود و
add-to-cart واقعاً در دیتابیس ثبت می‌شود.

---

## چرا بازنویسی با پایتون کمکی نمی‌کرد

Django و FastAPI هم دقیقاً به همین PostgreSQL نیاز دارند — مشکل هیچ‌وقت
NestJS نبود، نبودِ دیتابیس روی ماشین بود. و SQLite هم روی این schema جواب
نمی‌دهد: ۴۱ تا enum، ۱۸۰ ستون UUID، ۱۱ فیلد JSON، partial index و trigger —
هیچ‌کدام در SQLite وجود ندارند. هزینه‌اش دور ریختن ۲۶ ماژول و ۱۶۱ تست سبز بود.

---

## اگر باز هم Docker خواستی

```powershell
# PowerShell با Run as Administrator
wsl --install
# ری‌استارت کامل ویندوز
wsl --update
wsl --set-default-version 2
```

بعد Docker Desktop را نصب و اجرا کن تا نهنگ سبز شود، **PowerShell را ببند و
دوباره باز کن**، سپس `docker compose up -d`.

پیش‌نیاز: در Task Manager → Performance → CPU باید `Virtualization: Enabled`
باشد. اگر نیست، در BIOS باید `Intel VT-x` یا `AMD-V` را روشن کنی.

---

## نکتهٔ `prisma.config.ts`

اگر این پیام را دیدی:

```
Prisma config detected, skipping environment variable loading.
```

یعنی Prisma CLI دیگر خودش `.env` را نمی‌خواند و این کار به `prisma.config.ts`
سپرده شده. آن فایل حالا `.env` را اول می‌خواند. اگر دوباره خطای
`DATABASE_URL not found` دیدی، اولین جایی که باید نگاه کنی همین است.

---

## خطاهای رایج

| خطا | علت | راه‌حل |
|---|---|---|
| `docker: not recognized` | Docker نصب نیست | گزینهٔ ۱ یا ۲ را برو |
| `WSL must be updated` | Docker به WSL2 نیاز دارد | گزینهٔ ۱ یا ۲ را برو |
| `ETIMEDOUT` | فایروال / VPN / IPv6 | VPN را خاموش کن؛ `127.0.0.1` نه `localhost` |
| `ECONNREFUSED` | سرور بالا نیست | `npm run db:check` |
| `DATABASE_URL not found` | `.env` نیست | `npm run env:setup` |
| OTP خطای 503 | Redis | `REDIS_URL=memory` در `.env` |
| `P1001` روی Neon | نبود SSL | `?sslmode=require` در انتهای URL |

---

## مرحلهٔ بعد از `migrate`

`prisma migrate dev` جدول‌ها و ایندکس‌های ساده را می‌سازد، اما سه چیز را بلد
نیست و در این schema فراوان‌اند: **partial unique index**، **CHECK
constraint**، و **trigger** برای جدول‌های append-only. بدون این‌ها اپ کار
می‌کند ولی تضمین‌های همزمانی پشتوانهٔ دیتابیسی ندارند.

خروجی `migrate` را بفرست تا `integrity.sql` نوشته شود.
