"use client";

import { useEffect, useRef, useCallback } from "react";

export interface UseInfiniteScrollOptions {
  /** Called when the sentinel enters the viewport. Must be stable (useCallback). */
  onLoadMore: () => void;
  /** Whether there are more pages to load. */
  hasMore: boolean;
  /** Whether a fetch is currently in progress. */
  isLoading: boolean;
  /** Pixels from the bottom of the sentinel at which to trigger (default 200). */
  rootMargin?: number;
}

/**
 * Returns a ref to attach to a sentinel element positioned at the bottom of the
 * list. When the sentinel scrolls within `rootMargin` px of the viewport the
 * `onLoadMore` callback fires — but only if `hasMore` is true and `isLoading`
 * is false. This satisfies the IntersectionObserver acceptance criterion from
 * issue #287.
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  rootMargin = 200,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !isLoading) {
        onLoadMore();
      }
    },
    [onLoadMore, hasMore, isLoading],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: `0px 0px ${rootMargin}px 0px`,
    });
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [handleIntersection, rootMargin]);

  return { sentinelRef };
}
