// ════════════════════════════════════════════════════════════════════════════
// @mediagen/core — pure, dependency-free domain logic shared by the backend and
// the frontend. No I/O, no framework: just functions over @mediagen/types.
//
// Today this owns PROMPT CONSTRUCTION — the single source of truth for the
// deterministic text we send to image/video generators. Both ends import these:
// the frontend to show/edit a prompt, the backend to fall back to one when the
// client doesn't send its own. There is exactly one builder per kind of output.
// ════════════════════════════════════════════════════════════════════════════

export * from './prompts/text.js';
export * from './prompts/film.js';
export * from './prompts/comics.js';
