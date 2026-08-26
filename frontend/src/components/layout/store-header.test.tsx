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

// Mock feature hooks so the header is isolated from auth/cart API calls.
const cartCount = vi.fn(() => 0);

vi.mock("@/features/cart", () => ({
  useCart: () => ({
    data: {
      items: Array.from({ length: cartCount() }, () => ({ quantity: 1 })),
    },
  }),
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
});

describe("<StoreHeader />", () => {
  it("renders the search trigger with the brand placeholder", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "جستجو" })).toHaveTextContent(
      "جستجو در LUMINA...",
    );
  });

  it("renders the cart action with an accessible name", () => {
    renderHeader();
    expect(screen.getByLabelText("سبد خرید")).toHaveAttribute("href", "/cart");
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

  it("opens the full-screen search overlay and focuses the input", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "جستجو" }));
    const input = (await screen.findByRole("searchbox", {
      name: "جستجو",
    })) as HTMLInputElement;
    expect(input).toHaveFocus();
  });

  it("clears a typed query from inside the overlay", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "جستجو" }));
    const input = (await screen.findByRole("searchbox", {
      name: "جستجو",
    })) as HTMLInputElement;
    await user.type(input, "کتانی");
    expect(input.value).toBe("کتانی");
    await user.click(screen.getByLabelText("پاک کردن"));
    expect(input.value).toBe("");
  });
});
