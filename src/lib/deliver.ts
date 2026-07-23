/**
 * Deliver generated outputs as Telegram attachments + progress messages.
 */

import { InputFile } from "grammy";
import type { Ctx } from "../bot.js";
import { appendConversation, saveAsset, type AssetType } from "./assets.js";
import { buildPdf } from "./pdf.js";
import { backMenuKeyboard } from "./ui.js";

export async function sendProgress(ctx: Ctx, text: string): Promise<void> {
  try {
    await ctx.api.sendChatAction(ctx.chat!.id, "typing");
  } catch {
    /* ignore */
  }
  await ctx.reply(text);
}

export async function deliverTextAnswer(ctx: Ctx, userId: number, answer: string): Promise<void> {
  const clipped = answer.length > 4000 ? answer.slice(0, 3990) + "…" : answer;
  await appendConversation(userId, "assistant", clipped);
  await ctx.reply(clipped, { reply_markup: backMenuKeyboard() });
}

export async function deliverTextDocument(
  ctx: Ctx,
  userId: number,
  body: string,
  filename: string,
  label: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(body);
  const asset = await saveAsset(userId, {
    type: "document",
    size: bytes.byteLength,
    filename,
    label,
    textBody: body,
  });
  ctx.session.lastDocText = body;
  ctx.session.lastDocId = asset.id;
  await ctx.replyWithDocument(new InputFile(bytes, filename), {
    caption: label,
    reply_markup: backMenuKeyboard(),
  });
  await appendConversation(userId, "assistant", `Document ready: ${filename}`);
  return asset.id;
}

export async function deliverPdf(
  ctx: Ctx,
  userId: number,
  body: string,
  filename: string,
  title: string,
): Promise<string> {
  const bytes = buildPdf(body, title);
  const asset = await saveAsset(userId, {
    type: "pdf",
    size: bytes.byteLength,
    filename,
    label: title,
    textBody: body,
  });
  await ctx.replyWithDocument(new InputFile(bytes, filename), {
    caption: `PDF ready: ${title}`,
    reply_markup: backMenuKeyboard(),
  });
  await appendConversation(userId, "assistant", `PDF ready: ${filename}`);
  return asset.id;
}

export async function deliverImage(
  ctx: Ctx,
  userId: number,
  bytes: Uint8Array,
  filename: string,
  caption: string,
): Promise<string> {
  const asset = await saveAsset(userId, {
    type: "image",
    size: bytes.byteLength,
    filename,
    label: caption.slice(0, 120),
  });
  await ctx.replyWithPhoto(new InputFile(bytes, filename), {
    caption,
    reply_markup: backMenuKeyboard(),
  });
  await appendConversation(userId, "assistant", `Image ready: ${caption.slice(0, 80)}`);
  return asset.id;
}

export async function deliverSummaryFile(
  ctx: Ctx,
  userId: number,
  body: string,
): Promise<string> {
  const filename = "summary.txt";
  const bytes = new TextEncoder().encode(body);
  const asset = await saveAsset(userId, {
    type: "summary",
    size: bytes.byteLength,
    filename,
    label: "Summary",
    textBody: body,
  });
  ctx.session.lastDocText = body;
  ctx.session.lastDocId = asset.id;
  const clipped = body.length > 3500 ? body.slice(0, 3490) + "…" : body;
  await ctx.reply(clipped);
  await ctx.replyWithDocument(new InputFile(bytes, filename), {
    caption: "Summary as a file — export to PDF anytime.",
    reply_markup: backMenuKeyboard(),
  });
  await appendConversation(userId, "assistant", "Summary delivered");
  return asset.id;
}

export type { AssetType };
