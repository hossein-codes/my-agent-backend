# یکپارچگی دیتابیس — چیزهایی که `prisma migrate dev` تولید نمی‌کند

> استخراج‌شده از `prisma/schema.prisma` با شمارهٔ خط، تا قابل ردیابی باشد.

> Prisma فقط جدول، ستون، ایندکس معمولی و FK می‌سازد. **هیچ‌کدام از موارد زیر را نمی‌سازد.**

> اگر اعمال نشوند، این محدودیت‌ها فقط در لایهٔ اپلیکیشن هستند — یعنی یک باگ یا یک کوئری دستی می‌تواند دادهٔ نامعتبر بنویسد.


**جمع: 45 مورد** — 30 × CHECK · 8 × UNIQUE · 7 × TRIGGER


---

## محدودیت‌های CHECK — 30 مورد

| مدل | ستون | شرط / توضیح | خط |
|---|---|---|---|
| `CampaignRule` | `amountOff` | > 0 | 810 |
| `CampaignRule` | `orderItems` | (Contract §7/§24) | 827 |
| `CartItem` | `quantity` | (> 0) | 949 |
| `Coupon` | `minOrderAmount` | >= 0 | 860 |
| `Coupon` | `maxDiscountAmount` | >= 0 | 861 |
| `Coupon` | `usageLimitTotal` | >= 1 | 864 |
| `Coupon` | `usageLimitPerUser` | >= 1 | 865 |
| `CouponUsage` | `discountAmount` | >= 0 | 911 |
| `Exchange` | `quantity` | (> 0) | 1601 |
| `InventoryMovement` | `quantity` | (<> 0) | 709 |
| `InventoryReservation` | `quantity` | (> 0) | 736 |
| `MediaAsset` | `sizeBytes` | (>= 0) | 1871 |
| `Order` | `paidAmount` | (0..totalAmount) | 1165 |
| `Order` | `refundedAmount` | (<= paidAmount) | 1166 |
| `OrderItem` | `quantity` | (> 0) | 1237 |
| `Payment` | `amount` | (> 0) | 1318 |
| `PaymentAttempt` | `amount` | (> 0) | 1342 |
| `PaymentTransaction` | `amount` | (> 0) | 1371 |
| `Product` | `basePrice` | >= 0 | 503 |
| `Refund` | `amount` | (> 0) | 1625 |
| `RefundItem` | `amount` | (>= 0) | 1654 |
| `ReturnItem` | `requestedQuantity` | (> 0) | 1575 |
| `ReturnItem` | `approvedQuantity` | (0..requestedQuantity) | 1576 |
| `Shipment` | `costAmount` | >= 0 | 1492 |
| `ShipmentItem` | `quantity` | (> 0) | 1516 |
| `ShippingMethod` | `basePrice` | >= 0 | 1452 |
| `ShippingMethod` | `perKgPrice` | >= 0 | 1453 |
| `VariantPrice` | `basePrice` | >= 0 | 765 |
| `VariantPrice` | `salePrice` | (0..basePrice) | 766 |
| `VariantPrice` | `effectiveTo` | (> effectiveFrom) | 768 |

---

## ایندکس یکتای جزئی (partial unique) و NULLS NOT DISTINCT — 8 مورد

| مدل | ستون | شرط / توضیح | خط |
|---|---|---|---|
| `Cart` | `convertedOrder` | one ACTIVE cart per user — partial unique in SQL | 936 |
| `InventoryReservation` | `movements` | one ACTIVE reservation per (cart, variant) — partial unique in SQL | 746 |
| `Payment` | `attempts` | one OPEN payment per order (PENDING/PROCESSING/UNKNOWN) — partial unique | 1330 |
| `ProductVariant` | `exchangeTargets` | as a NULLS NOT DISTINCT partial unique index in the migration SQL. | 601 |
| `Refund` | `items` | one in-flight refund per return request — partial unique (§26) | 1640 |
| `ShippingMethod` | `shipments` | / (exactly one default per method — partial unique). | 1467 |
| `UserProfile` | `updatedAt` | / (partial unique index). E.164 format enforced by app validation. | 152 |
| `VariantPrice` | `orderItems` | one CURRENT row per variant — partial unique (variantId) WHERE effectiveTo IS NULL | 777 |

---

## تریگرها — 7 مورد

| مدل | ستون | شرط / توضیح | خط |
|---|---|---|---|
| `None` | `—` | client flag: a guard trigger refuses isVerifiedPurchase=true unless the | 1732 |
| `Inventory` | `updatedAt` | / Immutable inventory ledger (§2, §5). UPDATE/DELETE blocked by DB trigger. | 701 |
| `Order` | `convertedCarts` | / Append-only (trigger). totalAmount equation enforced by CHECK. | 1200 |
| `OrderStatusHistory` | `createdAt` | / Append-only (trigger). | 1275 |
| `PaymentAttempt` | `reconciliations` | / Immutable record of a VERIFIED money movement (§9). Append-only (trigger). | 1362 |
| `PaymentEvent` | `createdAt` | / (guard trigger); only status/processedAt/error may advance (§12). | 1397 |
| `Review` | `isVerifiedPurchase` | DB-guarded by trigger — cannot be faked | 1747 |
