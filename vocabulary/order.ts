// order.ts — remembers the order in which each subject was written.
//
// The graph does not keep it, and people read a vocabulary in the order of its file: lists of terms and of problems
// come out in that order. vocabulary.ts writes it down when it parses or adds; terms.ts and check.ts read it.

// @ts-types="@types/n3"
import type { Store } from "n3";

const ORDER = new WeakMap<Store, Map<string, number>>();

/** Notes that `subject` was written now, unless it was already there. */
export function remember(store: Store, subject: string): void {
  const seen = ORDER.get(store) ?? new Map<string, number>();
  ORDER.set(store, seen);
  if (!seen.has(subject)) seen.set(subject, seen.size);
}

/** `items` in the order they were written; what was never noted goes last, as the graph gives it. */
export function inOrder<T extends { value: string }>(store: Store, items: T[]): T[] {
  const seen = ORDER.get(store);
  const at = (item: T) => seen?.get(item.value) ?? Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => at(a) - at(b));
}
