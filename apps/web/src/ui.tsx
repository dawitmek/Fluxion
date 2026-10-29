import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatKey, keyProblem, type Modifier } from '@fluxion/shared';
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
// Key codes as people know them: KeyA -> A, ArrowLeft -> ←, Digit1 -> 1, Control+Shift+KeyE -> Ctrl+Shift+E.
export function keyLabel(code: string): string {
  if (code.includes('+')) return code.split('+').map(keyLabel).join('+');
  const names: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Control: 'Ctrl' };
  return names[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '').replace(/(Left|Right)$/, ' $1');
}

function Keycaps({ value }: { value: string }) {
  const parts = value.split('+');
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="key-plus">+</span>}
          <kbd className="kbd">{keyLabel(part)}</kbd>
        </span>
      ))}
    </>
  );
}

const MODIFIER_CODES: Record<string, Modifier> = {
  ControlLeft: 'Control',
  ControlRight: 'Control',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
};

const heldModifiers = (e: KeyboardEvent | React.KeyboardEvent): Modifier[] =>
  [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as Modifier[];

// Records a key or combination by pressing it. Click (or focus and press Enter), then press the keys; Escape cancels.
export function KeyCapture({ value, onChange, label = 'Key' }: { value: string; onChange: (key: string) => void; label?: string }) {
  const [listening, setListening] = useState(false);
  const [held, setHeld] = useState<Modifier[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const shiftAlone = useRef<string | null>(null); // a Shift key pressed with nothing else yet

  const stop = () => {
    setListening(false);
    setHeld([]);
    shiftAlone.current = null;
  };
  const accept = (key: string) => {
    const reason = keyProblem(key);
    if (reason) return setProblem(reason);
    setProblem(null);
    stop();
    if (key !== value) onChange(key);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!listening) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setListening(true);
        setProblem(null);
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === 'Escape' && heldModifiers(e).length === 0) return stop();
    if (e.metaKey || e.code.startsWith('Meta') || e.code.startsWith('OS')) {
      return setProblem("Win and Cmd can't be part of a command");
    }
    const modifier = MODIFIER_CODES[e.code];
    if (modifier) {
      setHeld(heldModifiers(e));
      shiftAlone.current = modifier === 'Shift' && !e.ctrlKey && !e.altKey ? e.code : null;
      return;
    }
    shiftAlone.current = null;
    accept(formatKey({ modifiers: heldModifiers(e), key: e.code }));
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (!listening) return;
    e.preventDefault();
    // Shift pressed and let go on its own means Shift is the key.
    if (shiftAlone.current && e.code === shiftAlone.current) return accept(shiftAlone.current);
    setHeld(heldModifiers(e));
  };

  return (
    <span className="key-capture-wrap">
      <button
        type="button"
        className={`input key-capture ${listening ? 'listening' : ''}`}
        aria-label={`${label}: ${keyLabel(value)}. ${listening ? 'Press the keys, or Escape to cancel.' : 'Press Enter to change.'}`}
        onClick={() => (setListening(!listening), setProblem(null), setHeld([]))}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => (stop(), setProblem(null))}
      >
        {listening ? (
          held.length > 0 ? (
            <span className="muted">{held.map((m) => keyLabel(m)).join('+')}+…</span>
          ) : (
            <span className="muted">Press keys…</span>
          )
        ) : (
          <Keycaps value={value} />
        )}
      </button>
      {problem && (
        <span className="key-capture-problem" role="alert">
          {problem}
        </span>
      )}
    </span>
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
