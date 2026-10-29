/**
 * App Store Manager — local backend.
 *
 * A thin Bun server that:
 *   - browses the filesystem so the UI can pick a project directory,
 *   - loads/saves a project's app_store config + per-language store text,
 *   - detects app languages (assets/locales) and target platforms,
 *   - serves screenshot images,
 *   - sets up missing per-language store-text folders, and
 *   - runs the app_store/scripts/*.sh wrappers, streaming output over SSE.
 *
 * All validation lives in the browser (it already holds the loaded bundle).
 * The server only does filesystem + process work, scoped to the project.
 */

import { existsSync } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

const PORT = Number(process.env.PORT ?? 4317);
const HOME = homedir();
const CONFIG_DIR = join(HOME, '.app_store_manager');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DIST_DIR = join(import.meta.dir, 'dist');

// Scripts the Run tab is allowed to invoke (wrappers in app_store/scripts/).
const ALLOWED_SCRIPTS = new Set([
  'build',
  'prepare',
  'capture',
  'capture_raw',
  'compose',
  'submit',
  'cleanup',
  'status',
  'doctor',
]);

// ── small helpers ────────────────────────────────────────────────────────────

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const badRequest = (message: string) => json({ error: message }, 400);

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Resolve `child` and confirm it stays within `base` (prevents path escape). */
function within(base: string, child: string): string | null {
  const b = resolve(base);
  const c = resolve(b, child);
  if (c === b || c.startsWith(b + sep)) return c;
  return null;
}

// ── manager config (recent projects + per-project settings) ───────────────────

type ProjectSettings = { targets: string[] };
type ManagerConfig = {
  recent: string[];
  settings: Record<string, ProjectSettings>;
};

async function loadManagerConfig(): Promise<ManagerConfig> {
  const cfg = await readJson<ManagerConfig>(CONFIG_FILE);
  return {
    recent: cfg?.recent ?? [],
    settings: cfg?.settings ?? {},
  };
}

async function saveManagerConfig(cfg: ManagerConfig): Promise<void> {
  if (!existsSync(CONFIG_DIR)) await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
}

async function rememberProject(dir: string): Promise<void> {
  const cfg = await loadManagerConfig();
  cfg.recent = [dir, ...cfg.recent.filter(d => d !== dir)].slice(0, 12);
  await saveManagerConfig(cfg);
}

// ── project loading ────────────────────────────────────────────────────────────

const CONFIG_FILES = ['info.json', 'languages.json', 'paths.json', 'screens.json'];

