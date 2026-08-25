-- Database invariants Prisma cannot express. Safe to run repeatedly (PostgreSQL/Neon).
-- Keep object names stable: scripts/verify-integrity.mjs verifies this manifest.

CREATE OR REPLACE FUNCTION pg_temp.add_check(t text, n text, e text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=n AND conrelid=t::regclass) THEN
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s)', t::regclass, n, e);
  END IF;
END $$;

SELECT pg_temp.add_check('"Category"','Category_no_self_parent_check','"parentId" IS NULL OR "parentId" <> id');
SELECT pg_temp.add_check('"ProductAttribute"','ProductAttribute_exactly_one_check','num_nonnulls("attributeValueId", "rawValue") = 1');
SELECT pg_temp.add_check('"CouponUsage"','CouponUsage_discount_nonnegative_check','"discountAmount" >= 0');
SELECT pg_temp.add_check('"Product"','Product_base_price_nonnegative_check','"basePrice" >= 0');
SELECT pg_temp.add_check('"Inventory"','Inventory_nonnegative_counters_check','"onHand" >= 0 AND reserved >= 0 AND sold >= 0 AND returned >= 0 AND damaged >= 0 AND "lowStockThreshold" >= 0');
SELECT pg_temp.add_check('"Inventory"','Inventory_reserved_lte_on_hand_check','reserved <= "onHand"');
SELECT pg_temp.add_check('"InventoryMovement"','InventoryMovement_quantity_nonzero_check','quantity <> 0');
SELECT pg_temp.add_check('"InventoryMovement"','InventoryMovement_snapshot_nonnegative_check','"onHandAfter" >= 0 AND "reservedAfter" >= 0 AND "reservedAfter" <= "onHandAfter"');
SELECT pg_temp.add_check('"InventoryReservation"','InventoryReservation_quantity_positive_check','quantity > 0');
SELECT pg_temp.add_check('"VariantPrice"','VariantPrice_base_price_nonnegative_check','"basePrice" >= 0');
SELECT pg_temp.add_check('"VariantPrice"','VariantPrice_sale_price_range_check','"salePrice" IS NULL OR ("salePrice" >= 0 AND "salePrice" <= "basePrice")');
SELECT pg_temp.add_check('"VariantPrice"','VariantPrice_effective_range_check','"effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"');
SELECT pg_temp.add_check('"CampaignRule"','CampaignRule_discount_exactly_one_check','("discountType" = ''PERCENT'' AND "percentOff" BETWEEN 1 AND 100 AND "amountOff" IS NULL) OR ("discountType" = ''FIXED'' AND "amountOff" > 0 AND "percentOff" IS NULL)');
SELECT pg_temp.add_check('"CampaignTarget"','CampaignTarget_exactly_one_check','num_nonnulls("productId", "categoryId", "collectionId") = 1');
SELECT pg_temp.add_check('"Coupon"','Coupon_values_check','"percentOff" BETWEEN 1 AND 100 AND "minOrderAmount" >= 0 AND ("maxDiscountAmount" IS NULL OR "maxDiscountAmount" >= 0) AND ("usageLimitTotal" IS NULL OR "usageLimitTotal" >= 1) AND "usageLimitPerUser" >= 1 AND "usageCount" >= 0');
SELECT pg_temp.add_check('"CouponTarget"','CouponTarget_exactly_one_check','num_nonnulls("productId", "categoryId", "collectionId") = 1');
SELECT pg_temp.add_check('"CartItem"','CartItem_quantity_positive_check','quantity > 0');
SELECT pg_temp.add_check('"Order"','Order_amounts_check','"totalAmount" >= 0 AND "paidAmount" BETWEEN 0 AND "totalAmount" AND "refundedAmount" BETWEEN 0 AND "paidAmount"');
SELECT pg_temp.add_check('"OrderFinancialSnapshot"','OrderFinancialSnapshot_amounts_check','"subtotalAmount" >= 0 AND "productDiscountAmount" >= 0 AND "campaignDiscountAmount" >= 0 AND "couponDiscountAmount" >= 0 AND "shippingAmount" >= 0 AND "otherChargesAmount" >= 0 AND "totalAmount" = "subtotalAmount" - "productDiscountAmount" - "campaignDiscountAmount" - "couponDiscountAmount" + "shippingAmount" + "otherChargesAmount"');
SELECT pg_temp.add_check('"OrderItem"','OrderItem_values_check','quantity > 0 AND "unitPrice" >= 0 AND "discountPerUnit" >= 0 AND "finalUnitPrice" >= 0 AND "finalUnitPrice" = "unitPrice" - "discountPerUnit" AND "lineTotal" = "finalUnitPrice" * quantity AND "shippedQuantity" >= 0 AND "returnedQuantity" >= 0 AND "refundedQuantity" >= 0 AND "shippedQuantity" <= quantity AND "returnedQuantity" <= quantity AND "refundedQuantity" <= quantity');
SELECT pg_temp.add_check('"Payment"','Payment_amount_positive_check','amount > 0');
SELECT pg_temp.add_check('"PaymentAttempt"','PaymentAttempt_amount_positive_check','amount > 0');
SELECT pg_temp.add_check('"PaymentTransaction"','PaymentTransaction_amount_positive_check','amount > 0');
SELECT pg_temp.add_check('"ShippingMethod"','ShippingMethod_prices_check','"basePrice" >= 0 AND "perKgPrice" >= 0 AND ("freeShippingThreshold" IS NULL OR "freeShippingThreshold" >= 0)');
SELECT pg_temp.add_check('"ShippingMethodRate"','ShippingMethodRate_prices_check','("basePrice" IS NULL OR "basePrice" >= 0) AND ("perKgPrice" IS NULL OR "perKgPrice" >= 0) AND ("freeShippingThreshold" IS NULL OR "freeShippingThreshold" >= 0)');
SELECT pg_temp.add_check('"Shipment"','Shipment_cost_nonnegative_check','"costAmount" >= 0');
SELECT pg_temp.add_check('"ShipmentItem"','ShipmentItem_quantity_positive_check','quantity > 0');
SELECT pg_temp.add_check('"ReturnItem"','ReturnItem_quantities_check','"requestedQuantity" > 0 AND ("approvedQuantity" IS NULL OR "approvedQuantity" BETWEEN 0 AND "requestedQuantity")');
SELECT pg_temp.add_check('"Exchange"','Exchange_quantity_positive_check','quantity > 0');
SELECT pg_temp.add_check('"Refund"','Refund_amount_positive_check','amount > 0');
SELECT pg_temp.add_check('"RefundItem"','RefundItem_amount_nonnegative_check','amount >= 0');
SELECT pg_temp.add_check('"Review"','Review_rating_check','rating BETWEEN 1 AND 5');
SELECT pg_temp.add_check('"MediaAsset"','MediaAsset_size_nonnegative_check','"sizeBytes" >= 0');

