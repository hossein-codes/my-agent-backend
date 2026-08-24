import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Countdown } from "./countdown";

describe("<Countdown />", () => {
  it("renders nothing when endsAt is missing", () => {
    const { container } = render(<Countdown endsAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a stable placeholder before mounting (no hydration mismatch)", () => {
    render(<Countdown endsAt={new Date(Date.now() + 3_600_000).toISOString()} />);
    // Server/first render placeholder
    expect(screen.getByText("--:--:--", { exact: false })).toBeInTheDocument();
  });
});
