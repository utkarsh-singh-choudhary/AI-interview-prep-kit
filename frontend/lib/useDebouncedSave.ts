"use client";
import { useCallback, useRef } from "react";

/**
 * Local-first editing: updates apply to state immediately, and a save function is
 * invoked only after `delayMs` of inactivity — so typing doesn't fire one request
 * per keystroke. Call `flush()` on blur to save immediately when needed.
 */
export function useDebouncedSave(delayMs = 700) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<(() => void) | null>(null);

  const schedule = useCallback((fn: () => void) => {
    pending.current = fn;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { pending.current?.(); pending.current = null; }, delayMs);
  }, [delayMs]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    pending.current?.();
    pending.current = null;
  }, []);

  return { schedule, flush };
}
