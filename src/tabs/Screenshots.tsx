import * as React from 'react';
import { useApp } from '../App';
import { api } from '../api';
import { cn, shotEntry } from '../lib';
import type { Caption } from '../types';
import { Badge, Button, Card, Dropdown, Input, PageHeader, useToast } from '../ui';

// The per-screen pipeline stages that exist on disk, in flow order.
const STAGES: { kind: 'raw' | 'store'; label: string; hint: string; empty: string }[] = [
  { kind: 'raw', label: 'Raw capture', hint: 'from the simulator / emulator', empty: 'not captured' },
  { kind: 'store', label: 'Composed (store)', hint: 'framed + captioned for upload', empty: 'not composed' },
];

/** Map sequence number → filename (capture writes <seq>.png, seq = screen order). */
function seqMap(files: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  files.forEach((f, idx) => {
    const n = parseInt(f, 10);
    map[Number.isFinite(n) && n > 0 ? n : idx + 1] = f;
  });
  return map;
}

// One screen: its deep-link path (language-independent) and its caption in each
// language. Editing, reordering and removal all act on these rows, so paths and
// captions stay aligned across every language.
type Row = { path: string; caps: Record<string, Caption> };

export function Screenshots() {
  const { project: P, lang, setLang, reload, runScript } = useApp();
  const toast = useToast();
  const [composing, setComposing] = React.useState<number | null>(null);
  const [uploading, setUploading] = React.useState<number | null>(null);
  const [dragSeq, setDragSeq] = React.useState<number | null>(null);
  const [copying, setCopying] = React.useState(false);

  const targetDevs = new Set(P.settings.targets.flatMap(os => P.platforms[os].devices));
  // Every device configured in screens.json (any platform, targeted or not) plus
  // any that already have screenshots on disk — so a device added in the Devices
  // tab always appears here, regardless of targets.
  const configuredDevs = (Object.keys(P.platforms) as (keyof typeof P.platforms)[]).flatMap(os => P.platforms[os].devices);
  const devices = Array.from(
    new Set([...Object.keys(P.screenshots.raw || {}), ...Object.keys(P.screenshots.store || {}), ...configuredDevs]),
  ).sort();
  const [dev, setDev] = React.useState(() => devices[0] || '');
  React.useEffect(() => {
    if (!devices.includes(dev)) setDev(devices[0] || '');
  }, [devices.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildRows = React.useCallback(
    (): Row[] =>
      (P.config.paths || []).map((path, i) => ({
        path,
        caps: Object.fromEntries(P.storeLanguages.map(l => [l, structuredClone((P.text[l]?.screens?.[i] || {}) as Caption)])),
      })),
    [P],
  );
  const [rows, setRows] = React.useState<Row[]>(buildRows);
  const [dirty, setDirty] = React.useState(false);
  // Rebuild only when the project reloads — NOT on language switch, so edits to
  // several languages survive while moving between them before saving.
  React.useEffect(() => {
    setRows(buildRows());
    setDirty(false);
  }, [buildRows]);

  const mutate = (fn: (r: Row[]) => void) => {
    setRows(prev => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const setPath = (i: number, v: string) => mutate(r => (r[i].path = v));
  const setCaption = (i: number, field: 'title' | 'text', v: string) =>
    mutate(r => (r[i].caps[lang] = { ...(r[i].caps[lang] || {}), [field]: v }));
  const move = (i: number, d: -1 | 1) => mutate(r => ([r[i], r[i + d]] = [r[i + d], r[i]]));
  const removeRow = (i: number) => mutate(r => r.splice(i, 1));
  const addRow = () => mutate(r => r.push({ path: '/', caps: {} }));

  async function save() {
    const newPaths = rows.map(r => r.path.trim());
    if (newPaths.some(p => !p)) return toast('Every screen needs a path');

    if (JSON.stringify(newPaths) !== JSON.stringify(P.config.paths || [])) {
      await api.saveFile(P.dir, 'paths.json', newPaths);
    }
    // Rewrite each language's captions, but only where they actually changed.
    for (const l of P.storeLanguages) {
      const arr = rows.map(r => r.caps[l] || {});
      if (JSON.stringify(arr) !== JSON.stringify(P.text[l]?.screens || [])) {
        await api.saveFile(P.dir, `screenshots/info/${l}/screens.json`, arr);
      }
    }
    await reload();
    setDirty(false);
    toast('Saved paths & captions');
  }

  // Compose a single screen's store image from its raw capture (compose.py --seq).
  async function composeOne(seq: number) {
    if (!dev) return toast('Pick a device first');
    setComposing(seq);
    try {
      const code = await runScript('compose', ['--device', dev, '--lang', lang, '--seq', String(seq), '--force']);
      if (code === 0) {
        await reload();
        toast(`Composed #${seq} (${dev} / ${lang})`);
      } else {
        toast(`Compose #${seq} failed — see Run Scripts`);
      }
    } finally {
      setComposing(null);
    }
  }

  // Save a manually-captured raw screenshot for one screen (drag-and-drop / picker).
  async function uploadRaw(seq: number, file: File) {
    if (!dev) return toast('Pick a device first');
    if (!file.type.startsWith('image/')) return toast('Drop an image file');
    setUploading(seq);
    try {
      await api.uploadRaw(P.dir, dev, lang, seq, file);
      await reload();
      toast(`Saved raw #${seq} (${dev} / ${lang})`);
    } catch (e: any) {
      toast(e?.message || `Upload failed for #${seq}`);
    } finally {
      setUploading(null);
    }
  }

  // Copy the English raw captures into the current language (text-free screens).
  async function useEnglishRaws() {
    if (!dev) return toast('Pick a device first');
    setCopying(true);
    try {
      const { copied } = await api.copyRaw(P.dir, dev, lang, 'en');
      await reload();
      toast(copied ? `Copied ${copied} English raw${copied === 1 ? '' : 's'} → ${lang}` : 'No English raws to copy');
    } catch (e: any) {
      toast(e?.message || 'Copy failed');
    } finally {
      setCopying(false);
    }
  }

  const targeted = targetDevs.has(dev);
  const enRaws = (P.screenshots.raw?.[dev]?.en || []).length;
  const stages = STAGES.map(s => {
    const { folder, files } = shotEntry(P, s.kind, dev, lang);
    return { ...s, folder, files, map: seqMap(files) };
  });
  const raw = stages[0];

  // Captured sequences beyond the declared screens (no row to edit them).
  const maxSeq = Math.max(rows.length, ...stages.flatMap(s => s.files.map(f => parseInt(f, 10) || 0)));
  const extraSeqs = Array.from({ length: Math.max(0, maxSeq - rows.length) }, (_, k) => rows.length + k + 1);

  const StageRow = ({ seq }: { seq: number }) => (
    <div className="flex items-stretch gap-2 flex-wrap sm:flex-nowrap">
      {stages.map((s, idx) => {
        const file = s.map[seq];
        const url = file ? api.screenshotUrl(P.dir, s.kind, dev, s.folder, file) : undefined;
        // ok — present · error — raw missing on a targeted device (red) ·
        // pending — composed missing but raw exists (amber) · none — nothing expected yet
        const state: 'ok' | 'error' | 'pending' | 'none' = file
          ? 'ok'
          : s.kind === 'raw'
            ? targeted ? 'error' : 'none'
            : raw.map[seq] ? 'pending' : 'none';
        const tone = state === 'ok' ? 'muted' : state === 'error' ? 'err' : state === 'pending' ? 'warn' : 'muted';
        const badge = state === 'ok' ? 'ok' : state === 'pending' ? 'pending' : s.empty;
        const isRaw = s.kind === 'raw';
        const busy = isRaw && uploading === seq;
        // The raw cell accepts a dropped image (manual capture) and a click upload.
        const dropProps = isRaw
          ? {
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragSeq(seq); },
              onDragLeave: () => setDragSeq(cur => (cur === seq ? null : cur)),
              onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                setDragSeq(null);
                const f = e.dataTransfer.files?.[0];
                if (f) uploadRaw(seq, f);
              },
            }
          : {};
        return (
          <React.Fragment key={s.kind}>
            {idx > 0 && <div className="self-center text-muted-foreground px-0.5 select-none">→</div>}
            <div
              className={cn('flex-1 min-w-[140px] rounded', isRaw && dragSeq === seq && 'ring-2 ring-ring ring-offset-1 ring-offset-background')}
              {...dropProps}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{s.label}</span>
                <Badge tone={tone}>{busy ? 'uploading' : badge}</Badge>
              </div>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="block">
                  <img
                    loading="lazy"
                    src={url}
                    alt={`${s.label} ${seq}`}
                    className="w-full rounded border border-border bg-black object-contain"
                    style={{ maxHeight: 300 }}
                  />
                </a>
              ) : (
                <div
                  className={cn(
                    'rounded border border-dashed flex items-center justify-center text-center text-xs text-muted-foreground px-2',
                    state === 'error' ? 'border-destructive' : 'border-border',
                    isRaw && dragSeq === seq && 'border-ring bg-muted',
                  )}
                  style={{ height: 160 }}
                >
                  {busy ? 'Uploading…' : isRaw ? 'Drop a screenshot here, or use Upload below' : s.empty}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-1">{s.hint}</div>
              {isRaw && (
                <Button asChild variant="outline" size="sm" className="w-full mt-1.5">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busy || !dev}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadRaw(seq, f);
                        e.currentTarget.value = '';
                      }}
                    />
                    {busy ? 'Uploading…' : url ? 'Replace raw…' : 'Upload raw…'}
                  </label>
                </Button>
              )}
              {s.kind === 'store' && raw.map[seq] && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1.5"
                  disabled={composing !== null}
                  title={dirty ? 'Composes from the last saved captions — Save first to include edits' : undefined}
                  onClick={() => composeOne(seq)}
                >
                  {composing === seq ? 'Composing…' : file ? 'Re-compose' : 'Compose from raw'}
                </Button>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <>
      <PageHeader title="Screenshots" subtitle="Each screen end-to-end: its path, caption, raw capture, and composed (store) image." />

      <div className="flex items-center gap-3 mb-4 flex-wrap sticky top-0 bg-background py-1 z-10">
        <span className="text-xs text-muted-foreground">Device</span>
        <Dropdown
          value={dev}
          onValueChange={setDev}
          className="w-64"
          options={devices.length ? devices.map(d => ({ value: d, label: d + (targetDevs.has(d) ? '' : ' (not targeted)') })) : [{ value: '', label: 'no devices' }]}
        />
        <span className="text-xs text-muted-foreground ml-2">Language</span>
        <Dropdown value={lang} onValueChange={setLang} className="w-40" options={P.storeLanguages.map(l => ({ value: l, label: l }))} />
        {lang !== 'en' && (
          <Button
            variant="outline"
            size="sm"
            disabled={!dev || copying || enRaws === 0}
            title={enRaws === 0 ? 'No English raw screenshots for this device' : `Copy ${enRaws} English raw screenshot${enRaws === 1 ? '' : 's'} into ${lang} (for text-free screens)`}
            onClick={useEnglishRaws}
          >
            {copying ? 'Copying…' : 'Use English raws'}
          </Button>
        )}
        <span className="flex-1" />
        {stages.map(s => (
          <Badge key={s.kind} tone="muted">
            {s.label}: {s.files.length}
          </Badge>
        ))}
        <Button variant="outline" size="sm" onClick={addRow}>+ Add screen</Button>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>

      {!devices.length && <Card>No devices configured — add one in the Devices tab to capture screenshots. You can still edit paths and captions below.</Card>}
      {!rows.length && (
        <Card>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">No screens yet.</span>
            <Button variant="primary" size="sm" onClick={addRow}>+ Add screen</Button>
          </div>
        </Card>
      )}

      {rows.map((row, i) => {
        const seq = i + 1;
        const cap = row.caps[lang] || {};
        return (
          <Card key={i}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="font-mono text-xs bg-muted border border-border px-1.5 py-0.5 rounded shrink-0">#{seq}</span>
              <Input className="font-mono text-xs flex-1" placeholder="/deep/link/path" value={row.path} onChange={e => setPath(i, e.target.value)} />
              <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">↑</Button>
              <Button variant="ghost" size="sm" disabled={i === rows.length - 1} onClick={() => move(i, 1)} title="Move down">↓</Button>
              <Button variant="destructive-outline" size="sm" onClick={() => removeRow(i)}>Remove</Button>
            </div>
            <div className="flex gap-2.5 mb-3">
              <Input placeholder={`Caption title (${lang})`} value={cap.title || ''} onChange={e => setCaption(i, 'title', e.target.value)} />
              <Input placeholder={`Caption subtitle (${lang})`} value={cap.text || ''} onChange={e => setCaption(i, 'text', e.target.value)} />
            </div>
            <StageRow seq={seq} />
          </Card>
        );
      })}

      <div className="flex gap-2.5 mt-1 mb-4">
        <Button variant="outline" onClick={addRow}>+ Add screen</Button>
        <Button variant="primary" disabled={!dirty} onClick={save}>Save</Button>
      </div>

      {extraSeqs.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Badge tone="warn">extra</Badge>
            <span className="text-xs text-muted-foreground">
              Captured screens with no matching path ({extraSeqs.join(', ')}). Add screens above or clean up these captures.
            </span>
          </div>
          {extraSeqs.map(seq => (
            <div key={seq} className="mb-3">
              <div className="font-mono text-xs mb-1">#{seq}</div>
              <StageRow seq={seq} />
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