/** Build the full bundle the UI needs for one project. */
async function loadProject(dir: string) {
  const appStore = join(dir, 'app_store');
  const hasAppStore = existsSync(appStore);

  const config: Record<string, unknown> = {};
  const configErrors: Record<string, string> = {};
  if (hasAppStore) {
    for (const f of CONFIG_FILES) {
      const p = join(appStore, f);
      if (!existsSync(p)) continue;
      try {
        config[f.replace('.json', '')] = JSON.parse(await readFile(p, 'utf8'));
      } catch (e) {
        configErrors[f] = String(e);
      }
    }
  }

  const info = (config.info ?? {}) as any;

  // App languages: directory names under assets/locales (e.g. "en", "zh-hant").
  const appLanguages: string[] = [];
  const localesDir = join(dir, 'assets', 'locales');
  if (existsSync(localesDir)) {
    for (const e of await readdir(localesDir, { withFileTypes: true })) {
      if (e.isDirectory()) appLanguages.push(e.name);
    }
    appLanguages.sort();
  }

  // Map a locale dir name to the canonical code used in info.supportedLanguages
  // (e.g. "zh-hant" -> "zh-Hant"), falling back to the dir name.
  const supported: Array<{ code: string; name?: string; primary?: boolean }> =
    info?.supportedLanguages ?? [];
  const canonical = (dirName: string) =>
    supported.find(s => s.code.toLowerCase() === dirName.toLowerCase())?.code ??
    dirName;
  const languageName = (dirName: string) =>
    supported.find(s => s.code.toLowerCase() === dirName.toLowerCase())?.name;

  // Store-text languages: dirs under screenshots/info.
  const infoDir = join(appStore, 'screenshots', 'info');
  const storeLanguages: string[] = [];
  if (existsSync(infoDir)) {
    for (const e of await readdir(infoDir, { withFileTypes: true })) {
      if (e.isDirectory()) storeLanguages.push(e.name);
    }
    storeLanguages.sort();
  }

  // Per-language store text (info.json + screens.json under screenshots/info/<lang>).
  const text: Record<string, { info: unknown; screens: unknown }> = {};
  for (const lang of storeLanguages) {
    text[lang] = {
      info: await readJson(join(infoDir, lang, 'info.json')),
      screens: await readJson(join(infoDir, lang, 'screens.json')),
    };
  }

  // Raw + store screenshots: { device: { lang: [files] } }.
  const screenshots: Record<string, Record<string, Record<string, string[]>>> =
    {};
  // First composed (store) image on disk per device — its real pixel size is
  // the effective store resolution, used to fill the Devices store_resolution.
  const storeSample: Record<string, string> = {};
  for (const kind of ['raw', 'store'] as const) {
    const root = join(appStore, 'screenshots', kind);
    screenshots[kind] = {};
    if (!existsSync(root)) continue;
    for (const dev of await readdir(root, { withFileTypes: true })) {
      if (!dev.isDirectory()) continue;
      screenshots[kind][dev.name] = {};
      const devDir = join(root, dev.name);
      for (const lang of await readdir(devDir, { withFileTypes: true })) {
        if (!lang.isDirectory()) continue;
        const files = (
          await readdir(join(devDir, lang.name))
        ).filter(f => /\.(png|jpe?g)$/i.test(f));
        files.sort(
          (a, b) =>
            (parseInt(a) || 0) - (parseInt(b) || 0) || a.localeCompare(b),
        );
        screenshots[kind][dev.name][lang.name] = files;
        if (kind === 'store' && files.length && !storeSample[dev.name]) {
          storeSample[dev.name] = join(devDir, lang.name, files[0]);
        }
      }
    }
  }

  // Resolve each sampled composed image to a "WxH" string (PNG/JPEG headers).
  const storeResolutions: Record<string, string> = {};
  for (const [dev, path] of Object.entries(storeSample)) {
    const size = await imageSize(path);
    if (size) storeResolutions[dev] = size;
  }

  // Platform availability derived from screens.json + info.json.
  const screens = (config.screens ?? {}) as any;
  const devicesOf = (k: string) =>
    screens?.[k] ? Object.keys(screens[k]) : [];
  const platforms = {
    ios: { available: !!screens?.ios || !!info?.appleAppStore, devices: devicesOf('ios') },
    ipados: { available: !!screens?.ipados, devices: devicesOf('ipados') },
    macos: {
      available: !!screens?.macos || !!info?.appleAppStore?.platforms?.macos,
      devices: devicesOf('macos'),
    },
    android: { available: !!screens?.android || !!info?.googlePlay, devices: devicesOf('android') },
    windows: { available: !!info?.microsoftStore, devices: devicesOf('windows') },
  };

  const mgr = await loadManagerConfig();
  const settings: ProjectSettings = mgr.settings[dir] ?? {
    targets: (['ios', 'ipados', 'macos', 'android', 'windows'] as const).filter(
      p => platforms[p].available,
    ),
  };

  return {
    dir,
    name: basename(dir),
    hasAppStore,
    config,
    configErrors,
    appLanguages: appLanguages.map(d => ({
      dir: d,
      code: canonical(d),
      name: languageName(d),
    })),
    storeLanguages,
    platforms,
    text,
    screenshots,
    storeResolutions,
    settings,
  };
}

/**
 * Pixel dimensions ("WxH") of a PNG or JPEG, read from its header without
 * decoding the whole file. Returns null for anything it can't parse.
 */
async function imageSize(path: string): Promise<string | null> {
  try {
    const head = Buffer.from(await Bun.file(path).slice(0, 65536).arrayBuffer());
    // PNG: 8-byte signature, then IHDR with width@16, height@20 (big-endian).
    if (head.length >= 24 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
      const w = head.readUInt32BE(16);
      const h = head.readUInt32BE(20);
      if (w && h) return `${w}x${h}`;
    }
    // JPEG: scan segments for the SOF marker carrying height/width.
    if (head.length >= 4 && head[0] === 0xff && head[1] === 0xd8) {
      let o = 2;
      while (o + 9 < head.length) {
        if (head[o] !== 0xff) { o++; continue; }
        const marker = head[o + 1];
        const len = head.readUInt16BE(o + 2);
        // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15 carry the frame size.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          const h = head.readUInt16BE(o + 5);
          const w = head.readUInt16BE(o + 7);
          if (w && h) return `${w}x${h}`;
        }
        o += 2 + len;
      }
    }
  } catch {
    // Unreadable or malformed — fall through to null.
  }
  return null;
}

