/**
 * Content safety filter for public deployment.
 * Blocks illegal / clearly dangerous requests with a human message.
 */

const BLOCKED_PATTERNS: RegExp[] = [
  /\bhow\s+to\s+(make|build|create)\s+(a\s+)?(bomb|explosive|molotov)\b/i,
  /\b(child\s*porn|csam|child\s*sexual)\b/i,
  /\bhow\s+to\s+(hack|crack)\s+(into\s+)?(bank|someone'?s\s+account)\b/i,
  /\b(buy|sell)\s+(illegal\s+)?(drugs|cocaine|heroin|fentanyl)\b/i,
  /\bhow\s+to\s+(murder|assassinate|poison)\s+(someone|a\s+person)\b/i,
  /\bmake\s+ricin\b/i,
  /\bhow\s+to\s+build\s+a\s+gun\b/i,
];

export const SAFETY_BLOCKED_MESSAGE =
  "I can't help with that request — it looks unsafe or illegal. " +
  "Try something else, or tap a button in the menu.";

/** Returns true when the text should be refused. */
export function isUnsafeContent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return BLOCKED_PATTERNS.some((re) => re.test(t));
}
