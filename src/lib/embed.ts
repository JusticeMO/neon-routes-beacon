import { SAKAFIND_URL } from '@/lib/integrations/sakafind';

/**
 * Beacon also runs inside Sakafind's tenant "Matatus" tab, in a frame. Two things differ
 * there: Sakafind waits for a "ready" signal before it stops showing its loading note
 * (and shows a fallback if it never comes), and "Continue with Sakafind" cannot run in
 * the frame, because Sakafind refuses to be framed and the browser keeps a framed site's
 * storage apart from the same site opened on its own.
 */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // a cross-origin parent throws on access: that is a frame too
  }
}

/** The message Sakafind listens for. It carries no data, only that Beacon has started. */
export const READY_MESSAGE = { type: 'beacon:ready' } as const;

export function announceReady(): void {
  if (!isEmbedded()) return;
  let target = '*';
  try {
    if (SAKAFIND_URL) target = new URL(SAKAFIND_URL).origin;
  } catch { /* leave '*': the message says nothing private */ }
  window.parent.postMessage(READY_MESSAGE, target);
}
