// src/hooks/usePaginatedList.ts
import { useCallback, useEffect, useState } from "react";
import type { UIEvent } from "react";

/**
 * Infinite-scroll-style pagination over an already-filtered/sorted list.
 * Resets to the first page whenever `items` gets a new reference (i.e.
 * whenever the caller's own filter/sort useMemo recomputes).
 */
export function usePaginatedList<T>(items: T[], pageSize: number) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  const visibleItems = items.slice(0, visibleCount);
  const canLoadMore = items.length > visibleCount;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + pageSize, items.length));
  }, [pageSize, items.length]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!canLoadMore) return;
      const target = event.currentTarget;
      if (target.scrollHeight - target.scrollTop - target.clientHeight < 200) {
        loadMore();
      }
    },
    [canLoadMore, loadMore],
  );

  return { visibleItems, visibleCount, canLoadMore, loadMore, onScroll };
}
