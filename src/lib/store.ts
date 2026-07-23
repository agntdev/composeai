/**
 * Durable domain store — Redis when REDIS_URL is set, in-memory otherwise.
 * Keyed get/set/delete only (no keyspace scans). Collections are kept via
 * explicit index records (e.g. user asset id lists).
 *
 * Workers-safe: ioredis is loaded dynamically and only under Node with REDIS_URL.
 */

export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

class MemoryKv implements KvStore {
  private readonly map = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
  /** Test helper — wipe all keys. */
  clear(): void {
    this.map.clear();
  }
}

const memory = new MemoryKv();
let redisPromise: Promise<KvStore> | null = null;

function envRedisUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env.REDIS_URL;
}

async function redisStore(url: string): Promise<KvStore> {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ioredis: any = require("ioredis");
  const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
  const client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
  const prefix = "assist:kv:";
  return {
    async get(key: string) {
      return client.get(prefix + key);
    },
    async set(key: string, value: string) {
      await client.set(prefix + key, value);
    },
    async del(key: string) {
      await client.del(prefix + key);
    },
  };
}

async function backend(): Promise<KvStore> {
  const url = envRedisUrl();
  if (!url) return memory;
  redisPromise ??= redisStore(url).catch(() => memory);
  return redisPromise;
}

/** Read a JSON value (or undefined if missing/corrupt). */
export async function kvGet<T>(key: string): Promise<T | undefined> {
  const raw = await (await backend()).get(key);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Write a JSON value. */
export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await backend()).set(key, JSON.stringify(value));
}

/** Delete a key. */
export async function kvDel(key: string): Promise<void> {
  await (await backend()).del(key);
}

/** Test-only: clear the in-memory backend. */
export function _resetMemoryStore(): void {
  memory.clear();
  redisPromise = null;
}
