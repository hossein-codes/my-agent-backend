# Frontend Foundation (Phase 2)

This documents the foundation actually implemented in `frontend/`. It builds on
the architecture in `docs/frontend-architecture.md` and is strictly
**mobile-first** — desktop visual polish is deferred to a later phase. No
ecommerce UI (homepage, product grid, cart/checkout screens, account) is built
here.

## Stack

- Next.js 16 (App Router), React 19, TypeScript (strict +
  `noUncheckedIndexedAccess`), Tailwind CSS v4.
- Server Components by default; Client Components only for interactivity.
- TanStack Query for server state, Zustand for auth/UI client state.
- React Hook Form + Zod (feature-owned schemas), Radix UI primitives,
  `sonner` toasts, `motion` available for future animation.
- Persian font **Vazirmatn** self-hosted via `@fontsource/vazirmatn`
  (build works offline).

## Providers (`src/providers/app-providers.tsx`)

Composed in the root layout, client-side:

```text
QueryClientProvider → I18nProvider → ThemeProvider → AuthProvider → (Toaster)
```

- Each provider has a single responsibility; none hold business logic.
- `QueryClient` is configured not to retry 400/401/403/404/422.
- Theme supports light / dark / system via `next-themes` (tokens in
  `globals.css`).

## Design tokens (`src/app/globals.css`)

Single source of truth in CSS variables, exposed to Tailwind via
`@theme inline`:

- **Colors:** background, foreground, card, popover, primary, secondary,
  muted, accent, success, warning, destructive, border, input, ring +
  semantic `price`/`price-old`. Light and dark themes.
- **Radius:** sm/md/lg/xl from a single `--radius`.
- **Elevation:** three clean shadows (`--elevation-1/2/3`); mobile stays light.
- **Motion:** `--duration-fast/normal/slow`, `--ease-standard`, and a global
  `prefers-reduced-motion` override.
- **Typography scale:** display, heading, title, body, body-small, caption,
  label, button (`.text-*` component classes). Scales up at ≥480px.
- **Spacing** tokens (4–48px) and **safe-area** insets (`--sat/sab/...`) with
  `pb-safe`/`pt-safe` utilities and `100dvh`.

## RTL / Localization (`src/lib/i18n/`)

- Persian is primary (`lang="fa" dir="rtl"`); English is scaffolded.
- `getServerLocale()` reads the `NEXT_LOCALE` cookie in Server Components so
  the root `<html dir/lang>` is correct server-side (no hydration flash).
  This file is `server-only`.
- `I18nProvider` + `useI18n()`/`useT()` for the client; `setLocale` updates
  the cookie and `<html>` attributes.
- Flat, namespaced keys in `dictionaries/common.ts` (common, validation,
  state, currency). Feature dictionaries are added per feature later.
- Logical CSS properties (`ms-*`/`me-*`, `ps-*`/`pe-*`) are used throughout;
  no hardcoded `left/right`.

## UI primitives (`src/components/ui/`)

Domain-agnostic and accessible (Radix where applicable):

`Button` (+ `IconButton`, with `loading`, variants, 44px touch target),
`Input`, `Textarea`, `Label`, `FormField` (associates label/error/helper via
`aria-describedby`), `Select` (bottom sheet on mobile), `Checkbox`,
`RadioGroup`, `Switch`, `Tabs`, `Accordion`, `Tooltip`, `Avatar`, `Badge`,
`Card`, `Separator`, `Skeleton`, `Spinner`, `Dialog` (centered on desktop,
bottom sheet on mobile), and `BottomSheet`.

Shared/reusable: `EmptyState`, `ErrorState`, `ForbiddenState`,
`PriceDisplay`, `ProductImage`, `QuantitySelector`, `ConfirmDialog`,
`Container`, `PageShell`, `StoreHeader`, `MobileNav`.

## API layer (`src/lib/api/`)

