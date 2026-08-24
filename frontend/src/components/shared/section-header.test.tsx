import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "./section-header";

describe("<SectionHeader />", () => {
  it("renders title and optional view-all link", () => {
    render(
      <SectionHeader
        title="پرفروش‌ترین‌ها"
        viewAllHref="/products"
        viewAllLabel="مشاهده همه"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "پرفروش‌ترین‌ها" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "مشاهده همه" }),
    ).toHaveAttribute("href", "/products");
  });

  it("omits the link when no href provided", () => {
    render(<SectionHeader title="فروش ویژه" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
