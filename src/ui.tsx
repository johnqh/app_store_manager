import * as React from 'react';
import {
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Card as DSCard,
  Badge as DSBadge,
  Input as DSInput,
  TextArea as DSTextArea,
  Heading,
  Text,
} from '@sudobility/components';
import { cn } from './lib';

export { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem };

/** Styled text input — the design-system Input. */
export const Input = DSInput;

/** A labelled dropdown built from the @sudobility/components Select. */
export function Dropdown({
  value,
  onValueChange,
  options,
  placeholder,
  className,
}: {
  value?: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn('w-56', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A dropdown over a known set of values that still allows a custom entry.
 * Picking "Other…" swaps in a text input; a value not in `options` is kept
 * as a selectable item (never silently dropped). `allowEmpty` adds a
 * "— none —" choice that clears the value.
 */
const COMBO_OTHER = '__other__';
const COMBO_NONE = '__none__';
export function ComboField({
  value,
  options,
  placeholder,
  allowEmpty,
  onChange,
  className,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  allowEmpty?: boolean;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [custom, setCustom] = React.useState(false);

  if (custom) {
    return (
      <div className="flex gap-1.5">
        <Input
          autoFocus
          value={value}
          placeholder={placeholder}
          className={className}
          onChange={e => onChange(e.target.value)}
        />
        <Button variant="ghost" size="sm" title="Back to list" onClick={() => setCustom(false)}>
          ↩
        </Button>
      </div>
    );
  }

  // Keep a current value that isn't a preset selectable, so it's never lost.
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select
      value={value ? value : allowEmpty ? COMBO_NONE : undefined}
      onValueChange={v => {
        if (v === COMBO_OTHER) return setCustom(true);
        onChange(v === COMBO_NONE ? '' : v);
      }}
    >
      <SelectTrigger className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value={COMBO_NONE}>— none —</SelectItem>}
        {opts.map(o => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
        <SelectItem value={COMBO_OTHER}>Other…</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Card container — the design-system Card (bordered surface by default). */
export function Card({
  className,
  variant = 'bordered',
  children,
}: {
  className?: string;
  variant?: 'default' | 'bordered' | 'elevated' | 'info' | 'success' | 'warning' | 'error' | 'callout';
  children: React.ReactNode;
}) {
  return (
    <DSCard variant={variant} padding="md" className={cn('mb-3', className)}>
      {children}
    </DSCard>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text as="div" size="xs" weight="semibold" color="muted" transform="uppercase" className={cn('tracking-wide mb-3', className)}>
      {children}
    </Text>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <Heading level={1} size="xl" weight="semibold">{title}</Heading>
      {subtitle && <Text as="p" size="sm" color="muted" className="mt-0.5">{subtitle}</Text>}
    </div>
  );
}

// Map our semantic tone onto the design-system Badge variant.
type BadgeTone = 'ok' | 'warn' | 'err' | 'muted' | 'info';
const BADGE_VARIANT: Record<BadgeTone, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  ok: 'success',
  warn: 'warning',
  err: 'danger',
  info: 'info',
  muted: 'default',
};
export function Badge({ tone = 'muted', children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <DSBadge variant={BADGE_VARIANT[tone]} size="sm" pill>
      {children}
    </DSBadge>
  );
}

/** Multi-line text input — the design-system TextArea (value-based onChange). */
export function Textarea({
  value,
  onChange,
  rows,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  return <DSTextArea value={value} onChange={onChange} rows={rows} placeholder={placeholder} className={className} />;
}

export function Field({
  label,
  counter,
  counterOver,
  children,
}: {
  label: React.ReactNode;
  counter?: string;
  counterOver?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block mb-3.5">
      <span className="flex justify-between mb-1.5 text-xs text-muted-foreground">
        <span>{label}</span>
        {counter != null && <span className={counterOver ? 'text-destructive font-bold' : ''}>{counter}</span>}
      </span>
      {children}
    </label>
  );
}

/* ── toast ──────────────────────────────────────────────────────── */
const ToastCtx = React.createContext<(msg: string) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = React.useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {msg && (
        <div className="fixed bottom-5 right-5 z-[70] rounded-md border border-border bg-card px-4 py-3 text-sm shadow-lg">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
