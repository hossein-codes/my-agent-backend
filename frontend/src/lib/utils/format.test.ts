import { describe, it, expect } from "vitest";
import {
  formatToman,
  formatTomanWithCurrency,
  formatPercent,
  toPersianDigits,
  formatNumber,
} from "./format";

describe("toPersianDigits", () => {
  it("converts ascii digits", () => {
    expect(toPersianDigits(1250000)).toBe("۱۲۵۰۰۰۰");
  });
});

describe("formatToman", () => {
  it("groups thousands in Persian digits (fa-IR)", () => {
    expect(formatToman(1_250_000)).toBe("۱٬۲۵۰٬۰۰۰");
  });

  it("renders zero", () => {
    expect(formatToman(0)).toBe("۰");
  });

  it("never shows decimals (integer money only)", () => {
    expect(formatToman(450_000)).not.toContain(".");
  });

  it("supports English locale with latin digits", () => {
    expect(formatToman(1_250_000, "en")).toBe("1,250,000");
  });
});

describe("formatTomanWithCurrency", () => {
  it("appends the تومان suffix for fa", () => {
    expect(formatTomanWithCurrency(1_250_000)).toBe("۱٬۲۵۰٬۰۰۰ تومان");
  });
  it("appends Toman for en", () => {
    expect(formatTomanWithCurrency(1_250_000, "en")).toBe("1,250,000 Toman");
  });
});

describe("formatPercent", () => {
  it("renders a Persian percentage label", () => {
    expect(formatPercent(20)).toBe("۲۰٪");
  });
});

describe("formatNumber", () => {
  it("localizes a count to Persian digits", () => {
    expect(formatNumber(3)).toBe("۳");
  });
});
