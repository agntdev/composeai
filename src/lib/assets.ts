/**
 * Asset + conversation durable records.
 * Retention: asset metadata purged after 30 days; conversation keeps last 30 messages.
 * Uses explicit per-user index keys — never scans the keyspace.
 */

import { now } from "./clock.js";
import { kvDel, kvGet, kvSet } from "./store.js";

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_HISTORY = 30;

export type AssetType = "image" | "document" | "pdf" | "summary";

export interface AssetRecord {
  id: string;
  userId: number;
  type: AssetType;
  createdAt: number;
  size: number;
  filename: string;
  /** Short label / preview text (not the full binary). */
  label: string;
  /** Optional stored text body for later PDF export (docs/summaries). */
  textBody?: string;
}

export interface UserRecord {
  telegramId: number;
  language: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  at: number;
}

export interface ConversationRecord {
  userId: number;
  messages: ChatMessage[];
}

function userKey(id: number): string {
  return `user:${id}`;
}
function convKey(id: number): string {
  return `conv:${id}`;
}
function assetKey(id: string): string {
  return `asset:${id}`;
}
function assetIndexKey(userId: number): string {
  return `assets-idx:${userId}`;
}

export async function ensureUser(telegramId: number, language = "en"): Promise<UserRecord> {
  const existing = await kvGet<UserRecord>(userKey(telegramId));
  const t = now();
  if (existing) {
    existing.updatedAt = t;
    if (language && language !== existing.language) existing.language = language;
    await kvSet(userKey(telegramId), existing);
    return existing;
  }
  const rec: UserRecord = {
    telegramId,
    language: language || "en",
    createdAt: t,
    updatedAt: t,
  };
  await kvSet(userKey(telegramId), rec);
  return rec;
}

export async function appendConversation(
  userId: number,
  role: "user" | "assistant",
  text: string,
): Promise<void> {
  const key = convKey(userId);
  const rec = (await kvGet<ConversationRecord>(key)) ?? { userId, messages: [] };
  rec.messages.push({ role, text: text.slice(0, 4000), at: now() });
  if (rec.messages.length > MAX_HISTORY) {
    rec.messages = rec.messages.slice(-MAX_HISTORY);
  }
  await kvSet(key, rec);
}

export async function getConversation(userId: number): Promise<ChatMessage[]> {
  const rec = await kvGet<ConversationRecord>(convKey(userId));
  return rec?.messages ?? [];
}

let idSeq = 0;
function makeId(): string {
  idSeq += 1;
  return `${now().toString(36)}-${idSeq.toString(36)}`;
}

/**
 * Save asset metadata (+ optional text body for re-export).
 * Purges expired assets for this user on write (index-driven, no scan).
 */
export async function saveAsset(
  userId: number,
  partial: Omit<AssetRecord, "id" | "userId" | "createdAt"> & { id?: string },
): Promise<AssetRecord> {
  await purgeExpiredAssets(userId);
  const id = partial.id ?? makeId();
  const rec: AssetRecord = {
    id,
    userId,
    type: partial.type,
    createdAt: now(),
    size: partial.size,
    filename: partial.filename,
    label: partial.label,
    textBody: partial.textBody,
  };
  await kvSet(assetKey(id), rec);
  const idx = (await kvGet<string[]>(assetIndexKey(userId))) ?? [];
  if (!idx.includes(id)) idx.push(id);
  await kvSet(assetIndexKey(userId), idx);
  return rec;
}

export async function getAsset(
  userId: number,
  assetId: string,
): Promise<AssetRecord | "expired" | undefined> {
  const rec = await kvGet<AssetRecord>(assetKey(assetId));
  if (!rec || rec.userId !== userId) return undefined;
  if (now() - rec.createdAt > RETENTION_MS) {
    await deleteAsset(userId, assetId);
    return "expired";
  }
  return rec;
}

export async function listAssets(userId: number): Promise<AssetRecord[]> {
  await purgeExpiredAssets(userId);
  const idx = (await kvGet<string[]>(assetIndexKey(userId))) ?? [];
  const out: AssetRecord[] = [];
  for (const id of idx) {
    const rec = await kvGet<AssetRecord>(assetKey(id));
    if (rec) out.push(rec);
  }
  return out;
}

async function deleteAsset(userId: number, assetId: string): Promise<void> {
  await kvDel(assetKey(assetId));
  const idx = (await kvGet<string[]>(assetIndexKey(userId))) ?? [];
  await kvSet(
    assetIndexKey(userId),
    idx.filter((x) => x !== assetId),
  );
}

/** Drop assets older than 30 days for this user (via index only). */
export async function purgeExpiredAssets(userId: number): Promise<number> {
  const idx = (await kvGet<string[]>(assetIndexKey(userId))) ?? [];
  if (idx.length === 0) return 0;
  const t = now();
  const keep: string[] = [];
  let removed = 0;
  for (const id of idx) {
    const rec = await kvGet<AssetRecord>(assetKey(id));
    if (!rec) {
      removed++;
      continue;
    }
    if (t - rec.createdAt > RETENTION_MS) {
      await kvDel(assetKey(id));
      removed++;
    } else {
      keep.push(id);
    }
  }
  if (removed > 0) await kvSet(assetIndexKey(userId), keep);
  return removed;
}

/** Latest document asset with text body (for /pdf without args). */
export async function latestDocWithBody(userId: number): Promise<AssetRecord | undefined> {
  const list = await listAssets(userId);
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i]!;
    if ((a.type === "document" || a.type === "summary") && a.textBody) return a;
  }
  return undefined;
}
