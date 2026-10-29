import * as React from 'react';
import { useApp } from '../App';
import { api } from '../api';
import { DEVICE_DEFAULTS, DEVICE_FIELDS, DEVICE_GROUPS, EMPTY_HOST_OPTIONS, OS_LABEL, PLATFORM_HEAD, PLATFORM_ORDER, STANDARD_DEVICES, deviceFieldOptions, recomputePlatforms } from '../lib';
import type { HostDeviceOptions, OS } from '../types';
import { Badge, Button, Card, ComboField, Input, PageHeader, SectionTitle, useToast } from '../ui';

interface Dev {
  key: string;
  fields: Record<string, string>;
}
type Draft = Record<OS, Dev[]>;

// Build the editable draft from screens.json, filling any empty store_resolution
// with the real pixel size of a device's existing composed image (storeRes map).
// Returns how many fields were auto-filled so the UI can flag the pending change.
function buildDraft(
  screens: Record<string, Record<string, Record<string, string>>> = {},
  storeRes: Record<string, string> = {},
): { draft: Draft; filled: number; added: number } {
  const d = {} as Draft;
  let filled = 0;
  let added = 0;
  for (const plat of PLATFORM_ORDER) {
    d[plat] = Object.entries(screens[plat] || {}).map(([key, fields]) => {
      const f = { ...fields };
      if (!f.store_resolution && storeRes[key]) {
        f.store_resolution = storeRes[key];
        filled++;
      }
      return { key, fields: f };
    });
    // Scaffold any standard devices for this platform that aren't configured yet
    // (e.g. iPhone always shows iphone_6_9 and iphone_duo).
    for (const std of STANDARD_DEVICES[plat] ?? []) {
      if (!d[plat].some(dev => dev.key === std.key)) {
        d[plat].push({ key: std.key, fields: { ...std.fields } });
        added++;
      }
    }
  }
  return { draft: d, filled, added };
}

