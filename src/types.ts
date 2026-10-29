export type OS = 'ios' | 'ipados' | 'macos' | 'android' | 'windows';
export type StoreId = 'apple' | 'google' | 'microsoft';

export interface LangInfo {
  dir: string;
  code: string;
  name?: string;
}
export interface PlatformInfo {
  available: boolean;
  devices: string[];
}
export interface Caption {
  title?: string;
  text?: string;
}
export interface LangText {
  info: any;
  screens: Caption[] | null;
}

export interface Project {
  dir: string;
  name: string;
  hasAppStore: boolean;
  config: {
    info?: any;
    languages?: string[];
    paths?: string[];
    screens?: Record<string, Record<string, Record<string, string>>>;
  };
  configErrors: Record<string, string>;
  appLanguages: LangInfo[];
  storeLanguages: string[];
  platforms: Record<OS, PlatformInfo>;
  text: Record<string, LangText>;
  screenshots: {
    raw: Record<string, Record<string, string[]>>;
    store: Record<string, Record<string, string[]>>;
  };
  /** Device key → pixel size ("WxH") of its first composed store image, if any. */
  storeResolutions: Record<string, string>;
  settings: { targets: OS[] };
}

/** Host-enumerated device options (installed simulators/runtimes/AVDs). */
export interface HostDeviceOptions {
  simulators: { ios: string[]; ipados: string[] };
  runtimes: string[];
  avds: string[];
}

export interface RunState {
  id: string;
  script: string;
  label: string;
  output: string;
  status: 'running' | 'done' | 'error';
  code: number | null;
}
