import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { appendConversation, getConversation } from "../lib/assets.js";
import { now } from "../lib/clock.js";
import { deliverTextAnswer, sendProgress } from "../lib/deliver.js";
import { allowRequest, ensureFreshUser, expireFlowIfNeeded, notifyExpired } from "../lib/guards.js";
import { answerQuestion } from "../lib/openrouter.js";
import { clearFlow, enterFlow } from "../lib/session.js";
import { cancelRow } from "../lib/ui.js";

registerMainMenuItem({ label: "Ask", data: "ask:start", order: 10 });

const composer = new Composer<Ctx>();

const PROMPT =
  "What's your question? Type it below — I'll answer right here in chat.";

async function promptForQuestion(ctx: Ctx, edit: boolean): Promise<void> {
  enterFlow(ctx.session, "awaiting_question", now());
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

export async function runAsk(ctx: Ctx, question: string): Promise<void> {
  const userId = await ensureFreshUser(ctx);
  if (userId == null) return;
  if (!(await allowRequest(ctx, question))) return;

  await appendConversation(userId, "user", question);
  await sendProgress(ctx, "Thinking…");
  const history = await getConversation(userId);
  const answer = await answerQuestion(question, history);
  clearFlow(ctx.session);
  await deliverTextAnswer(ctx, userId, answer);
}

composer.callbackQuery("ask:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await promptForQuestion(ctx, true);
});

composer.command("ask", async (ctx) => {
  const arg = ctx.match?.toString().trim() ?? "";
  if (arg) {
    await runAsk(ctx, arg);
    return;
  }
  await promptForQuestion(ctx, false);
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.message.text.startsWith("/")) return next();
  if (expireFlowIfNeeded(ctx)) {
    await notifyExpired(ctx);
    return;
  }
  if (ctx.session.step !== "awaiting_question") return next();
  const q = ctx.message.text.trim();
  if (!q) {
    await ctx.reply("Send a short question, or tap Cancel.", { reply_markup: cancelRow() });
    return;
  }
  await runAsk(ctx, q);
});

export default composer;