// ── language setup ───────────────────────────────────────────────────────────

/**
 * Create missing screenshots/info/<lang>/{info,screens}.json by copying the
 * primary language (default "en"), and align languages.json to the app's
 * detected languages. Returns what changed (or would change in dryRun).
 */
async function syncLanguages(dir: string, dryRun: boolean) {
  const appStore = join(dir, 'app_store');
  const infoDir = join(appStore, 'screenshots', 'info');

  const localesDir = join(dir, 'assets', 'locales');
  const appLangs: string[] = existsSync(localesDir)
    ? (await readdir(localesDir, { withFileTypes: true }))
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort()
    : [];

  const existing: string[] = existsSync(infoDir)
    ? (await readdir(infoDir, { withFileTypes: true }))
        .filter(e => e.isDirectory())
        .map(e => e.name)
    : [];

  const primary = existing.includes('en') ? 'en' : existing[0];
  const created: string[] = [];
  const missing = appLangs.filter(l => !existing.includes(l));

  if (!dryRun && primary) {
    const tmplInfo = await readFile(join(infoDir, primary, 'info.json'), 'utf8');
    const tmplScreens = await readFile(
      join(infoDir, primary, 'screens.json'),
      'utf8',
    );
    for (const lang of missing) {
      const target = join(infoDir, lang);
      await mkdir(target, { recursive: true });
      // Copy the primary template; set the locale field so it's obviously a draft.
      let obj: any;
      try {
        obj = JSON.parse(tmplInfo);
        obj.locale = lang;
      } catch {
        obj = null;
      }
      await writeFile(
        join(target, 'info.json'),
        (obj ? JSON.stringify(obj, null, 2) : tmplInfo) + '\n',
      );
      await writeFile(join(target, 'screens.json'), tmplScreens);
      created.push(lang);
    }
  }

  // languages.json aligned to the app's languages, using canonical casing.
  const info = await readJson<any>(join(appStore, 'info.json'));
  const supported: Array<{ code: string }> = info?.supportedLanguages ?? [];
  const canonical = (d: string) =>
    supported.find(s => s.code.toLowerCase() === d.toLowerCase())?.code ?? d;
  const desiredLangs = appLangs.map(canonical).sort();
  const currentLangs = (await readJson<string[]>(join(appStore, 'languages.json'))) ?? [];
  const langsChanged =
    JSON.stringify([...currentLangs].sort()) !==
    JSON.stringify([...desiredLangs].sort());
  if (!dryRun && langsChanged) {
    await writeFile(
      join(appStore, 'languages.json'),
      JSON.stringify(desiredLangs, null, 2) + '\n',
    );
  }

  return {
    dryRun,
    primary,
    missing,
    created,
    languagesChanged: langsChanged,
    desiredLanguages: desiredLangs,
    currentLanguages: currentLangs,
  };
}

// ── host device options (installed simulators / runtimes / AVDs) ───────────────

type HostDeviceOptions = {
  simulators: { ios: string[]; ipados: string[] };
  runtimes: string[];
  avds: string[];
};

/** Run a command and return stdout; throws on non-zero exit or spawn failure. */
async function sh(cmd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], { stdout: 'pipe', stderr: 'ignore' });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error(`${cmd} exited non-zero`);
  return out;
}

/** Candidate `emulator` binaries (Android SDK), most specific first. */
function emulatorBins(): string[] {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(HOME, 'Library/Android/sdk')];
  const bins = roots.filter(Boolean).map(r => join(r as string, 'emulator', 'emulator'));
  bins.push('emulator'); // fall back to PATH
  return bins;
}

let deviceOptsCache: { at: number; data: HostDeviceOptions } | null = null;

/** Enumerate what's installed on this host. Each probe degrades to [] on
 *  failure (no Xcode, non-macOS, no Android SDK), cached briefly since the
 *  simctl calls are slow and installs rarely change mid-session. */
