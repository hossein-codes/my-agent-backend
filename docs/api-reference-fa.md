<!-- تولیدشده از سورس. برای بازسازی: python3 backend/scripts/gen-api-doc.py -->

## آنچه فرانت باید بداند

### ۱) جریان احراز هویت (OTP)

```
POST /auth/otp/request   { phone: "+989121234567" }
   → 200 { sent: true, expiresIn: 180 }
   → در توسعه، کد در لاگ سرور چاپ می‌شود (SMS_PROVIDER=console)

POST /auth/otp/verify    { phone, code: "123456", deviceKind: "WEB" }
   → 200 { accessToken, expiresIn: 900, userId, roles: ["CUSTOMER"] }
   → refreshToken در کوکیٔ HttpOnly با path=/api/v1/auth و sameSite=lax

POST /auth/refresh       (بدون body — کوکی خوانده می‌شود)
   → 200 { accessToken, expiresIn }
```

- `expiresIn` ثانیه است؛ رفرش را ~۶۰ ثانیه قبل از انقضا برنامه‌ریزی کنید.
- کوکی فقط به `/api/v1/auth` می‌رود → `fetch` باید `credentials: 'include'` داشته باشد.
- **refresh token یک‌بارمصرف است.** دو درخواست refresh همزمان = باطل شدن کل خانوادهٔ سشن. mutex بگذارید.

### ۲) پاکت خطا — همیشه همین شکل

```json
{ "code": "auth.otp_invalid", "message": "...", "details": {...}, "requestId": "...", "timestamp": "..." }
```

روی **`code`** سوییچ کنید، نه `message`. خطاهای 5xx همیشه پیام عمومی دارند.
`requestId` را در UI خطا نشان دهید — همان کلیدی است که در لاگ سرور پیدا می‌شود.

### ۳) پاکت صفحه‌بندی — همهٔ لیست‌ها

```json
{ "items": [...], "total": 42, "page": 1, "pageSize": 20,
  "totalPages": 3, "hasNext": true, "hasPrev": false }
```

### ۴) حداقل endpoint‌های ویترین

```
GET  /catalog/highlights        بلوک‌های صفحهٔ اصلی
GET  /catalog/products          لیست + فیلتر + جستجو + مرتب‌سازی
GET  /catalog/products/:slug    جزئیات محصول
GET  /catalog/categories        درخت دسته‌بندی
GET  /catalog/facets            رنگ/سایز/ویژگی برای سایدبار
GET  /catalog/search/suggest    typeahead
GET  /shipping/methods          روش‌های ارسال با قیمت
POST /checkout/preview          قیمت‌گذاری سبد (بدون تغییر)
POST /checkout                  ثبت سفارش (اتمیک + idempotent)
POST /payments/orders/:id/initiate  → gatewayUrl
```

فیلترهای `GET /catalog/products` به‌صورت رشتهٔ کاماجدا:
`?category=men&brands=a,b&colors=black&sizes=M,L&attrs=material:cotton|fit:regular&minPrice=0&maxPrice=1000000&sort=price_asc&inStock=true&page=1&pageSize=20`

> ⚠️ **`sizes` با LABEL فرستاده می‌شود نه slug** — مدل `Size` ستون slug ندارد.

### ۵) پرداخت — نکتهٔ حیاتی

ریدایرکت درگاه به `FRONTEND_BASE_URL/payment-result?status=...&order=FA-...` می‌رود،
ولی **این ریدایرکت هرگز پرداخت را قطعی نمی‌کند**. صفحهٔ نتیجه باید
`POST /payments/verify` را صدا بزند و `orderStatus` را از **پاسخ** بخواند، نه از URL.

### ۶) CORS

`CORS_ORIGINS` باید origin دقیق Next.js باشد. وایلدکارد مجاز نیست چون `credentials: true` است.

---

# قرارداد API — مرجع فرانت‌اند

> تولیدشده از سورس واقعی با `python3 backend/scripts/gen-api-doc.py`.

> **Base URL:** `{ORIGIN}/api/v1` · **Auth:** `Authorization: Bearer <accessToken>`

> **پول:** همیشه Integer **تومان** (`IRT`) — هرگز اعشار نفرستید.


**111 endpoint · 19 گروه · 52 DTO**

