# راه‌اندازی محیط توسعه روی ویندوز — بدون Docker، بدون WSL

هدف: بک‌اند را روی یک ویندوز معمولی بالا بیاوری و فرانت را به API واقعی وصل
کنی. هیچ‌کدام از مراحل به Docker یا WSL نیاز ندارد؛ هر دو فقط به‌عنوان گزینهٔ
سوم آمده‌اند.

---

## خلاصهٔ سریع

همهٔ دستورات داخل پوشهٔ `backend/` اجرا می‌شوند:

```powershell
npm install
npm run env:setup          # فایل .env را با secret های واقعی می‌سازد
#   → حالا Postgres را جور کن (سه گزینه، بخش «مرحله ۳»)
npm run db:check           # دقیقاً می‌گوید چرا وصل نمی‌شود
npm run prisma:migrate:dev # جدول‌ها
npm run seed               # نقش‌ها، مجوزها، دسته‌بندی، محصول نمونه
npm run start:dev          # API روی http://localhost:3000/api/v1
```

Redis لازم نیست نصب کنی: فایل `.env` به‌صورت پیش‌فرض `REDIS_URL=memory` دارد
(بخش «Redis» را بخوان).

---

## چرا تلاش‌های قبلی شکست خورد

سه مشکل مستقل بود، هر سه رفع شد:

**۱. `scripts/devbox.sh` روی ویندوز اصلاً اجرا نمی‌شد.** یک اسکریپت bash بود و
برای اجرا به WSL نیاز داشت. WSL نصب/به‌روز نبود، پس اسکریپت در همان خط اول
مُرد و چون `set -e` داشت، هیچ مرحلهٔ بعدی‌اش اجرا نشد — از جمله **ساختن فایل
env**. حالا جای آن دو اسکریپت Node خالص آمده (`scripts/setup-env.mjs` و
`scripts/check-db.mjs`) که روی ویندوز، مک و لینوکس یکسان کار می‌کنند.
`devbox.sh` و `devbox.ps1` منسوخ شده‌اند: فقط دستورات درست را چاپ می‌کنند و با
کد ۱ خارج می‌شوند تا هیچ‌کس فکر نکند setup موفق بوده.

**۲. فایل env نام اشتباهی داشت.** اسکریپت قدیمی `.env.development` می‌ساخت.
اما **Prisma CLI فقط فایلی به نام دقیقاً `.env` را می‌خواند**؛ برای همین
`prisma migrate dev` و `prisma db seed` خطای
`Environment variable not found: DATABASE_URL` می‌دادند. حالا یک فایل `.env`
ساخته می‌شود که هر دو طرف آن را می‌خوانند:

- Prisma CLI: از طریق `prisma.config.ts` که `loadEnvFiles(['.env', '.env.<NODE_ENV>'], ...)`
  را صدا می‌زند (`.env` اول است؛ مهم است).
- NestJS: از طریق `app-config.module.ts` که `.env.<NODE_ENV>` و بعد `.env` را
  بار می‌زند.

**۳. Redis روی ویندوز نسخهٔ رسمی ندارد.** بدون Redis، `OtpService` عمداً fail
closed می‌کند و لاگین با **503** جواب می‌گیرد. حالا `REDIS_URL=memory` یک
جایگزین درون‌حافظه‌ای را فعال می‌کند که همان دستورات Redis را درون پروسهٔ Node
اجرا می‌کند.

---

## مرحله ۱ — Node

Node.js نسخهٔ ۲۰ یا بالاتر (`node -v`). بعد داخل `backend/`:

```powershell
npm install
```

## مرحله ۲ — ساخت فایل `.env`

```powershell
npm run env:setup
```

این کار `backend/.env` را از روی `.env.example` می‌سازد و این پنج secret را با
۳۲ بایت عدد تصادفی (`crypto.randomBytes(32)`) پر می‌کند:

`JWT_ACCESS_SECRET`, `OTP_HASH_PEPPER`, `AUDIT_HASH_KEY`,
`DATA_ENCRYPTION_KEY`, `ADMIN_BOOTSTRAP_SECRET`

**idempotent است:** اگر `.env` از قبل وجود داشته باشد دست نمی‌زند، پس اجرای
مکرر چیزی را خراب نمی‌کند. فایل `.env` در `.gitignore` است و هرگز commit
نمی‌شود.

---

## مرحله ۳ — PostgreSQL

سه گزینه، از ساده‌ترین به سنگین‌ترین. **فقط یکی** را انتخاب کن.

### گزینهٔ ۱ — Postgres ابری رایگان (Neon یا Supabase) ← پیشنهادی

بدون هیچ نصبی. روی [neon.tech](https://neon.tech) یا
[supabase.com](https://supabase.com) یک پروژهٔ رایگان بساز و connection string
را کپی کن، بعد در `backend/.env` جای `DATABASE_URL` بگذار:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public&sslmode=require
```

دو نکته که معمولاً گیر می‌افتند:

- **`?sslmode=require` را حذف نکن.** Postgres ابری بدون TLS اجازهٔ اتصال
  نمی‌دهد و خطایش به شکل یک timeout گمراه‌کننده ظاهر می‌شود.
- **در Supabase برای migrate از Session pooler (پورت ۵۴۳۲) استفاده کن، نه
  Transaction pooler (پورت ۶۵۴۳).** دستور `migrate` تراکنش DDL می‌زند و روی
  حالت transaction کار نمی‌کند.

بعد: `npm run db:check` باید `✓ PostgreSQL is accepting connections.` بدهد.

### گزینهٔ ۲ — نصب مستقیم PostgreSQL 16 روی ویندوز

اگر می‌خواهی همه‌چیز آفلاین و لوکال باشد. از
[postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
نسخهٔ ۱۶ را نصب کن (نصب‌کنندهٔ EDB). موقع نصب رمز کاربر `postgres` را یادت
بماند و پورت را همان ۵۴۳۲ بگذار.

بعد در PowerShell کاربر و دیتابیس را بساز:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres
```

و داخل `psql`:

```sql
CREATE USER fashion WITH PASSWORD 'fashion' CREATEDB;
CREATE DATABASE fashion_dev OWNER fashion;
GRANT ALL PRIVILEGES ON DATABASE fashion_dev TO fashion;
\c fashion_dev
GRANT ALL ON SCHEMA public TO fashion;
\q
```

و در `backend/.env`:

```
DATABASE_URL=postgresql://fashion:fashion@127.0.0.1:5432/fashion_dev
```

سرویس PostgreSQL با ویندوز بالا می‌آید (`services.msc` → `postgresql-x64-16`)،
پس نیازی نیست هر بار دستی استارتش کنی. اگر پورت ۵۴۳۲ اشغال بود، در
`postgresql.conf` پورت را عوض کن و در `DATABASE_URL` هم همان را بنویس.

### گزینهٔ ۳ — Docker (نیازمند WSL2)

```powershell
docker compose up -d        # Postgres 16 + Redis 7
docker compose ps
```

این تنها گزینه‌ای است که پیش‌نیاز بیرونی دارد:

- **Virtualization باید در BIOS روشن باشد.** در Task Manager → Performance →
  CPU باید `Virtualization: Enabled` باشد؛ اگر نیست، از BIOS/UEFI فعالش کن.
- **WSL2 نصب و به‌روز باشد.** در PowerShell **با دسترسی Administrator**:
  ```powershell
  wsl --update
  wsl --shutdown
  ```
  بعد Docker Desktop را ری‌استارت کن و صبر کن تا پایین پنجره بنویسد
  **Engine running**.

کانتینرها همان `fashion`/`fashion` و دیتابیس `fashion_dev` را می‌سازند، پس
`DATABASE_URL` پیش‌فرض `.env` بدون تغییر کار می‌کند.

---

## مرحله ۴ — بررسی اتصال

```powershell
npm run db:check
```

اسکریپت با یک اتصال TCP خام (بدون هیچ dependency) چک می‌کند Postgres و Redis
جواب می‌دهند یا نه، و **علت** را می‌گوید نه فقط «نشد»:

```
==> DATABASE_URL: 127.0.0.1:5432
✓ PostgreSQL is accepting connections.

==> REDIS_URL=memory
✓ Using the in-process Redis stand-in — nothing to connect to.

✓ Ready. Next:  npm run prisma:migrate:dev  &&  npm run seed  &&  npm run start:dev
```

`ECONNREFUSED` و `ETIMEDOUT` عمداً از هم جدا توضیح داده می‌شوند، چون راه‌حلشان
کاملاً متفاوت است (جدول خطاها پایین). اگر `localhost` نوشته باشی و سرور فقط
روی IPv4 گوش بدهد، اسکریپت خودش `127.0.0.1` را هم امتحان می‌کند و مستقیم
می‌گوید مشکل از IPv6 است.

---

## Redis — چرا `REDIS_URL=memory`

Redis نسخهٔ رسمی ویندوز ندارد. Redis هم فقط دادهٔ موقتی نگه می‌دارد: کد OTP،
شمارندهٔ rate limit، قفل‌ها و کش. چون `OtpService` عمداً fail closed است، بدون
Redis لاگین با **503 Service Unavailable** جواب می‌گیرد.

`.env` به‌صورت پیش‌فرض این را دارد:

```
REDIS_URL=memory
# REDIS_URL=redis://127.0.0.1:6379/0
```

`memory` یعنی `RedisService` به‌جای ioredis از
`src/shared/redis/memory-redis.ts` استفاده کند — همان زیرمجموعهٔ دستوراتی که
کد واقعاً صدا می‌زند (`get`, `set` با `EX`/`NX`, `del`, `incr`, `expire NX`,
`ttl`, `multi().exec()`) با معناشناسی واقعی Redis: TTL واقعاً منقضی می‌شود،
`ttl` برای کلید نبود `-2` و برای کلید بدون TTL برابر `-1` است، و پنجرهٔ
rate-limit با هر hit ری‌ست نمی‌شود.

### محدودیت‌ها (بخوان)

- **تک‌پروسه‌ای.** حالت داخل حافظهٔ همان پروسهٔ Node است. دو نمونهٔ API هیچ
  چیزی را با هم شریک نیستند؛ با `cluster` یا چند پورت بالا آوردن، هر کدام
  OTP و rate limit خودش را دارد.
- **غیرماندگار.** با ری‌استارت (که `nest start --watch` موقع هر تغییر فایل
  انجام می‌دهد) همهٔ OTPها، پنجره‌های rate limit و قفل‌ها می‌پرند. یعنی اگر
  وسط تست لاگین فایل را عوض کنی، کد OTP قبلی باطل می‌شود.
- **rate limit واقعی نیست.** محدودکردن درخواست فقط داخل همان پروسه اثر
  دارد، پس به‌عنوان محافظت در نظر نگیرش.
- **health endpoint دروغ نمی‌گوید ولی گمراه‌کننده است:** `GET /api/v1/health`
  برای Redis هم `ok` برمی‌گرداند، چون واقعاً یک کلاینت (درون‌حافظه‌ای) هست.
- **روی production اصلاً بالا نمی‌آید.** `AppConfigService.redisUrl` وقتی
  `NODE_ENV=production` و `REDIS_URL=memory` باشد همان لحظهٔ boot خطا
  می‌دهد. این عمدی است.

وقتی Redis واقعی داشتی (مثلاً با Docker)، همان خط کامنت‌شده را فعال کن.

---

## مرحله ۵ — migrate، seed، اجرا

```powershell
npm run prisma:migrate:dev
npm run seed
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- سلامت: `curl http://localhost:3000/api/v1/health`
- دیدن داده‌ها با رابط گرافیکی: `npx prisma studio`

فرانت را هم می‌توانی به همین آدرس وصل کنی (`API_PREFIX=api/v1`).

### نکتهٔ مهم دربارهٔ `migrate dev`

`prisma migrate dev` جدول‌ها، ایندکس‌های ساده و foreign key ها را می‌سازد. اما
schema این پروژه سه چیز دارد که **Prisma بلد نیست تولید کند** و باید به صورت
SQL دستی به migration اضافه شوند:

- **partial unique index** — مثل «هر کاربر فقط یک سبد `ACTIVE`»
- **CHECK constraint** — مثل `paidAmount BETWEEN 0 AND totalAmount`
- **trigger** — جدول‌های append-only مثل `InventoryLedger`

بدون این‌ها اپلیکیشن بالا می‌آید و کار می‌کند، ولی تضمین‌های همزمانی که در
سرویس‌ها نوشته شده پشتوانهٔ دیتابیسی ندارند. خروجی آن مرحله را بفرست تا فایل
`integrity.sql` ساخته شود.

---

## خطاهای رایج

| خطا | یعنی چه | راه‌حل |
|---|---|---|
| `Environment variable not found: DATABASE_URL` | فایل `.env` نیست (یا نامش `.env.development` است و Prisma آن را نمی‌خواند) | `npm run env:setup` — دقیقاً فایلی به نام `.env` می‌سازد |
| `ECONNREFUSED` از `db:check` | ماشین جواب داد ولی **چیزی روی آن پورت گوش نمی‌دهد** | Postgres بالا نیست، یا پورت اشتباه است. گزینهٔ ۱/۲/۳ بالا. علت دوم روی ویندوز: `localhost` به `::1` (IPv6) رفته در حالی که سرور روی IPv4 است → در `.env` بنویس `127.0.0.1` |
| `ETIMEDOUT` از `db:check` | هیچ‌کس رد نکرده؛ **اصلاً جوابی نیامده** (۵ ثانیه صبر کرد) | بسته‌ها drop می‌شوند: فایروال ویندوز/شبکهٔ شرکتی، نیاز به VPN، یا IP تو در allowlist سرویس ابری نیست. این با «سرویس خاموش است» فرق دارد — آن `ECONNREFUSED` است |
| `ENOTFOUND` | نام host resolve نمی‌شود | connection string ابری را دوباره کپی کن (typo) |
| `P1001: Can't reach database server` | Prisma نتوانست وصل شود — همان مشکل، با پیام خود Prisma | `npm run db:check` علت دقیق را می‌گوید؛ بعد `.env` را اصلاح کن |
| خطای **503** روی `POST /auth/otp` (یا `verification service is temporarily unavailable`) | Redis در دسترس نیست و OTP عمداً fail closed است | `REDIS_URL=memory` در `.env` بگذار و API را ری‌استارت کن |
| `429` روی درخواست OTP | rate limit یا resend cooldown | طبیعی است؛ `OTP_RESEND_COOLDOWN_SECONDS` را در `.env` کم کن (با `REDIS_URL=memory` ری‌استارت API هم پاکش می‌کند) |
| `P3006` یا خطای constraint موقع `migrate dev` | schema پر از partial index / CHECK / trigger است که Prisma تولید نمی‌کند | انتظار می‌رود؛ خروجی را بفرست تا SQL دستی نوشته شود |
| `WSL must be updated` / `WSL 2 installation is incomplete` | فقط مربوط به گزینهٔ ۳ (Docker) | `wsl --update` و `wsl --shutdown` با دسترسی Administrator، بعد ری‌استارت |

---

## یادآوری امنیتی

`.env` و `.env.*` در `.gitignore` هستند (به‌جز `.env.example`) و نباید commit
شوند. اعتبارنامه‌های `fashion:fashion` فقط برای لوکال‌اند و هرگز نباید در
staging یا production استفاده شوند.