async function hostDeviceOptions(): Promise<HostDeviceOptions> {
  if (deviceOptsCache && Date.now() - deviceOptsCache.at < 60_000) return deviceOptsCache.data;
  const data: HostDeviceOptions = { simulators: { ios: [], ipados: [] }, runtimes: [], avds: [] };

  try {
    const j = JSON.parse(await sh('xcrun', ['simctl', 'list', 'devicetypes', '--json']));
    for (const dt of j.devicetypes ?? []) {
      const n = String(dt.name ?? '');
      if (/^iPhone/.test(n)) data.simulators.ios.push(n);
      else if (/^iPad/.test(n)) data.simulators.ipados.push(n);
    }
  } catch {}

  try {
    const j = JSON.parse(await sh('xcrun', ['simctl', 'list', 'runtimes', '--json']));
    const seen = new Set<string>();
    for (const rt of j.runtimes ?? []) {
      if (rt.isAvailable === false) continue;
      // identifier e.g. com.apple.CoreSimulator.SimRuntime.iOS-18-6  →  iOS-18-6
      const id = String(rt.identifier ?? '').split('.').pop() ?? '';
      if (/^(iOS|iPadOS)-/.test(id) && !seen.has(id)) {
        seen.add(id);
        data.runtimes.push(id);
      }
    }
  } catch {}

  for (const bin of emulatorBins()) {
    try {
      data.avds = (await sh(bin, ['-list-avds'])).split('\n').map(s => s.trim()).filter(Boolean);
      break;
    } catch {}
  }

  deviceOptsCache = { at: Date.now(), data };
  return data;
}

// ── script runner (SSE) ────────────────────────────────────────────────────────

type Run = {
  id: string;
  proc: ReturnType<typeof Bun.spawn>;
  chunks: string[];
  done: boolean;
  exitCode: number | null;
  subscribers: Set<(line: string) => void>;
  label: string;
};
const runs = new Map<string, Run>();