## فهرست

- **/admin** — 50 endpoint
- **/auth** — 8 endpoint
- **/campaigns** — 1 endpoint
- **/cart** — 5 endpoint
- **/catalog** — 9 endpoint
- **/checkout** — 3 endpoint
- **/files** — 1 endpoint
- **/health** — 2 endpoint
- **/identity** — 2 endpoint
- **/notifications** — 5 endpoint
- **/orders** — 3 endpoint
- **/payments** — 4 endpoint
- **/refunds** — 1 endpoint
- **/returns** — 3 endpoint
- **/reviews** — 2 endpoint
- **/shipping** — 2 endpoint
- **/system** — 1 endpoint
- **/users** — 6 endpoint
- **/wishlist** — 3 endpoint

---

## `/admin`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/admin/campaigns` | 🔐 `products.read` | — | `PaginationDto` | — | `list` |
| `POST` | `/admin/campaigns` | 🔐 `products.write` | `CampaignCreateDto` | — | — | `create` |
| `PATCH` | `/admin/campaigns/:id/status` | 🔐 `products.write` | — | — | — | `setStatus` |
| `GET` | `/admin/catalog/options` | 🔐 `products.read` | — | — | — | `options` |
| `GET` | `/admin/catalog/products` | 🔐 `products.read` | — | `PaginationDto` | — | `list` |
| `POST` | `/admin/catalog/products` | 🔐 `products.write` | `ProductCreateDto` | — | — | `create` |
| `DELETE` | `/admin/catalog/products/:id` | 🔐 `products.delete` | — | — | — | `softDelete` |
| `PATCH` | `/admin/catalog/products/:id` | 🔐 `products.write` | `ProductUpdateDto` | — | — | `update` |
| `PATCH` | `/admin/catalog/products/:id/status` | 🔐 `products.write` | `PublishDto` | — | — | `setStatus` |
| `POST` | `/admin/catalog/products/:id/variants` | 🔐 `products.write` | `VariantCreateDto` | — | — | `addVariant` |
| `PATCH` | `/admin/catalog/variants/:variantId/price` | 🔐 `products.write` | `PriceDto` | — | — | `setPrice` |
| `GET` | `/admin/coupons` | 🔐 `settings.manage` | — | `PaginationDto` | — | `list` |
| `POST` | `/admin/coupons` | 🔐 `settings.manage` | `CouponCreateDto` | — | — | `create` |
| `PATCH` | `/admin/coupons/:id/status` | 🔐 `settings.manage` | — | — | — | `setStatus` |
| `GET` | `/admin/coupons/:id/usages` | 🔐 `settings.manage` | — | `PaginationDto` | — | `usages` |
| `GET` | `/admin/identity/requests` | 🔐 `identity.review` | — | `PaginationDto` | — | `queue` |
| `GET` | `/admin/identity/requests/:id/national-code` | 🔐 `identity.review` | — | — | — | `revealNationalCode` |
| `POST` | `/admin/identity/requests/:id/review` | 🔐 `identity.review` | `ReviewDto` | — | — | `review` |
| `GET` | `/admin/inventory/:variantId` | 🔐 `inventory.read` | — | — | — | `?` |
| `POST` | `/admin/inventory/:variantId/adjust` | 🔐 `inventory.write` | `StockAdjustDto` | — | — | `?` |
| `GET` | `/admin/inventory/:variantId/movements` | 🔐 `inventory.read` | — | `PaginationDto` | — | `movements` |
| `GET` | `/admin/inventory/low-stock` | 🔐 `inventory.read` | — | `PaginationDto` | — | `lowStock` |
| `GET` | `/admin/orders` | 🔐 `order.read` | — | `PaginationDto` | — | `list` |
| `GET` | `/admin/orders/:id` | 🔐 `order.read` | — | — | — | `?` |
| `POST` | `/admin/orders/:id/ship` | 🔐 `order.manage` | `ShipmentDto` | — | — | `ship` |
| `POST` | `/admin/orders/:id/transition` | 🔐 `order.manage` | `TransitionDto` | — | — | `transition` |
| `GET` | `/admin/rbac/permissions` | 🔐 `roles.read` | — | — | — | `?` |
| `POST` | `/admin/rbac/permissions` | 🔐 `roles.write` | `PermissionCreateDto` | — | — | `createPermission` |
| `GET` | `/admin/rbac/roles` | 🔐 `roles.read` | — | — | — | `roles` |
| `POST` | `/admin/rbac/roles/:slug/permissions` | 🔐 `roles.write` | `PermissionDto` | — | — | `setRolePermissions` |
| `GET` | `/admin/rbac/users/:userId/roles` | 🔐 `roles.read` | — | — | — | `userRoles` |
| `POST` | `/admin/rbac/users/:userId/roles` | 🔐 `roles.assign` | `AssignRolesDto` | — | — | `assignRoles` |
| `DELETE` | `/admin/rbac/users/:userId/roles/:roleSlug` | 🔐 `roles.assign` | — | — | — | `revokeRole` |
| `GET` | `/admin/refunds` | 🔐 `payment.read` | — | `PaginationDto` | — | `list` |
| `POST` | `/admin/refunds` | 🔐 `refund.create` | `CreateRefundDto` | — | — | `?` |
| `POST` | `/admin/refunds/:id/complete` | 🔐 `refund.approve` | — | — | — | `complete` |
| `GET` | `/admin/reports/orders-by-status` | 🔐 `audit.read` | — | — | — | `ordersByStatus` |
| `GET` | `/admin/reports/overview` | 🔐 `audit.read` | — | `RangeDto` | — | `overview` |
| `GET` | `/admin/reports/top-products` | 🔐 `audit.read` | — | `TopProductsQueryDto` | — | `topProducts` |
| `GET` | `/admin/returns` | 🔐 `order.read` | — | `PaginationDto` | — | `queue` |
| `POST` | `/admin/returns/:id/review` | 🔐 `order.manage` | `ReviewReturnDto` | — | — | `review` |
| `GET` | `/admin/reviews` | 🔐 `review.moderate` | — | `PaginationDto` | — | `queue` |
| `POST` | `/admin/reviews/:id/moderate` | 🔐 `review.moderate` | `ModerateDto` | — | — | `moderate` |
| `GET` | `/admin/system/flags` | 🔐 `settings.manage` | — | — | — | `?` |
| `PATCH` | `/admin/system/flags/:key` | 🔐 `settings.manage` | `FlagDto` | — | — | `setFlag` |
| `PATCH` | `/admin/system/settings/:key` | 🔐 `settings.manage` | `SettingDto` | — | — | `setSetting` |
| `GET` | `/admin/users` | 🔐 `user.manage` | — | `PaginationDto` | — | `list` |
| `DELETE` | `/admin/users/:id` | 🔐 `user.manage` | — | — | — | `softDelete` |
| `PATCH` | `/admin/users/:id/status` | 🔐 `user.manage` | `AdminUserStatusDto` | — | — | `setStatus` |
| `DELETE` | `/admin/users/:userId/sessions/:sessionId` | 🔐 `user.manage` | — | — | — | `revoke` |

