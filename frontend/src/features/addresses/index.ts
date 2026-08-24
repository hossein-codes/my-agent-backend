/**
 * Address feature boundary.
 *
 * NOTE: The backend does not (yet) expose a customer address-book endpoint —
 * checkout ships its address inline with the order
 * (`CheckoutSubmitDto extends AddressDto`). To avoid inventing API endpoints,
 * this feature currently owns the shared address TYPE and validation schema
 * used by checkout/account screens. A server-backed address book can be added
 * later behind `api/` without touching feature consumers.
 */
export { addressSchema } from "@/features/checkout/schemas/checkout-schema";
export type { AddressFormValues } from "@/features/checkout/schemas/checkout-schema";
