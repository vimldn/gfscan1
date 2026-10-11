"use client";
/** Per-viewer convenience only: recent searches in localStorage, wrapped in try/catch. */
const KEY = "cieat:recent:v1";
export interface RecentItem { kind: "query" | "product"; value: string; label: string; at: number }

export function readRecent(): RecentItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function pushRecent(item: Omit<RecentItem, "at">) {
  try {
    const cur = readRecent().filter((r) => !(r.kind === item.kind && r.value === item.value));
    localStorage.setItem(KEY, JSON.stringify([{ ...item, at: Date.now() }, ...cur].slice(0, 8)));
  } catch {}
}

export function clearRecent() {
  try { localStorage.removeItem(KEY); } catch {}
}
