/**
 * Shared UI fragments and cancel keyboard.
 */

import { inlineButton, inlineKeyboard, type InlineKeyboardMarkup } from "../toolkit/index.js";

export function backMenuKeyboard(): InlineKeyboardMarkup {
  return inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
}

export function cancelRow(): InlineKeyboardMarkup {
  return inlineKeyboard([
    [inlineButton("Cancel", "flow:cancel")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
}

export function summaryLengthKeyboard(): InlineKeyboardMarkup {
  return inlineKeyboard([
    [
      inlineButton("Short", "summary:len:short"),
      inlineButton("Medium", "summary:len:medium"),
      inlineButton("Long", "summary:len:long"),
    ],
    [inlineButton("Cancel", "flow:cancel")],
  ]);
}

export const CANCEL_TEXT = "Cancelled — tap a button below when you're ready.";
export const EXPIRED_TEXT = "That step timed out. Tap a button in the menu to start again.";
