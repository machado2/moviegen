// ════════════════════════════════════════════════════════════════════════════
// ComicsGen — Canonical format definition for HQ / graphic-novel production.
// An extension of MovieGen sharing the same monorepo, backend, and frontend.
// ════════════════════════════════════════════════════════════════════════════

// AssetVariant is shared with the film format (type-only import; erased at runtime).
import type { AssetVariant } from './index.js';

// ─── Project ──────────────────────────────────────────────────────────────────

export interface ComicsProject {
  id: string;
  title: string;
  language: string;          // BCP-47, e.g. "pt-BR"
  createdAt: string;         // ISO 8601
  updatedAt: string;

  globalStyle: string;       // style instruction applied to every quadro
  restrictions: string[];    // global "never do" rules, one per entry

  assets: Record<string, ComicsAsset>;
  pranchas: PranchaRef[];    // ordered index; each prancha is a separate file

}

// ─── Assets ───────────────────────────────────────────────────────────────────

export type ComicsAssetType = 'image';

export type ComicsAssetRole =
  | 'character'        // visual reference for a character (face + body in HQ style)
  | 'style-reference'  // style reference page/image
  | 'location';        // visual reference for a place

export type ComicsAssetStatus =
  | 'active'    // ready to use
  | 'pending'   // not yet generated/uploaded
  | 'external'; // provisional reference from outside the project

export interface ComicsAsset {
  id: string;
  type: ComicsAssetType;
  role: ComicsAssetRole;
  status: ComicsAssetStatus;
  file: string | null;            // path relative to project root, null if pending
  characterName?: string;         // for character assets: canonical name
  characterDescription?: string;  // canonical description: age, ethnicity, wardrobe, posture
  description?: string;           // human-readable notes
  skipped?: boolean;              // production queue: user skipped this unit (persisted)
  queuePriority?: number;         // production queue: manual ordering (lower = earlier); queue-only

  // Generated/uploaded candidates; `file` mirrors the selected one. Same model
  // as film assets — see AssetVariant in ./index.ts.
  variants?: AssetVariant[];
  selectedVariantId?: string | null;
}

// ─── Pranchas ─────────────────────────────────────────────────────────────────

export type PranchaLayout =
  | 'rows-1'              // 1 splash quadro, 2:3 (full page)
  | 'rows-2'              // 2 horizontal quadros, 4:3 each
  | 'rows-3'              // 3 panoramic quadros, 2:1 each
  | 'rows-4'              // 4 very panoramic quadros, 3:1 each
  | 'grid-2x2'           // 4 vertical quadros, 2:3 each
  | 'grid-2x3'           // 6 square quadros, 1:1 each
  | 'grid-2x4'           // 8 square quadros, 1:1 each
  | 'top-then-grid-2x2'; // 1 panoramic (2:1) + 4 squares (1:1)

export interface PranchaRef {
  id: string;
  number: number;
  shortTitle: string;  // readable label: "Cartório — Manhã"
  file: string;        // relative path to the prancha JSON file
}

export interface Prancha {
  id: string;
  number: number;
  shortTitle: string;  // matches PranchaRef.shortTitle
  origin: string;      // reference to the script: "roteiro/ato_um.md · PRANCHA 14"
  layout: PranchaLayout;
  renderMode?: PranchaRenderMode; // default 'panels': quadros + montage; 'page': one full-page render
  selectedPageRenderId?: string | null;
  pageRenders?: PageRender[];
  quadros: Quadro[];
}

export type PranchaRenderMode = 'panels' | 'page';

// ─── Quadros ──────────────────────────────────────────────────────────────────

export type QuadroSlotFormat =
  | 'vertical de página inteira, proporção 2:3'    // rows-1
  | 'horizontal alto, proporção 4:3'               // rows-2
  | 'horizontal panorâmico, proporção 2:1'         // rows-3 / top-then-grid-2x2 (slot 1)
  | 'horizontal muito panorâmico, proporção 3:1'   // rows-4
  | 'vertical, proporção 2:3'                       // grid-2x2
  | 'quadrado, proporção 1:1';                      // grid-2x3 / grid-2x4 / top-then-grid-2x2 (slots 2-5)

export type QuadroTextType =
  | 'dialogue'       // speech balloon (character in panel)
  | 'offscreen'      // speech balloon from off-panel (O.S.)
  | 'voice-over'     // off voice (V.O.) / narrator
  | 'caption'        // narration caption
  | 'sfx'            // onomatopoeia
  | 'sign'           // sign / poster / diegetic object text
  | 'title';         // visual title in the artwork

export interface QuadroText {
  type: QuadroTextType;
  speaker?: string;  // character name, when applicable
  text: string;      // literal text with exact accentuation and punctuation
}

export interface Quadro {
  id: string;
  order: number;
  slotFormat: QuadroSlotFormat;   // determined by the prancha layout
  composition: string;            // visual description (framing, action, posture)
  characters: string[];           // ids of character assets present in this quadro
  setting: string;                // place + atmosphere (light, temperature, texture)
  texts: QuadroText[];            // all texts that must appear in the quadro
  restrictions: string[];         // quadro-specific restrictions (besides global)
  refs: string[];                 // ids of assets attached to the prompt (besides characters)

