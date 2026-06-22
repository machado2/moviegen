# MovieGen — AI Movie Production Web Application

## Overview

MovieGen is a web application for producing AI-generated films. It manages the full production pipeline: from an uploaded screenplay, through structured shot-by-shot planning, to assembling takes into scenes and scenes into a final movie. The application is project-based and ships as a Docker container for reproducible deployment.

---

## Core Concepts

### Hierarchy

```
Project
  ├── Assets (central library — characters, voices, locations)
  └── Scenes (ordered list)
        └── Scene
              └── Shots (ordered, ~≤15s each)
                    └── Shot
                          ├── Takes (multiple attempts, never deleted)
                          └── selectedTakeId (which take to use in assembly)
```

### Design Principles

1. **TypeScript everywhere.** The structured format is defined as TypeScript types. If the format changes, the compiler finds every callsite. No backwards-compatibility shims during the early phase of development.

2. **The asset library is the single source of truth.** Characters, voices, and locations are defined once with an `id`. Scenes reference assets by `id`; they never redefine them.

3. **The shot is the atomic unit of generation.** Each shot is a single camera idea of up to 15 seconds — the natural limit of current AI video generation models.

4. **Takes are additive, never destructive.** Every generation attempt or upload is kept as a take. The user picks the best one. Nothing is overwritten.

5. **Format evolution is compiler-aided.** The structured project format lives in strongly typed TypeScript interfaces. Changing the format intentionally breaks the build at every affected callsite, making incomplete migrations impossible to miss.

6. **No silent format compatibility.** There is no migration layer, version negotiation, or "try the old format first." The current TypeScript types are the format. Old projects that no longer match must be manually migrated or re-imported.

---

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Language | TypeScript (strict mode) | Type safety for format evolution |
| Backend | Node.js + Fastify | Fast, low-overhead HTTP server |
| Frontend | React 18 + Vite | Fast HMR, lightweight build |
| UI components | shadcn/ui + Tailwind CSS | Accessible, unstyled-by-default components |
| Storage | Local filesystem | Simple, Docker-portable, no external dependency |
| Database | SQLite via Drizzle ORM | Lightweight, serverless, schema migration via Drizzle Kit |
| AI (script parsing) | OpenRouter API | Model-agnostic; user brings their own key |
| Video assembly | FFmpeg (via fluent-ffmpeg) | Robust pipeline with explicit re-encoding strategy |
| Containerization | Docker + Docker Compose | One-command deploy |

---

## Data Model

All types live in `packages/types/src/index.ts`. This is the canonical source — the backend and frontend both import from here. Changing a type here breaks the build everywhere it matters.

```typescript
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
```

---

## Filesystem Layout

All project data is stored under a configurable `DATA_DIR` (default: `./data`).

```
data/
  projects/
    {projectId}/
      project.json             ← Project (without scene data)
      script.md                ← original uploaded screenplay (optional)
      scenes/
        {sceneId}.json         ← Scene (includes shots + takes metadata)
      assets/
        {assetId}.{ext}        ← actual asset files (images, audio, video)
      takes/
        {sceneId}/
          {shotId}/
            {takeId}.mp4       ← video takes
      output/
        scenes/
          {sceneId}.mp4        ← assembled scene video
        movie.mp4              ← final assembled movie
```

Note: take metadata (id, createdAt, source, etc.) lives in the scene JSON file. Only the actual video files live in the `takes/` directory.

---

## API Specification

Base path: `/api/v1`

All request and response bodies are JSON unless otherwise noted. File uploads use `multipart/form-data`.

### Projects

| Method | Path | Description |
|---|---|---|
| `POST` | `/projects` | Create a new project |
| `GET` | `/projects` | List all projects |
| `GET` | `/projects/:id` | Get project metadata |
| `PUT` | `/projects/:id` | Update project metadata (title, style, restrictions, etc.) |
| `DELETE` | `/projects/:id` | Delete project and all data |
| `GET` | `/projects/:id/export` | Download full project as `.zip` |
| `POST` | `/projects/import` | Import project from `.zip` |

### Script

| Method | Path | Description |
|---|---|---|
| `POST` | `/projects/:id/script` | Upload a markdown screenplay (stores raw file, does not parse) |
| `POST` | `/projects/:id/script/parse` | Parse the stored screenplay with AI into `ParsedScript` |
| `POST` | `/projects/:id/script/apply` | Apply a `ParsedScript` to the project (creates scenes, shots, characters) |
| `POST` | `/projects/:id/structured-import` | Import a `Project`-shaped JSON directly (skips AI parsing) |

