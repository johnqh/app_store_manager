import * as React from 'react';
import { useApp } from '../App';
import { api } from '../api';
import { type Level } from '../lib';
import { Badge, Button, Card, PageHeader, SectionTitle, useToast } from '../ui';

export function Languages() {
  const { project, reload } = useApp();
  const toast = useToast();
  const P = project;
  const [preview, setPreview] = React.useState<string>('');

  const appDirs = P.appLanguages.map(l => l.dir);
  const missing = appDirs.filter(d => !P.storeLanguages.includes(d));
  const extra = P.storeLanguages.filter(d => !appDirs.includes(d));
  const langsDiffer = JSON.stringify([...(P.config.languages || [])].sort()) !== JSON.stringify([...P.appLanguages.map(l => l.code)].sort());

  const icon = (level: Level) => ({ ok: '✅', warn: '🟡', err: '❌' }[level]);

  return (
    <>
      <PageHeader title="Languages" subtitle="Detected from the app (assets/locales) and matched to store-text folders." />

      <Card>
        <SectionTitle className="mt-0">App languages ({appDirs.length})</SectionTitle>
        <ul className="list-none p-0 m-0">
          {P.appLanguages.map(l => {
            const has = P.storeLanguages.includes(l.dir);
            return (
              <li key={l.dir} className="flex gap-2.5 items-start py-1.5 border-b border-border last:border-0">
                <span className="w-5 text-center shrink-0">{icon(has ? 'ok' : 'warn')}</span>
                <div>
                  <div>{l.dir}{l.name ? ' — ' + l.name : ''}</div>
                  <div className="text-xs text-muted-foreground">{has ? 'store text present' : 'no store-text folder (will be created from primary)'}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {extra.length > 0 && (
        <Card>
          <SectionTitle className="mt-0">Store-only languages</SectionTitle>
          <p className="text-xs text-muted-foreground">These have store text but are not in the app: {extra.join(', ')}</p>
        </Card>
      )}

      <Card>
        <SectionTitle className="mt-0">Set up languages</SectionTitle>
        <p className="text-xs text-muted-foreground mb-3">
          {missing.length
            ? `${missing.length} missing store-text folder(s): ${missing.join(', ')}. Creating copies the primary language as a draft, then run \`bun run localize:store\` to translate.`
            : 'All app languages already have store-text folders.'}
        </p>
        <div className="flex gap-2.5">
          <Button
            variant="outline"
            onClick={async () => {
              const r = await api.syncLanguages(P.dir, true);
              setPreview(JSON.stringify(r, null, 2));
            }}
          >
            Preview (dry run)
          </Button>
          <Button
            variant="primary"
            disabled={!missing.length && !langsDiffer}
            onClick={async () => {
              const r = await api.syncLanguages(P.dir, false);
              toast(`Created ${r.created.length} folder(s)${r.languagesChanged ? ', updated languages.json' : ''}`);
              await reload();
            }}
          >
            Set up missing languages
          </Button>
        </div>
        {preview && <pre className="mt-3 rounded-md border border-border bg-black/80 text-xs p-3 overflow-auto font-mono text-[#cdd3dd]">{preview}</pre>}
      </Card>
    </>
  );
}
