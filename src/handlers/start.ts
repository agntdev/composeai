import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { ensureUser } from "../lib/assets.js";
import { clearFlow } from "../lib/session.js";

const composer = new Composer<Ctx>();

export const WELCOME =
  "Hi — I'm ComposeAI.\n\n" +
  "Ask a question, generate an image, draft a document, export a PDF, or get a summary. " +
  "Tap a button below, or just type what you need.";

composer.command("start", async (ctx) => {
  clearFlow(ctx.session);
  if (ctx.from?.id != null) {
    await ensureUser(ctx.from.id, ctx.from.language_code ?? "en");
  }
  // Deep-link payload: /start <code> reserved for future invites; ignore silently.
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearFlow(ctx.session);
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
