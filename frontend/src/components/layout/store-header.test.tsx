import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StoreHeader } from "./store-header";

// next/link and next/navigation require an App Router context.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

// Mock feature hooks so the header is isolated from auth/cart/wishlist API.
const cartCount = vi.fn(() => 0);
const wishlistTotal = vi.fn(() => 0);
const isAuthed = vi.fn(() => false);

vi.mock("@/features/cart", () => ({
  useCart: () => ({
    data: {
      items: Array.from({ length: cartCount() }, () => ({ quantity: 1 })),
    },
  }),
}));

vi.mock("@/features/wishlist", () => ({
  useWishlist: () => ({ data: { total: wishlistTotal() } }),
}));

vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: isAuthed() }),
}));

function renderHeader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StoreHeader />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cartCount.mockReturnValue(0);
  wishlistTotal.mockReturnValue(0);
  isAuthed.mockReturnValue(false);
});

describe("<StoreHeader />", () => {
  it("renders the LUMINA logo centered", () => {
    renderHeader();
    expect(screen.getByLabelText(/LUMINA/)).toBeInTheDocument();
  });

  it("renders all header actions with accessible names", () => {
    renderHeader();
    expect(screen.getByLabelText("اعلان‌ها")).toHaveAttribute("href", "/notifications");
    expect(screen.getByLabelText("سبد خرید")).toHaveAttribute("href", "/cart");
    expect(screen.getByLabelText("علاقه‌مندی‌ها")).toHaveAttribute("href", "/login");
  });

  it("hides cart badge when count is 0", () => {
    renderHeader();
    expect(screen.queryByText("۰")).not.toBeInTheDocument();
  });

  it("shows the real cart count badge", () => {
    cartCount.mockReturnValue(3);
    renderHeader();
    expect(screen.getByText("۳")).toBeInTheDocument();
  });

  it("caps large badge values at ۹۹+", () => {
    cartCount.mockReturnValue(150);
    renderHeader();
    expect(screen.getByText("۹۹+")).toBeInTheDocument();
  });

  it("shows search entry that opens the search sheet", async () => {
    const user = userEvent.setup();
    renderHeader();
    const trigger = screen.getByRole("button", { name: "جستجو" });
    await user.click(trigger);
    expect(
      screen.getByPlaceholderText("جستجو در محصولات لومینا..."),
    ).toBeInTheDocument();
  });
});
