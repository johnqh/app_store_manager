import * as React from 'react';
import { MasterDetailLayout, MasterListItem } from '@sudobility/components';
import { Squares2X2Icon, DevicePhoneMobileIcon, PhotoIcon, DocumentTextIcon, LanguageIcon, CommandLineIcon } from '@heroicons/react/24/outline';
import { api, type BrowseResult, type RecentEntry } from './api';
import { cn } from './lib';
import type { Project, RunState } from './types';
import { Badge, Button, Card, ToastProvider } from './ui';
import { Overview } from './tabs/Overview';
import { Devices } from './tabs/Devices';
import { StoreText } from './tabs/StoreText';
import { Screenshots } from './tabs/Screenshots';
import { Languages } from './tabs/Languages';
import { Run } from './tabs/Run';

/* ── shared app context ─────────────────────────────────────────── */
interface AppCtxValue {
  project: Project;
  reload: () => Promise<void>;
  patch: (updater: (p: Project) => void) => void;
  lang: string;
  setLang: (l: string) => void;
  storeTab: 'apple' | 'google' | 'microsoft';
  setStoreTab: (s: 'apple' | 'google' | 'microsoft') => void;
  runScript: (script: string, args: string[]) => Promise<number>;
}
const AppCtx = React.createContext<AppCtxValue | null>(null);
export const useApp = () => {
  const v = React.useContext(AppCtx);
  if (!v) throw new Error('AppCtx missing');
  return v;
};

type IconType = React.ComponentType<{ className?: string }>;
const TABS: { id: string; label: string; icon: IconType }[] = [
  { id: 'overview', label: 'Overview', icon: Squares2X2Icon },
  { id: 'devices', label: 'Devices', icon: DevicePhoneMobileIcon },
  { id: 'languages', label: 'Languages', icon: LanguageIcon },
  { id: 'screenshots', label: 'Screenshots', icon: PhotoIcon },
  { id: 'text', label: 'Store Text', icon: DocumentTextIcon },
  { id: 'run', label: 'Run Scripts', icon: CommandLineIcon },
];

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function Root() {
  const [project, setProject] = React.useState<Project | null>(null);
  const [tab, setTab] = React.useState('overview');
  // Mobile master-detail state: show the nav list or the selected tab's content.
  const [mobileView, setMobileView] = React.useState<'navigation' | 'content'>('navigation');
  const [lang, setLang] = React.useState('en');
  const [storeTab, setStoreTab] = React.useState<'apple' | 'google' | 'microsoft'>('apple');
  const [picking, setPicking] = React.useState(false);
  const [runs, setRuns] = React.useState<RunState[]>([]);

  const openProject = React.useCallback(async (dir: string) => {
    const p = await api.project(dir);
    setProject(p);
    setLang(p.storeLanguages.includes('en') ? 'en' : p.storeLanguages[0] || 'en');
    setTab('overview');
    setPicking(false);
  }, []);

  const reload = React.useCallback(async () => {
    if (!project) return;
    setProject(await api.project(project.dir));
  }, [project]);

  const patch = React.useCallback((updater: (p: Project) => void) => {
    setProject(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      updater(next);
      return next;
    });
  }, []);

  React.useEffect(() => {
    api
      .recent()
      .then(r => {
        if (r.recent[0]?.exists) openProject(r.recent[0].dir);
        else setPicking(true);
      })
      .catch(() => setPicking(true));
  }, [openProject]);

  /* run management (kept here so output survives tab switches) */
  const startRun = React.useCallback(
    (script: string, args: string[]): Promise<number> =>
      new Promise(async resolve => {
        if (!project) return resolve(-1);
        const { runId, label } = await api.run(project.dir, script, args);
        setRuns(rs => [{ id: runId, script, label, output: `$ app_store/scripts/${script}.sh ${args.join(' ')}\n`, status: 'running', code: null }, ...rs]);
        const es = new EventSource(`/api/run/${runId}/stream`);
        es.onmessage = e => {
          const m = e.data.match(/^__EXIT__ (-?\d+)/);
          if (m) {
            const code = Number(m[1]);
            es.close();
            setRuns(rs => rs.map(r => (r.id === runId ? { ...r, status: code === 0 ? 'done' : 'error', code, output: r.output + `\n[exit ${code}]\n` } : r)));
            resolve(code);
            return;
          }
          setRuns(rs => rs.map(r => (r.id === runId ? { ...r, output: r.output + e.data + '\n' } : r)));
        };
        es.onerror = () => {
          es.close();
          setRuns(rs => rs.map(r => (r.id === runId && r.status === 'running' ? { ...r, status: 'error' } : r)));
          resolve(-1);
        };
      }),
    [project],
  );
  const runSequence = React.useCallback(
    async (steps: [string, string[]][]) => {
      for (const [script, args] of steps) {
        const code = await startRun(script, args);
        if (code !== 0) break;
      }
    },
    [startRun],
  );

  if (!project) {
    return (
      <div className="min-h-full bg-background text-foreground">
        <Topbar onChange={() => setPicking(true)} />
        <div className="text-center text-muted-foreground py-24 px-5">
          <h1 className="text-xl font-semibold text-foreground mb-2">Select a project</h1>
          <p className="mb-5">Pick a project that contains an app_store/ folder.</p>
          <Button variant="primary" onClick={() => setPicking(true)}>Select Project…</Button>
        </div>
        {picking && <ProjectModal onPick={openProject} onClose={() => setPicking(false)} />}
      </div>
    );
  }

  const ctx: AppCtxValue = { project, reload, patch, lang, setLang, storeTab, setStoreTab, runScript: startRun };
  const goto = (id: string) => {
    setTab(id);
    setMobileView('content');
  };

  return (
    <AppCtx.Provider value={ctx}>
      {/* Fixed-height shell: the window never scrolls. MasterDetailLayout fills
          the space under the top bar and gives the master and detail panels
          their own independent scroll (it is flex-1/min-h-0 internally, so it
          needs a bounded-height parent — hence h-full + overflow-hidden here). */}
      <div className="h-full bg-background text-foreground flex flex-col overflow-hidden">
        <Topbar projectDir={project.dir} onChange={() => setPicking(true)} />
        <MasterDetailLayout
          masterTitle="App Store Manager"
          masterWidth={208}
          detailMaxWidth={1100}
          contentKey={tab}
          mobileView={mobileView}
          onBackToNavigation={() => setMobileView('navigation')}
          masterContent={
            <nav className="flex flex-col gap-0.5 p-2">
              {TABS.map(t => (
                <MasterListItem key={t.id} isSelected={tab === t.id} onClick={() => goto(t.id)} icon={t.icon} label={t.label} />
              ))}
            </nav>
          }
          detailContent={
            <div className="p-4 sm:p-6">
              {tab === 'overview' && <Overview goto={goto} />}
              {tab === 'devices' && <Devices />}
              {tab === 'screenshots' && <Screenshots />}
              {tab === 'text' && <StoreText />}
              {tab === 'languages' && <Languages />}
              {tab === 'run' && <Run runs={runs} startRun={startRun} runSequence={runSequence} clear={() => setRuns([])} />}
            </div>
          }
        />
      </div>
      {picking && <ProjectModal onPick={openProject} onClose={() => setPicking(false)} />}
    </AppCtx.Provider>
  );
}

