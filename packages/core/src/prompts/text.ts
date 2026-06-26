// Small text helpers shared by the prompt builders.

/** Append a period only when the text doesn't already end with terminal punctuation. */
export function dot(s: string): string {
  const t = s.trim();
  return /[.!?…:]$/.test(t) ? t : `${t}.`;
}
