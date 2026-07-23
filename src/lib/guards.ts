/**
 * Shared pre-checks for feature handlers: safety, rate limit, user ensure, flow TTL.
 */

import type { Ctx } from "../bot.js";
import { now } from "./clock.js";
import { ensureUser } from "./assets.js";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "./rate-limit.js";
import { isUnsafeContent, SAFETY_BLOCKED_MESSAGE } from "./safety.js";
import { clearFlow, isInFlow } from "./session.js";
import { EXPIRED_TEXT } from "./ui.js";

export async function ensureFreshUser(ctx: Ctx): Promise<number | null> {
  const id = ctx.from?.id;
  if (id == null) return null;
  const lang = ctx.from?.language_code ?? ctx.session.language ?? "en";
  ctx.session.language = lang;
  await ensureUser(id, lang);
  return id;
}

/** Expire timed-out flows. Returns true if the flow was cleared. */
export function expireFlowIfNeeded(ctx: Ctx): boolean {
  if (!isInFlow(ctx.session)) return false;
  if (ctx.session.expiresAt && now() > ctx.session.expiresAt) {
    clearFlow(ctx.session);
    return true;
  }
  return false;
}

/**
 * Run safety + rate-limit checks. Replies and returns false when blocked.
 */
export async function allowRequest(ctx: Ctx, text: string): Promise<boolean> {
  const userId = await ensureFreshUser(ctx);
  if (userId == null) {
    await ctx.reply("I couldn't identify your chat — open the bot from Telegram and try /start.");
    return false;
  }
  if (isUnsafeContent(text)) {
    await ctx.reply(SAFETY_BLOCKED_MESSAGE);
    return false;
  }
  const ok = await checkRateLimit(userId);
  if (!ok) {
    await ctx.reply(RATE_LIMIT_MESSAGE);
    return false;
  }
  return true;
}

export async function notifyExpired(ctx: Ctx): Promise<void> {
  await ctx.reply(EXPIRED_TEXT);
}
