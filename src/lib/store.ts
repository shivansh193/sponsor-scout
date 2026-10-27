import { hashKey, kvGet, kvIncr, kvSet } from "./cache";
import type { Report, RunInput } from "./types";

const REPORT_TTL = 60 * 60 * 24 * 90;
const RUN_TTL = 60 * 60 * 24;

export const saveReport = (r: Report) => kvSet(`report:${r.id}`, r, REPORT_TTL);
export const loadReport = (id: string) => kvGet<Report>(`report:${id}`);

/** Same input within 24h reuses the stored report (fast demo, saves quota). */
export function inputKey(i: RunInput): string {
  const canon = {
    b: i.brand?.id ?? null,
    q: i.brand ? "" : i.brandQuery.trim().toLowerCase(),
    l: i.lookalikes.map((x) => x.id).sort(),
    t: i.tags.map((x) => x.id).sort(),
    c: i.city?.trim().toLowerCase() ?? "",
    bu: i.budget,
    a: i.age ?? "",
  };
  return `run:${hashKey(JSON.stringify(canon))}`;
}

export const findRun = (i: RunInput) => kvGet<string>(inputKey(i));
export const rememberRun = (i: RunInput, id: string) => kvSet(inputKey(i), id, RUN_TTL);

/** Fixed-window rate limit per IP. */
export async function rateLimit(ip: string, bucket: string, limit: number, windowSec: number): Promise<boolean> {
  const n = await kvIncr(`rl:${bucket}:${ip}:${Math.floor(Date.now() / 1000 / windowSec)}`, windowSec);
  return n <= limit;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