CREATE UNIQUE INDEX IF NOT EXISTS "UserPhone_one_primary_per_user_idx" ON "UserPhone" ("userId") WHERE "isPrimary";
CREATE UNIQUE INDEX IF NOT EXISTS "ProductMedia_one_primary_per_product_idx" ON "ProductMedia" ("productId") WHERE "isPrimary";
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_options_unique_idx" ON "ProductVariant" ("productId", "colorId", "sizeId") NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS "Cart_one_active_per_user_idx" ON "Cart" ("userId") WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS "VariantPrice_one_current_per_variant_idx" ON "VariantPrice" ("variantId") WHERE "effectiveTo" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryReservation_one_active_cart_variant_idx" ON "InventoryReservation" ("cartId", "variantId") WHERE status = 'ACTIVE' AND "cartId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_one_open_per_order_idx" ON "Payment" ("orderId") WHERE status IN ('PENDING','PROCESSING','UNKNOWN');
CREATE UNIQUE INDEX IF NOT EXISTS "ShippingMethodRate_one_default_idx" ON "ShippingMethodRate" ("methodId") WHERE "provinceId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_tracking_unique_idx" ON "Shipment" ("carrierName", "trackingNumber") WHERE "trackingNumber" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Refund_one_inflight_return_idx" ON "Refund" ("returnRequestId") WHERE "returnRequestId" IS NOT NULL AND status IN ('PENDING','PROCESSING');

CREATE OR REPLACE FUNCTION integrity_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only: % is forbidden', TG_TABLE_NAME, TG_OP USING ERRCODE='23000'; END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['InventoryMovement','OrderFinancialSnapshot','OrderItem','OrderStatusHistory','OrderAddress','PaymentTransaction','PaymentEvent','PaymentReconciliation','ShipmentStatusHistory','RefundItem','AuditLog'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'integrity_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION integrity_reject_mutation()', 'integrity_append_only', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION integrity_webhook_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.provider IS DISTINCT FROM OLD.provider OR NEW."externalId" IS DISTINCT FROM OLD."externalId" OR NEW."eventType" IS DISTINCT FROM OLD."eventType" OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW."signatureValid" IS DISTINCT FROM OLD."signatureValid" OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt" THEN
  RAISE EXCEPTION 'WebhookEvent envelope is immutable' USING ERRCODE='23000';
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS integrity_webhook_immutable ON "WebhookEvent";
CREATE TRIGGER integrity_webhook_immutable BEFORE UPDATE ON "WebhookEvent" FOR EACH ROW EXECUTE FUNCTION integrity_webhook_immutable();

CREATE OR REPLACE FUNCTION integrity_review_verified_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."isVerifiedPurchase" AND (NEW."orderItemId" IS NULL OR NOT EXISTS (
   SELECT 1 FROM "OrderItem" oi JOIN "Order" o ON o.id=oi."orderId"
   WHERE oi.id=NEW."orderItemId" AND oi."productId"=NEW."productId" AND o."userId"=NEW."userId"
     AND o.status IN ('PAID','PROCESSING','READY_TO_SHIP','SHIPPED','DELIVERED','RETURN_REQUESTED','PARTIALLY_RETURNED','RETURNED','COMPLETED')
 )) THEN RAISE EXCEPTION 'verified purchase does not belong to this user/product' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS integrity_review_verified_purchase ON "Review";
CREATE TRIGGER integrity_review_verified_purchase BEFORE INSERT OR UPDATE OF "isVerifiedPurchase", "orderItemId", "userId", "productId" ON "Review" FOR EACH ROW EXECUTE FUNCTION integrity_review_verified_purchase();

-- Prevent cycles at any depth, including concurrent parent changes. The
-- recursive walk starts at the proposed parent and must never reach NEW.id.
CREATE OR REPLACE FUNCTION integrity_category_no_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."parentId" IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors(id) AS (
      SELECT NEW."parentId"
      UNION ALL
      SELECT c."parentId" FROM "Category" c
      JOIN ancestors a ON c.id = a.id
      WHERE c."parentId" IS NOT NULL
    ) SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Category parent assignment would create a cycle' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS integrity_category_no_cycle ON "Category";
CREATE TRIGGER integrity_category_no_cycle
  BEFORE INSERT OR UPDATE OF "parentId" ON "Category"
  FOR EACH ROW EXECUTE FUNCTION integrity_category_no_cycle();
