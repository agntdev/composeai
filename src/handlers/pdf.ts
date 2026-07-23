import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { appendConversation, getAsset, latestDocWithBody } from "../lib/assets.js";
import { now } from "../lib/clock.js";
import { deliverPdf, sendProgress } from "../lib/deliver.js";
import { allowRequest, ensureFreshUser, expireFlowIfNeeded, notifyExpired } from "../lib/guards.js";
import { clearFlow, enterFlow } from "../lib/session.js";
import { cancelRow } from "../lib/ui.js";

registerMainMenuItem({ label: "PDF", data: "pdf:start", order: 40 });

const composer = new Composer<Ctx>();

const PROMPT =
  "Send the text to export as PDF, or a document id from an earlier file. " +
  "If you already made a document, I can also export that.";

const EXPIRED_ASSET =
  "That file has expired (we keep files for 30 days). Create a new document or send fresh text.";

async function promptForPdf(ctx: Ctx, edit: boolean): Promise<void> {
  enterFlow(ctx.session, "awaiting_pdf_text", now());
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

export async function runPdf(ctx: Ctx, input: string): Promise<void> {
  const userId = await ensureFreshUser(ctx);
  if (userId == null) return;
  if (!(await allowRequest(ctx, input || "pdf"))) return;

  let body = input.trim();
  let title = "Export";

  // Bare "last" / empty → prefer session draft, then latest durable doc
  if (!body || /^(last|latest|doc)$/i.test(body)) {
    if (ctx.session.lastDocText) {
      body = ctx.session.lastDocText;
      title = "Your document";
    } else if (/^(last|latest|doc)$/i.test(body)) {
      const latest = await latestDocWithBody(userId);
      if (latest?.textBody) {
        body = latest.textBody;
        title = latest.label || "Your document";
      }
    }
    // Empty input with no session draft → caller should prompt (body stays "")
  } else {
    // Treat short tokens without spaces as possible asset ids
    if (!/\s/.test(body) && body.length <= 40) {
      const asset = await getAsset(userId, body);
      if (asset === "expired") {
        await ctx.reply(EXPIRED_ASSET, { reply_markup: cancelRow() });
        clearFlow(ctx.session);
        return;
      }
      if (asset?.textBody) {
        title = asset.label || "Document";
        body = asset.textBody;
      }
    }
  }

  if (!body || body.length < 1) {
    await ctx.reply(
      "No document text yet — send the content to export, or create a document first.",
      { reply_markup: cancelRow() },
    );
    return;
  }

  await appendConversation(userId, "user", `pdf: ${body.slice(0, 120)}`);
  await sendProgress(ctx, "Building your PDF…");
  try {
    await ctx.api.sendChatAction(ctx.chat!.id, "upload_document");
  } catch {
    /* ignore */
  }
  clearFlow(ctx.session);
  await deliverPdf(ctx, userId, body, "export.pdf", title);
}

composer.callbackQuery("pdf:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  // One-tap export only when this chat still has a session draft
  if (ctx.session.lastDocText) {
    await runPdf(ctx, "last");
    return;
  }
  await promptForPdf(ctx, true);
});

composer.command("pdf", async (ctx) => {
  const arg = ctx.match?.toString().trim() ?? "";
  if (arg) {
    await runPdf(ctx, arg);
    return;
  }
  if (ctx.session.lastDocText) {
    await runPdf(ctx, "last");
    return;
  }
  await promptForPdf(ctx, false);
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.message.text.startsWith("/")) return next();
  if (expireFlowIfNeeded(ctx)) {
    await notifyExpired(ctx);
    return;
  }
  if (ctx.session.step !== "awaiting_pdf_text") return next();
  const t = ctx.message.text.trim();
  if (!t) {
    await ctx.reply("Send the text (or a document id) to export.", { reply_markup: cancelRow() });
    return;
  }
  await runPdf(ctx, t);
});

export default composer;