- `client.ts` — centralized fetch client: base URL from
  `NEXT_PUBLIC_API_URL`, JSON, Bearer token injection,
  `credentials: "include"` for the HttpOnly refresh cookie, 20s timeout with
  `AbortController`, and normalized errors.
- `errors.ts` — `ApiError` with `status`, `code`, `details`, `requestId` and
  predicates (`isUnauthorized`, `isConflict`, `isNetworkError`, …);
  `getFieldErrors()` for class-validator errors.
- The backend error envelope `{ code, message, details?, requestId, timestamp }`
  is preserved; UI switches on **`code`**, not `message`.
- Handles 400/401/403/404/409/422/429/5xx, network failures and aborts.
  401 triggers the registered `onUnauthorized` (clears the session).

## Environment config (`src/lib/config/env.ts`)

Zod-validated, split into `publicConfig` (browser-safe `NEXT_PUBLIC_*`) and
`serverConfig` (server-only; never imported by Client Components). Copy
`.env.example` to `.env.local`.

## Auth (`src/features/auth/`)

Mirrors the real backend OTP contract (no invented mechanism):

- `POST /auth/otp/request` → `POST /auth/otp/verify` returns
  `{ accessToken, expiresIn, userId, roles }` and sets an HttpOnly
  `refresh_token` cookie scoped to `/api/v1/auth`.
- Access token is kept in memory (Zustand) + `localStorage` for reload
  restoration (15-min TTL). The refresh token is never read by JS.
- Refreshes run through a **mutex** because the backend refresh token is
  single-use (concurrent refreshes revoke the session family).
- `registerAuthAccess()` wires the token getter and 401 handler into the API
  client. Protected-route composition happens in a later phase.

## State

- **Server state:** TanStack Query via feature hooks (`useProducts`,
  `useCart`, `useOrders`, …). Server data is never copied into a global store.
- **Client state:** `auth-store` (single auth owner) and `ui-store`
  (mobile nav / search sheet) only.
- Cart is **server-authoritative**: every mutation returns the fresh cart from
  the backend; totals are `displayOnly` until the order is submitted.

## Money & formatting (`src/lib/utils/format.ts`)

- Integer Toman in → localized string out (`formatToman`,
  `formatTomanWithCurrency`). Persian digits by default (`۱٬۲۵۰٬۰۰۰ تومان`),
  English via `locale: "en"`. No floating-point math.
- Also `toPersianDigits`, `formatNumber`, `formatPercent`, `formatDate`,
  `formatDateTime`, `formatPhone`.

## Error / loading infrastructure

- Root `app/error.tsx`, `not-found.tsx`, `forbidden/page.tsx`, `loading.tsx`.
- `ErrorState` understands `ApiError` (network/403/request id); `EmptyState`;
  `Skeleton` for composition; buttons disable and show a spinner while
  pending; checkout/payment send an `Idempotency-Key`
  (`lib/utils/idempotency.ts`).

## Mobile shell

`(store)/layout.tsx` composes `StoreHeader` + `PageShell` + `MobileNav`. The
bottom nav is fixed, safe-area aware (`pb-safe`), and hidden at `sm+`. Content
has bottom padding so it is never covered by the nav. `PageShell` uses
`100dvh`.

## Testing

Vitest + Testing Library (jsdom), setup in `vitest.setup.ts`. Foundation tests
cover money formatting (Persian digits, no decimals) and the Button primitive
(loading/disabled/click). MSW is installed for future API mocks. Run with
`npm test`.

## Validation (executed)

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | ✅ pass |
| `npm run lint` (`eslint .`) | ✅ pass |
| `npm test` (`vitest run`) | ✅ 12 tests pass |
| `npm run build` (`next build`) | ✅ pass (19 routes) |

Mobile viewports 320–414px are the design target; the shell and primitives
use 44px touch targets, `dvh`, safe-area insets and responsive type. The
backend/prisma were not modified.

## Next phase

> Mobile store shell + home experience.
