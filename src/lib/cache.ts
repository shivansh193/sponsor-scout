import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";

// Server-side key/value store: Upstash Redis when configured (Vercel KV uses the
// same env vars), otherwise an in-process Map for local dev. Qloo responses are
// cached here and never written to the repo.

type Entry = { value: unknown; expires: number };

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const g = globalThis as unknown as { __ssMem?: Map<string, Entry> };
const mem = (g.__ssMem ??= new Map<string, Entry>());

export const storeKind = redis ? "redis" : "memory";

export async function kvGet<T>(key: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(key)) ?? null;
  const e = mem.get(key);
  if (!e) return null;
  if (e.expires && e.expires < Date.now()) {
    mem.delete(key);
    return null;
  }
  return e.value as T;
}

/** ttl in seconds; 0 = no expiry. */
export async function kvSet(key: string, value: unknown, ttl = 0): Promise<void> {
  if (redis) {
    if (ttl) await redis.set(key, value, { ex: ttl });
    else await redis.set(key, value);
    return;
  }
  mem.set(key, { value, expires: ttl ? Date.now() + ttl * 1000 : 0 });
}

export async function kvIncr(key: string, ttl: number): Promise<number> {
  if (redis) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, ttl);
    return n;
  }
  const cur = (await kvGet<number>(key)) ?? 0;
  const e = mem.get(key);
  mem.set(key, { value: cur + 1, expires: e?.expires || Date.now() + ttl * 1000 });
  return cur + 1;
}

export function hashKey(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

/** Read-through cache. */
export async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const hit = await kvGet<T>(key);
  if (hit !== null) return { value: hit, hit: true };
  const value = await fn();
  await kvSet(key, value, ttl);
  return { value, hit: false };
}
