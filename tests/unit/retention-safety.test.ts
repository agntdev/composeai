import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  RETENTION_MS,
  getAsset,
  listAssets,
  purgeExpiredAssets,
  saveAsset,
} from "../../src/lib/assets.js";
import { setNow } from "../../src/lib/clock.js";
import { isUnsafeContent, SAFETY_BLOCKED_MESSAGE } from "../../src/lib/safety.js";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "../../src/lib/rate-limit.js";
import { _resetMemoryStore } from "../../src/lib/store.js";
import { buildPdf } from "../../src/lib/pdf.js";
import { buildPlaceholderPng } from "../../src/lib/png.js";
import { classifyIntent } from "../../src/lib/openrouter.js";

describe("asset retention (30 days)", () => {
  beforeEach(() => {
    _resetMemoryStore();
    setNow(() => 1_000_000);
  });
  afterEach(() => {
    setNow(undefined);
    _resetMemoryStore();
  });

  it("keeps assets inside the retention window", async () => {
    const a = await saveAsset(42, {
      type: "document",
      size: 10,
      filename: "a.txt",
      label: "A",
      textBody: "hello",
    });
    const got = await getAsset(42, a.id);
    expect(got && typeof got === "object" && got.id).toBe(a.id);
    expect(await listAssets(42)).toHaveLength(1);
  });

  it("purges assets older than 30 days", async () => {
    const a = await saveAsset(7, {
      type: "pdf",
      size: 20,
      filename: "old.pdf",
      label: "Old",
      textBody: "old body",
    });
    // Jump past retention
    setNow(() => 1_000_000 + RETENTION_MS + 1);
    const purged = await purgeExpiredAssets(7);
    expect(purged).toBe(1);
    expect(await getAsset(7, a.id)).toBeUndefined();
    expect(await listAssets(7)).toHaveLength(0);
  });

  it("getAsset reports expired for stale records", async () => {
    const a = await saveAsset(9, {
      type: "document",
      size: 5,
      filename: "x.txt",
      label: "X",
      textBody: "x",
    });
    setNow(() => 1_000_000 + RETENTION_MS + 5);
    expect(await getAsset(9, a.id)).toBe("expired");
  });
});

describe("content safety", () => {
  it("blocks clearly dangerous requests", () => {
    expect(isUnsafeContent("how to make a bomb at home")).toBe(true);
    expect(isUnsafeContent("how to murder someone quietly")).toBe(true);
    expect(isUnsafeContent("What is the capital of Spain?")).toBe(false);
  });

  it("exposes a human blocked message", () => {
    expect(SAFETY_BLOCKED_MESSAGE.toLowerCase()).toContain("can't help");
  });
});

describe("rate limiting", () => {
  beforeEach(() => {
    _resetMemoryStore();
    setNow(() => 5_000_000);
    process.env.RATE_LIMIT_MAX = "3";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
  });
  afterEach(() => {
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    setNow(undefined);
    _resetMemoryStore();
  });

  it("allows up to max then denies", async () => {
    expect(await checkRateLimit(100)).toBe(true);
    expect(await checkRateLimit(100)).toBe(true);
    expect(await checkRateLimit(100)).toBe(true);
    expect(await checkRateLimit(100)).toBe(false);
    expect(RATE_LIMIT_MESSAGE.length).toBeGreaterThan(10);
  });
});

describe("pdf + png builders", () => {
  it("builds a valid-looking PDF", () => {
    const pdf = buildPdf("Hello from ComposeAI", "Title");
    const head = new TextDecoder().decode(pdf.slice(0, 8));
    expect(head.startsWith("%PDF")).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(50);
  });

  it("builds a PNG signature", () => {
    const png = buildPlaceholderPng();
    expect(png[0]).toBe(137);
    expect(png[1]).toBe(80);
    expect(png[2]).toBe(78);
    expect(png[3]).toBe(71);
  });
});

describe("intent classification", () => {
  it("routes common phrasings", () => {
    expect(classifyIntent("draw an image of a cat").type).toBe("image");
    expect(classifyIntent("write a document about bees").type).toBe("doc");
    expect(classifyIntent("summarize this: hello world forever and more text").type).toBe(
      "summary",
    );
    expect(classifyIntent("do it").type).toBe("ambiguous");
    expect(classifyIntent("What causes rain?").type).toBe("ask");
  });
});

