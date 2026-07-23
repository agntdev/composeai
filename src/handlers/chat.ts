/**
 * Natural chat flow — free-form messages when the user isn't mid-feature.
 * Classifies intent, may ask one clarifying question, then delivers output.
 */

import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { now } from "../lib/clock.js";
import { expireFlowIfNeeded, notifyExpired } from "../lib/guards.js";
import { classifyIntent } from "../lib/openrouter.js";
import { clearFlow, enterFlow, isInFlow } from "../lib/session.js";
import { cancelRow } from "../lib/ui.js";
import { HELP } from "./help.js";
import { runAsk } from "./ask.js";
import { runImage } from "./image.js";
import { runDoc } from "./doc.js";
import { runPdf } from "./pdf.js";
import { runSummary } from "./summary.js";

const composer = new Composer<Ctx>();

const CLARIFY: Record<string, string> = {
  image: "What should the image show? A short description is enough.",
  doc: "What should the document be about? A one-line brief works.",
  pdf: "What text should I put in the PDF?",
  summary: "Paste the text you'd like summarized.",
  general: "What would you like — an answer, image, document, PDF, or summary?",
  ask: "What's your question?",
};

composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return next();

  if (expireFlowIfNeeded(ctx)) {
    await notifyExpired(ctx);
  }

  // Handle clarification replies before other feature steps
  if (ctx.session.step === "awaiting_clarification") {
    const kind = ctx.session.clarifyKind ?? "general";
    const reply = text.trim();
    if (reply.length < 1) {
      await ctx.reply(CLARIFY[kind] ?? CLARIFY.general!, { reply_markup: cancelRow() });
      return;
    }
    clearFlow(ctx.session);
    await dispatch(ctx, kind, reply);
    return;
  }

  // Mid-feature flows (ask/image/doc/pdf/summary) are owned by their handlers
  if (isInFlow(ctx.session)) return next();

  const intent = classifyIntent(text);

  if (intent.type === "help") {
    await ctx.reply(HELP, { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (intent.type === "ambiguous") {
    enterFlow(ctx.session, "awaiting_clarification", now());
    ctx.session.clarifyKind = intent.question as typeof ctx.session.clarifyKind;
    await ctx.reply(CLARIFY[intent.question] ?? CLARIFY.general!, {
      reply_markup: cancelRow(),
    });
    return;
  }

  if (intent.type === "ask") {
    await runAsk(ctx, intent.question);
    return;
  }
  if (intent.type === "image") {
    await runImage(ctx, intent.prompt);
    return;
  }
  if (intent.type === "doc") {
    await runDoc(ctx, intent.brief);
    return;
  }
  if (intent.type === "pdf") {
    await runPdf(ctx, intent.text);
    return;
  }
  if (intent.type === "summary") {
    await runSummary(ctx, intent.text, "medium");
    return;
  }

  return next();
});

async function dispatch(ctx: Ctx, kind: string, text: string): Promise<void> {
  switch (kind) {
    case "image":
      await runImage(ctx, text);
      break;
    case "doc":
      await runDoc(ctx, text);
      break;
    case "pdf":
      await runPdf(ctx, text);
      break;
    case "summary":
      await runSummary(ctx, text, "medium");
      break;
    default:
      await runAsk(ctx, text);
      break;
  }
}

export default composer;