---

## `/auth`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `POST` | `/auth/logout` | 🔑 JWT | — | — | — | `logout` |
| `POST` | `/auth/otp/request` | 🔓 public | `OtpRequestDto` | — | `otp.request` | `requestOtp` |
| `POST` | `/auth/otp/verify` | 🔓 public | `OtpVerifyDto` | — | `otp.verify` | `verifyOtp` |
| `POST` | `/auth/recovery/confirm` | 🔓 public | `RecoveryConfirmDto` | — | `recovery.confirm` | `confirmRecovery` |
| `POST` | `/auth/recovery/request` | 🔓 public | `RecoveryRequestDto` | — | `recovery.request` | `requestRecovery` |
| `POST` | `/auth/refresh` | 🔓 public | `RefreshDto` | — | `session.refresh` | `refresh` |
| `GET` | `/auth/sessions` | 🔑 JWT | — | — | — | `sessionsList` |
| `DELETE` | `/auth/sessions/:id` | 🔑 JWT | — | — | — | `revokeOwnSession` |

---

## `/campaigns`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/campaigns/active` | 🔓 public | — | — | — | `active` |

---

## `/cart`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/cart` | 🔑 JWT | — | — | — | `get` |
| `POST` | `/cart/coupon/validate` | 🔑 JWT | `CouponDto` | — | `coupon.validate` | `validateCoupon` |
| `POST` | `/cart/items` | 🔑 JWT | `AddItemDto` | — | — | `add` |
| `DELETE` | `/cart/items/:variantId` | 🔑 JWT | — | — | — | `remove` |
| `POST` | `/cart/items/:variantId` | 🔑 JWT | `UpdateItemDto` | — | — | `update` |

