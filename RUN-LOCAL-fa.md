# اجرای پروژه روی سیستم خودت (ویندوز) — راهنمای سریع

این راهنما کل استک (بک‌اند + فرانت) را روی سیستم شخصی بالا می‌آورد.
همه‌چیز داخل VS Code قابل اجراست؛ فقط به **Node 20+** و **Git** نیاز داری.

---

## ۱) گرفتن ریپو و باز کردن در VS Code

```powershell
git clone -b arena/01a039db-my-agent-backend https://github.com/hossein-codes/my-agent-backend.git
cd my-agent-backend
code .
```

> اگر قبلاً clone کرده‌ای: `git fetch && git checkout arena/01a039db-my-agent-backend && git pull`

---

## ۲) بک‌اند (پورت 3000)

```powershell
cd backend
npm install
npx prisma generate     # ← مهم: ساخت Prisma Client (بدون این، ۱۰۰+ خطای tsc می‌گیری!)
npm run env:setup
```

حالا فایل `backend/.env` را باز کن و فقط خط `DATABASE_URL` را با آدرس Neon خودت
عوض کن (طبق `START-HERE-fa.md` — یک خط، بدون کوتیشن، بدون `-pooler`).

اختیاری — برای لاگین آزمایشی راحت (کد ثابت `123456`) این خط را هم به `.env` اضافه کن:

```
OTP_FIXED_CODE=123456
```

ادامه:

```powershell
npm run db:check          # تست اتصال به Neon
npm run db:migrate        # اعمال مهاجرت‌ها (امن، idempotent)
npm run seed              # نقش‌ها، دسته‌ها، رنگ‌ها و…
npm run seed:demo         # کاتالوگ دمو: ۱۵ محصول فارسی + عکس‌های واقعی
npm run start:dev
```

این ترمینال را باز نگه دار — کد OTP اینجا چاپ می‌شود (یا با کد ثابت ۱۲۳۴۵۶ وارد شو).

تست: مرورگر → `http://127.0.0.1:3000/docs` باید Swagger را نشان دهد.

---

## ۳) فرانت‌اند (پورت 3001)

یک ترمینال دوم در VS Code (`Ctrl+Shift+\``):

```powershell
cd frontend
npm install
```

فایل `frontend/.env.local` را بساز با این محتوا:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1
```

اجرا:

```powershell
npm run dev -- -p 3001
```

مرورگر → **http://localhost:3001** 🎉

---

## چرا پورت 3001؟

پورت 3000 را بک‌اند گرفته. CORS بک‌اند از قبل `http://localhost:3001` را مجاز
می‌دارد، پس هیچ تنظیم اضافه‌ای لازم نیست.

## نکته‌ها

- **عکس‌های هیرو و محصولات** داخل خود ریپو هستند (`frontend/public/…`) — نیازی به دانلود جداگانه ندارند.
- **OTP**: با `OTP_FIXED_CODE=123456` هر شماره‌ای (مثل `+989121112233`) + کد `123456` وارد شو. بدون آن، کد واقعی در ترمینال بک‌اند چاپ می‌شود.
- **پرداخت**: درگاه به‌صورت پیش‌فرض mock است — صفحه `/dev-payment-gateway` باز می‌شود و پرداخت آزمایشی کامل کار می‌کند.
- **دیتابیس ریست لازم شد؟** دوباره `npm run seed && npm run seed:demo` (هر دو idempotent هستند).
- مشکلات اتصال Neon: راهنمای کامل در `docs/local-setup-fa.md` و `START-HERE-fa.md`.

## پس از بازبینی و تأیید

شاخه `arena/01a039db-my-agent-backend` شامل همه کارهای جدید است (ناوبری، هیرو،
کل فرانت). هر وقت راضی بودی می‌توانی آن را در `main` ادغام (merge) کنی.