function startRun(dir: string, script: string, args: string[]): Run {
  const scriptPath = join(dir, 'app_store', 'scripts', `${script}.sh`);
  const id = `${script}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const label = `${script} ${args.join(' ')}`.trim();

  const proc = Bun.spawn(['bash', scriptPath, ...args], {
    cwd: dir,
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const run: Run = {
    id,
    proc,
    chunks: [`$ app_store/scripts/${script}.sh ${args.join(' ')}\n`],
    done: false,
    exitCode: null,
    subscribers: new Set(),
    label,
  };
  runs.set(id, run);

  const push = (text: string) => {
    run.chunks.push(text);
    for (const sub of run.subscribers) sub(text);
  };

  const pump = async (stream: ReadableStream<Uint8Array> | undefined) => {
    if (!stream) return;
    const reader = stream.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      push(dec.decode(value, { stream: true }));
    }
  };

  Promise.all([pump(proc.stdout as any), pump(proc.stderr as any)]).then(
    async () => {
      run.exitCode = await proc.exited;
      run.done = true;
      push(`\n__EXIT__ ${run.exitCode}\n`);
    },
  );

  return run;
}

function sseForRun(run: Run): Response {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (text: string) => {
        // Encode as SSE data frames, one per line of output.
        for (const line of text.split('\n')) {
          controller.enqueue(enc.encode(`data: ${line}\n`));
        }
        controller.enqueue(enc.encode('\n'));
      };
      // Replay buffered output, then subscribe to live output.
      send(run.chunks.join(''));
      if (run.done) {
        controller.close();
        return;
      }
      const sub = (text: string) => {
        send(text);
        if (run.done) {
          try {
            controller.close();
          } catch {}
          run.subscribers.delete(sub);
        }
      };
      run.subscribers.add(sub);
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}

export { loadProject, syncLanguages, within, handle };

// ── HTTP server ────────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    // ---- static (Vite build in dist/, with SPA fallback) ----
    if (req.method === 'GET' && !p.startsWith('/api/')) {
      const rel = p === '/' ? 'index.html' : p.slice(1);
      const file = within(DIST_DIR, rel);
      if (file && existsSync(file) && (await stat(file)).isFile())
        return new Response(Bun.file(file));
      const index = join(DIST_DIR, 'index.html');
      if (existsSync(index)) return new Response(Bun.file(index));
      return new Response('UI not built. Run `bun run build` first.', { status: 503 });
    }

    // ---- recent projects ----
    if (p === '/api/recent') {
      const cfg = await loadManagerConfig();
      const recent = [];
      for (const d of cfg.recent) {
        recent.push({ dir: d, exists: existsSync(join(d, 'app_store')) });
      }
      return json({ recent, home: HOME });
    }

    // ---- directory browser ----
    if (p === '/api/browse') {
      const target = url.searchParams.get('dir') || join(HOME, 'projects');
      const start = existsSync(target) ? target : HOME;
      try {
        const entries = [];
        for (const e of await readdir(start, { withFileTypes: true })) {
          if (!e.isDirectory() || e.name.startsWith('.')) continue;
          entries.push({
            name: e.name,
            hasAppStore: existsSync(join(start, e.name, 'app_store')),
          });
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        return json({
          path: start,
          parent: dirname(start) === start ? null : dirname(start),
          hasAppStore: existsSync(join(start, 'app_store')),
          entries,
        });
      } catch (e) {
        return badRequest(String(e));
      }
    }

    // ---- host device options (installed simulators / runtimes / AVDs) ----
    if (p === '/api/devices/options') {
      return json(await hostDeviceOptions());
    }

    // ---- load project ----
    if (p === '/api/project') {
      const dir = url.searchParams.get('dir');
      if (!dir || !existsSync(dir)) return badRequest('Directory not found');
      await rememberProject(dir);
      return json(await loadProject(dir));
    }

    // ---- save a json file under app_store ----
    if (p === '/api/file' && req.method === 'POST') {
      const body = (await req.json()) as {
        dir: string;
        relpath: string;
        content: unknown;
      };
      const base = join(body.dir, 'app_store');
      const target = within(base, body.relpath);
      if (!target || !target.endsWith('.json'))
        return badRequest('Invalid path');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(body.content, null, 2) + '\n');
      return json({ ok: true });
    }

    // ---- upload a raw screenshot (manual capture, drag-and-drop) ----
    // Writes screenshots/raw/<device>/<lang>/<seq>.<ext>, replacing any existing
    // file for that seq so there's exactly one raw per sequence number.
    if (p === '/api/screenshots/upload' && req.method === 'POST') {
      const form = await req.formData();
      const dir = String(form.get('dir') || '');
      const device = String(form.get('device') || '');
      const lang = String(form.get('lang') || '');
      const seqNum = parseInt(String(form.get('seq') || ''), 10);
      const file = form.get('file');
      if (!dir || !device || !lang || !Number.isFinite(seqNum) || seqNum < 1 || !(file instanceof File))
        return badRequest('Missing or invalid upload fields');
      if (!file.type.startsWith('image/')) return badRequest('File must be an image');
      const base = join(dir, 'app_store');
      const targetDir = within(base, `screenshots/raw/${device}/${lang}`);
      if (!targetDir) return badRequest('Invalid path');
      await mkdir(targetDir, { recursive: true });
      for (const ext of ['png', 'jpg', 'jpeg']) {
        const existing = join(targetDir, `${seqNum}.${ext}`);
        if (existsSync(existing)) await rm(existing);
      }
      const ext = file.type === 'image/jpeg' ? 'jpg' : 'png';
      const outName = `${seqNum}.${ext}`;
      await Bun.write(join(targetDir, outName), await file.arrayBuffer());
      return json({ ok: true, file: outName });
    }

    // ---- copy raw screenshots from one language to another (e.g. "Use English")
    // For text-free screens the English captures work for every language.
    if (p === '/api/screenshots/copy-raw' && req.method === 'POST') {
      const body = (await req.json()) as {
        dir: string;
        device: string;
        fromLang?: string;
        toLang: string;
      };
      const fromLang = body.fromLang || 'en';
      if (!body.dir || !body.device || !body.toLang) return badRequest('Missing fields');
      if (body.toLang === fromLang) return badRequest('Source and target are the same');
      const base = join(body.dir, 'app_store');
      const srcDir = within(base, `screenshots/raw/${body.device}/${fromLang}`);
      const dstDir = within(base, `screenshots/raw/${body.device}/${body.toLang}`);
      if (!srcDir || !dstDir) return badRequest('Invalid path');
      if (!existsSync(srcDir)) return badRequest(`No ${fromLang} raw screenshots for ${body.device}`);
      await mkdir(dstDir, { recursive: true });
      let copied = 0;
      for (const f of await readdir(srcDir)) {
        if (!/\.(png|jpe?g)$/i.test(f)) continue;
        await Bun.write(join(dstDir, f), Bun.file(join(srcDir, f)));
        copied++;
      }
      return json({ ok: true, copied });
    }

    // ---- invalidate stale translations when the English source changes ----
    // Removes the given keys (grouped by store block) from every language
    // except the source, so `localize` will regenerate them from English.
    if (p === '/api/text/invalidate' && req.method === 'POST') {
      const body = (await req.json()) as {
        dir: string;
        sourceLang: string;
        removals: Record<string, string[]>;
      };
      const infoDir = join(body.dir, 'app_store', 'screenshots', 'info');
      if (!existsSync(infoDir)) return json({ removed: 0, langs: [] });
      let removed = 0;
      const langs: string[] = [];
      for (const e of await readdir(infoDir, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name === body.sourceLang) continue;
        const file = join(infoDir, e.name, 'info.json');
        const data = await readJson<Record<string, any>>(file);
        if (!data) continue;
        let changed = false;
        for (const [storeKey, keys] of Object.entries(body.removals)) {
          const block = data[storeKey];
          if (!block || typeof block !== 'object') continue;
          for (const k of keys) {
            if (k in block) {
              delete block[k];
              removed++;
              changed = true;
            }
          }
        }
        if (changed) {
          await writeFile(file, JSON.stringify(data, null, 2) + '\n');
          langs.push(e.name);
        }
      }
      return json({ removed, langs });
    }

    // ---- per-project settings (which OS targets) ----
    if (p === '/api/settings' && req.method === 'POST') {
      const body = (await req.json()) as {
        dir: string;
        settings: ProjectSettings;
      };
      const cfg = await loadManagerConfig();
      cfg.settings[body.dir] = body.settings;
      await saveManagerConfig(cfg);
      return json({ ok: true });
    }

    // ---- language setup ----
    if (p === '/api/languages/sync' && req.method === 'POST') {
      const body = (await req.json()) as { dir: string; dryRun?: boolean };
      if (!existsSync(join(body.dir, 'app_store')))
        return badRequest('No app_store folder');
      return json(await syncLanguages(body.dir, !!body.dryRun));
    }

    // ---- serve a screenshot ----
    if (p === '/api/screenshot') {
      const dir = url.searchParams.get('dir') || '';
      const kind = url.searchParams.get('kind') || 'raw';
      const rel = `screenshots/${kind}/${url.searchParams.get('device')}/${url.searchParams.get('lang')}/${url.searchParams.get('file')}`;
      const base = join(dir, 'app_store');
      const file = within(base, rel);
      if (!file || !existsSync(file)) return new Response('Not found', { status: 404 });
      return new Response(Bun.file(file));
    }

    // ---- run a script ----
    if (p === '/api/run' && req.method === 'POST') {
      const body = (await req.json()) as {
        dir: string;
        script: string;
        args?: string[];
      };
      if (!ALLOWED_SCRIPTS.has(body.script))
        return badRequest('Script not allowed');
      const scriptPath = join(body.dir, 'app_store', 'scripts', `${body.script}.sh`);
      if (!existsSync(scriptPath))
        return badRequest(`Script not found: ${scriptPath}`);
      const run = startRun(body.dir, body.script, body.args ?? []);
      return json({ runId: run.id, label: run.label });
    }

    // ---- stream run output ----
    const streamMatch = p.match(/^\/api\/run\/([^/]+)\/stream$/);
    if (streamMatch) {
      const run = runs.get(streamMatch[1]);
      if (!run) return new Response('Unknown run', { status: 404 });
      return sseForRun(run);
    }

    // ---- stop a run ----
    const stopMatch = p.match(/^\/api\/run\/([^/]+)\/stop$/);
    if (stopMatch && req.method === 'POST') {
      const run = runs.get(stopMatch[1]);
      if (run && !run.done) run.proc.kill();
      return json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
}

if (import.meta.main) {
  const server = Bun.serve({ port: PORT, idleTimeout: 0, fetch: handle });
  console.log(`\n  App Store Manager running at  http://localhost:${server.port}\n`);
}
