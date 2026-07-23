import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { clearFlow } from "../lib/session.js";
import { CANCEL_TEXT } from "../lib/ui.js";

const composer = new Composer<Ctx>();

async function doCancel(ctx: Ctx): Promise<void> {
  clearFlow(ctx.session);
  await ctx.reply(CANCEL_TEXT, { reply_markup: mainMenuKeyboard() });
}

composer.command("cancel", async (ctx) => {
  await doCancel(ctx);
});

composer.callbackQuery("flow:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearFlow(ctx.session);
  try {
    await ctx.editMessageText(CANCEL_TEXT, { reply_markup: mainMenuKeyboard() });
  } catch {
    await ctx.reply(CANCEL_TEXT, { reply_markup: mainMenuKeyboard() });
  }
});

export default composer;
