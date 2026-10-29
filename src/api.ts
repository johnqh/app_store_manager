import type { HostDeviceOptions, Project } from './types';

async function req(path: string, opts?: RequestInit) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || r.statusText);
  return r.json();
}
const postJson = (path: string, body: unknown) =>
  req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export interface RecentEntry { dir: string; exists: boolean }
export interface BrowseResult {
  path: string;
  parent: string | null;
  hasAppStore: boolean;
  entries: { name: string; hasAppStore: boolean }[];
}

export const api = {
  recent: (): Promise<{ recent: RecentEntry[]; home: string }> => req('/api/recent'),
  browse: (dir?: string): Promise<BrowseResult> =>
    req('/api/browse' + (dir ? '?dir=' + encodeURIComponent(dir) : '')),
  project: (dir: string): Promise<Project> => req('/api/project?dir=' + encodeURIComponent(dir)),
  deviceOptions: (): Promise<HostDeviceOptions> => req('/api/devices/options'),
  saveFile: (dir: string, relpath: string, content: unknown) =>
    postJson('/api/file', { dir, relpath, content }),
  invalidateTranslations: (
    dir: string,
    sourceLang: string,
    removals: Record<string, string[]>,
  ): Promise<{ removed: number; langs: string[] }> =>
    postJson('/api/text/invalidate', { dir, sourceLang, removals }),
  saveSettings: (dir: string, settings: Project['settings']) =>
    postJson('/api/settings', { dir, settings }),
  syncLanguages: (dir: string, dryRun = false) =>
    postJson('/api/languages/sync', { dir, dryRun }),
  run: (dir: string, script: string, args: string[]): Promise<{ runId: string; label: string }> =>
    postJson('/api/run', { dir, script, args }),
  stopRun: (id: string) => fetch(`/api/run/${id}/stop`, { method: 'POST' }),
  screenshotUrl: (dir: string, kind: string, device: string, lang: string, file: string) =>
    `/api/screenshot?dir=${encodeURIComponent(dir)}&kind=${kind}&device=${encodeURIComponent(device)}&lang=${encodeURIComponent(lang)}&file=${encodeURIComponent(file)}`,
  // Upload a manually-captured raw screenshot (drag-and-drop) for one seq.
  uploadRaw: (dir: string, device: string, lang: string, seq: number, file: File): Promise<{ ok: boolean; file: string }> => {
    const fd = new FormData();
    fd.append('dir', dir);
    fd.append('device', device);
    fd.append('lang', lang);
    fd.append('seq', String(seq));
    fd.append('file', file);
    return req('/api/screenshots/upload', { method: 'POST', body: fd });
  },
  // Copy raw screenshots from another language (default English) into `toLang`.
  copyRaw: (dir: string, device: string, toLang: string, fromLang = 'en'): Promise<{ ok: boolean; copied: number }> =>
    postJson('/api/screenshots/copy-raw', { dir, device, toLang, fromLang }),
};