---

## `/catalog`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/catalog/brands` | 🔓 public | — | — | — | `?` |
| `GET` | `/catalog/categories` | 🔓 public | — | — | — | `?` |
| `GET` | `/catalog/collections` | 🔓 public | — | — | — | `?` |
| `GET` | `/catalog/facets` | 🔓 public | — | — | — | `?` |
| `GET` | `/catalog/highlights` | 🔓 public | — | `HighlightsQueryDto` | — | `highlights` |
| `GET` | `/catalog/products` | 🔓 public | — | `ProductListQueryDto` | — | `listProducts` |
| `GET` | `/catalog/products/:productId/reviews` | 🔓 public | — | `PaginationDto` | — | `list` |
| `GET` | `/catalog/products/:slug` | 🔓 public | — | — | — | `?` |
| `GET` | `/catalog/search/suggest` | 🔓 public | — | `SuggestQueryDto` | — | `suggest` |

---

## `/checkout`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `POST` | `/checkout` | 🔑 JWT | `CheckoutSubmitDto` | — | `payment.initiate` | `submit` |
| `POST` | `/checkout/preview` | 🔑 JWT | `CheckoutPreviewDto` | — | `coupon.validate` | `preview` |
| `GET` | `/checkout/summary` | 🔑 JWT | — | — | — | `summary` |

---

## `/files`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `POST` | `/files/upload/:purpose` | 🔐 `media.write` | `multipart: file` | — | — | `upload` |

---

## `/health`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/health/live` | 🔓 public | — | — | — | `?` |
| `GET` | `/health/ready` | 🔓 public | — | — | — | `ready` |

---

## `/identity`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/identity/me` | 🔑 JWT | — | — | — | `mine` |
| `POST` | `/identity/requests` | 🔑 JWT | `SubmitIdentityDto` | — | — | `submit` |

---

## `/notifications`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/notifications` | 🔑 JWT | — | `PaginationDto` | — | `list` |
| `POST` | `/notifications/:id/read` | 🔑 JWT | — | — | — | `read` |
| `GET` | `/notifications/preferences` | 🔑 JWT | — | — | — | `preferences` |
| `POST` | `/notifications/preferences` | 🔑 JWT | `PreferencesDto` | — | — | `updatePreferences` |
| `POST` | `/notifications/read-all` | 🔑 JWT | — | — | — | `readAll` |

---

## `/orders`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/orders` | 🔑 JWT | — | `PaginationDto` | — | `list` |
| `GET` | `/orders/:id` | 🔑 JWT | — | — | — | `?` |
| `POST` | `/orders/:id/cancel` | 🔑 JWT | `CancelDto` | — | — | `cancel` |

---

## `/payments`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/payments/callback` | 🔓 public | — | `CallbackQuery` | `payment.callback` | `redirectCallback` |
| `POST` | `/payments/orders/:orderId/initiate` | 🔑 JWT | — | — | `payment.initiate` | `initiate` |
| `POST` | `/payments/verify` | 🔓 public | — | — | `payment.callback` | `verify` |
| `POST` | `/payments/webhook` | 🔓 public | `WebhookDto` | — | `payment.callback` | `webhook` |

---

## `/refunds`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/refunds/me` | 🔑 JWT | — | `PaginationDto` | — | `mine` |

---

## `/returns`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/returns` | 🔑 JWT | — | `PaginationDto` | — | `mine` |
| `POST` | `/returns` | 🔑 JWT | `ReturnRequestDto` | — | — | `request` |
| `GET` | `/returns/:id` | 🔑 JWT | — | — | — | `detail` |

---

## `/reviews`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `POST` | `/reviews` | 🔑 JWT | `CreateReviewDto` | — | `review.create` | `create` |
| `POST` | `/reviews/:id` | 🔑 JWT | `UpdateReviewDto` | — | — | `update` |

---

