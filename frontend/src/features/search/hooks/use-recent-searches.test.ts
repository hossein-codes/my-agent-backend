import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecentSearches } from "./use-recent-searches";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useRecentSearches", () => {
  it("adds newest first and de-duplicates", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.add("کفش"));
    act(() => result.current.add("کیف"));
    act(() => result.current.add("کفش"));
    expect(result.current.items).toEqual(["کفش", "کیف"]);
  });

  it("removes an item", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.add("کفش"));
    act(() => result.current.remove("کفش"));
    expect(result.current.items).toEqual([]);
  });

  it("caps history at 8 items", () => {
    const { result } = renderHook(() => useRecentSearches());
    for (let i = 0; i < 10; i++) act(() => result.current.add(`جستجو ${i}`));
    expect(result.current.items).toHaveLength(8);
  });

  it("ignores empty/short terms", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.add(""));
    act(() => result.current.add("a"));
    expect(result.current.items).toEqual([]);
  });
});
