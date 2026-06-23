# MovieGen + ComicsGen

Two AI production pipelines in one app, sharing the same monorepo, server, and UI:

- **MovieGen** — AI-generated films: screenplay → shot-by-shot planning → takes →
  assembled scenes → final movie. See [`SPEC.md`](./SPEC.md).
- **ComicsGen** — AI HQ / graphic novels: roteiro → prancha-by-prancha planning →
  per-quadro renders → programmatic page montage → CBZ / PDF / EPUB.
  See [`comics-spec.md`](./comics-spec.md).

The frontend has a Films / Comics medium switch; the backend serves films under
`/api/v1` and comics under `/api/v1/comics`.

## Quick start (Docker)

```sh
docker compose up --build
# open http://localhost:3000
```

Project data is persisted to `./data` (mounted into the container at `/data`).

## Development

```sh
npm install                 # install all workspace deps
npm run dev:backend         # Fastify API on :3000 (tsx watch)
npm run dev:frontend        # Vite dev server on :5173 (proxies /api → :3000)
npm run build               # build types → backend (→ dist/) → frontend (→ dist/public/)
npm run typecheck           # type-check every workspace
node dist/server.js         # run the production build (serves API + frontend)
```

External tools (all installed by the Docker image):
- `nickel` — the on-disk project format is [Nickel](https://nickel-lang.org)
  (`project.ncl`, per-scene/prancha `.ncl`); the backend shells out to it to read
  those files. **Required for local dev too** — install the `nickel` CLI and put it
  on `PATH` (or point `NICKEL_BIN` at it), e.g. download the release binary from
  https://github.com/nickel-lang/nickel/releases.
- `ffmpeg` / `ffprobe` — film assembly.
- `python3` + `Pillow`, `img2pdf`, `ebooklib` — comics page montage and book export.
- `codex` (optional) — AI frame generation for comics (`renders/generate`). Without
  it, upload renders manually; configure with `CODEX_BIN` / `CODEX_IMAGE_CMD`.

## Layout

```
packages/types   canonical format: index.ts (films) + comics.ts (comics)
backend          Fastify API, filesystem storage, in-memory job queue
  src/assembly   film ffmpeg two-pass pipeline
  src/comics     comics stack: storage, services, routes, Pillow montage + book export
frontend         React + Vite + Tailwind + shadcn-style UI (Films / Comics switch)
dist/            build output: server.js (backend) + public/ (frontend) + copied .py
```

Comics data is namespaced at `data/comics/projects/{id}` so it never collides with
film projects at `data/projects/{id}`.

## Architecture decisions (deviations from the spec, explained)

- **Filesystem is the canonical store; no SQLite/Drizzle.** The spec's data model,
  filesystem layout, and "single source of truth" principle are entirely
  file-based (`project.ncl`, per-scene/prancha `.ncl`, asset/take files), and jobs
  are explicitly in-memory. The stack table lists SQLite, but no schema or role for
  it is defined anywhere, so a second redundant store was omitted. All I/O is behind
  `backend/src/storage/filesystem.ts`, so introducing a DB later is localized.

- **On-disk structured data is Nickel, not JSON.** Project/scene/prancha files (and
  the import/export ZIP) are [Nickel](https://nickel-lang.org) (`.ncl`). Writing is a
  small serializer (`backend/src/storage/nickel.ts`); reading shells out to the
  `nickel` binary, which evaluates the file and exports JSON that the backend parses
  in memory (JSON is only a transient transport, never persisted). The HTTP API,
  SSE, and the temporary Python montage spec stay JSON — those are transport, not the
  stored project format. The LLM still returns JSON and is converted on save.

- **Medium-agnostic core vs. video-specific tail (for future comics support).**
  The core — projects, the asset library, scenes, the atomic generation unit
  (`Shot`), additive `Take`s, and filesystem storage — carries no movie-only
  assumptions. The only video-coupled pieces are:
  - `backend/src/assembly/*` and `services/assembly.ts` (ffmpeg two-pass pipeline),
  - the video fields on `Shot`/`Take` (`camera`, `exit`, take `durationSeconds`, mp4 outputs),
  - the Assembly tab + `useAssembly` hook on the frontend.

  Adding a comic medium should be additive (a parallel "page/panel" output path
  and an image-composition assembler) rather than a rewrite. Coordinate the exact
  shared shape with the comics spec before changing `packages/types`.

## API

Base path `/api/v1`. See the API table in `SPEC.md`. Project API responses never
include the OpenRouter key — only `hasApiKey: boolean`.
