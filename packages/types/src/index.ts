// ════════════════════════════════════════════════════════════════════════════
// MovieGen — Canonical format definition.
// The backend and frontend both import from here. Changing a type here breaks
// the build everywhere it matters. No backwards-compatibility shims.
// ════════════════════════════════════════════════════════════════════════════

// ComicsGen format (HQ / graphic novels) lives alongside the film format.
export * from './comics.js';

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  title: string;
  language: string;          // BCP-47, e.g. "en", "pt-BR"
  createdAt: string;         // ISO 8601
  updatedAt: string;

  globalStyle: string;       // visual style applied to all shots
  method: string[];          // production principles (free text, one per entry)
  restrictions: string[];    // global "never do" rules, one per entry

  assets: Record<string, Asset>;
  scenes: SceneRef[];        // ordered index; each scene is a separate file

  // AI configuration. The API key is never serialised back to the frontend.
  openrouterApiKey?: string | null;
  parseModel?: string;       // default: google/gemini-2.5-pro
  ttsModel?: string;
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export type AssetType = 'image' | 'audio' | 'video';

export type AssetRole =
  | 'character-face'      // fixes facial identity
  | 'character-body'      // fixes body, clothing, proportions
  | 'character-concept'   // provisional reference (to be replaced)
  | 'voice'               // character voice timbre sample
  | 'voice-over'          // narrator / off-screen voice
  | 'location'            // visual reference for a place
  | 'ambient-sound';      // audio atmosphere (excluded from video render)

export type AssetStatus =
  | 'active'    // ready to use
  | 'pending'   // not yet generated/uploaded
  | 'external'  // provisional reference from outside the project
  | 'no-video'; // valid but excluded from video render pipeline

export interface Asset {
  id: string;
  type: AssetType;
  role: AssetRole;
  status: AssetStatus;
  file: string | null;     // path relative to project root, null if pending
  prompt: string;          // usage instruction; {ref} is replaced by actual attachment label
  sourceId?: string;       // id of asset this was derived from
  crop?: string;           // crop descriptor when derived (e.g. "right-panel")
  characterName?: string;  // for character assets: which character this belongs to
  description?: string;    // human-readable notes
}

// ─── Scenes ───────────────────────────────────────────────────────────────────

export interface SceneRef {
  id: string;
  number: number;
  shortTitle: string;      // concise human label: "Brejo - Dawn"
  file: string;            // relative path to scene JSON file
}

export interface Scene {
  id: string;
  number: number;
  shortTitle: string;      // matches SceneRef.shortTitle
  slugTitle: string;       // screenplay slug line: "EXT. BREJO - DAWN"
  targetDuration: string;  // e.g. "45s"
  summary: string;
  continuity: {
    in: string;            // how this scene connects to the previous
    out: string;           // what state it hands to the next scene
  };
  refs: AssetRef[];        // assets available to all shots in this scene
  shots: Shot[];
}

// ─── Shots ────────────────────────────────────────────────────────────────────

export interface Shot {
  id: string;
  order: number;
  targetDuration: string;   // e.g. "15s", max enforced at 15s
  camera: string;           // single camera idea
  action: string;           // what is seen — description for the video generator
  exit: string;             // event that ends/transitions the shot
  diegeticTexts: string[];  // on-screen text that exists in the story world
  sounds: string[];         // sound descriptions (ambient, effects)
  lines: DialogueLine[];    // spoken lines (dialogue and voice-over)
  refs: AssetRef[];         // assets specific to this shot (added to scene refs)

  selectedTakeId: string | null;
  takes: Take[];
}

export interface AssetRef {
  assetId: string;
  required: boolean;        // cannot be dropped when attachment count is capped
}

export interface DialogueLine {
  speaker: string;          // character id or "narrator"
  type: 'dialogue' | 'voice-over';
  text: string;
}

// ─── Takes ────────────────────────────────────────────────────────────────────

export interface Take {
  id: string;
  shotId: string;
  createdAt: string;        // ISO 8601
  filename: string;         // relative path under shot's takes/ directory
  fileSizeBytes: number;
  durationSeconds: number | null;  // null until probed
  source: 'upload' | 'generated';
  generationPrompt?: string;
  notes?: string;
}

// ─── Characters ───────────────────────────────────────────────────────────────

// Derived view — computed from assets, not stored separately.
export interface Character {
  id: string;               // e.g. "euclides"
  name: string;             // display name: "Dr. Euclides"
  description: string;
  faceAssetId: string | null;
  bodyAssetId: string | null;
  conceptAssetId: string | null;
  voiceAssetId: string | null;
}

// ─── Script Import ────────────────────────────────────────────────────────────

// Intermediate result of AI script parsing — what the LLM returns before
// the user reviews and confirms it becomes the project structure.
export interface ParsedScript {
  title: string;
  language: string;
  globalStyle: string;
  characters: ParsedCharacter[];
  scenes: ParsedScene[];
}

export interface ParsedCharacter {
  id: string;
  name: string;
  description: string;
  voiceDescription: string;  // for TTS prompt generation
}

export interface ParsedScene {
  number: number;
  shortTitle: string;
  slugTitle: string;
  summary: string;
  continuityIn: string;
  continuityOut: string;
  shots: ParsedShot[];
}

export interface ParsedShot {
  order: number;
  camera: string;
  targetDuration: string;
  action: string;
  exit: string;
  diegeticTexts: string[];
  sounds: string[];
  lines: DialogueLine[];
  characterIds: string[];    // which characters appear in this shot
}

// ─── Jobs (assembly progress) ───────────────────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface JobProgress {
  id: string;
  kind:
    | 'scene-assembly'
    | 'movie-assembly'
    | 'prancha-assembly'
    | 'book-assembly'
    | 'render-generate'
    | 'script-parse';
  status: JobStatus;
  progress: number;          // 0..1
  message: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Assembly status (derived view for the Assembly tab) ────────────────────

export type SceneAssemblyState = 'not-assembled' | 'assembled' | 'stale';

export interface SceneAssemblyStatus {
  sceneId: string;
  number: number;
  shortTitle: string;
  shotCount: number;
  shotsWithTake: number;
  ready: boolean;            // all shots have a selected take
  missingShots: number[];    // shot orders without a selected take
  state: SceneAssemblyState;
  outputAt: string | null;   // ISO mtime of assembled output, null if none
}

export interface MovieAssemblyStatus {
  scenes: SceneAssemblyStatus[];
  ready: boolean;            // every scene has an up-to-date assembled output
  movieAt: string | null;
}

// ─── API DTOs ───────────────────────────────────────────────────────────────

// Project as exposed over the API: api key is redacted to a boolean.
export type ProjectDTO = Omit<Project, 'openrouterApiKey'> & {
  hasApiKey: boolean;
};

export interface ProjectSummary {
  id: string;
  title: string;
  language: string;
  createdAt: string;
  updatedAt: string;
  sceneCount: number;
}

export interface CreateProjectInput {
  title: string;
  language?: string;
  globalStyle?: string;
}

export interface ApiError {
  error: string;
  details?: string[];
}
