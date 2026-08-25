-- Invariants that Prisma's schema language cannot express as CHECK constraints.
-- The e2e harness applies this immediately after `prisma db push`.

ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_nonnegative_counters_check"
  CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "sold" >= 0 AND "returned" >= 0 AND "damaged" >= 0),
  ADD CONSTRAINT "Inventory_reserved_lte_on_hand_check"
  CHECK ("reserved" <= "onHand");

ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT "InventoryReservation_quantity_positive_check"
  CHECK ("quantity" > 0);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_base_price_nonnegative_check"
  CHECK ("basePrice" >= 0);

ALTER TABLE "VariantPrice"
  ADD CONSTRAINT "VariantPrice_base_price_nonnegative_check"
  CHECK ("basePrice" >= 0),
  ADD CONSTRAINT "VariantPrice_sale_price_range_check"
  CHECK ("salePrice" IS NULL OR ("salePrice" >= 0 AND "salePrice" <= "basePrice"));

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_total_amount_nonnegative_check"
  CHECK ("totalAmount" >= 0),
  ADD CONSTRAINT "Order_paid_amount_range_check"
  CHECK ("paidAmount" >= 0 AND "paidAmount" <= "totalAmount"),
  ADD CONSTRAINT "Order_refunded_amount_range_check"
  CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "paidAmount");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive_check"
  CHECK ("amount" > 0);

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_amount_positive_check"
  CHECK ("amount" > 0);

ALTER TABLE "PaymentTransaction"
  ADD CONSTRAINT "PaymentTransaction_amount_positive_check"
  CHECK ("amount" > 0);
