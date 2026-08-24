import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePaginatedList } from "./usePaginatedList";

describe("usePaginatedList", () => {
  it("shows only the first page, then loads more", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const { result } = renderHook(() => usePaginatedList(items, 10));

    expect(result.current.visibleItems).toHaveLength(10);
    expect(result.current.canLoadMore).toBe(true);

    act(() => result.current.loadMore());
    expect(result.current.visibleItems).toHaveLength(20);

    act(() => result.current.loadMore());
    expect(result.current.visibleItems).toHaveLength(25);
    expect(result.current.canLoadMore).toBe(false);
  });

  it("resets to the first page when the items array changes", () => {
    let items = [1, 2, 3, 4, 5];
    const { result, rerender } = renderHook(() => usePaginatedList(items, 2));

    act(() => result.current.loadMore());
    expect(result.current.visibleItems).toHaveLength(4);

    items = [6, 7, 8]; // new filtered result
    rerender();
    expect(result.current.visibleItems).toHaveLength(2);
  });
});