export function Devices() {
  const { project, reload, patch } = useApp();
  const toast = useToast();
  const initial = React.useMemo(() => buildDraft(project.config.screens, project.storeResolutions), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = React.useState<Draft>(initial.draft);
  // If composed images filled in missing store resolutions, or standard devices
  // were scaffolded, start dirty so the Save button invites persisting them.
  const [dirty, setDirty] = React.useState(initial.filled > 0 || initial.added > 0);
  const [host, setHost] = React.useState<HostDeviceOptions>(EMPTY_HOST_OPTIONS);
  const [optsError, setOptsError] = React.useState(false);

  React.useEffect(() => {
    api
      .deviceOptions()
      .then(h => {
        setHost(h);
        setOptsError(false);
      })
      .catch(() => setOptsError(true));
  }, []);

  const mutate = (fn: (d: Draft) => void) => {
    setDraft(prev => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  function uniqueKey(plat: OS, base: string) {
    const existing = new Set(draft[plat].map(d => d.key));
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  async function save() {
    const out: Record<string, Record<string, Record<string, string>>> = {};
    for (const plat of PLATFORM_ORDER) {
      const arr = draft[plat];
      if (!arr.length) continue;
      const keys = arr.map(d => d.key.trim());
      if (keys.some(k => !k)) return toast('Every device needs a key');
      if (new Set(keys).size !== keys.length) return toast('Duplicate device keys in ' + OS_LABEL[plat]);
      out[plat] = {};
      arr.forEach(d => (out[plat][d.key.trim()] = { ...d.fields }));
    }
    await api.saveFile(project.dir, 'screens.json', out);
    patch(p => {
      p.config.screens = out;
      p.platforms = recomputePlatforms({ ...p, config: { ...p.config, screens: out } });
    });
    setDirty(false);
    toast('Saved screens.json');
  }

  return (
    <>
      <PageHeader title="Devices" subtitle="Capture devices per platform (app_store/screens.json). The device key is what scripts reference (e.g. --device iphone_6_9)." />

      {optsError && (
        <Card className="border-warning">
          <div className="text-sm">
            <strong>Simulator / Runtime / Emulator dropdowns unavailable.</strong> Couldn't load installed
            devices from the host — the manager server is likely out of date. Stop it and re-run{' '}
            <code className="bg-muted px-1 rounded">bun run server.ts</code> (or <code className="bg-muted px-1 rounded">bun run start</code>),
            then reload. Until then these fields accept free text.
          </div>
        </Card>
      )}

      {initial.added > 0 && (
        <Card variant="info">
          Added {initial.added} standard device{initial.added === 1 ? '' : 's'} (iPhone always shows{' '}
          <strong>iphone_6_9</strong> and <strong>iphone_duo</strong>). Save to keep{initial.added === 1 ? ' it' : ' them'}.
        </Card>
      )}

      {initial.filled > 0 && (
        <Card variant="info">
          Filled {initial.filled} empty <strong>store resolution</strong>
          {initial.filled === 1 ? '' : 's'} from the size of existing composed images. Save to keep{initial.filled === 1 ? ' it' : ' them'}.
        </Card>
      )}

      {DEVICE_GROUPS.map(group => {
        const total = group.platforms.reduce((n, plat) => n + draft[plat].length, 0);
        const multi = group.platforms.length > 1;
        return (
          <Card key={group.label}>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <SectionTitle className="mt-0 mb-0">{group.label}</SectionTitle>
              <Badge>{total + ' device' + (total === 1 ? '' : 's')}</Badge>
              <span className="flex-1" />
              {group.platforms.map(plat => (
                <Button
                  key={plat}
                  variant="outline"
                  size="sm"
                  onClick={() => mutate(d => d[plat].push({ key: uniqueKey(plat, DEVICE_DEFAULTS[plat].key), fields: Object.fromEntries(Object.entries(DEVICE_DEFAULTS[plat]).filter(([k]) => k !== 'key')) }))}
                >
                  {PLATFORM_HEAD[plat][1]}
                </Button>
              ))}
            </div>

            {total === 0 && <p className="text-xs text-muted-foreground">No devices. Add one to capture this platform.</p>}

            {group.platforms.map(plat =>
              draft[plat].map((d, i) => {
                const dup = draft[plat].filter(x => x.key === d.key).length > 1;
                return (
                  <div key={plat + i} className="border border-border rounded-md p-3 mt-2.5">
                    <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                      {/* In a mixed group, tag the row with its platform so iPhone vs iPad is clear. */}
                      {multi && <Badge>{OS_LABEL[plat]}</Badge>}
                      <span className="text-xs text-muted-foreground">Device key</span>
                      <Input className={(dup || !d.key.trim() ? 'border-destructive ' : '') + 'max-w-[280px]'} value={d.key} onChange={e => mutate(dr => (dr[plat][i].key = e.target.value))} />
                      {dup && <Badge tone="err">duplicate key</Badge>}
                      <span className="flex-1" />
                      <Button variant="destructive-outline" size="sm" onClick={() => mutate(dr => dr[plat].splice(i, 1))}>Remove</Button>
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                      {DEVICE_FIELDS[plat].map(([fk, flabel, placeholder]) => {
                        const setField = (v: string) =>
                          mutate(dr => {
                            if (v) dr[plat][i].fields[fk] = v;
                            else delete dr[plat][i].fields[fk];
                          });
                        // For store_resolution, offer the real size of this device's
                        // composed image as the first (recommended) choice.
                        const composed = fk === 'store_resolution' ? project.storeResolutions[d.key] : undefined;
                        const base = deviceFieldOptions(plat, fk, host);
                        const options = composed && !base.includes(composed) ? [composed, ...base] : base;
                        return (
                          <label key={fk} className="block">
                            <span className="block text-xs text-muted-foreground mb-1.5">
                              {flabel}
                              {composed && <span className="text-info"> · composed {composed}</span>}
                            </span>
                            {options.length ? (
                              <ComboField
                                value={d.fields[fk] ?? ''}
                                options={options}
                                placeholder={placeholder}
                                allowEmpty={fk === 'store_resolution'}
                                onChange={setField}
                              />
                            ) : (
                              <Input value={d.fields[fk] ?? ''} placeholder={placeholder} onChange={e => setField(e.target.value)} />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              }),
            )}
          </Card>
        );
      })}

      <div className="flex gap-2.5 items-center">
        <Button variant="primary" disabled={!dirty} onClick={save}>Save screens.json</Button>
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(buildDraft(project.config.screens, project.storeResolutions).draft);
            setDirty(false);
          }}
        >
          Revert
        </Button>
        <span className="text-xs text-muted-foreground">Changes here update which devices appear in Overview, Screenshots and Run.</span>
      </div>
    </>
  );
}
