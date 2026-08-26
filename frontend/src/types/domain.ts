/**
 * Frontend DTO types — mirror the ACTUAL backend response shapes.
 *
 * These are the shapes returned by the API (camelCase, as Nest serializes
 * Prisma/JS objects). They are NOT Prisma models and they are NOT UI models.
 * When a UI/form needs a different shape, map at the feature boundary.
 *
 * Source of truth: backend/src/modules/<domain>/*.service.ts
 */

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type SortKey =
  | "newest"
  | "price_asc"
  | "price_desc"
  | "popular"
  | "name";

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  productCount: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  path: string;
  productCount: number;
  children: Category[];
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
}

export interface ProductMedia {
  id?: string;
  url: string;
  alt: string | null;
  type?: string;
}

export interface PriceInfo {
  base: number;
  sale: number | null;
  unit: number;
  discountPercent: number;
  onSale: boolean;
}

/** Item in product lists / highlights — the card shape. */
export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  brand: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
  image: string | null;
  imageAlt: string | null;
  /** Cheapest purchasable variant's current unit price (Integer Toman). */
  priceFrom: number | null;
  basePriceFrom: number | null;
  discountPercent: number;
  onSale: boolean;
  inStock: boolean;
  isFeatured: boolean;
}

export interface ProductOptionColor {
  id: string;
  displayName: string;
  slug: string;
  hexCode: string;
  hasStock: boolean;
}

export interface ProductOptionSize {
  id: string;
  label: string;
  sortOrder: number;
  hasStock: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  colorId: string | null;
  color: string | null;
  colorHex: string | null;
  sizeId: string | null;
  size: string | null;
  price: PriceInfo | null;
  available: number;
  purchasable: boolean;
}

export interface FacetColor {
  id: string;
  name: string;
  displayName: string;
  slug: string;
  hexCode: string;
}

export interface FacetSize {
  id: string;
  label: string;
  type: string;
  slug: string;
}

export interface FacetAttribute {
  name: string;
  slug: string;
  type: string;
  values: { label: string; slug: string }[];
}

export interface Facets {
  colors: FacetColor[];
  sizes: FacetSize[];
  attributes: FacetAttribute[];
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: { name: string; slug: string; logoUrl: string | null } | null;
  categories: { name: string; slug: string; path: string }[];
  collections: { name: string; slug: string }[];
  tags: { name: string; slug: string }[];
  media: ProductMedia[];
  attributes: { name: string; slug: string; value: string }[];
  options: { colors: ProductOptionColor[]; sizes: ProductOptionSize[] };
  variants: ProductVariant[];
  priceFrom: number | null;
  isFeatured: boolean;
  seo: { title: string | null; description: string | null };
  publishedAt: string | null;
}

