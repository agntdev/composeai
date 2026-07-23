/**
 * Shared session shape + helpers for multi-step flows.
 * Ephemeral only — durable data lives in src/lib/assets.ts + store.ts.
 */

export type FlowStep =
  | "idle"
  | "awaiting_question"
  | "awaiting_image_prompt"
  | "awaiting_doc_brief"
  | "awaiting_pdf_text"
  | "awaiting_summary_text"
  | "awaiting_summary_length"
  | "awaiting_clarification";

export type SummaryLength = "short" | "medium" | "long";

export interface Session {
  step?: FlowStep;
  /** When the current flow should auto-expire (epoch ms). */
  expiresAt?: number;
  /** Pending free-form payload while clarifying. */
  pendingText?: string;
  /** What the clarification is for. */
  clarifyKind?: "image" | "doc" | "pdf" | "summary" | "general" | "ask";
  /** Chosen summary length. */
  summaryLength?: SummaryLength;
  /** Last generated document/summary text (session-scoped Request). */
  lastDocText?: string;
  lastDocId?: string;
  language?: string;
}

export const FLOW_TTL_MS = 10 * 60 * 1000;

export function clearFlow(session: Session): void {
  session.step = "idle";
  session.expiresAt = undefined;
  session.pendingText = undefined;
  session.clarifyKind = undefined;
  // keep lastDoc* and language
}

/** Enter a flow step using the injectable clock. */
export function enterFlow(
  session: Session,
  step: FlowStep,
  nowMs: number,
  ttlMs = FLOW_TTL_MS,
): void {
  session.step = step;
  session.expiresAt = nowMs + ttlMs;
}

export function isInFlow(session: Session): boolean {
  return !!session.step && session.step !== "idle";
}