function Topbar({ projectDir, onChange }: { projectDir?: string; onChange: () => void }) {
  return (
    <header className="flex items-center gap-3.5 px-5 py-2.5 border-b border-border bg-card shrink-0 z-20">
      <span className="font-bold tracking-wide">📦 App Store Manager</span>
      {projectDir && <span className="text-xs text-muted-foreground font-mono">{projectDir}</span>}
      <span className="flex-1" />
      {projectDir && <Button variant="ghost" size="sm" onClick={onChange}>Change project</Button>}
    </header>
  );
}

/* ── project picker modal ───────────────────────────────────────── */
function ProjectModal({ onPick, onClose }: { onPick: (dir: string) => void; onClose: () => void }) {
  const [recent, setRecent] = React.useState<RecentEntry[]>([]);
  const [browse, setBrowse] = React.useState<BrowseResult | null>(null);

  const go = React.useCallback((dir?: string) => api.browse(dir).then(setBrowse), []);
  React.useEffect(() => {
    api.recent().then(r => {
      setRecent(r.recent);
      go(r.recent[0]?.dir);
    });
  }, [go]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card text-card-foreground border border-border rounded-xl w-[640px] max-w-[92vw] max-h-[82vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border font-semibold">Select Project</div>
        <div className="px-5 py-3.5 overflow-auto">
          {recent.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent</div>
              {recent.map(r => (
                <div key={r.dir} className="flex items-center px-2.5 py-2 rounded-md hover:bg-muted cursor-pointer" onClick={() => onPick(r.dir)}>
                  <span className={cn('font-mono text-sm', !r.exists && 'text-muted-foreground')}>{(r.exists ? '📦 ' : '⚠️ ') + r.dir}</span>
                </div>
              ))}
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-3">Browse</div>
            </>
          )}
          {browse && (
            <>
              <div className="font-mono text-xs text-muted-foreground break-all mb-2.5">
                {browse.path}
                {browse.hasAppStore && '   ✓ has app_store'}
              </div>
              {browse.parent && (
                <div className="flex items-center px-2.5 py-2 rounded-md hover:bg-muted cursor-pointer" onClick={() => go(browse.parent!)}>
                  ⬆ ..
                </div>
              )}
              {browse.entries.map(e => (
                <div key={e.name} className="flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-muted cursor-pointer" onClick={() => go(browse.path + '/' + e.name)}>
                  <span>{(e.hasAppStore ? '📦 ' : '📁 ') + e.name}</span>
                  {e.hasAppStore && <Badge tone="ok">app_store</Badge>}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="px-5 py-3.5 border-t border-border flex gap-2.5 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!browse?.hasAppStore} onClick={() => browse && onPick(browse.path)}>
            Open this folder
          </Button>
        </div>
      </div>
    </div>
  );
}
