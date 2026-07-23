import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { appendConversation } from "../lib/assets.js";
import { now } from "../lib/clock.js";
import { deliverSummaryFile, sendProgress } from "../lib/deliver.js";
import { allowRequest, ensureFreshUser, expireFlowIfNeeded, notifyExpired } from "../lib/guards.js";
import { generateSummary } from "../lib/openrouter.js";
import { clearFlow, enterFlow, type SummaryLength } from "../lib/session.js";
import { cancelRow, summaryLengthKeyboard } from "../lib/ui.js";

registerMainMenuItem({ label: "Summary", data: "summary:start", order: 50 });

const composer = new Composer<Ctx>();

const PROMPT = "Paste the text you want summarized (or forward a long message's content).";

const LENGTH_PROMPT = "How long should the summary be?";

async function promptForSummary(ctx: Ctx, edit: boolean): Promise<void> {
  enterFlow(ctx.session, "awaiting_summary_text", now());
  ctx.session.summaryLength = undefined;
  ctx.session.pendingText = undefined;
  if (edit) {
    try {
      await ctx.editMessageText(PROMPT, { reply_markup: cancelRow() });
      return;
    } catch {
      /* fall through */
    }
  }
  await ctx.reply(PROMPT, { reply_markup: cancelRow() });
}

export async function runSummary(
  ctx: Ctx,
  text: string,
  length: SummaryLength = "medium",
): Promise<void> {
  const userId = await ensureFreshUser(ctx);
  if (userId == null) return;
  if (!(await allowRequest(ctx, text))) return;

  await appendConversation(userId, "user", `summary(${length}): ${text.slice(0, 200)}`);
  await sendProgress(ctx, "Summarizing…");
  const body = await generateSummary(text, length);
  clearFlow(ctx.session);
  ctx.session.pendingText = undefined;
  ctx.session.summaryLength = undefined;
  await deliverSummaryFile(ctx, userId, body);
}

composer.callbackQuery("summary:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await promptForSummary(ctx, true);
});

composer.callbackQuery(/^summary:len:(short|medium|long)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const len = (ctx.match as RegExpExecArray)[1] as SummaryLength;
  const text = ctx.session.pendingText;
  if (!text) {
    await promptForSummary(ctx, true);
    return;
  }
  ctx.session.summaryLength = len;
  await runSummary(ctx, text, len);
});

composer.command("summary", async (ctx) => {
  const arg = ctx.match?.toString().trim() ?? "";
  if (arg) {
    // Optional leading length token: short|medium|long
    const m = /^(short|medium|long)\s+([\s\S]+)$/i.exec(arg);
    if (m) {
      await runSummary(ctx, m[2]!.trim(), m[1]!.toLowerCase() as SummaryLength);
      return;
    }
    // Store text and ask for length
    enterFlow(ctx.session, "awaiting_summary_length", now());
    ctx.session.pendingText = arg;
    await ctx.reply(LENGTH_PROMPT, { reply_markup: summaryLengthKeyboard() });
    return;
  }
  await promptForSummary(ctx, false);
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.message.text.startsWith("/")) return next();
  if (expireFlowIfNeeded(ctx)) {
    await notifyExpired(ctx);
    return;
  }
  if (ctx.session.step === "awaiting_summary_text") {
    const t = ctx.message.text.trim();
    if (t.length < 10) {
      await ctx.reply("Need a bit more text to summarize — paste at least a few sentences.", {
        reply_markup: cancelRow(),
      });
      return;
    }
    enterFlow(ctx.session, "awaiting_summary_length", now());
    ctx.session.pendingText = t;
    await ctx.reply(LENGTH_PROMPT, { reply_markup: summaryLengthKeyboard() });
    return;
  }
  return next();
});

export default composer;