### Characters

Characters are computed views over assets. The UI uses these endpoints for the character panel.

| Method | Path | Description |
|---|---|---|
| `GET` | `/projects/:id/characters` | List characters derived from assets |
| `GET` | `/projects/:id/characters/:charId` | Get character with all linked assets |

### Assets

| Method | Path | Description |
|---|---|---|
| `GET` | `/projects/:id/assets` | List all assets |
| `POST` | `/projects/:id/assets` | Create asset record (metadata only; use upload to attach file) |
| `GET` | `/projects/:id/assets/:assetId` | Get asset metadata |
| `PUT` | `/projects/:id/assets/:assetId` | Update asset metadata |
| `DELETE` | `/projects/:id/assets/:assetId` | Delete asset |
| `POST` | `/projects/:id/assets/:assetId/upload` | Upload file for an asset |
| `GET` | `/projects/:id/assets/:assetId/file` | Download asset file |
| `POST` | `/projects/:id/assets/:assetId/generate` | Auto-generate asset with AI (voice, image prompt, etc.) |

### Scenes

| Method | Path | Description |
|---|---|---|
| `GET` | `/projects/:id/scenes` | List scenes (from SceneRef index) |
| `POST` | `/projects/:id/scenes` | Create a scene |
| `GET` | `/projects/:id/scenes/:sceneId` | Get full scene (with shots) |
| `PUT` | `/projects/:id/scenes/:sceneId` | Update scene metadata |
| `DELETE` | `/projects/:id/scenes/:sceneId` | Delete scene |
| `POST` | `/projects/:id/scenes/reorder` | Reorder scenes |

### Shots

| Method | Path | Description |
|---|---|---|
| `POST` | `/projects/:id/scenes/:sceneId/shots` | Add a shot |
| `PUT` | `/projects/:id/scenes/:sceneId/shots/:shotId` | Update shot |
| `DELETE` | `/projects/:id/scenes/:sceneId/shots/:shotId` | Delete shot |
| `POST` | `/projects/:id/scenes/:sceneId/shots/reorder` | Reorder shots |

### Takes

| Method | Path | Description |
|---|---|---|
| `GET` | `/projects/:id/scenes/:sceneId/shots/:shotId/takes` | List takes |
| `POST` | `/projects/:id/scenes/:sceneId/shots/:shotId/takes` | Upload a take (video file) |
| `GET` | `/projects/:id/scenes/:sceneId/shots/:shotId/takes/:takeId` | Stream take video |
| `DELETE` | `/projects/:id/scenes/:sceneId/shots/:shotId/takes/:takeId` | Delete a take |
| `PUT` | `/projects/:id/scenes/:sceneId/shots/:shotId/selected-take` | Select a take for assembly |

### Assembly

| Method | Path | Description |
|---|---|---|
| `POST` | `/projects/:id/scenes/:sceneId/assemble` | Assemble scene from selected takes |
| `GET` | `/projects/:id/scenes/:sceneId/output` | Stream assembled scene video |
| `POST` | `/projects/:id/assemble` | Assemble full movie from assembled scenes |
| `GET` | `/projects/:id/output` | Stream final movie |

All assembly endpoints return a job ID immediately and run asynchronously. Progress is tracked via SSE:

```
GET /projects/:id/jobs/:jobId/progress   (text/event-stream)
```

---

## AI Integration

### OpenRouter API Key

Each project stores its own `OPENROUTER_API_KEY`. It is stored in the project's metadata on the filesystem. It is never sent back to the frontend in any API response — only a boolean `hasApiKey` is returned.

### Script Parsing

When the user uploads a markdown screenplay and requests parsing, the backend:

1. Reads the stored `script.md` for the project.
2. Sends it to OpenRouter with a structured output prompt requesting a `ParsedScript` JSON.
3. The model choice is configurable per project (default: `google/gemini-2.5-pro`).
4. Returns the `ParsedScript` to the frontend for the user to review.
5. The user then calls `/script/apply` to commit the parsed structure.

The prompt instructs the LLM to:
- Extract characters with voice descriptions suitable for TTS prompt generation.
- Break each scene into shots of at most 15 seconds each.
- Identify which characters appear in each shot.
- Extract dialogue lines with speaker identification.
- Generate camera descriptions and action descriptions.

### Voice Generation

When a character has a voice description but no voice asset file, the user can trigger auto-generation. The backend sends the voice description to a TTS API (configurable, default via OpenRouter) and stores the result as an audio asset.

