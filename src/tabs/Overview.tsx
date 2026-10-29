import * as React from 'react';
import { useApp } from '../App';
import { api } from '../api';
import {
  OS_LABEL,
  PLATFORM_ORDER,
  STORE_LABEL,
  activeStores,
  cn,
  screenshotIssues,
  validateListing,
  type Level,
} from '../lib';
import type { OS } from '../types';
import { Badge, Button, Card, PageHeader, SectionTitle, useToast } from '../ui';

const ICON: Record<Level, string> = { ok: '✅', warn: '🟡', err: '❌' };

function CheckRow({ level, title, detail, onClick }: { level: Level; title: string; detail: string; onClick?: () => void }) {
  return (
    <li className={cn('flex gap-2.5 items-start py-1.5 border-b border-border last:border-0', onClick && 'cursor-pointer')} onClick={onClick}>
      <span className="w-5 text-center shrink-0">{ICON[level]}</span>
      <div>
        <div>{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </li>
  );
}

export function Overview({ goto }: { goto: (tab: string) => void }) {
  const { project, patch, setLang, setStoreTab } = useApp();
  const toast = useToast();
  const P = project;

  async function toggleTarget(os: OS, on: boolean) {
    const targets = new Set(P.settings.targets);
    on ? targets.add(os) : targets.delete(os);
    const next = { targets: [...targets] as OS[] };
    patch(p => {
      p.settings = next;
    });
    await api.saveSettings(P.dir, next);
  }

  if (!P.hasAppStore) {
    return (
      <>
        <PageHeader title={P.name} />
        <Card>⚠️ No app_store/ folder found in this project.</Card>
      </>
    );
  }

  const stores = activeStores(P);

  return (
    <>
      <PageHeader title={P.name} subtitle="Submission readiness overview" />

      <Card>
        <SectionTitle className="mt-0">Submit to</SectionTitle>
        <p className="text-xs text-muted-foreground mb-3">
          Detected from screens.json + info.json. iOS/iPadOS/macOS → Apple, Android → Google, Windows → Microsoft.
        </p>
        <div className="flex gap-2.5 flex-wrap">
          {PLATFORM_ORDER.map(os => {
            const av = P.platforms[os].available;
            const on = P.settings.targets.includes(os);
            return (
              <label
                key={os}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1.5 border rounded-full select-none',
                  !av ? 'opacity-50 border-border' : on ? 'border-primary bg-primary/10 cursor-pointer' : 'border-border cursor-pointer',
                )}
              >
                <input type="checkbox" checked={on} disabled={!av} onChange={e => toggleTarget(os, e.target.checked)} />
                {OS_LABEL[os]}
                {!av && <span className="text-xs text-muted-foreground">(n/a)</span>}
              </label>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle className="mt-0">Store listings</SectionTitle>
        <ul className="list-none p-0 m-0">
          {stores.flatMap(store => [
            ...P.storeLanguages.map(lang => {
              const r = validateListing(P, store, lang);
              return (
                <CheckRow
                  key={store + lang}
                  level={r.level}
                  title={`${STORE_LABEL[store]} · ${lang}`}
                  detail={r.issues.length ? r.issues.join('; ') : 'all required fields OK'}
                  onClick={() => {
                    setStoreTab(store);
                    setLang(lang);
                    goto('text');
                  }}
                />
              );
            }),
            ...P.appLanguages
              .filter(al => !P.storeLanguages.includes(al.dir))
              .map(al => (
                <CheckRow key={store + 'miss' + al.dir} level="warn" title={`${STORE_LABEL[store]} · ${al.dir}`} detail="no store text folder — set up in Languages" onClick={() => goto('languages')} />
              )),
          ])}
          {!stores.length && <li className="py-1.5">No target platforms selected.</li>}
        </ul>
      </Card>

      <Card>
        <SectionTitle className="mt-0">Screenshots</SectionTitle>
        <ul className="list-none p-0 m-0">
          {P.settings.targets
            .filter(os => P.platforms[os].devices.length)
            .map(os => {
              const iss = screenshotIssues(P, os);
              return (
                <CheckRow
                  key={os}
                  level={iss.length ? 'err' : 'ok'}
                  title={OS_LABEL[os]}
                  detail={iss.length ? iss.slice(0, 4).join('; ') + (iss.length > 4 ? ` … +${iss.length - 4}` : '') : 'all devices/languages present'}
                  onClick={() => goto('screenshots')}
                />
              );
            })}
          {!P.settings.targets.some(os => P.platforms[os].devices.length) && <li className="py-1.5">No capture devices for selected platforms.</li>}
        </ul>
      </Card>

      <Card>
        <SectionTitle className="mt-0">Quick actions</SectionTitle>
        <div className="flex gap-2.5 flex-wrap">
          <Button variant="primary" onClick={() => goto('run')}>Open Run Scripts →</Button>
          <Button variant="outline" onClick={() => goto('devices')}>Manage devices</Button>
          <Button variant="ghost" onClick={() => toast('Tip: set targets above, then run capture_raw in Run Scripts')}>?</Button>
        </div>
      </Card>
    </>
  );
}
