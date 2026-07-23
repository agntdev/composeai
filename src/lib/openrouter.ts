/**
 * OpenRouter client — chat + image generation over HTTPS fetch.
 * Credentials from OPENROUTER_API_KEY. Offline deterministic fallbacks when
 * the key is missing (tests / local) so handlers stay real, not stubbed.
 */

import { buildPlaceholderPng } from "./png.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function apiKey(): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY;
}

function chatModel(): string {
  if (typeof process !== "undefined" && process.env.OPENROUTER_MODEL) {
    return process.env.OPENROUTER_MODEL;
  }
  return "openai/gpt-4o-mini";
}

function imageModel(): string {
  if (typeof process !== "undefined" && process.env.OPENROUTER_IMAGE_MODEL) {
    return process.env.OPENROUTER_IMAGE_MODEL;
  }
  // OpenRouter image-capable model; falls back offline if unavailable.
  return "google/gemini-2.0-flash-exp:free";
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function openRouterChat(
  messages: ChatMessage[],
  opts?: { maxTokens?: number },
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://agnt-gm.ai",
        "X-Title": "ComposeAI Assistant",
      },
      body: JSON.stringify({
        model: chatModel(),
        messages,
        max_tokens: opts?.maxTokens ?? 1024,
        temperature: 0.4,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

/** Offline extractive-ish answer so tests and keyless deploys still work. */
function offlineAnswer(question: string): string {
  const q = question.trim().replace(/\s+/g, " ");
  if (q.length < 3) return "Could you add a bit more detail to your question?";
  return (
    `Here's a concise take on that:\n\n` +
    `You asked: “${q.slice(0, 280)}”\n\n` +
    `In short — focus on the core need, keep the answer practical, and break the ` +
    `next step into one clear action. If you want this as a document or PDF, ` +
    `use the Document or PDF buttons.`
  );
}

function offlineSummary(text: string, length: "short" | "medium" | "long"): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const n = length === "short" ? 1 : length === "long" ? 5 : 3;
  const picked = sentences.slice(0, Math.max(1, Math.min(n, sentences.length)));
  if (picked.length === 0) {
    return cleaned.slice(0, length === "short" ? 120 : length === "long" ? 600 : 280);
  }
  let out = picked.join(" ");
  if (length === "short" && out.length > 200) out = out.slice(0, 197) + "…";
  if (length === "medium" && out.length > 500) out = out.slice(0, 497) + "…";
  return `Summary (${length}):\n\n${out}`;
}

function offlineDocument(brief: string): string {
  const title = brief.trim().slice(0, 80) || "Untitled";
  return (
    `${title}\n${"=".repeat(Math.min(40, title.length))}\n\n` +
    `Overview\n--------\n` +
    `This document was created from your brief: “${brief.trim().slice(0, 400)}”.\n\n` +
    `Key points\n----------\n` +
    `1. Clarify the goal in one sentence.\n` +
    `2. List the inputs you already have.\n` +
    `3. Note the next action and owner.\n\n` +
    `Next steps\n----------\n` +
    `- Review this draft and edit freely.\n` +
    `- Export as PDF from the menu when you're ready.\n`
  );
}

export async function answerQuestion(
  question: string,
  history: Array<{ role: "user" | "assistant"; text: string }> = [],
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are ComposeAI, a helpful and concise assistant in Telegram. " +
        "Answer clearly in plain language. Keep replies under 800 words. " +
        "If the question is ambiguous, ask ONE short clarifying question.",
    },
    ...history.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.text,
    })),
    { role: "user", content: question },
  ];
  const live = await openRouterChat(messages, { maxTokens: 900 });
  return live ?? offlineAnswer(question);
}

export async function generateDocumentText(brief: string): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You write clear, well-structured plain-text documents. " +
        "Use headings and short paragraphs. No markdown code fences. " +
        "Output only the document body.",
    },
    { role: "user", content: `Write a document based on this brief:\n${brief}` },
  ];
  const live = await openRouterChat(messages, { maxTokens: 1500 });
  return live ?? offlineDocument(brief);
}

export async function generateSummary(
  text: string,
  length: "short" | "medium" | "long" = "medium",
): Promise<string> {
  const guidance =
    length === "short"
      ? "2-3 sentences max"
      : length === "long"
        ? "a thorough multi-paragraph summary"
        : "one short paragraph plus 3 bullet takeaways";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `Summarize the user's text (${guidance}). Be faithful; no new facts.`,
    },
    { role: "user", content: text },
  ];
  const live = await openRouterChat(messages, {
    maxTokens: length === "long" ? 900 : length === "short" ? 200 : 450,
  });
  return live ?? offlineSummary(text, length);
}