  skipped?: boolean;              // production queue: user skipped this unit (persisted)
  queuePriority?: number;         // production queue: manual ordering (lower = earlier); queue-only

  selectedRenderId: string | null;
  renders: Render[];
}

// ─── Renders ──────────────────────────────────────────────────────────────────

export interface Render {
  id: string;
  quadroId: string;
  createdAt: string;           // ISO 8601
  filename: string;            // relative path under the quadro's renders/ directory
  fileSizeBytes: number;
  widthPx: number | null;      // null until probed
  heightPx: number | null;
  source: 'generated' | 'upload';
  generationPrompt?: string;   // full prompt sent to the generator
  generationModel?: string;    // image model id used (gateway), or "codex" for the local CLI
  notes?: string;
}

export interface PageRender {
  id: string;
  createdAt: string;           // ISO 8601
  filename: string;            // relative path under the prancha's page-renders/ directory
  fileSizeBytes: number;
  widthPx: number | null;
  heightPx: number | null;
  source: 'generated' | 'upload';
  generationPrompt?: string;
  generationModel?: string;
  notes?: string;
}

// ─── Characters ───────────────────────────────────────────────────────────────

// Derived view — computed from assets, not stored separately.
export interface ComicsCharacter {
  id: string;               // e.g. "nivaldo"
  name: string;             // display name: "Nivaldo Pimenta"
  description: string;      // canonical appearance description
  assetId: string | null;   // id of the linked character asset
}

// ─── Script Import ────────────────────────────────────────────────────────────

export interface ParsedComicsScript {
  title: string;
  language: string;
  globalStyle: string;
  characters: ParsedComicsCharacter[];
  locations?: ParsedComicsLocation[];  // recurring settings → location reference assets
  pranchas: ParsedPrancha[];
}

export interface ParsedComicsCharacter {
  id: string;
  name: string;
  description: string;
}

export interface ParsedComicsLocation {
  id: string;
  name: string;
  description: string;       // canonical visual look of the place
}

export interface ParsedPrancha {
  number: number;
  shortTitle: string;
  origin: string;
  layout: PranchaLayout;
  quadros: ParsedQuadro[];
}

// One candidate breakdown of a raw narrative scene into one or more local
// pranchas. ParsedPrancha.number is local to the scene candidate, not a global
// page number; production Prancha.number is derived after applying candidates.
export interface ComicsSceneBreakdown {
  id: string;
  sceneNumber: number;
  createdAt: string;       // ISO 8601
  model: string;
  pranchas: ParsedPrancha[];
}

export interface ParsedQuadro {
  order: number;
  slotFormat: QuadroSlotFormat;
  composition: string;
  characterIds: string[];
  setting: string;
  texts: QuadroText[];
  restrictions: string[];
}

// ─── Assembly Options ─────────────────────────────────────────────────────────

export type MontagemFit = 'contain' | 'cover';

export interface MontagemOptions {
  gutterPx: number;          // space between quadros in px (default: 48)
  background: string;        // background/gutter color (default: "black")
  fit: MontagemFit;          // 'contain' (default) or 'cover'
  canvasWidth: number;       // final canvas width in px (default: 1800)
  canvasHeight: number;      // final canvas height in px (default: 2700)
}

// ─── DTOs / derived views ─────────────────────────────────────────────────────

export type ComicsProjectDTO = ComicsProject;

export interface ComicsProjectSummary {
  id: string;
  title: string;
  language: string;
  createdAt: string;
  updatedAt: string;
  pranchaCount: number;
}

export type PranchaAssemblyState = 'not-assembled' | 'assembled' | 'stale';

export interface PranchaAssemblyStatus {
  pranchaId: string;
  number: number;
  shortTitle: string;
  layout: PranchaLayout;
  renderMode: PranchaRenderMode;
  quadroCount: number;
  quadrosWithRender: number;
  ready: boolean;            // all quadros have a selected render
  missingQuadros: number[];  // quadro orders without a selected render
  state: PranchaAssemblyState;
  outputAt: string | null;   // ISO mtime of assembled output, null if none
}

export type BookFormat = 'cbz' | 'pdf' | 'epub';

export interface BookAssemblyStatus {
  pranchas: PranchaAssemblyStatus[];
  ready: boolean;            // every prancha has an up-to-date assembled output
  outputs: Record<BookFormat, string | null>; // ISO mtime per generated format
}

export const QUADRO_COUNT_BY_LAYOUT: Record<PranchaLayout, number> = {
  'rows-1': 1,
  'rows-2': 2,
  'rows-3': 3,
  'rows-4': 4,
  'grid-2x2': 4,
  'grid-2x3': 6,
  'grid-2x4': 8,
  'top-then-grid-2x2': 5,
};
