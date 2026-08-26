# پوشهٔ sandbox — فقط برای محیط پیش‌نمایش Arena

این فایل‌ها **لازمِ سیستم خودت نیستند**. روی ویندوز/سیستم عادی خودت طبق
`START-HERE-fa.md` با Neon و `npm run start:dev` کار کن.

## چرا این پوشه وجود دارد؟

در sandbox پیش‌نمایش:

1. شبکه فقط npm را باز می‌گذارد — باینری‌های Prisma از `binaries.prisma.sh`
   دانلود نمی‌شوند؛ کلاینت با engine نوع WASM ساخته می‌شود که به driver
   adapter نیاز دارد (`prisma-wasm-patch.cjs` آن را تزریق می‌کند، بدون
   دست‌زدن به کد پروژه).
2. پوشه‌های `node_modules` و فایل‌های ignored (مثل `.env`) بین نوبت‌ها
   ریست می‌شوند — `pgboot.cjs` کل زنجیره (نصب، generate، دیتابیس توکار،
   مهاجرت‌ها، seed) را به‌صورت idempotent بالا می‌آورد.

## اجزا

| فایل | نقش |
|---|---|
| `pgboot.cjs` | PostgreSQL توکار روی پورت 54329 + اعمال مهاجرت‌های واقعی + seed واقعی |
| `prisma-wasm-patch.cjs` | تزریق `@prisma/adapter-pg` به PrismaClient برای engine از نوع WASM |

## ترتیب اجرا (در Arena)

```
# 1) دیتابیس (پروسهٔ بلندمدت)
node sandbox/pgboot.cjs          # با start_process

# 2) env بک‌اند (اگر .env نبود)
cd backend && node scripts/setup-env.mjs
# سپس در .env:
#   DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres?schema=public
#   OTP_FIXED_CODE=123456   (لاگین آزمایشی بدون دیدن لاگ)

# 3) API (پروسهٔ بلندمدت)
cd backend && npm run build
NODE_OPTIONS="--require ../sandbox/prisma-wasm-patch.cjs" node dist/main.js

# 4) فرانت (پروسهٔ بلندمدت، پورت 3001)
cd frontend && npm run dev -- -p 3001
```

فرانت `.env.local` را می‌خواند: `API_PROXY_TARGET=http://127.0.0.1:3000`
پروکسی same-origin را فعال می‌کند (تعریف `rewrites` در `next.config.ts`).
