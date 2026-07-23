import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { appendConversation } from "../lib/assets.js";
import { now } from "../lib/clock.js";
import { deliverTextDocument, sendProgress } from "../lib/deliver.js";
import { allowRequest, ensureFreshUser, expireFlowIfNeeded, notifyExpired } from "../lib/guards.js";
import { generateDocumentText } from "../lib/openrouter.js";
import { clearFlow, enterFlow } from "../lib/session.js";
import { cancelRow } from "../lib/ui.js";

registerMainMenuItem({ label: "Document", data: "doc:start", order: 30 });

const composer = new Composer<Ctx>();

const PROMPT =
  "What should the document cover? Send a short brief — topic, audience, and any must-include points.";

async function promptForDoc(ctx: Ctx, edit: boolean): Promise<void> {
  enterFlow(ctx.session, "awaiting_doc_brief", now());
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

export async function runDoc(ctx: Ctx, brief: string): Promise<void> {
  const userId = await ensureFreshUser(ctx);
  if (userId == null) return;
  if (!(await allowRequest(ctx, brief))) return;

  await appendConversation(userId, "user", `doc: ${brief}`);
  await sendProgress(ctx, "Drafting your document…");
  try {
    await ctx.api.sendChatAction(ctx.chat!.id, "upload_document");
  } catch {
    /* ignore */
  }
  const body = await generateDocumentText(brief);
  clearFlow(ctx.session);
  const safeName =
    brief
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "document";
  await deliverTextDocument(
    ctx,
    userId,
    body,
    `${safeName}.txt`,
    "Your document is ready. Use PDF to export it.",
  );
}

composer.callbackQuery("doc:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await promptForDoc(ctx, true);
});

composer.command("doc", async (ctx) => {
  const arg = ctx.match?.toString().trim() ?? "";
  if (arg) {
    await runDoc(ctx, arg);
    return;
  }
  await promptForDoc(ctx, false);
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.message.text.startsWith("/")) return next();
  if (expireFlowIfNeeded(ctx)) {
    await notifyExpired(ctx);
    return;
  }
  if (ctx.session.step !== "awaiting_doc_brief") return next();
  const b = ctx.message.text.trim();
  if (b.length < 2) {
    await ctx.reply("Send a short brief for the document, or tap Cancel.", {
      reply_markup: cancelRow(),
    });
    return;
  }
  await runDoc(ctx, b);
});

export default composer;
