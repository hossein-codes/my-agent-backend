# راهنمای تست بک‌اند

بک‌اند دو لایهٔ تست مستقل دارد. سبز بودن یکی جای دیگری را نمی‌گیرد.

## ۱) تست‌های واحد

```bash
cd backend
npm test
```

این تست‌ها سریع‌اند و وابستگی‌های بیرونی، از جمله Prisma، را mock می‌کنند. هدف آن‌ها بررسی شاخه‌های منطقی سرویس‌ها، نگاشت خطاها، محاسبات و قراردادهای کوچک است. چون mock هر مقدار ورودی را می‌پذیرد، این لایه وجود enum، foreign key، نوع واقعی ستون یا رفتار همزمان PostgreSQL را تضمین نمی‌کند.

تنظیم Jest این لایه `rootDir=src` دارد؛ بنابراین فایل‌های `test/*.e2e-spec.ts` را برنمی‌دارد.

## ۲) تست‌های end-to-end با PostgreSQL واقعی

```bash
cd backend
npm run prisma:generate
npm run test:e2e
```

این فرمان Docker یا PostgreSQL نصب‌شده روی سیستم نمی‌خواهد. در شروع هر اجرای Jest:

1. باینری‌های `initdb` و `pg_ctl` از پکیج متناسب `@embedded-postgres/*` مستقیماً اجرا می‌شوند؛ wrapper مبتنی بر ESM استفاده نمی‌شود.
2. یک cluster موقت با پورت آزاد و مستقل ساخته می‌شود.
3. برای سرعت، `fsync=off` و `synchronous_commit=off` فعال می‌شوند.
4. مدل‌ها با `prisma db push` ساخته می‌شوند.
5. محدودیت‌های `CHECK` که زبان schema پریزما قادر به بیان آن‌ها نیست از `prisma/integrity.sql` نصب می‌شوند.
6. seed واقعی اجرا و کل `AppModule` بوت می‌شود. `configureApp` نیز اجرا می‌شود؛ بنابراین prefix، guardهای احراز هویت و مجوز، ValidationPipe و exception filter همان تنظیمات برنامه را دارند.
7. در پایان اجرا PostgreSQL متوقف و کل دایرکتوری cluster حذف می‌شود.

محیط e2e از `REDIS_URL=memory`، `PAYMENT_PROVIDER=mock` و `SMS_PROVIDER=console` استفاده می‌کند، اما دیتابیس mock نیست. متد `E2eHarness.reset()` تمام جدول‌های برنامه را `TRUNCATE ... CASCADE` و سپس seed را دوباره اجرا می‌کند.

### چه چیزهایی پوشش داده می‌شوند؟

- رقابت واقعی ۲۰ رزروکننده برای ۵ واحد موجودی و invariantِ `reserved <= onHand`
- foreign key واقعی Cart در رزرو و ledger متناظر هر رزرو موفق
- محدودیت‌های مالی دیتابیس: `paidAmount <= totalAmount` و `refundedAmount <= paidAmount`
- integer و غیرمنفی بودن قیمت‌ها
- امن بودن callback پرداخت در برابر authority ناشناس و query-string tampering
- احراز هویت endpoint verify پرداخت، مسیرهای مشتری و تمام routeهای ثبت‌شدهٔ `admin/*`
- یکسان بودن پاسخ درخواست OTP برای شمارهٔ موجود و ناموجود و عدم افشای کد
- رد JWT جعلی و `alg=none` و عدم write پس از 401
- دید عمومی catalog: مخفی بودن DRAFT و soft-delete، سقف pagination و پارامتری بودن جست‌وجو در برابر SQL injection
- عمومی ماندن catalog، campaign فعال، روش‌های ارسال و health probeها

برای اجرای هر دو لایه پشت‌سرهم:

```bash
npm run test:all
```

## اگر suiteها skip شدند

فایل `@prisma/client` بعد از `npm install` ممکن است فقط placeholder باشد. وجود فایل روی دیسک کافی نیست؛ harness عمداً `new PrismaClient()` را امتحان می‌کند. اگر client تولید نشده باشد، suiteهای e2e به‌جای fail شدن با دلیل روشن skip می‌شوند.

راه‌حل معمول:

```bash
cd backend
npm ci
npm run prisma:generate
npm run test:e2e
```

اگر `prisma:generate` در دریافت engine خطا داد، دسترسی شبکه/پراکسی به CDN باینری‌های Prisma را بررسی و سپس فرمان را دوباره اجرا کنید. اگر پیام از نبودن `@embedded-postgres/<platform-arch>` بود، مطمئن شوید optional dependencyهای پلتفرم هنگام نصب حذف نشده‌اند (برای مثال از `npm ci --omit=optional` استفاده نشده باشد).

اگر `pg_ctl` نتواند سرور را بالا بیاورد، harness محتوای `server.log` همان cluster را به خطا اضافه می‌کند؛ علت واقعی را از همان بخش بررسی کنید. دایرکتوری موقت حتی در این مسیر خطا نیز پاک می‌شود.

> یک اجرای سبز که در خروجی آن suiteها `skipped` باشند، تأیید e2e محسوب نمی‌شود. در CI باید تعداد suiteهای اجراشده و skipped نیز بررسی شود.