## `/shipping`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/shipping/methods` | 🔓 public | — | `QuoteQueryDto` | — | `?` |
| `GET` | `/shipping/provinces` | 🔓 public | — | — | — | `?` |

---

## `/system`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/system/settings` | 🔓 public | — | — | — | `publicSettings` |

---

## `/users`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/users/me` | 🔑 JWT | — | — | — | `me` |
| `PATCH` | `/users/me` | 🔑 JWT | `UpdateProfileDto` | — | — | `updateMe` |
| `POST` | `/users/me/emails` | 🔑 JWT | `AddEmailDto` | — | — | `addEmail` |
| `DELETE` | `/users/me/emails/:id` | 🔑 JWT | — | — | — | `removeEmail` |
| `POST` | `/users/me/phones` | 🔑 JWT | `AddPhoneDto` | — | — | `addPhone` |
| `DELETE` | `/users/me/phones/:id` | 🔑 JWT | — | — | — | `removePhone` |

---

## `/wishlist`

| متد | مسیر | دسترسی | body | query | rate limit | handler |
|---|---|---|---|---|---|---|
| `GET` | `/wishlist` | 🔑 JWT | — | `PaginationDto` | — | `list` |
| `POST` | `/wishlist` | 🔑 JWT | `AddDto` | — | — | `add` |
| `DELETE` | `/wishlist/:productId` | 🔑 JWT | — | — | — | `remove` |

---

## شکل DTOها

> «لازم» یعنی بدون `@IsOptional`. قواعد، decoratorهای class-validator هستند.


### `AddDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `productId` | `string` | ✅ | `@IsUUID` |
| `variantId` | `string` | — | `@IsUUID` |

### `AddEmailDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `email` | `string` | ✅ | `@IsString`, `@Matches` |
| `label` | `string` | — | `@IsString`, `@MaxLength` |

### `AddItemDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `variantId` | `string` | ✅ | `@IsUUID` |
| `quantity` | `number` | ✅ | `@IsInt`, `@Min`, `@Max` |

### `AddPhoneDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `phone` | `string` | ✅ | `@IsString`, `@Matches` |
| `label` | `string` | — | `@IsString`, `@MaxLength` |

### `AdminUserStatusDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `status` | `'ACTIVE' | 'BLOCKED'` | ✅ | `@IsIn` |
| `reason` | `string` | — | `@IsString`, `@MaxLength` |

### `AssignRolesDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `each` | `true }) roles!: string[]` | ✅ | `@IsArray`, `@IsString` |

### `CampaignCreateDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `name` | `string` | ✅ | `@IsString`, `@Min`, `@MaxLength` |
| `slug` | `string` | ✅ | `@IsString`, `@MaxLength` |
| `description` | `string` | — | `@IsString`, `@MaxLength` |
| `startsAt` | `string` | ✅ | `@IsString` |
| `endsAt` | `string` | — | `@IsString` |
| `type` | `[RuleDto] }) @IsArray() rules!: RuleDto[]` | ✅ | `@IsArray` |
| `type` | `[String] }) @IsOptional() @IsUUID(undefined, { each: true }) productIds?: string[]` | — | `@IsUUID` |
| `type` | `[String] }) @IsOptional() @IsUUID(undefined, { each: true }) categoryIds?: string[]` | — | `@IsUUID` |

### `CancelDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `reason` | `string` | — | `@IsString`, `@MaxLength` |

### `CheckoutPreviewDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `provinceName` | `string` | ✅ | `@IsString`, `@MaxLength` |
| `couponCode` | `string` | — | `@IsString`, `@MaxLength` |

### `AddressDto`  ⟵ پایهٔ DTOهای صفحه‌بندی

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `receiverFirstName` | `string` | ✅ | `@IsString`, `@MinLength`, `@MaxLength` |
| `receiverLastName` | `string` | ✅ | `@IsString`, `@MinLength`, `@MaxLength` |
| `example` | `'+989121234567' }) @Matches(/^\+989\d{9}$/) receiverPhone!: string` | ✅ | `@Matches` |
| `provinceName` | `string` | ✅ | `@IsString`, `@MaxLength` |
| `cityName` | `string` | ✅ | `@IsString`, `@MaxLength` |
| `district` | `string` | — | `@IsString`, `@MaxLength` |
| `example` | `'1234567890' }) @Matches(/^\d{10}$/, { message: 'postalCode must be 10 digits' }) postalCode!: string` | ✅ | `@Matches` |
| `line` | `string` | ✅ | `@IsString`, `@MaxLength` |
| `unit` | `string` | — | `@IsString`, `@MaxLength` |
| `deliveryNotes` | `string` | — | `@IsString`, `@MaxLength` |