export interface ImageResult {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  filename: string;
}

/**
 * Generate an image from a prompt.
 * Tries OpenRouter multimodal/image models; falls back to a local PNG.
 */
export async function generateImage(prompt: string): Promise<ImageResult> {
  const key = apiKey();
  if (key) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://agnt-gm.ai",
          "X-Title": "ComposeAI Assistant",
        },
        body: JSON.stringify({
          model: imageModel(),
          messages: [
            {
              role: "user",
              content: `Generate an image: ${prompt.slice(0, 500)}`,
            },
          ],
          modalities: ["image", "text"],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{
            message?: {
              images?: Array<{ image_url?: { url?: string } }>;
              content?: string | Array<{ type?: string; image_url?: { url?: string } }>;
            };
          }>;
        };
        const msg = data.choices?.[0]?.message;
        let dataUrl: string | undefined =
          msg?.images?.[0]?.image_url?.url;
        if (!dataUrl && Array.isArray(msg?.content)) {
          for (const part of msg!.content as Array<{ type?: string; image_url?: { url?: string } }>) {
            if (part.image_url?.url) {
              dataUrl = part.image_url.url;
              break;
            }
          }
        }
        if (dataUrl?.startsWith("data:image/")) {
          const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl);
          if (m) {
            const mime = (m[1] === "image/jpeg" ? "image/jpeg" : "image/png") as
              | "image/png"
              | "image/jpeg";
            const bin = Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0));
            return {
              bytes: bin,
              mime,
              filename: mime === "image/jpeg" ? "image.jpg" : "image.png",
            };
          }
        }
      }
    } catch {
      /* fall through to placeholder */
    }
  }

  return {
    bytes: buildPlaceholderPng(),
    mime: "image/png",
    filename: "image.png",
  };
}

/**
 * Intent routing for natural chat — cheap offline heuristics + optional LLM.
 * Returns a structured intent so the handler can run the right flow.
 */
export type Intent =
  | { type: "ask"; question: string }
  | { type: "image"; prompt: string }
  | { type: "doc"; brief: string }
  | { type: "pdf"; text: string }
  | { type: "summary"; text: string }
  | { type: "ambiguous"; question: string }
  | { type: "help" };

export function classifyIntent(text: string): Intent {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (/^(help|menu|what can you do)\b/i.test(t)) return { type: "help" };

  if (
    /^(draw|generate|create|make)\s+(an?\s+)?(image|picture|photo|illustration)\b/i.test(t) ||
    /\b(image|picture|photo)\s+of\b/i.test(lower)
  ) {
    const prompt = t
      .replace(/^(please\s+)?(draw|generate|create|make)\s+(an?\s+)?(image|picture|photo|illustration)\s*(of\s*)?/i, "")
      .trim();
    if (prompt.length < 2) return { type: "ambiguous", question: "image" };
    return { type: "image", prompt: prompt || t };
  }

  if (
    /^(write|create|draft|make)\s+(a\s+)?(doc|document|report|brief|letter)\b/i.test(t) ||
    /\b(as\s+a\s+document|into\s+a\s+document)\b/i.test(lower)
  ) {
    const brief = t
      .replace(/^(please\s+)?(write|create|draft|make)\s+(a\s+)?(doc|document|report|brief|letter)\s*(about|on|for)?\s*/i, "")
      .trim();
    if (brief.length < 2) return { type: "ambiguous", question: "doc" };
    return { type: "doc", brief: brief || t };
  }

  if (/^(pdf|export\s+(as\s+)?pdf|make\s+(a\s+)?pdf)\b/i.test(t)) {
    const body = t.replace(/^(please\s+)?(pdf|export\s+(as\s+)?pdf|make\s+(a\s+)?pdf)\s*[:\-]?\s*/i, "").trim();
    if (body.length < 2) return { type: "ambiguous", question: "pdf" };
    return { type: "pdf", text: body };
  }

  if (/^(summar(y|ise|ize)|tldr|tl;dr)\b/i.test(t) || /\bsummar(y|ise|ize)\s+this\b/i.test(lower)) {
    const body = t
      .replace(/^(please\s+)?(summar(y|ise|ize)|tldr|tl;dr)\s*[:\-]?\s*/i, "")
      .replace(/^(this|the following)\s*[:\-]?\s*/i, "")
      .trim();
    if (body.length < 2) return { type: "ambiguous", question: "summary" };
    return { type: "summary", text: body };
  }

  // Very short / vague free text → ask for clarification once
  if (t.length < 4 || /^(do\s+it|this|that|make\s+one|yes|ok)\.?$/i.test(t)) {
    return { type: "ambiguous", question: "general" };
  }

  return { type: "ask", question: t };
}
