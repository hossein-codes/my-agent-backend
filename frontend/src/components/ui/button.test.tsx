import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("<Button />", () => {
  it("renders children", () => {
    render(<Button>افزودن به سبد</Button>);
    expect(screen.getByRole("button", { name: "افزودن به سبد" })).toBeInTheDocument();
  });

  it("shows a spinner and disables when loading", () => {
    render(<Button loading>در حال ارسال</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.querySelector("svg")).toBeInTheDocument();
  });

  it("handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>کلیک</Button>);
    await userEvent.click(screen.getByRole("button", { name: "کلیک" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
