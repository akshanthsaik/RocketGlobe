// src/hooks/useDebouncedCallback.ts
import { useEffect, useMemo, useRef } from "react";
import { debounce, type DebouncedFunction } from "../lib/utils";

/** Stable debounced wrapper around `callback` - always calls the latest version.
 *  Returns the debounced function itself, so callers can `.cancel()` a pending
 *  call (e.g. when a "clear filters" action resets the input it feeds). */
export function useDebouncedCallback<
  T extends (...args: Parameters<T>) => void,
>(callback: T, wait: number): DebouncedFunction<T> {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const debounced = useMemo(
    () =>
      debounce((...args: Parameters<T>) => callbackRef.current(...args), wait),
    [wait],
  );

  useEffect(() => () => debounced.cancel(), [debounced]);

  return debounced;
}
