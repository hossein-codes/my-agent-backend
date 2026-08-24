# Frontend Architecture

This document describes the **actual** frontend foundation implemented in
`frontend/`. It is the contract for all subsequent feature work. The store
UI (homepage, product grid, checkout screens) is intentionally **not** built
yet — this is the foundation those features will stand on.

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript (strict)
- **Styling:** Tailwind CSS v4 with design tokens in `globals.css`
- **Priority:** mobile-first. Desktop polish is a later phase.
- **Direction:** Persian RTL by default (`<html dir="rtl">`), LTR-compatible
  via logical CSS properties.

---

## 1. Directory structure

```text
frontend/src/
├── app/                      # Routing & composition ONLY
│   ├── (store)/              # Storefront route group (header + bottom nav)
│   │   ├── page.tsx          # Home (foundation placeholder)
│   │   ├── products/[slug]/
│   │   ├── categories/[slug]/
│   │   ├── search/
│   │   └── campaigns/[slug]/
│   ├── (auth)/               # Login / register / verify (centered layout)
│   ├── account/              # Profile, addresses, orders, wishlist
│   ├── cart/  checkout/  orders/[id]/  payment-result/
│   ├── layout.tsx            # Root: RTL, fonts, providers, metadata
│   ├── globals.css           # Design tokens (single source of truth)
│   ├── loading.tsx  error.tsx  not-found.tsx
│
├── components/
│   ├── ui/                   # Headless, domain-agnostic primitives
│   ├── layout/               # App-level: StoreHeader, MobileNav, Container…
│   └── shared/               # Cross-feature: PriceDisplay, ErrorState…
│
├── features/                 # Domain modules (self-contained)
│   ├── auth/  products/  categories/  search/  cart/  wishlist/
│   ├── checkout/  orders/  reviews/  addresses/  profile/  campaigns/
│   └── shipping/
│
├── lib/
│   ├── api/                  # Central API client + error model
│   ├── config/env.ts         # Validated, server/public-separated env
│   └── utils/                # cn, format (money/date), idempotency
│
├── hooks/                    # useMediaQuery, useIsDesktop
├── stores/                   # Global client UI state only (ui-store)
├── providers/                # AppProviders (Query, Theme, Auth, Toaster)
├── types/                    # api.ts (error codes, pagination) + domain.ts
└── constants/                # queryKeys, page sizes, currency
```

---

## 2. Dependency rules

```text
app  →  features  →  shared components / lib
```

- `components/ui/` must never import a feature, a product, an order, etc.
- `components/shared/` may be used by multiple features but must not import a
  specific feature.
- Features may use `lib/`, `components/ui/`, and `components/shared/`.
- Features must not import from each other (no circular dependencies).
- Barrel files (`index.ts`) are **feature-local**; there is no global barrel.
- `@/*` aliases to `src/*`.

---

## 3. Server vs client components

- **Server Components are the default.** A component file carries `"use client"`
  only when it needs interactivity, browser APIs, or local state.
- Route files (`app/.../page.tsx`) primarily fetch/prepare data and compose
  features — they do not hold business logic.
- Global client concerns are isolated in `providers/app-providers.tsx`.
- TanStack Query is used for client-side data fetching/caching where
  interactivity is required; Server Components fetch directly via the same
  typed feature APIs when appropriate.

---

## 4. API architecture

Central client: `src/lib/api/client.ts`.

- Base URL from `publicConfig.apiUrl` (`NEXT_PUBLIC_API_URL`, ending in
  `/api/v1`).
- `credentials: "include"` so the HttpOnly refresh cookie is sent to
  `/auth/refresh` (the cookie is scoped to `/api/v1/auth` by the backend).
- Bearer access token injected via `registerAuthAccess()`.
- 20s default timeout (abortable per request).
- Every non-2xx is normalized to an `ApiError` with the backend envelope:
  ```json
  { "code": "coupon.expired", "message": "...", "details": {...},
    "requestId": "...", "timestamp": "..." }
  ```
- The UI switches on **`code`**, never on `message`.
- Network/abort failures get synthetic codes `common.network_error` and
  `common.aborted`.
- 401 triggers `onUnauthorized()` (clears the session).

Feature APIs own their endpoints, e.g.:

```ts
// features/products/api/products-api.ts
export const productsApi = {
  list: (params) => apiClient.get<ProductListResponse>("/catalog/products", { query }),
  getBySlug: (slug) => apiClient.get<ProductDetail>(`/catalog/products/${slug}`),
};
```

Components/hooks never call raw `fetch("/api/...")`.

---

## 5. Authentication

Designed around the existing backend contract (see
`docs/api-reference-fa.md`).

- **OTP flow:** `POST /auth/otp/request` → `POST /auth/otp/verify`
  (`{ phone, code, deviceKind: "WEB" }`).
- On verify: backend returns `{ accessToken, expiresIn, userId, roles }` and
  sets the **refresh token in an HttpOnly, SameSite=Lax cookie** scoped to
  `/api/v1/auth`.
- The access token lives in memory (Zustand) and is persisted to
  `localStorage` so a reload restores the session without a new OTP. It has a
  15-minute TTL. **The refresh token is never readable by JS.**
- `authStore.refresh()` rotates tokens ~60s before expiry through a **mutex**
  because the backend refresh token is single-use (two concurrent refreshes
  revoke the whole session family).
