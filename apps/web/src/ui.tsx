import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ALLOWED_KEYS } from '@fluxion/shared';
import { ApiError } from './api';

export function useError() {
  const [error, setError] = useState<string | null>(null);
  // Wraps an async action so its failure shows up in the card that triggered it.
  const guard = (action: () => Promise<unknown>) => () => {
    setError(null);
    return action().catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };
  return { error, guard, setError };
}

export function ErrorNotice({ error }: { error: string | null }) {
  return error ? (
    <p className="notice error" role="alert">
      {error}
    </p>
  ) : null;
}

export function Card({
  title,
  description,
  actions,
  children,
  id,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const headingId = id ?? `card-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section className="card stack" aria-labelledby={headingId}>
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 id={headingId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// Saves on blur so typing doesn't send a request per keystroke.
// After a save, shows whatever the parent reloaded: the new value, or the old one if the save failed.
function useSavedText(value: string) {
  const [text, setText] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => setText(value), [value]);
  const save = (onSave: () => Promise<unknown> | void) => Promise.resolve(onSave()).then(() => setText(latest.current));
  return { text, setText, revert: () => setText(value), save };
}

export function TextCell({
  value,
  onSave,
  label,
  placeholder,
  required,
  type,
}: {
  value: string;
  onSave: (v: string) => Promise<unknown> | void;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  const { text, setText, revert, save } = useSavedText(value);
  return (
    <input
      className="input"
      type={type}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = text.trim();
        if (next === value || (required && !next)) return revert();
        void save(() => onSave(next));
      }}
    />
  );
}

export function NumberCell({
  value,
  min,
  max,
  onSave,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onSave: (n: number) => Promise<unknown> | void;
  label?: string;
}) {
  const { text, setText, revert, save } = useSavedText(String(value));
  return (
    <input
      className="input short"
      type="number"
      min={min}
      max={max}
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text);
        if (n === value) return;
        if (text.trim() === '' || !Number.isInteger(n) || n < min || n > max) return revert();
        void save(() => onSave(n));
      }}
    />
  );
}

// Key codes as people know them: KeyA -> A, ArrowLeft -> ←, Digit1 -> 1.
export function keyLabel(code: string) {
  const arrows: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  if (arrows[code]) return arrows[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/(Left|Right)$/, ' $1');
}

export function KeySelect({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Key">
      {ALLOWED_KEYS.map((key) => (
        <option key={key} value={key}>
          {keyLabel(key)}
        </option>
      ))}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  children,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {children}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

// One-of-many with a line of help per option.
export function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string, ReactNode])[];
  onChange: (value: T) => void;
}) {
  const name = label.toLowerCase().replace(/\W+/g, '-');
  return (
    <div className="choices" role="radiogroup" aria-label={label}>
      {options.map(([option, title, help]) => (
        <label key={option} className={`choice ${value === option ? 'selected' : ''}`}>
          <input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} />
          <strong>{title}</strong>
          <span>{help}</span>
        </label>
      ))}
    </div>
  );
}
