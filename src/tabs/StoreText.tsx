import * as React from 'react';
import { useApp } from '../App';
import { api } from '../api';
import { FIELD_SPECS, STORE_KEY, STORE_LABEL, activeStores, cn, fieldLen, type FieldSpec } from '../lib';
import type { LangText, StoreId } from '../types';
import { Button, Card, Dropdown, Field, Input, PageHeader, Textarea, useToast } from '../ui';

export function StoreText() {
  const { project, reload, lang, setLang, storeTab, setStoreTab } = useApp();
  const toast = useToast();
  const [draft, setDraft] = React.useState<LangText>(() => structuredClone(project.text[lang] ?? { info: {}, screens: [] }));
  const [dirty, setDirty] = React.useState(false);

  // Reset the working copy whenever the active language changes.
  React.useEffect(() => {
    setDraft(structuredClone(project.text[lang] ?? { info: {}, screens: [] }));
    setDirty(false);
  }, [lang, project]);

  if (!project.storeLanguages.length) {
    return (
      <>
        <PageHeader title="Store Text" />
        <Card>No store-text languages yet. Set them up in the Languages tab.</Card>
      </>
    );
  }

  const stores = activeStores(project);
  const storeKey = STORE_KEY[storeTab];
  const obj: Record<string, any> = (draft.info[storeKey] = draft.info[storeKey] || {});

  const setField = (key: string, raw: string, isArray: boolean) => {
    setDraft(prev => {
      const next = structuredClone(prev);
      const o = (next.info[storeKey] = next.info[storeKey] || {});
      o[key] = isArray ? raw.split(',').map(s => s.trim()).filter(Boolean) : raw;
      return next;
    });
    setDirty(true);
  };

  async function save() {
    await api.saveFile(project.dir, `screenshots/info/${lang}/info.json`, draft.info);

    // Editing the English source invalidates the machine translations: drop the
    // changed keys from every other language so `localize` regenerates them.
    let cleared = 0;
    if (lang === 'en' && project.storeLanguages.some(l => l !== 'en')) {
      const removals = changedKeys(project.text.en?.info, draft.info);
      if (Object.keys(removals).length) {
        cleared = (await api.invalidateTranslations(project.dir, 'en', removals)).removed;
      }
    }

    await reload();
    setDirty(false);
    toast('Saved store text for ' + lang + (cleared ? ` · cleared ${cleared} stale translated field${cleared === 1 ? '' : 's'}` : ''));
  }

  return (
    <>
      <PageHeader title="Store Text" subtitle="Per-language listing text (app_store/screenshots/info/<lang>/)." />

      <div className="flex items-center gap-3 mb-3.5">
        <span className="text-xs text-muted-foreground">Language</span>
        <Dropdown value={lang} onValueChange={setLang} className="w-40" options={project.storeLanguages.map(l => ({ value: l, label: l }))} />
        <span className="flex-1" />
        <Button variant="primary" disabled={!dirty} onClick={save}>Save {lang}</Button>
      </div>

      <div className="flex gap-1.5 border-b border-border mb-4 flex-wrap">
        {(['apple', 'google', 'microsoft'] as StoreId[]).map(store => (
          <button
            key={store}
            onClick={() => setStoreTab(store)}
            className={cn('px-3 py-2 border-b-2 text-sm', storeTab === store ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground')}
          >
            {STORE_LABEL[store]}
            {!stores.includes(store) && ' (not targeted)'}
          </button>
        ))}
      </div>

      <Card>
        {FIELD_SPECS[storeTab].map(spec => (
          <FieldEditor key={spec[0]} spec={spec} obj={obj} onChange={setField} />
        ))}
      </Card>
    </>
  );
}

/** Keys whose value differs between the old and new English listing, grouped
 *  by store block (appleAppStore / googlePlay / microsoftStore). */
function changedKeys(oldInfo: any, newInfo: any): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const sk of Object.values(STORE_KEY)) {
    const o = oldInfo?.[sk] ?? {};
    const n = newInfo?.[sk] ?? {};
    const changed = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter(
      k => JSON.stringify(o[k]) !== JSON.stringify(n[k]),
    );
    if (changed.length) out[sk] = changed;
  }
  return out;
}

function FieldEditor({ spec, obj, onChange }: { spec: FieldSpec; obj: Record<string, any>; onChange: (key: string, raw: string, isArray: boolean) => void }) {
  const [key, label, max, required, multiline] = spec;
  let v = obj[key];
  const isArray = Array.isArray(v);
  if (isArray) v = v.join(', ');
  v = v == null ? '' : String(v);
  const len = fieldLen(key, v);
  const over = !!max && len > max;
  const counter = max ? `${len} / ${max}` : `${len}`;

  return (
    <Field label={label + (required ? ' *' : '')} counter={counter} counterOver={over}>
      {multiline ? (
        <Textarea rows={6} value={v} className={over ? 'border-destructive' : ''} onChange={val => onChange(key, val, isArray)} />
      ) : (
        <Input value={v} className={over ? 'border-destructive' : ''} onChange={e => onChange(key, e.target.value, isArray)} />
      )}
    </Field>
  );
}
