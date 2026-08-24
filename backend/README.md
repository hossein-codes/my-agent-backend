# Fashion Backend — راهنمای راه‌اندازی

NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis 7

> ⚠️ **وضعیت فعلی:** کد کامل است و ۱۴۹ تست سبز دارد، ولی **هنوز هیچ‌وقت build نشده و
> سرور بالا نیامده**. دلیلش این است که `@prisma/client` در محیط توسعه generate نشد.
> مسیر زیر را طی کن تا بسته شود.

---

## مسیر راه‌اندازی — ۶ قدم

### قدم ۰ — پیش‌نیازها

```bash
node -v      # باید ≥ 20 باشد
docker -v    # برای Postgres و Redis
```

### قدم ۱ — زیرساخت + generate + .env

```bash
cd backend
npm run infra:setup
```

این اسکریپت (`scripts/devbox.sh`) چهار کار می‌کند:
1. `docker compose up -d` → Postgres 16 + Redis 7
2. `.env.development` را از `.env.example` می‌سازد و **secret واقعی با `openssl rand -hex 32` تولید می‌کند**
3. `npm install`
4. `npm run prisma:generate`

**✅ معیار موفقیت:** `node_modules/.prisma/client/index.d.ts` وجود داشته باشد.

```bash
ls node_modules/.prisma/client/index.d.ts
npx tsc --noEmit -p tsconfig.json   # باید ۰ خطا بدهد
```

> اگر `tsc` بعد از generate هنوز خطا داد، **خروجی کامل را بفرست** — یعنی کد من با
> تایپ‌های واقعی پریزما نمی‌خواند و باید اصلاح شود.

### قدم ۲ — ساخت migration

```bash
npm run prisma:migrate:dev -- --name init
```

**انتظار خطا دارم.** schema پر است از مواردی که Prisma تولید نمی‌کند —
فهرست کامل در `docs/db-integrity-checklist-fa.md`:

- **۳۰ محدودیت CHECK** (مثل `Order.paidAmount` باید بین ۰ و `totalAmount` باشد)
- **۸ ایندکس یکتای جزئی** (مثل «یک سبد ACTIVE به ازای هر کاربر»)
- **۷ تریگر** (جدول‌های append-only و guard تریگر `Review.isVerifiedPurchase`)

اگر migrate موفق شد ولی اینها ساخته نشدند، دیتابیس **کار می‌کند ولی محافظت‌نشده است** —
یعنی یک باگ در کد می‌تواند دادهٔ نامعتبر بنویسد.

### قدم ۳ — seed

```bash
npm run seed
```

RBAC (۷ نقش + مجوزها)، رنگ/سایز/ویژگی، درخت دسته‌بندی، برند، و یک محصول نمونه.
**Idempotent است** — می‌توانی چند بار اجرا کنی.

### قدم ۴ — بالا آوردن سرور

```bash
npm run start:dev
```

**این اولین باری است که Nest گراف DI را می‌سازد.** اگر provider گم‌شده یا
circular dependency باشد، اینجا معلوم می‌شود — نه در `tsc`.

**✅ معیار موفقیت:**

```bash
curl -s localhost:3000/health/live          # → {"status":"ok",...}
curl -s localhost:3000/health/ready         # → {"status":"ready",...}
open http://localhost:3000/docs             # Swagger UI
```

### قدم ۵ — تست دود (smoke test) جریان اصلی

```bash
# ۱) لاگین — در توسعه کد OTP در لاگ سرور چاپ می‌شود
curl -s -X POST localhost:3000/api/v1/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+989121234567"}'

# کد را از ترمینال سرور بردار، سپس:
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+989121234567","code":"<کد>"}' | jq -r .accessToken)

# ۲) کاتالوگ
curl -s localhost:3000/api/v1/catalog/products | jq '.total'
curl -s localhost:3000/api/v1/catalog/categories | jq

# ۳) پروفایل
curl -s localhost:3000/api/v1/users/me -H "Authorization: Bearer $TOKEN" | jq
```

---

## تعریف «تمام»

بک‌اند وقتی بسته است که **همهٔ اینها سبز باشند**:

- [ ] `npx tsc --noEmit -p tsconfig.json` → **۰ خطا**
- [ ] `npm run build` → **exit 0**
- [ ] `npm test` → **149/149 سبز** (الان سبز است)
- [ ] `npm run prisma:migrate:dev` → موفق
- [ ] `npm run seed` → موفق
- [ ] `npm run start:dev` → سرور بالا می‌آید
- [ ] `GET /health/ready` → `{"status":"ready"}`
- [ ] smoke test بالا → هر سه پاسخ درست
- [ ] **۴۵ مورد `docs/db-integrity-checklist-fa.md` اعمال شده**

---

## اگر خطا گرفتی

خروجی **کامل** این چهار دستور را بفرست:

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | tail -50
npm run prisma:migrate:dev -- --name init 2>&1 | tail -50
npm run seed 2>&1 | tail -50
npm run start:dev 2>&1 | tail -80
```

---

## دستورات دیگر

| دستور | کار |
|---|---|
| `npm run prisma:studio` | مرورگر دیتابیس |
| `python3 scripts/gen-api-doc.py` | بازتولید `docs/api-reference-fa.md` از سورس |
| `docker compose down -v` | پاک کردن کامل دیتابیس |

## اسناد

- `docs/api-reference-fa.md` — ۱۱۱ endpoint، ۵۱ DTO
- `docs/db-integrity-checklist-fa.md` — ۴۵ مورد SQL که Prisma نمی‌سازد
- `docs/backend-review-fa.md` — بررسی کامل ساختار + باگ‌های پیدا‌شده
