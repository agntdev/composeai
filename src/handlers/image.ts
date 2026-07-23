import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { appendConversation } from "../lib/assets.js";
import { now } from "../lib/clock.js";
import { deliverImage, sendProgress } from "../lib/deliver.js";
import { allowRequest, ensureFreshUser, expireFlowIfNeeded, notifyExpired } from "../lib/guards.js";
import { generateImage } from "../lib/openrouter.js";
import { clearFlow, enterFlow } from "../lib/session.js";
import { cancelRow } from "../lib/ui.js";

registerMainMenuItem({ label: "Image", data: "image:start", order: 20 });

const composer = new Composer<Ctx>();

const PROMPT =
  "Describe the image you want — subject, style, mood. I'll generate it and send it here.";

async function promptForImage(ctx: Ctx, edit: boolean): Promise<void> {
  enterFlow(ctx.session, "awaiting_image_prompt", now());
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

export async function runImage(ctx: Ctx, prompt: string): Promise<void> {
  const userId = await ensureFreshUser(ctx);
  if (userId == null) return;
  if (!(await allowRequest(ctx, prompt))) return;

  await appendConversation(userId, "user", `image: ${prompt}`);
  await sendProgress(ctx, "Generating your image…");
  try {
    await ctx.api.sendChatAction(ctx.chat!.id, "upload_photo");
  } catch {
    /* ignore */
  }
  const img = await generateImage(prompt);
  clearFlow(ctx.session);
  await deliverImage(
    ctx,
    userId,
    img.bytes,
    img.filename,
    `Here's your image: ${prompt.slice(0, 100)}`,
  );
}

composer.callbackQuery("image:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await promptForImage(ctx, true);
});

composer.command("image", async (ctx) => {
  const arg = ctx.match?.toString().trim() ?? "";
  if (arg) {
    await runImage(ctx, arg);
    return;
  }
  await promptForImage(ctx, false);
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.message.text.startsWith("/")) return next();
  if (expireFlowIfNeeded(ctx)) {
    await notifyExpired(ctx);
    return;
  }
  if (ctx.session.step !== "awaiting_image_prompt") return next();
  const p = ctx.message.text.trim();
  if (p.length < 2) {
    await ctx.reply("Add a bit more detail to the prompt, or tap Cancel.", {
      reply_markup: cancelRow(),
    });
    return;
  }
  await runImage(ctx, p);
});

export default composer;