### `CheckoutSubmitDto`  ⟵ extends `AddressDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `shippingMethodId` | `string` | ✅ | `@IsString` |
| `couponCode` | `string` | — | `@IsString`, `@MaxLength` |

### `CouponCreateDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `example` | `'SPRING20' }) @IsString() @MinLength(3) @MaxLength(32) code!: string` | ✅ | `@IsString`, `@MinLength`, `@MaxLength` |
| `example` | `20, description: 'Integer percent, 1..100' }) @IsInt() @Min(1) @Max(100) percentOff!: number` | ✅ | `@IsInt`, `@Min`, `@Max` |
| `description` | `string` | — | `@IsString`, `@MaxLength` |
| `example` | `500000 }) @IsOptional() @IsInt() @Min(0) minOrderAmount?: number` | — | `@IsInt`, `@Min` |
| `example` | `200000 }) @IsOptional() @IsInt() @Min(0) maxDiscountAmount?: number` | — | `@IsInt`, `@Min` |
| `example` | `'2026-03-01T00:00:00.000Z' }) @IsString() startsAt!: string` | ✅ | `@IsString` |
| `endsAt` | `string` | — | `@IsString` |
| `usageLimitTotal` | `number` | — | `@IsInt`, `@Min` |
| `default` | `1 }) @IsOptional() @IsInt() @Min(1) usageLimitPerUser?: number` | — | `@IsInt`, `@Min` |

### `CouponDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `code` | `string` | ✅ | `@IsString`, `@MinLength` |

### `CreateRefundDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `orderId` | `string` | ✅ | `@IsUUID` |
| `returnRequestId` | `string` | — | `@IsUUID` |
| `amount` | `number` | — | `@IsInt`, `@Min` |
| `method` | `'GATEWAY' | 'MANUAL_BANK_TRANSFER' | 'STORE_CREDIT'` | — | `@IsIn` |
| `note` | `string` | — | `@IsString`, `@MaxLength` |

### `CreateReviewDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `productId` | `string` | ✅ | `@IsUUID` |
| `rating` | `number` | ✅ | `@IsInt`, `@Min`, `@Max` |
| `title` | `string` | — | `@IsString`, `@MaxLength` |
| `body` | `string` | — | `@IsString`, `@MaxLength` |
| `orderItemId` | `string` | — | `@IsUUID` |
| `each` | `true }) mediaAssetIds?: string[]` | — | `@IsArray`, `@IsUUID` |

### `FlagDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `isEnabled` | `boolean` | ✅ | `@IsBoolean` |

### `HighlightsQueryDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `limit` | `number = 8` | — | `@IsInt`, `@Min`, `@Max` |

### `ModerateDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `decision` | `'APPROVED' | 'REJECTED' | 'HIDDEN'` | ✅ | `@IsIn` |
| `note` | `string` | — | `@IsString`, `@MaxLength` |

### `OtpRequestDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `phone` | `string` | ✅ | `@Matches` |

### `OtpVerifyDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `phone` | `string` | ✅ | `@Matches` |
| `code` | `string` | ✅ | `@IsString`, `@Matches` |
| `deviceKind` | `'WEB' | 'ANDROID' | 'IOS'` | — | `@IsIn` |
| `deviceName` | `string` | — | `@IsString`, `@MaxLength` |

### `PaginationDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `page` | `number = 1` | — | `@IsInt`, `@Min` |
| `pageSize` | `number = DEFAULT_PAGE_SIZE` | — | `@IsInt`, `@Min`, `@Max` |

### `PermissionCreateDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `example` | `'order.export' }) @IsString() @MaxLength(80) slug!: string` | ✅ | `@IsString`, `@MaxLength` |
| `category` | `string` | — | `@IsString`, `@MaxLength` |
| `description` | `string` | — | `@IsString`, `@MaxLength` |

