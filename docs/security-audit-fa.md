# گزارش ممیزی یکپارچگی و امنیت بک‌اند

تاریخ: ۱۴۰۵/۰۶/۰۳ (۲۰۲۶-۰۸-۲۵)

## نتیجهٔ تحویل

دو نسخهٔ موازی `integrity.sql` ادغام شد. نسخهٔ نهایی شامل **۳۳ CHECK نام‌دار، ۱۰ unique/partial index و ۱۴ اتصال trigger** است (۱۱ جدول append-only به‌علاوهٔ سه trigger envelope وبهوک، خرید معتبر، و چرخهٔ Category). همهٔ CHECKها به‌صورت catalog-aware و همهٔ indexها با `IF NOT EXISTS` نصب می‌شوند؛ triggerها با `CREATE OR REPLACE FUNCTION` و `DROP TRIGGER IF EXISTS` قابل اجرای مجدد هستند.

اسکریپت‌ها مستقیماً PostgreSQL را هدف می‌گیرند و برای Neon از `DATABASE_URL` و SSL استفاده می‌کنند:

```bash
npm run db:integrity   # نصب integrity.sql؛ اجرای دوباره امن است
npm run db:verify      # خواندن pg_constraint / pg_indexes / information_schema.triggers
npm run db:audit       # تطبیق کامنت‌های constraint در schema.prisma با SQL
```

**مهم:** اگر دادهٔ موجود ناسالم باشد، `db:integrity` عمداً fail می‌شود. این رفتار درست است؛ ابتدا رکوردهای ناسالم را پیدا و پاک/اصلاح کنید، نه اینکه constraint را دور بزنید.

## آنچه اجرا شد

- `npm run db:audit`: کامنت‌های مرتبط با CHECK، unique جزئی، trigger، append-only و cycle را استخراج می‌کند و باید با صفر مورد جاافتاده تمام شود.
- `node --check` برای هر سه اسکریپت دیتابیس: موفق.
- تست واحد موجود: در این محیط **۱۴ suite کشف شد؛ ۶ suite و ۵۶ تست سبز و ۸ suite به علت نبود Prisma Client اجرا نشدند**. بنابراین ادعای ۱۶۲ تست سبز نمی‌کنم.
- `prisma generate`: اجرا نشد؛ اتصال TLS به `https://binaries.prisma.sh` در sandbox قطع شد. `npx tsc --noEmit` نیز به همین دلیل با خطاهای generated client متوقف شد.
- e2e با PostgreSQL embedded در کد اصلاح شده است: migration و `integrity.sql` را با `pg` مستقیماً اجرا می‌کند و Prisma Client را با `@prisma/adapter-pg` می‌سازد؛ دیگر به `prisma db push` یا دانلود schema engine برای ساخت دیتابیس تست وابسته نیست. اجرای واقعی e2e این session به دلیل همان generated client/network انجام نشد.

## سوراخ‌ها و اصلاحات مهم

- رزرو موجودی با quantity صفر می‌توانست checkout را به ۵۰۰ برساند؛ quantity مثبت و به‌روزرسانی شرطی موجودی اعمال شد.
- JSON خراب و body بزرگ اکنون به خطاهای ۴۰۰/۴۱۳ نگاشت می‌شوند، نه ۵۰۰.
- لغو سفارش CouponUsage append-only را حذف نمی‌کند؛ ledger حفظ و usage فعال idempotent بازسازی می‌شود.
- تست‌های همزمانی تاریخچهٔ append-only را هنگام setup پاک نمی‌کنند.
- queryهای همپوشان جست‌وجوی coupon در تراکنش حذف شد.
- جعل `Review.isVerifiedPurchase` با تطبیق user/product/order پرداخت‌شده در trigger رد می‌شود.
- envelope وبهوک immutable است؛ ۱۱ جدول تاریخچه در برابر UPDATE/DELETE محافظت می‌شوند.
- uniqueهای primary phone، primary product media و ترکیب variant با گزینه‌های nullable اضافه شد.
- Category اکنون در هر عمقی (از جمله A→B→C→A) با trigger بازگشتی محافظت می‌شود.
- verifier از catalog واقعی PostgreSQL می‌خواند و فقط وجود متن SQL را بررسی نمی‌کند.

## مواردی که باید در CI/استیجینگ Neon تکمیل و ثبت شوند

سناریوهای نفوذ دو کاربر باید با fixture واقعی اجرا شوند: IDOR برای سفارش/آدرس/مرجوعی با پاسخ **۴۰۴ نه ۴۰۳**، لغو سفارش کاربر دیگر، نادیده‌گرفتن قیمت و تخفیف کلاینت در checkout، mass assignment فیلدهای حساس، race همزمان coupon یک‌بارمصرف، body حداقل ۱۰۰KB، و اطمینان از نبود ۵۰۰ یا stack trace. این‌ها در این محیط به‌دلیل generated client قابل ادعای سبز نیستند.

## چک‌لیست production

- [ ] `SWAGGER_ENABLED=false`
- [ ] secret واقعی و تصادفی برای JWT، OTP pepper، audit hash و encryption؛ نگهداری در secret manager و rotation
- [ ] `PAYMENT_PROVIDER=zarinpal` با credential و callback واقعی؛ replay و reconciliation پرداخت تست شود
- [ ] Redis واقعی، مشترک، دارای TLS/auth و persistence؛ rate limit حافظه‌ای برای چند replica کافی نیست
- [ ] CORS با allowlist دقیق دامنه‌های production؛ هرگز `*` همراه credentials
- [ ] backup و PITR در Neon فعال و restore drill ثبت شود
- [ ] ابتدا backup/staging، سپس `npm run db:integrity` و `npm run db:verify` روی Neon؛ خروجی catalog ذخیره شود
- [ ] محدودیت body/upload در reverse proxy، malware scan، لاگ بدون PII و alert برای constraint/payment failure

پس از در دسترس بودن Prisma engine یا cache CI، این سه مورد باید با خروجی عددی به release پیوست شوند: `npm test -- --runInBand` (هدف ۱۶۲ تست)، `npm run test:e2e` (هدف ۳۲ تست پایه به‌علاوهٔ suite نفوذ)، و `npx tsc --noEmit`.
