import * as React from 'react';
import { useApp } from '../App';
import { api } from '../api';
import { activeStores, cn } from '../lib';
import type { RunState } from '../types';
import { Badge, Button, Card, Dropdown, PageHeader, SectionTitle, useToast } from '../ui';

interface Opts {
  orientation: 'portrait' | 'landscape';
  delay: string;
  device: string;
  skipBuild: boolean;
  skipRelease: boolean;
  debugOnly: boolean;
  dryRun: boolean;
  screenshots: boolean;
  subscriptions: boolean;
  metadataOnly: boolean;
}
const DEFAULT_OPTS: Opts = {
  orientation: 'portrait',
  delay: '3',
  device: '',
  skipBuild: false,
  skipRelease: false,
  debugOnly: false,
  dryRun: false,
  screenshots: true,
  subscriptions: false,
  metadataOnly: false,
};

export function Run({
  runs,
  startRun,
  runSequence,
  clear,
}: {
  runs: RunState[];
  startRun: (script: string, args: string[]) => Promise<number>;
  runSequence: (steps: [string, string[]][]) => Promise<void>;
  clear: () => void;
}) {
  const { project } = useApp();
  const toast = useToast();
  const [o, setO] = React.useState<Opts>(DEFAULT_OPTS);
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO(p => ({ ...p, [k]: v }));

  const allDevices = Object.values(project.platforms).flatMap(p => p.devices);
  const stores = activeStores(project);

  const buildArgs = (script: string): string[] => {
    const a: string[] = [];
    if (script === 'build') {
      if (o.debugOnly) a.push('--debug-only');
      if (o.dryRun) a.push('--dry-run');
    } else if (script === 'prepare') {
      a.push('--device', o.device, '--orientation', o.orientation);
      if (o.dryRun) a.push('--dry-run');
    } else if (script === 'capture') {
      a.push('--device', o.device, '--orientation', o.orientation, '--delay', o.delay);
      if (o.dryRun) a.push('--dry-run');
    } else if (script === 'capture_raw') {
      for (const os of project.settings.targets) if (['ios', 'ipados', 'android'].includes(os)) a.push('--platform', os);
      a.push('--orientation', o.orientation, '--delay', o.delay);
      if (o.skipBuild) a.push('--skip-build');
      if (o.skipRelease) a.push('--skip-release');
      if (o.dryRun) a.push('--dry-run');
    }
    return a;
  };
  const submitArgs = (forceDry?: boolean): string[] => {
    const a = ['--platforms', stores.join(',')];
    if (o.screenshots) a.push('--screenshots');
    if (o.subscriptions) a.push('--subscriptions');
    if (o.metadataOnly) a.push('--metadata-only');
    if (o.skipBuild) a.push('--skip-build');
    if (forceDry || o.dryRun) a.push('--dry-run');
    return a;
  };

  const Chk = ({ k, label }: { k: keyof Opts; label: string }) => (
    <label className={cn('inline-flex items-center gap-2 px-3 py-1.5 border rounded-full cursor-pointer select-none', o[k] ? 'border-primary bg-primary/10' : 'border-border')}>
      <input type="checkbox" checked={o[k] as boolean} onChange={e => set(k, e.target.checked as any)} />
      {label}
    </label>
  );

  return (
    <>
      <PageHeader title="Run Scripts" subtitle={`Runs app_store/scripts/*.sh in ${project.dir} and streams output live.`} />

      <Card>
        <SectionTitle className="mt-0">Options</SectionTitle>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1.5">Orientation</span>
            <Dropdown value={o.orientation} onValueChange={v => set('orientation', v as Opts['orientation'])} className="w-full" options={[{ value: 'portrait', label: 'portrait' }, { value: 'landscape', label: 'landscape' }]} />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1.5">Capture delay (s)</span>
            <input type="number" min={0} value={o.delay} onChange={e => set('delay', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background" />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1.5">Device (prepare/capture)</span>
            <Dropdown value={o.device} onValueChange={v => set('device', v)} className="w-full" placeholder="— pick —" options={allDevices.map(d => ({ value: d, label: d }))} />
          </label>
        </div>
        <div className="flex gap-2.5 mt-2.5 flex-wrap">
          <Chk k="skipBuild" label="skip build" />
          <Chk k="skipRelease" label="skip release" />
          <Chk k="debugOnly" label="debug only" />
          <Chk k="dryRun" label="dry run" />
        </div>
      </Card>

      <Card>
        <SectionTitle className="mt-0">Build &amp; capture</SectionTitle>
        <div className="flex gap-2.5 flex-wrap">
          <Button variant="outline" onClick={() => startRun('build', buildArgs('build'))}>Build</Button>
          <Button variant="outline" onClick={() => (o.device ? startRun('prepare', buildArgs('prepare')) : toast('Pick a device first'))}>Prepare device</Button>
          <Button variant="outline" onClick={() => (o.device ? startRun('capture', buildArgs('capture')) : toast('Pick a device first'))}>Capture device</Button>
          <Button variant="outline" onClick={() => startRun('compose', [])}>Compose frames</Button>
        </div>
        <div className="flex gap-2.5 items-center mt-2.5 flex-wrap">
          <Button variant="primary" onClick={() => startRun('capture_raw', buildArgs('capture_raw'))}>▶ Full capture (capture_raw)</Button>
          <span className="text-xs text-muted-foreground">build → each device: prepare → capture → shutdown, across all languages</span>
        </div>
      </Card>

      <Card>
        <SectionTitle className="mt-0">Submit</SectionTitle>
        <p className="text-xs text-muted-foreground mb-2.5">Platforms from your Overview selection: {stores.length ? stores.join(', ') : 'none selected'}</p>
        <div className="flex gap-2.5 mb-2.5 flex-wrap">
          <Chk k="screenshots" label="upload screenshots" />
          <Chk k="subscriptions" label="subscriptions" />
          <Chk k="metadataOnly" label="metadata only" />
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <Button variant="primary" onClick={() => (stores.length ? startRun('submit', submitArgs()) : toast('Select a platform in Overview'))}>Submit metadata + screenshots</Button>
          <Button variant="ghost" onClick={() => (stores.length ? startRun('submit', submitArgs(true)) : toast('Select a platform'))}>Submit (dry run)</Button>
        </div>
      </Card>

      <Card>
        <SectionTitle className="mt-0">Full pipeline &amp; utilities</SectionTitle>
        <div className="flex gap-2.5 flex-wrap">
          <Button variant="primary" onClick={() => runSequence([['capture_raw', buildArgs('capture_raw')], ['compose', []], ['submit', submitArgs()]])}>
            ▶▶ Full: capture_raw → compose → submit
          </Button>
        </div>
        <div className="flex gap-2.5 mt-2.5 flex-wrap">
          <Button variant="ghost" onClick={() => startRun('status', ['--no-open'])}>status</Button>
          <Button variant="ghost" onClick={() => startRun('doctor', [])}>doctor</Button>
          <Button variant="ghost" onClick={() => startRun('cleanup', [])}>cleanup</Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2.5 mb-2">
          <SectionTitle className="mt-0 mb-0">Output</SectionTitle>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={clear}>Clear</Button>
        </div>
        {!runs.length && <p className="text-xs text-muted-foreground">No runs yet.</p>}
        {runs.map(r => (
          <div key={r.id} className="border border-border rounded-md p-3 mb-3">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="font-mono text-xs bg-muted border border-border px-1.5 py-0.5 rounded">{r.script}</span>
              <span className="text-sm">{r.label}</span>
              <span className="flex-1" />
              <Badge tone={r.status === 'running' ? 'warn' : r.status === 'done' ? 'ok' : 'err'}>
                {r.status === 'running' ? 'running' : r.status === 'done' ? 'done' : 'exit ' + (r.code ?? '?')}
              </Badge>
              {r.status === 'running' && (
                <Button variant="destructive-outline" size="sm" onClick={() => api.stopRun(r.id)}>Stop</Button>
              )}
            </div>
            <Console text={r.output} />
          </div>
        ))}
      </Card>
    </>
  );
}

function Console({ text }: { text: string }) {
  const ref = React.useRef<HTMLPreElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  return (
    <pre ref={ref} className="bg-black/80 border border-border rounded-md font-mono text-xs p-3 overflow-auto whitespace-pre-wrap text-[#cdd3dd]" style={{ height: '30vh' }}>
      {text}
    </pre>
  );
}