### `PermissionDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `each` | `true }) permissionIds!: string[]` | ✅ | `@IsArray`, `@IsUUID` |

### `PreferencesDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `smsEnabled` | `boolean` | — | `@IsBoolean` |
| `emailEnabled` | `boolean` | — | `@IsBoolean` |
| `inAppEnabled` | `boolean` | — | `@IsBoolean` |
| `promotionalEnabled` | `boolean` | — | `@IsBoolean` |

### `PriceDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `example` | `450000 }) @IsInt() @Min(0) basePrice!: number` | ✅ | `@IsInt`, `@Min` |
| `salePrice` | `number` | — | `@IsInt`, `@Min` |
| `note` | `string` | — | `@IsString`, `@MaxLength` |

### `ProductCreateDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `name` | `string` | ✅ | `@IsString`, `@MinLength`, `@MaxLength` |
| `slug` | `string` | — | `@IsString`, `@Matches`, `@MaxLength` |
| `description` | `string` | — | `@IsString`, `@MaxLength` |
| `brandId` | `string` | — | `@IsUUID` |
| `each` | `true }) categoryIds?: string[]` | — | `@IsArray`, `@IsUUID` |
| `isFeatured` | `boolean` | — | `@IsBoolean` |
| `seoTitle` | `string` | — | `@IsString`, `@MaxLength` |
| `seoDescription` | `string` | — | `@IsString`, `@MaxLength` |
| `publishedAt` | `string` | — | `@IsString` |

### `ProductListQueryDto`  ⟵ extends `PaginationDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `search` | `string` | — | `@IsString` |
| `category` | `string` | — | `@IsString` |
| `includeSubcategories` | `string` | — | `@IsBooleanString` |
| `brands` | `string` | — | `@IsString` |
| `collection` | `string` | — | `@IsString` |
| `colors` | `string` | — | `@IsString` |
| `sizes` | `string` | — | `@IsString` |
| `attrs` | `string` | — | `@IsString` |
| `minPrice` | `number` | — | `@IsInt`, `@Min` |
| `maxPrice` | `number` | — | `@IsInt`, `@Min` |
| `inStock` | `string` | — | `@IsBooleanString` |
| `onSale` | `string` | — | `@IsBooleanString` |
| `featured` | `string` | — | `@IsBooleanString` |
| `sort` | `SortKey` | — | `@IsIn` |

### `ProductUpdateDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `name` | `string` | — | `@IsString`, `@MinLength`, `@MaxLength` |
| `description` | `string` | — | `@IsString`, `@MaxLength` |
| `brandId` | `string` | — | `@IsUUID` |
| `each` | `true }) categoryIds?: string[]` | — | `@IsArray`, `@IsUUID` |
| `isFeatured` | `boolean` | — | `@IsBoolean` |
| `seoTitle` | `string` | — | `@IsString`, `@MaxLength` |
| `seoDescription` | `string` | — | `@IsString`, `@MaxLength` |

### `PublishDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `status` | `string` | ✅ | `@IsIn` |
| `publishedAt` | `string` | — | `@IsString` |
| `unpublishAt` | `string` | — | `@IsString` |

### `QuoteQueryDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `province` | `string` | — | `@IsString`, `@MaxLength` |
| `subtotal` | `number = 0` | — | `@IsInt`, `@Min` |
| `weightGrams` | `number = 0` | — | `@IsInt`, `@Min` |

### `RangeDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `from` | `string` | — | `@IsISO8601` |
| `to` | `string` | — | `@IsISO8601` |

### `RecoveryConfirmDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `token` | `string` | ✅ | `@IsString`, `@Length` |
| `newPhone` | `string` | ✅ | `@Matches` |

### `RecoveryRequestDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `email` | `string` | ✅ | `@example`, `@IsString`, `@Matches` |

### `RefreshDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `refreshToken` | `string` | — | `@IsString`, `@Length` |

### `ReturnItemDto`  ⟵ عنصر آرایه

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `orderItemId` | `string` | ✅ | `@IsUUID` |
| `requestedQuantity` | `number` | ✅ | `@IsInt`, `@Min` |
| `reason` | `string` | — | `@IsString`, `@MaxLength` |
| `condition` | `string` | — | `@IsString`, `@MaxLength` |