If a voice asset does not exist, the UI shows a "Generate Voice" button. The user can also upload a voice sample directly without going through generation.

### Asset Description Generation

For character appearances and locations, when no image asset exists, the backend can generate a detailed image generation prompt using the LLM, based on the character description or location name extracted from the screenplay. The user can then copy this prompt to an external image generator.

Future: direct API integration with image generation services (Replicate, fal.ai, etc.).

---

## Video Assembly

This is the most technically sensitive part of the application. Previous attempts with naive FFmpeg usage produced issues such as:
- A/V sync drift when concatenating clips with different timebase values.
- Missing audio streams causing concat failures.
- Resolution mismatches producing stretched or letterboxed frames.
- Codec incompatibilities between takes from different sources.

### Robust Assembly Strategy

Assembly uses a two-pass approach:

**Pass 1 — Normalization.** Each selected take is re-encoded to a canonical intermediate format before concatenation:

```
Codec:       H.264 (libx264), CRF 18, preset slow
Audio:       AAC 192kbps, stereo, 48000 Hz
Resolution:  1920×1080 (source aspect ratio preserved with letterbox/pillarbox)
Frame rate:  24 fps (constant frame rate)
Pixel fmt:   yuv420p
```

If a take has no audio stream, a silent audio stream is added during normalization. This ensures every normalized file has matching stream counts and timebases.

**Pass 2 — Concatenation.** After all takes for a scene are normalized, the concat demuxer joins them:

```
ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4
```

Because all inputs are already in the same format after Pass 1, `-c copy` is safe and fast.

### Implementation

```
backend/src/assembly/
  normalize.ts    — takes a take file path, returns normalized temp file path
  concat.ts       — takes list of normalized files, concatenates to output
  assemble.ts     — orchestrates: normalize all takes → concat → clean up temps
  probe.ts        — wraps ffprobe to read duration, codec, resolution, has-audio
```

The assembly module uses `fluent-ffmpeg` for Node.js FFmpeg bindings. FFmpeg and FFprobe must be available in `$PATH` (they are installed in the Docker image).

### Scene Assembly

1. For each shot in the scene (ordered by `shot.order`), get the selected take.
2. If any shot has no selected take, return an error listing the missing shots.
3. Normalize each take in parallel (bounded to 4 concurrent FFmpeg processes).
4. Concatenate normalized files in order.
5. Store result at `data/projects/{id}/output/scenes/{sceneId}.mp4`.

### Movie Assembly

1. For each scene in the project (ordered by `scene.number`), check that `output/scenes/{sceneId}.mp4` exists.
2. If any scene has no assembled output, return an error listing missing scenes.
3. Concatenate scene outputs using the same concat-demuxer approach (they are already normalized from step 1 of scene assembly).
4. Store result at `data/projects/{id}/output/movie.mp4`.

---

## Frontend UI

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  MovieGen   [Project: Fé Pública ▾]                     [Settings]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [Overview] [Characters] [Assets] [Scenes] [Assembly]                │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Overview Tab

- Project title (editable inline)
- Global style (textarea, editable)
- Method principles (editable list)
- Restrictions (editable list)
- Script section:
  - Upload markdown script button
  - If script exists: "Parse with AI" button → opens review modal with `ParsedScript`
  - "Import structured JSON" button (direct structured import, skips AI)
  - "Export project ZIP" button
- API key section (masked input, shows only whether key is set)

### Characters Tab

Shows each character as a card. For each character:
- Name and description
- Face asset: preview thumbnail + upload/generate buttons
- Body asset: preview thumbnail + upload/generate buttons
- Voice asset: audio player + upload/generate buttons
- Concept asset (if any): preview + replace button

If a character was extracted from the script but has no assets yet, the card shows all items as "Pending" with generation/upload actions.

### Assets Tab

Table view of all assets in the project library. Columns: ID, Type, Role, Status, Character (if applicable), File (with download link), Actions (edit, upload, delete).

Supports filtering by type (image/audio/video) and role. Bulk download as ZIP.

### Scenes Tab

The main production view.

**Scene list** (left sidebar):
- Ordered list of scenes with short titles
- Progress indicator (how many shots have a selected take)
- "Add scene" button

**Scene detail** (main area, when a scene is selected):
- Scene metadata (slug title, duration, summary, continuity)
- Scene-level asset refs panel
- Shot list, each shot rendered as a card:

