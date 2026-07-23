import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

export const HELP =
  "Here's what I can do:\n\n" +
  "• Ask — get a clear answer to a question\n" +
  "• Image — generate a picture from a prompt\n" +
  "• Document — draft a text document\n" +
  "• PDF — export text or a recent doc as PDF\n" +
  "• Summary — condense long text (short / medium / long)\n\n" +
  "Tap /start for the menu, or just type a request in plain language.\n" +
  "Files you create are kept for 30 days, then removed.";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP, { reply_markup: backToMenu });
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: backToMenu });
});

export default composer;