### `ReturnRequestDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `enum` | `['REFUND', 'EXCHANGE'] }) @IsIn(['REFUND', 'EXCHANGE']) type!: 'REFUND' | 'EXCHANGE'` | ✅ | `@IsIn` |
| `reason` | `ReturnReason` | ✅ | `@IsIn` |
| `type` | `[ReturnItemDto] }) @IsArray() items!: ReturnItemDto[]` | ✅ | `@IsArray` |
| `description` | `string` | — | `@IsString`, `@MaxLength` |

### `ReviewDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `enum` | `['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED'` | ✅ | `@IsIn` |
| `note` | `string` | — | `@IsString`, `@MaxLength` |

### `ReviewReturnDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `enum` | `['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED'` | ✅ | `@IsIn` |
| `note` | `string` | — | `@IsString`, `@MaxLength` |

### `RuleDto`  ⟵ عنصر آرایه

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `enum` | `['PERCENT', 'FIXED'] }) @IsIn(['PERCENT', 'FIXED']) discountType!: 'PERCENT' | 'FIXED'` | ✅ | `@IsIn` |
| `description` | `'PERCENT = 1..100, FIXED = Toman amount' }) @IsInt() @Min(1) discountValue!: number` | ✅ | `@IsInt`, `@Min` |
| `maxDiscountAmount` | `number` | — | `@IsInt`, `@Min` |
| `minQuantity` | `number` | — | `@IsInt`, `@Min` |

### `SettingDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `value` | `string` | ✅ | `@IsString`, `@MaxLength` |
| `valueType` | `SettingValueType` | — | `@IsIn` |
| `isPublic` | `boolean` | — | `@IsBoolean` |

### `ShipmentDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `carrierName` | `string` | ✅ | `@IsString`, `@MaxLength` |
| `trackingNumber` | `string` | ✅ | `@IsString`, `@Matches` |

### `StockAdjustDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `delta` | `number` | ✅ | `@IsInt` |
| `type` | `'RECEIPT' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN'` | ✅ | `@IsIn` |
| `note` | `string` | — | `@IsString`, `@MaxLength` |

### `SubmitIdentityDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `nationalCode` | `string` | ✅ | `@Matches` |

### `SuggestQueryDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `q` | `string` | — | `@IsString`, `@MaxLength` |

### `TopProductsQueryDto`  ⟵ extends `RangeDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `limit` | `number = 10` | — | — |

### `TransitionDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `example` | `'PROCESSING' }) @IsString() @MaxLength(32) status!: string` | ✅ | `@IsString`, `@MaxLength` |
| `reason` | `string` | — | `@IsString`, `@MaxLength` |

### `UpdateItemDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `quantity` | `number` | ✅ | `@IsInt`, `@Min`, `@Max` |

### `UpdateProfileDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `firstName` | `string` | — | `@IsString`, `@MinLength`, `@MaxLength` |
| `lastName` | `string` | — | `@IsString`, `@MinLength`, `@MaxLength` |

### `UpdateReviewDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `rating` | `number` | — | `@IsInt`, `@Min`, `@Max` |
| `title` | `string` | — | `@IsString`, `@MaxLength` |
| `body` | `string` | — | `@IsString`, `@MaxLength` |

### `VariantCreateDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `example` | `'TS-BLK-M' }) @IsString() @MinLength(2) @MaxLength(64) sku!: string` | ✅ | `@IsString`, `@MinLength`, `@MaxLength` |
| `colorId` | `string` | — | `@IsUUID` |
| `sizeId` | `string` | — | `@IsUUID` |
| `example` | `450000, description: 'Integer Toman' }) @IsInt() @Min(0) basePrice!: number` | ✅ | `@IsInt`, `@Min` |
| `example` | `390000 }) @IsOptional() @IsInt() @Min(0) salePrice?: number` | — | `@IsInt`, `@Min` |
| `initialStock` | `number` | — | `@IsInt`, `@Min` |

### `WebhookDto`

| فیلد | نوع | لازم | قواعد اعتبارسنجی |
|---|---|---|---|
| `authority` | `string` | — | `@IsString` |
| `externalId` | `string` | — | `@IsString` |
| `eventType` | `string` | — | `@IsString` |

### DTOهای یافت‌نشده (باید دستی بررسی شوند)

`CallbackQuery`
