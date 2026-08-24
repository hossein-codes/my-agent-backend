import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProductListItem } from "@/types/domain";
import { ProductCard } from "./product-card";

// Cart/wishlist/auth hooks pull in providers; stub the feature hooks so the
// card is tested in isolation (its presentational behavior only).
vi.mock("@/features/wishlist", () => ({
  useWishlistIds: () => new Set<string>(),
  useWishlistMutations: () => ({
    add: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  }),
}));

vi.mock("../hooks/use-quick-add", () => ({
  useQuickAddToCart: () => ({ add: vi.fn(), isPending: false, canAdd: true }),
  useIsProductInCart: () => false,
}));

const product: ProductListItem = {
  id: "p1",
  name: "تی‌شرت نخی طرح مینیمال",
  slug: "cotton-minimal-tee",
  brand: { name: "LUMINA", slug: "lumina" },
  category: { name: "زنانه", slug: "women" },
  image: null,
  imageAlt: null,
  priceFrom: 1_250_000,
  basePriceFrom: 1_500_000,
  discountPercent: 17,
  onSale: true,
  inStock: true,
  isFeatured: true,
};

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProductCard product={product} />
    </QueryClientProvider>,
  );
}

describe("<ProductCard />", () => {
  it("renders name, brand, discount badge and price", () => {
    renderCard();
    expect(screen.getByText(/تی‌شرت نخی/)).toBeInTheDocument();
    expect(screen.getByText("LUMINA")).toBeInTheDocument();
    expect(screen.getByLabelText(/افزودن به علاقه‌مندی/)).toBeInTheDocument();
  });

  it("links to the real product route by slug", () => {
    renderCard();
    expect(
      screen.getByRole("link", { name: /تی‌شرت نخی/ }),
    ).toHaveAttribute("href", "/products/cotton-minimal-tee");
  });
});
