import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HostDeviceOptions, OS, Project, StoreId } from './types';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/* ── labels + mappings ──────────────────────────────────────────── */
export const OS_LABEL: Record<OS, string> = {
  ios: 'iOS',
  ipados: 'iPadOS',
  macos: 'macOS',
  android: 'Android',
  windows: 'Windows',
};
export const STORE_KEY: Record<StoreId, string> = {
  apple: 'appleAppStore',
  google: 'googlePlay',
  microsoft: 'microsoftStore',
};
export const STORE_LABEL: Record<StoreId, string> = {
  apple: 'Apple App Store',
  google: 'Google Play',
  microsoft: 'Microsoft Store',
};
export const osToStore = (os: OS): StoreId =>
  os === 'android' ? 'google' : os === 'windows' ? 'microsoft' : 'apple';

export const PLATFORM_ORDER: OS[] = ['ios', 'ipados', 'macos', 'android', 'windows'];

// Devices tab grouping — one card per platform. iPhone and iPad are separate;
// the iPhone card auto-shows its standard devices (see STANDARD_DEVICES).
export const DEVICE_GROUPS: { label: string; platforms: OS[] }[] = [
  { label: 'iPhone', platforms: ['ios'] },
  { label: 'iPad', platforms: ['ipados'] },
  { label: 'macOS', platforms: ['macos'] },
  { label: 'Android', platforms: ['android'] },
  { label: 'Windows', platforms: ['windows'] },
];

// Devices a platform always shows, scaffolded with defaults when absent from
// screens.json, so the App Store's required iPhone slots are there by default:
// the 6.9" phone (iPhone with Dynamic Island) and iPhone Duo. An existing entry
// with the same key is kept as-is and never overwritten.
export const STANDARD_DEVICES: Partial<Record<OS, { key: string; fields: Record<string, string> }[]>> = {
  ios: [
    { key: 'iphone_6_9', fields: { simulator: 'iPhone 16 Pro Max', runtime: 'iOS-18-6', resolution: '1320x2868', store_resolution: '1320x2868' } },
    { key: 'iphone_duo', fields: { simulator: 'iPhone Duo', runtime: 'iOS-27-2', resolution: '2007x2853', store_resolution: '2007x2853' } },
  ],
};
export const PLATFORM_HEAD: Record<OS, [string, string]> = {
  ios: ['iPhone (iOS)', '+ Add iPhone'],
  ipados: ['iPad (iPadOS)', '+ Add iPad'],
  macos: ['macOS', '+ Add Mac'],
  android: ['Android', '+ Add Android device'],
  windows: ['Windows', '+ Add Windows device'],
};
// [field key, label, placeholder]
export const DEVICE_FIELDS: Record<OS, [string, string, string][]> = {
  ios: [['simulator', 'Simulator', 'iPhone 16 Pro Max'], ['runtime', 'Runtime', 'iOS-18-6'], ['resolution', 'Resolution', '1320x2868'], ['store_resolution', 'Store resolution', 'optional']],
  ipados: [['simulator', 'Simulator', 'iPad Pro 13-inch (M4)'], ['runtime', 'Runtime', 'iOS-18-6'], ['resolution', 'Resolution', '2064x2752'], ['store_resolution', 'Store resolution', '2752x2064']],
  macos: [['app', 'App', 'native'], ['resolution', 'Resolution', '2880x1800']],
  android: [['emulator', 'Emulator (AVD)', 'Pixel_9_Pro_XL'], ['resolution', 'Resolution', '1344x2992'], ['store_resolution', 'Store resolution', '1080x1920']],
  windows: [['emulator', 'Target', 'local'], ['resolution', 'Resolution', '2560x1440'], ['store_resolution', 'Store resolution', 'optional']],
};
export const DEVICE_DEFAULTS: Record<OS, Record<string, string>> = {
  ios: { key: 'iphone_6_9', simulator: 'iPhone 16 Pro Max', runtime: 'iOS-18-6', resolution: '1320x2868' },
  ipados: { key: 'ipad_13', simulator: 'iPad Pro 13-inch (M4)', runtime: 'iOS-18-6', resolution: '2064x2752', store_resolution: '2752x2064' },
  macos: { key: 'macos_desktop', app: 'native', resolution: '2880x1800' },
  android: { key: 'android_phone', emulator: 'Pixel_9_Pro_XL', resolution: '1344x2992', store_resolution: '1080x1920' },
  windows: { key: 'windows_desktop', emulator: 'local', resolution: '2560x1440' },
};

