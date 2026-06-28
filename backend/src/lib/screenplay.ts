// Deterministic, faithful screenplay segmentation. No LLM: this is the cheap,
// re-runnable "extraction" step that splits the original script into raw scenes
// by their heading/slug lines, preserving prose verbatim. The creative work
// (turning a scene into shots) is a separate per-scene transform.

import type { RawScene } from '@mediagen/types';

// A scene heading / slug line: INT./EXT./EST., I/E, INT/EXT, or a "CENA N" style
// heading. Tolerates a leading markdown header (#), list/quote markers, and a
// leading scene number.
const HEADING_RE =
  /^\s*#{0,6}\s*(?:[-*>]\s*)?(?:\d+[.)]?\s+)?(INT(?:\.\/EXT)?|EXT|EST|I\/E|INT\/EXT|CENA|SCENE)\b[.\s]/i;

function stripHeadingDecorations(line: string): string {
  return line.replace(/^\s*#{0,6}\s*(?:[-*>]\s*)?/, '').trim();
}

// A character dialogue cue: a short, (mostly) upper-case line that names a
// speaker. Heuristic — used only for best-effort "who appears", never for
// structure. Excludes headings and common transitions.
const TRANSITION_RE = /^(CUT TO|FADE (IN|OUT)|DISSOLVE|SMASH CUT|CORTA|FUSÃO|FADE)\b/i;
function isCue(line: string): boolean {
  const t = line.trim().replace(/\(.*?\)\s*$/, '').trim(); // drop trailing "(V.O.)" etc.
  if (!t || t.length > 40) return false;
  if (HEADING_RE.test(line) || TRANSITION_RE.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 4) return false;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 2) return false;
  return t === t.toUpperCase(); // fully upper-case (accents allowed)
}

/**
 * Split a screenplay (plain text or light markdown) into ordered raw scenes.
 * If no headings are found the whole script becomes a single raw scene, so the
 * source layer always exists.
 */
export function segmentScreenplay(markdown: string, source = 'script.md'): RawScene[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    if (HEADING_RE.test(line)) {
      current = { heading: stripHeadingDecorations(line), body: [] };
      blocks.push(current);
    } else if (current) {
      current.body.push(line);
    } else if (line.trim()) {
      // Prose before the first heading: keep it as a leading scene.
      current = { heading: '', body: [line] };
      blocks.push(current);
    }
  }

  if (blocks.length === 0) {
    const text = markdown.trim();
    if (!text) return [];
    return [{ number: 1, heading: 'CENA 1', text, characterCues: cuesIn([text]), source }];
  }

  return blocks.map((b, i) => {
    const bodyText = b.body.join('\n').replace(/\s+$/, '');
    const text = (b.heading ? `${b.heading}\n${bodyText}` : bodyText).trim();
    return {
      number: i + 1,
      heading: b.heading || `CENA ${i + 1}`,
      text,
      characterCues: cuesIn(b.body),
      source,
    };
  });
}

function cuesIn(lines: string[]): string[] {
  const seen = new Set<string>();
  for (const l of lines) {
    if (isCue(l)) seen.add(l.trim().replace(/\(.*?\)\s*$/, '').trim());
  }
  return [...seen];
}