- `authApi.me()` → `GET /users/me` provides profile, phones, emails, roles.
- Protected routes are composed in the next phase; the session and
  unauthorized handling are already in place.

---

## 6. State strategy

| State kind | Mechanism |
|---|---|
| Server data (products, orders, cart, profile) | **TanStack Query** via feature hooks |
| Auth session/client identity | Zustand `auth-store` (single owner) |
| Global UI (mobile nav, search sheet) | Zustand `ui-store` |
| Local/ephemeral UI | React `useState` / URL search params |

No competing state libraries. Server data is never duplicated into a global
store. Cart mutations update the cache from the authoritative server response
(the backend returns the full cart after every mutation).

---

## 7. Money

All money is **Integer Toman** from the backend. The frontend never performs
authoritative financial math (no `price * 0.1`, no floating-point discounts).

- `lib/utils/format.ts`: `formatToman(n)` → `"1,250,000"`,
  `formatTomanWithCurrency(n)` → `"1,250,000 تومان"`.
- `components/shared/price-display.tsx` renders prices with tabular numerals.
- Checkout/order totals come from the backend and are marked `displayOnly: true`
  on the preview; the submit/order response is authoritative.

---

## 8. Error & loading architecture

- `lib/api/errors.ts` — `ApiError`, `getFieldErrors()`.
- Canonical codes mirrored in `types/api.ts` (auth, catalog, cart, coupon,
  order, payment, review, file, system).
- `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx` — root boundaries.
- `components/shared/error-state.tsx` — inline error panel that understands
  `ApiError` (shows request id for support).
- `components/ui/skeleton.tsx` + route `loading.tsx` — non-blocking loading.
- Buttons support a `loading` prop to prevent duplicate submissions; checkout
  and payment send an `Idempotency-Key`.

---

## 9. RTL / i18n

- `dir="rtl" lang="fa"` at the root.
- Styling uses logical properties (`ms-*`/`me-*`, `ps-*`/`pe-*`, `inset-inline`);
  hardcoded `left/right` are avoided so the layout can support LTR later.
- Persian font (Vazirmatn) is self-hosted via `@fontsource/vazirmatn` so
  production builds do not depend on Google Fonts at build time.

---

## 10. Design system

Tokens live in `app/globals.css` (Tailwind v4 `@theme inline`): color, radius,
shadow, safe-area insets, semantic `--price`/`--accent`, light/dark. UI
primitives (`button`, `input`, `textarea`, `label`, `badge`, `card`,
`skeleton`, `spinner`, `separator`, dialog/alert-dialog) are built on Radix
for accessibility. Dark mode is wired through `next-themes`; the default is
light.

---

## 11. Mobile-first

- Every component is designed at the mobile viewport first.
- `PageShell` reserves bottom space for `MobileNav` (hidden at `sm+`) and
  respects `env(safe-area-inset-*)` for notches/home indicators.
- `useMediaQuery`/`useIsDesktop` allow branching presentation while sharing
  feature logic; no business logic is forked between mobile and desktop.
- Desktop layout/polish is explicitly deferred to a later phase.

---

## 12. Environment config

`lib/config/env.ts` validates variables with Zod at startup:

- **Public (browser-safe):** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME`,
  `NEXT_PUBLIC_DEFAULT_LOCALE`.
- **Server-only:** `API_BASE_URL` (falls back to the public URL). Importing
  `serverConfig` into a Client Component will leak no secret because no secret
  is stored here — add server-only secrets with care and never expose them via
  `NEXT_PUBLIC_*`.

Copy `frontend/.env.example` to `frontend/.env.local`.

---

## 13. Features at a glance

| Feature | Owns |
|---|---|
| `auth` | OTP, session, refresh mutex, `/users/me`, login/logout hooks |
| `products` | list/detail API + hooks, filters |
| `categories` | category tree, brands, collections, facets |
| `search` | typeahead suggestions |
| `cart` | cart API, mutations, count badge |
| `wishlist` | list/add/remove + membership set |
| `checkout` | preview, submit (idempotent), payment initiate/verify, address schema |
| `shipping` | methods + provinces |
| `orders` | list/detail/cancel, status labels & tones |
| `reviews` | product reviews, create |
| `addresses` | shared address type/schema (no backend address book yet) |
| `profile` | `/users/me` update |
| `campaigns` | active campaigns |

Each feature follows `api/`, `hooks/`, `schemas/`, `types.ts`, `index.ts`.

---

## 14. Testing

- Vitest + @testing-library/react in `jsdom`.
- `vitest.config.ts`, `vitest.setup.ts`.
- Current coverage focuses on critical foundations: money formatting
  (`format.test.ts`) and the Button primitive (`button.test.tsx`).
- Run: `npm test` (watch: `npm run test:watch`).
- MSW is installed for API mocking in future feature tests.

---

## 15. Commands

```bash
cd frontend
npm run dev          # Next dev (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest
npm run format       # Prettier
```

All four gates (`typecheck`, `lint`, `test`, `build`) pass on this foundation.

---

## 16. Boundaries / non-negotiables

- Backend is authoritative for auth, pricing, discounts, stock, order totals,
  payment and validation. Frontend validation is UX only.
- No Prisma schema/migrations or backend business logic are modified.
- No API endpoints or response shapes were invented; types mirror the actual
  backend source.
- Business logic lives in features, never in UI primitives or route JSX.