/* ── device-field option sources ─────────────────────────────────────
 * Which fields are constrained to a known set (→ dropdown) vs. free text.
 * Simulators / runtimes / AVDs come from the host (enumerated by the server);
 * resolutions are curated presets. Every control keeps an "Other…" escape
 * hatch, so a value outside the list is still allowed — it is never dropped. */
export const EMPTY_HOST_OPTIONS: HostDeviceOptions = {
  simulators: { ios: [], ipados: [] },
  runtimes: [],
  avds: [],
};

// Common store-accepted capture resolutions (portrait "WxH"), newest first.
const RESOLUTIONS: Record<OS, string[]> = {
  ios: ['1320x2868', '1290x2796', '1179x2556', '1284x2778', '1242x2688', '1125x2436'],
  ipados: ['2064x2752', '2048x2732', '1668x2388', '1620x2160'],
  macos: ['2880x1800', '2560x1600', '1440x900', '1280x800'],
  android: ['1344x2992', '1440x3120', '1080x2340', '1080x1920'],
  windows: ['3840x2160', '2560x1440', '1920x1080'],
};
// Resolutions apps are typically downscaled to for store upload.
const STORE_RESOLUTIONS: Record<OS, string[]> = {
  ios: ['1320x2868', '1290x2796', '1242x2688'],
  ipados: ['2752x2064', '2732x2048', '2048x2732'],
  macos: ['2880x1800', '1280x800'],
  android: ['1080x1920', '1080x2340'],
  windows: ['1920x1080', '3840x2160'],
};

/** Known options for a device field, or [] when it is free-form text. */
export function deviceFieldOptions(plat: OS, key: string, host: HostDeviceOptions): string[] {
  switch (key) {
    case 'simulator':
      return plat === 'ipados' ? host.simulators.ipados : host.simulators.ios;
    case 'runtime':
      return host.runtimes;
    case 'emulator':
      return plat === 'android' ? host.avds : plat === 'windows' ? ['local'] : [];
    case 'app':
      return ['native'];
    case 'resolution':
      return RESOLUTIONS[plat] ?? [];
    case 'store_resolution':
      return STORE_RESOLUTIONS[plat] ?? [];
    default:
      return [];
  }
}

/* ── store-text field specs + limits ────────────────────────────── */
// [key, label, max (0 = no limit), required, multiline]
export type FieldSpec = [string, string, number, boolean, boolean?];
export const FIELD_SPECS: Record<StoreId, FieldSpec[]> = {
  apple: [
    ['title', 'Title', 30, true],
    ['subtitle', 'Subtitle', 30, true],
    ['keywords', 'Keywords (comma-separated)', 100, true],
    ['promotionalText', 'Promotional Text', 170, false],
    ['description', 'Description', 4000, true, true],
    ['whatsNew', "What's New", 4000, false, true],
    ['supportUrl', 'Support URL', 0, false],
    ['marketingUrl', 'Marketing URL', 0, false],
  ],
  google: [
    ['title', 'Title', 30, true],
    ['shortDescription', 'Short Description', 80, true],
    ['fullDescription', 'Full Description', 4000, true, true],
    ['tags', 'Tags (comma-separated)', 0, false],
  ],
  microsoft: [
    ['productName', 'Product Name', 256, true],
    ['shortDescription', 'Short Description', 1000, true],
    ['description', 'Description', 10000, true, true],
    ['searchTerms', 'Search Terms (semicolon-separated)', 0, false],
    ['whatsNew', "What's New", 1500, false, true],
  ],
};

