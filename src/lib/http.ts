import type { ProviderError, ProviderId } from "./types";

export type Result<T> = { ok: true; data: T } | { ok: false; error: ProviderError };

export async function fetchJson<T>(
  provider: ProviderId,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Result<T>> {
  const { timeoutMs = 9000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal, cache: "no-store" });
    if (res.status === 429) return { ok: false, error: { provider, kind: "rate_limited", message: "Rate limited by provider" } };
    if (!res.ok) return { ok: false, error: { provider, kind: "http", message: `HTTP ${res.status}` } };
    try {
      return { ok: true, data: (await res.json()) as T };
    } catch {
      return { ok: false, error: { provider, kind: "parse", message: "Invalid JSON from provider" } };
    }
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return {
      ok: false,
      error: { provider, kind: aborted ? "timeout" : "network", message: aborted ? `Timed out after ${timeoutMs}ms` : String((e as Error)?.message ?? e) },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Simple in-process sliding-window rate limiter (per server instance). */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(private max: number, private windowMs: number) {}
  tryTake(now = Date.now()): boolean {
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}

/** Small TTL cache (per server instance). Supabase provides the shared cache. */
export class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  constructor(private maxEntries = 500) {}
  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.m.delete(k);
      return undefined;
    }
    return e.v;
  }
  /** Returns the value even if expired (used as a fallback when providers fail). */
  getStale(k: string): V | undefined {
    return this.m.get(k)?.v;
  }
  set(k: string, v: V, ttlMs: number) {
    if (this.m.size >= this.maxEntries) {
      const first = this.m.keys().next().value;
      if (first !== undefined) this.m.delete(first);
    }
    this.m.set(k, { v, exp: Date.now() + ttlMs });
  }
}
