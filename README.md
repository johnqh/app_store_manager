# App Store Manager

A local web app to manage the `app_store/` submission flow for **any** project — config,
store-listing text, screenshots, language setup, and running the capture/compose/submit
scripts.

It is a thin layer over each project's `app_store/scripts/*.sh` wrappers (which in turn call
`~/projects/workflows/app_store/*`); it never reimplements them.

## Stack

Matches the other `@sudobility` web apps: **React 19 + Vite + TailwindCSS**, UI from
**`@sudobility/components`** (`Select`, `Button`) on the **default `@sudobility/design`
theme** (`configureTheme(defaultTheme)` + injected `generateThemeCSS`, `createTailwindPreset`).
A small **Bun server** (`server.ts`) does the filesystem + script work and serves the built UI.

## Run

```bash
cd ~/projects/app_store_manager
bun install            # first time (installs @sudobility/* from the npm registry)

bun run start          # build the UI + serve at http://localhost:4317  (PORT=xxxx to change)
# or, for UI development with hot reload:
bun run server         # terminal 1: API/server on :4317
bun run dev            # terminal 2: Vite dev server on :5319 (proxies /api → :4317)
```

Then open the URL. On first launch you pick a project; recent projects are remembered in
`~/.app_store_manager/config.json`.

## What it does

1. **Select Project** — a modal with recent projects and a filesystem browser; only folders
   that contain an `app_store/` directory can be opened (📦 marks them).
2. **Scoped to `<project>/app_store/`** — every read/write stays inside that folder (path
   escapes are rejected server-side).
3. **Overview** — pick which OSes to submit to (**iOS / iPadOS / macOS / Android / Windows**,
   only the ones the project supports are enabled, detected from `screens.json` + `info.json`),
   and see a readiness checklist for every store listing and screenshot set. Selection is
   persisted per project.
   - iOS / iPadOS / macOS → `apple`, Android → `google`, Windows → `microsoft` (the
     `submit.sh --platforms` tokens).
4. **Screenshot Paths** — edit `paths.json` (the ordered deep-link paths captured per screen;
   path *N* pairs with caption *N*).
5. **Store Text** — per-language editor for Apple / Google / Microsoft listings
   (`screenshots/info/<lang>/info.json`) plus the screenshot captions
   (`screenshots/info/<lang>/screens.json`), with **live character counts and limit
   validation** (Apple title/subtitle 30, keywords 100, promo 170, desc 4000; Google short
   desc 80, full desc 4000; etc.) and required-field checks.
6. **Screenshots** — thumbnail grid of `screenshots/raw/` (and composed `store/`) per device ×
   language; folders missing for a targeted platform are flagged red. Language folders are
   matched case-insensitively (the repos mix `zh-Hant` / `zh-hant`).
7. **Languages** — detects the app's languages from `assets/locales/`, compares them to the
   store-text folders, and **creates missing `screenshots/info/<lang>/` folders** (copied from
   the primary language as a draft) and aligns `languages.json`. Preview with a dry run first.
8. **Run Scripts** — CTAs to run each script individually (`build`, `prepare`, `capture`,
   `compose`, `submit`, plus `status` / `doctor` / `cleanup`) **or the full pipelines**
   (`capture_raw`, and `capture_raw → compose → submit`), with option toggles (orientation,
   delay, device, skip-build/release, dry-run, screenshots/subscriptions/metadata-only).
   Output streams live into the console; each run can be stopped.

## Notes

- **Submit is real.** `submit.sh` uploads to live App Store Connect / Google Play / Microsoft
  Store. Use the **Submit (dry run)** button first; every script also honors a `dry run` toggle.
- The server only touches the filesystem and spawns the whitelisted scripts; all validation
  runs in the browser from the loaded project bundle.
- Requirements come from the project itself (jq, Xcode/Android Studio, store credentials in
  `app_store/.env` + `.keys/`), exactly as when running the scripts by hand.

## Layout

```
server.ts              Bun server: browse / load / save / screenshots / language sync / run (SSE)
index.html             Vite entry
src/main.tsx           activates the default design theme, mounts <App/>
src/App.tsx            shell: context, project picker, sidebar, run (SSE) management
src/tabs/*.tsx         Overview, Devices, Paths, StoreText, Screenshots, Languages, Run
src/ui.tsx             re-exports @sudobility Button/Select + token-styled Card/Input/Badge/…
src/lib.ts             labels, device/field specs, validation, platform detection
src/api.ts, types.ts   fetch client + shared types
dist/                  built UI served by server.ts (gitignored)
```
