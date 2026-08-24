# راه‌اندازی محیط توسعه (ویندوز / مک / لینوکس)

هدف: از صفر تا یک API واقعاً بالا آمده که فرانت بتواند صدایش بزند.

---

## چرا روش قبلی شکست خورد

دو باگ در ابزار راه‌اندازی بود که هر دو رفع شد:

۱. **`scripts/devbox.sh` روی ویندوز اجرا نمی‌شد.** یک اسکریپت bash بود و
   `npm run infra:setup` آن را از طریق WSL صدا می‌زد. چون WSL آپدیت نبود،
   اسکریپت در همان خط اول مُرد و به‌خاطر `set -e` هیچ‌کدام از مراحل بعدی —
   از جمله **ساختن فایل env** — اجرا نشد.

۲. **فایل env نام اشتباهی داشت.** اسکریپت `.env.development` می‌ساخت.
   NestJS این نام را می‌خواند، اما **Prisma CLI فقط فایلی به نام `.env` را
   می‌شناسد**. برای همین `prisma migrate dev` و `prisma db seed` خطای
   `Environment variable not found: DATABASE_URL` می‌دادند.

حالا فقط یک فایل `.env` ساخته می‌شود که هم Nest و هم Prisma آن را می‌خوانند،
و اسکریپت‌ها Node خالص‌اند (بدون bash، بدون WSL).

---

## پیش‌نیازها

| ابزار | نسخه | توضیح |
|---|---|---|
| Node.js | ۲۰ یا بالاتر | تو ۲۲ داری ✓ |
| Docker Desktop | آخرین نسخه | برای Postgres و Redis |

اگر Docker Desktop خطای WSL می‌دهد، در PowerShell **با دسترسی Administrator**:

```powershell
wsl --update
wsl --shutdown
```

بعد Docker Desktop را ری‌استارت کن و صبر کن تا آیکون نهنگ سبز شود.

---

## مراحل

همه دستورات داخل پوشه `backend/` اجرا می‌شوند.

```powershell
# ۱) نصب پکیج‌ها
npm install

# ۲) ساخت فایل .env با secret های واقعی (تصادفی، ۳۲ بایت)
npm run env:setup

# ۳) بالا آوردن Postgres و Redis
docker compose up -d

# ۴) اطمینان از اینکه دیتابیس واقعاً جواب می‌دهد
npm run db:check
#    ✓ PostgreSQL is accepting connections.

# ۵) ساخت جدول‌ها
npm run prisma:migrate:dev

# ۶) داده‌های پایه: نقش‌ها، مجوزها، رنگ/سایز، دسته‌بندی، محصول نمونه
npm run seed

# ۷) اجرای API
npm run start:dev
```

بعد از مرحله ۷:

- API روی `http://localhost:3000/api/v1`
- مستندات Swagger روی `http://localhost:3000/docs`
- تست سلامت: `curl http://localhost:3000/api/v1/health`

برای دیدن داده‌ها با رابط گرافیکی: `npx prisma studio`

---

## اگر Docker اصلاً راه نیفتاد

می‌توانی PostgreSQL 16 را مستقیم روی ویندوز نصب کنی
([postgresql.org/download/windows](https://www.postgresql.org/download/windows/))،
بعد یک دیتابیس بساز و در `backend/.env` این خط را به آن اشاره بده:

```
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/fashion_dev
```

Redis اختیاری‌تر است — برای OTP، rate limit و قفل‌ها استفاده می‌شود. بدون آن
بخش‌هایی از auth درست کار نمی‌کنند، پس برای تست مسیر لاگین لازمش داری.

---

## نکته مهم دربارهٔ مرحله ۵

`prisma migrate dev` جدول‌ها، ایندکس‌های ساده و foreign key ها را می‌سازد.
اما schema این پروژه سه چیز دارد که **Prisma بلد نیست تولید کند** و باید به
صورت SQL دستی به migration اضافه شوند:

- **partial unique index** — مثل «هر کاربر فقط یک سبد `ACTIVE`»
- **CHECK constraint** — مثل `paidAmount BETWEEN 0 AND totalAmount`
- **trigger** — جدول‌های append-only مثل `InventoryLedger`

بدون این‌ها اپلیکیشن بالا می‌آید و کار می‌کند، ولی تضمین‌های همزمانی که در
سرویس‌ها نوشته شده پشتوانهٔ دیتابیسی ندارند. این کار بعد از موفق شدن مرحله ۵
انجام می‌شود — خروجی آن مرحله را بفرست تا فایل `integrity.sql` ساخته شود.

---

## خطاهای رایج

| خطا | علت | راه‌حل |
|---|---|---|
| `Environment variable not found: DATABASE_URL` | فایل `.env` نیست | `npm run env:setup` |
| `Can't reach database server at localhost:5432` | Postgres بالا نیست | `docker compose up -d` بعد `npm run db:check` |
| `WSL must be updated` | Docker Desktop | `wsl --update` با دسترسی ادمین |
| `P3006` هنگام migrate | CHECK/trigger در SQL دستی | خروجی را بفرست |
| `prisma` config deprecated warning | فقط هشدار است | فعلاً بی‌خطر؛ Prisma 7 نیاز به `prisma.config.ts` دارد |