/* ── validation ─────────────────────────────────────────────────── */
export type Level = 'ok' | 'warn' | 'err';

export const storeObj = (p: Project, lang: string, store: StoreId): any =>
  p.text[lang]?.info?.[STORE_KEY[store]] ?? null;

export function fieldValue(p: Project, lang: string, store: StoreId, key: string): string {
  let v = (storeObj(p, lang, store) || {})[key];
  if (Array.isArray(v)) v = v.join(', ');
  return v == null ? '' : String(v);
}
export function fieldLen(key: string, v: string): number {
  return key === 'keywords' ? v.length : [...v].length;
}
export function validateField(p: Project, lang: string, store: StoreId, spec: FieldSpec): { level: Level; msg: string } {
  const [key, , max, required] = spec;
  const v = fieldValue(p, lang, store, key);
  const len = fieldLen(key, v);
  if (required && !v.trim()) return { level: 'err', msg: 'required, empty' };
  if (max && len > max) return { level: 'err', msg: `${len}/${max} over limit` };
  if (!required && !v.trim()) return { level: 'warn', msg: 'empty (optional)' };
  return { level: 'ok', msg: `${len}${max ? '/' + max : ''}` };
}
export function validateListing(p: Project, store: StoreId, lang: string): { level: Level; issues: string[] } {
  const issues: string[] = [];
  for (const spec of FIELD_SPECS[store]) {
    const r = validateField(p, lang, store, spec);
    if (r.level !== 'ok') issues.push(`${spec[1]}: ${r.msg}`);
  }
  const level: Level = issues.some(i => i.includes('required') || i.includes('over limit'))
    ? 'err'
    : issues.length
      ? 'warn'
      : 'ok';
  return { level, issues };
}

/* Case-insensitive screenshot lookup (repos mix zh-Hant / zh-hant). */
export function shotEntry(p: Project, kind: 'raw' | 'store', dev: string, lang: string) {
  const map = p.screenshots[kind]?.[dev] || {};
  if (map[lang]) return { folder: lang, files: map[lang] };
  const key = Object.keys(map).find(k => k.toLowerCase() === lang.toLowerCase());
  return { folder: key || lang, files: key ? map[key] : [] };
}
export function screenshotIssues(p: Project, os: OS): string[] {
  const devs = p.platforms[os].devices;
  if (!devs.length) return [];
  const issues: string[] = [];
  for (const dev of devs) {
    for (const lang of p.storeLanguages) {
      const n = shotEntry(p, 'raw', dev, lang).files.length;
      if (n === 0) issues.push(`${dev} / ${lang}: no screenshots`);
      else if (n > 10) issues.push(`${dev} / ${lang}: ${n} (max 10)`);
    }
  }
  return issues;
}
export const activeStores = (p: Project): StoreId[] => [...new Set(p.settings.targets.map(osToStore))];

/** Recompute platform availability/devices locally (mirrors the server). */
export function recomputePlatforms(p: Project): Project['platforms'] {
  const screens = p.config.screens || {};
  const info = p.config.info || {};
  const dev = (k: string) => (screens[k] ? Object.keys(screens[k]) : []);
  return {
    ios: { available: !!screens.ios || !!info.appleAppStore, devices: dev('ios') },
    ipados: { available: !!screens.ipados, devices: dev('ipados') },
    macos: { available: !!screens.macos || !!info.appleAppStore?.platforms?.macos, devices: dev('macos') },
    android: { available: !!screens.android || !!info.googlePlay, devices: dev('android') },
    windows: { available: !!info.microsoftStore, devices: dev('windows') },
  };
}
