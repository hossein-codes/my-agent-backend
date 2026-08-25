# گزارش نهایی ممیزی امنیت بک‌اند

تاریخ: ۱۴۰۵/۰۶/۰۳ (2026-08-25)

## دامنه و نتیجه

این مرحله لایهٔ دوم دفاعی دیتابیس را تکمیل کرد: ۳۳ `CHECK` نام‌دار، ۱۰ ایندکس فیلترشده/ویژه و triggerهای append-only برای ۱۱ جدول تاریخچه در `prisma/integrity.sql`. فایل idempotent است و اجرای مجدد آن داده یا object موجود را خراب نمی‌کند. `npm run db:audit-integrity` کامنت‌های schema را استخراج و تطبیق می‌دهد؛ `npm run db:verify` از catalog خود PostgreSQL وجود objectها را می‌سنجد (نه صرفاً وجود متن SQL).

پوشش شامل محدودیت‌های موجودی، مبالغ سفارش، قیمت جاری variant، سبد فعال، رزرو فعال، پرداخت باز، کوپن، قیمت و quantity، خودوالدی Category، snapshot مالی، خطوط سفارش و ارسال/مرجوعی است. جعل `Review.isVerifiedPurchase` نیز با trigger و تطبیق user/product/order پرداخت‌شده رد می‌شود. envelope وب‌هوک غیرقابل بازنویسی و ledger/historyها غیرقابل UPDATE/DELETE شدند.

## تست‌های امنیتی

harness موجود PostgreSQL واقعی disposable را با `db push`، سپس `integrity.sql` بالا می‌آورد؛ بنابراین تست‌ها به mock دیتابیس متکی نیستند. پوشش موجود شامل احراز هویت تمام routeهای admin و customer، عدم تغییر موجودی بدون مجوز، عدم افشای Prisma/secret/stack، validation سبد، هم‌زمانی موجودی و پرداخت idempotent است.

در این checkout اجرای کامل ممکن نشد: `prisma generate` هنگام دانلود binary از `binaries.prisma.sh` با خطای TLS/network قطع شد و در نتیجه Prisma Client تولید نشد. خروجی واقعی unit: ۶ suite و ۵۶ تست سبز؛ ۸ suite به علت نبود generated client اصلاً load نشدند. e2e و اعمال روی Neon اجرا نشدند. همچنین `DATABASE_URL` محیط Neon در session حاضر تنظیم نبود. این موارد **سبز فرض نشده‌اند** و پیش از merge/production باید در CI دارای network و secret اجرا شوند.

## سوراخ‌های یافته و رفع‌شده

- `integrity.sql` قبلی فقط ۹ CHECK داشت و partial uniqueها، تاریخ‌های قیمت، Coupon، Category و اغلب جدول‌های تاریخچه را حفاظت نمی‌کرد؛ تکمیل شد.
- SQL قبلی idempotent نبود و اجرای دوم به duplicate constraint می‌خورد؛ اکنون افزودن CHECKها catalog-aware و indexها `IF NOT EXISTS` هستند.
- امکان جعل مستقیم verified purchase و بازنویسی payload وب‌هوک در سطح DB وجود داشت؛ trigger اضافه شد.
- uniqueهای primary phone، primary product media و گزینه‌های nullable variant جا افتاده بودند؛ اضافه شدند.
- verification قبلی صرفاً وجود نداشت؛ verifier اکنون `pg_constraint`، `pg_indexes` و `information_schema.triggers` را مستقیم می‌خواند.

## ریسک‌های باز (مانع production)

1. اجرای واقعی ۱۶۲ unit و ۳۲ e2e و typecheck در این محیط به دلیل دانلود نشدن Prisma engine تأیید نشده است.
2. `db:integrity` و `db:verify` روی Neon production به علت نبود `DATABASE_URL` اجرا نشده‌اند؛ rollout باید ابتدا روی branch/staging Neon و با backup انجام شود. افزودن constraint روی دادهٔ ناسالم fail می‌شود و این رفتار مطلوب است.
3. سناریوهای نفوذ درخواستیِ دو کاربر (IDOR سفارش/آدرس/مرجوعی، cancel بین‌کاربری)، دستکاری checkout، مسابقهٔ کوپن و payloadهای ۱۰۰KB/بسیار بزرگ هنوز به‌صورت suite مستقل کامل نشده‌اند؛ پوشش فعلی را نباید معادل آن‌ها دانست.
4. trigger چرخهٔ چندسطحی Category را نمی‌بندد؛ فقط self-parent مطابق schema منع شده است. جلوگیری از cycle کامل باید در service یا trigger recursive افزوده شود.
5. rate limit حافظه‌ای برای چند replica کافی نیست و production باید Redis مشترک داشته باشد.

## چک‌لیست production

- [ ] `DATABASE_URL` مستقیم/pooled صحیح Neon با `sslmode=require`؛ اجرای `npm run db:integrity` و سپس `npm run db:verify`
- [ ] اجرای `npm run test -- --runInBand`، `npm run test:e2e` و `npx tsc --noEmit` در CI و ثبت تعداد دقیق
- [ ] `SWAGGER_ENABLED=false`
- [ ] secretهای تصادفی واقعی برای JWT، OTP pepper، audit hash و encryption؛ rotation و secret manager
- [ ] `PAYMENT_PROVIDER=zarinpal` و credential/callback production؛ تست sandbox و replay webhook
- [ ] Redis واقعی، TLS/auth، persistence مناسب و rate limit مشترک
- [ ] allowlist دقیق CORS فقط دامنه‌های frontend production؛ هرگز `*` با credentials
- [ ] provider واقعی SMS/email/storage، محدودیت اندازه upload/body در reverse proxy و malware scan
- [ ] backup/PITR، alert برای خطای constraint و reconciliation پرداخت، log بدون PII
- [ ] اجرای suite نفوذ بازِ بند ۳ و ممنوعیت merge در صورت 500 یا stack trace