export interface ProductListResponse {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Highlights {
  featured: ProductListItem[];
  newest: ProductListItem[];
}

export interface SearchSuggestion {
  type: string;
  label: string;
  href: string;
}

export interface SearchSuggestions {
  items: SearchSuggestion[];
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface OtpRequestResponse {
  sent: boolean;
  expiresIn: number;
  cooldownSeconds?: number;
}

export interface OtpVerifyResponse {
  accessToken: string;
  expiresIn: number;
  /** Mobile clients only; web uses the HttpOnly cookie. */
  refreshToken?: string;
  userId: string;
  roles: string[];
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

export interface UserProfile {
  firstName: string | null;
  lastName: string | null;
  // Prisma profile row — keep loose for fields not used by the storefront.
  [key: string]: unknown;
}

export interface UserPhone {
  id: string;
  phone: string;
  label: string | null;
  isPrimary: boolean;
  verifiedAt: string | null;
}

export interface UserEmail {
  id: string;
  email: string;
  label: string | null;
  isPrimary: boolean;
  verifiedAt: string | null;
}

export interface CurrentUser {
  id: string;
  status: string;
  profile: UserProfile | null;
  phones: UserPhone[];
  emails: UserEmail[];
  roles: string[];
  identityVerified: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export interface CartItem {
  variantId: string;
  sku?: string;
  product?: { id: string; name: string; slug: string } | null;
  color?: string | null;
  size?: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  /** Live stock for the variant (server-authoritative). */
  available?: number;
  purchasable?: boolean;
}

export interface Cart {
  items: CartItem[];
  totals: {
    subtotal: number;
    displayOnly: true;
  };
}

export interface CouponValidation {
  code: string;
  discount: number;
  valid: true;
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export interface ShippingOption {
  methodId: string;
  name: string;
  carrier?: string | null;
  amount: number;
  /** True when the free-shipping rule zeroed the amount. */
  freeShippingApplied?: boolean;
  estimatedDaysMin?: number | null;
  estimatedDaysMax?: number | null;
  [key: string]: unknown;
}

export interface Province {
  id?: string;
  name: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface CheckoutCoupon {
  code: string;
  discount: number;
  percentOff: number;
  capped: boolean;
}

export interface CheckoutPreview {
  items: CartItem[];
  subtotal: number;
  coupon: CheckoutCoupon | null;
  couponError: string | null;
  shippingOptions: ShippingOption[];
  totals: {
    subtotal: number;
    couponDiscount: number;
    shippingFrom: number;
    total: number;
    displayOnly: true;
    currency: "IRT";
  };
}

export interface CheckoutSummary {
  itemCount: number;
  subtotal: number;
  currency: "IRT";
}

export interface CheckoutSubmitResponse {
  orderId: string;
  orderNumber: string;
  totals: OrderTotals;
  status: OrderStatus;
}

export interface CheckoutAddress {
  receiverFirstName: string;
  receiverLastName: string;
  receiverPhone: string;
  provinceName: string;
  cityName: string;
  district?: string;
  postalCode: string;
  line: string;
  unit?: string;
  deliveryNotes?: string;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PROCESSING"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "PARTIALLY_RETURNED"
  | "RETURNED";

export interface OrderTotals {
  subtotal: number;
  productDiscount: number;
  couponDiscount: number;
  shipping: number;
  total: number;
  paid: number;
  refunded: number;
  currency: "IRT";
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  sku: string;
  color: string | null;
  size: string | null;
  unitPrice: number;
  discountPerUnit: number;
  finalUnitPrice: number;
  quantity: number;
  lineTotal: number;
  shippedQuantity: number;
  returnedQuantity: number;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  paidAmount: number;
  placedAt: string;
  itemCount: number;
  preview: { productName: string; quantity: number; finalUnitPrice: number }[];
  paymentExpiresAt: string | null;
}

export interface OrderAddress extends CheckoutAddress {
  id?: string;
  orderId?: string;
}

export interface OrderHistoryEntry {
  from: OrderStatus | null;
  to: OrderStatus;
  at: string;
  reason: string | null;
}

export interface PaymentSummary {
  id: string;
  status: string;
  amount: number;
  paidAt: string | null;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totals: OrderTotals;
  couponCode: string | null;
  contactPhone: string;
  items: OrderItem[];
  address: OrderAddress | null;
  shipments: unknown[];
  payments: PaymentSummary[];
  history: OrderHistoryEntry[];
  dates: {
    placedAt: string;
    paymentExpiresAt: string | null;
    paidAt: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
  };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentInitiateResponse {
  paymentId: string;
  orderId: string;
  authority: string;
  amount: number;
  gatewayUrl: string | null;
}

export interface PaymentVerifyResponse {
  orderNumber: string;
  orderStatus: OrderStatus;
  settled: boolean;
  alreadySettled: boolean;
}

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

export interface WishlistItem {
  productId: string;
  name: string;
  slug: string;
  variantId: string | null;
  available: number | null;
  price: { base: number; sale: number | null } | null;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface Review {
  id: string;
  productId: string;
  userId?: string;
  rating: number;
  title: string | null;
  body: string | null;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface ActiveCampaign {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type?: string;
  startsAt?: string;
  endsAt?: string;
  [key: string]: unknown;
}