**Shot card**:
```
┌────────────────────────────────────────────────────────┐
│ Shot 3  ·  camera: "plano geral frontal fixo"  ·  15s  │
│                                                          │
│ Action: The bird crosses the plaza...                    │
│ Lines:  [NARRATOR V.O.] Eight bells...                  │
│ Sound:  eight bells, then institutional silence          │
│ Assets: [loc_praca_cartorio ✓] [euclides_corpo ✓]       │
│                                                          │
│ Takes:  [▶ take_001] [▶ take_002 ✓ selected] [+ Upload] │
│                                                          │
│ [Generate Prompt]  [Edit]  [Delete shot]                 │
└────────────────────────────────────────────────────────┘
```

The selected take is highlighted. Clicking a take thumbnail plays it inline. The "Generate Prompt" button assembles the full prompt for the shot (combining global style, scene refs, shot refs, action, dialogue, sounds) for pasting into a video generation tool.

### Assembly Tab

- Per-scene assembly: table of scenes, each with a "Assemble Scene" button. Shows status (not assembled / assembled / stale).
- Full movie assembly: "Assemble Movie" button, enabled when all scenes have been assembled.
- Progress indicator for running assembly jobs (live via SSE).
- Download buttons for assembled scenes and final movie.

---

## Project ZIP Format

The export ZIP has the following structure:

```
{projectId}.zip
  project.json
  script.md              (if present)
  scenes/
    {sceneId}.json
  assets/
    {assetId}.jpg        (actual asset files)
  takes/
    {sceneId}/
      {shotId}/
        {takeId}.mp4
  output/
    scenes/
      {sceneId}.mp4      (if assembled)
    movie.mp4            (if assembled)
```

Import: upload the ZIP to `POST /projects/import`. The backend extracts, validates the `project.json` against the current TypeScript types, and refuses with an error listing type mismatches if the format has changed.

---

## Docker

### Dockerfile

```dockerfile
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/ packages/
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### docker-compose.yml

```yaml
services:
  moviegen:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATA_DIR=/data
```

Run with:
```sh
docker compose up --build
```

---

## Repository Structure

```
moviegen/
  packages/
    types/               ← shared TypeScript types (the canonical format definition)
      src/index.ts
      package.json
      tsconfig.json
  backend/
    src/
      server.ts          ← Fastify server entry point
      routes/
        projects.ts
        scripts.ts
        characters.ts
        assets.ts
        scenes.ts
        shots.ts
        takes.ts
        assembly.ts
      services/
        project.ts       ← CRUD for projects
        scene.ts         ← CRUD for scenes and shots
        take.ts          ← take management
        ai.ts            ← OpenRouter integration
        assembly.ts      ← video assembly orchestration
      assembly/
        normalize.ts
        concat.ts
        assemble.ts
        probe.ts
      storage/
        filesystem.ts    ← all filesystem I/O abstracted here
      jobs/
        queue.ts         ← simple in-memory async job queue with SSE progress
    package.json
    tsconfig.json
  frontend/
    src/
      main.tsx
      App.tsx
      pages/
        Overview.tsx
        Characters.tsx
        Assets.tsx
        Scenes.tsx
        Assembly.tsx
      components/
        ShotCard.tsx
        TakePlayer.tsx
        AssetCard.tsx
        CharacterCard.tsx
        ScriptImportModal.tsx
        AssemblyProgress.tsx
      api/
        client.ts        ← typed API client using fetch
      hooks/
        useProject.ts
        useScene.ts
        useAssembly.ts
    package.json
    tsconfig.json
    vite.config.ts
  Dockerfile
  docker-compose.yml
  package.json           ← root workspace (npm workspaces)
  tsconfig.base.json
```

---

## Development Setup

```sh
# Install all workspace dependencies
npm install

# Start backend in watch mode
npm run dev:backend

# Start frontend in watch mode (separate terminal)
npm run dev:frontend

# Build everything
npm run build

# Type-check everything
npm run typecheck
```

---

## Key Constraints and Non-Goals (v1)

- **No user accounts.** Single-user, local deployment. Authentication is out of scope.
- **No cloud storage.** All data lives on the host filesystem mounted into Docker.
- **No automatic video generation.** The app prepares prompts and manages takes, but does not call video generation APIs on behalf of the user (Seedance, Runway, etc.) in v1. This may change.
- **No real-time collaboration.** One user, one session.
- **No format versioning.** Format changes break old projects by design — this is a feature, not a bug. The compiler tells you exactly what changed.
- **No undo/redo.** The ZIP export is the backup mechanism.
