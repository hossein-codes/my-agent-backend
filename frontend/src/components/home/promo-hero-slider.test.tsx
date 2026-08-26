import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromoHeroSlider, type PromoSlide } from "./promo-hero-slider";

// jsdom lacks scrollIntoView and matchMedia-based external stores.
Element.prototype.scrollIntoView = vi.fn();
const mql = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
vi.stubGlobal("matchMedia", vi.fn(() => mql));

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

const SLIDES: PromoSlide[] = [
  { id: "a", media: "/a.jpg", alt: "بنر یک", link: "/categories/women" },
  { id: "b", media: "/b.jpg", alt: "بنر دو" },
  { id: "c", media: "/c.jpg", alt: "بنر سه", link: "/campaigns/flash-sale", objectPosition: "center top" },
];

describe("<PromoHeroSlider />", () => {
  it("renders every slide with its artwork and alt", () => {
    render(<PromoHeroSlider slides={SLIDES} />);
    expect(screen.getByAltText("بنر یک")).toBeInTheDocument();
    expect(screen.getByAltText("بنر دو")).toBeInTheDocument();
    expect(screen.getByAltText("بنر سه")).toBeInTheDocument();
  });

  it("makes the whole slide a link only when a destination exists", () => {
    render(<PromoHeroSlider slides={SLIDES} />);
    expect(screen.getByRole("link", { name: "بنر یک" })).toHaveAttribute(
      "href",
      "/categories/women",
    );
    expect(screen.queryByRole("link", { name: "بنر دو" })).not.toBeInTheDocument();
  });

  it("renders a dot per slide with accessible labels and grows the hit area", () => {
    render(<PromoHeroSlider slides={SLIDES} />);
    const dots = screen.getAllByRole("button", { name: /نمایش اسلاید/ });
    expect(dots).toHaveLength(3);
    for (const dot of dots) {
      expect(dot.className).toContain("size-8"); // 32px hit area, visual dot is 5px
    }
  });

  it("scrolls to the tapped slide", async () => {
    const user = userEvent.setup();
    render(<PromoHeroSlider slides={SLIDES} />);
    await user.click(screen.getByRole("button", { name: "نمایش اسلاید ۳ از ۳" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("hides itself entirely when there are no slides", () => {
    const { container } = render(<PromoHeroSlider slides={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a single slide without pagination", () => {
    render(<PromoHeroSlider slides={[SLIDES[0]!]} />);
    expect(screen.getByAltText("بنر یک")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /نمایش اسلاید/ }),
    ).not.toBeInTheDocument();
  });
});
