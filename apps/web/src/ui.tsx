import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { formatKey, keyProblem, type Modifier } from '@fluxion/shared';
import { ApiError } from './api';
import { Icon, type IconName } from './icons';

export function useError() {
  const [error, setError] = useState<string | null>(null);
  // Wraps an async action so its failure shows up in the card that triggered it.
  const guard = (action: () => Promise<unknown>) => () => {
    setError(null);
    return action().catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };
  return { error, guard, setError };
}

// The theme's hues; each has an ink, a soft background and a fill (see theme.css).
export type Hue = 'red' | 'green' | 'amber' | 'indigo' | 'sky' | 'pink' | 'violet' | 'teal' | 'orange';

// An icon on a tinted tile, so a row can be told apart at a glance.
export function HueIcon({ name, hue, size = 'md' }: { name: IconName; hue: Hue; size?: 'sm' | 'md' }) {
  return (
    <span className={`hue-icon ${hue} ${size}`} aria-hidden="true">
      <Icon name={name} size={size === 'sm' ? 14 : 16} />
    </span>
  );
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
  icon,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  icon?: ReactNode; // sets the title apart, like a screen's name on the Overlay page
}) {
  const headingId = id ?? `card-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section className="card stack" aria-labelledby={headingId}>
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 id={headingId} className={icon ? 'card-title' : undefined}>
            {icon}
            {title}
          </h2>
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

// Every number box can be dragged: up for more, down for less. Steps grow with the number, so a target of 1,000 moves
// by tens. A click without a drag types as usual, and a box already being typed in selects text as usual. The drag
// ends by leaving the box, so ones that save on blur save then.
const NUMBER_DRAG_PX = 4; // per step
const SPINNER_PX = 20; // the browser's up and down arrows, at the right end
export function installNumberDrag() {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  document.addEventListener('mousedown', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'number' || input.disabled || input.readOnly) return;
    if (e.button !== 0 || document.activeElement === input || e.offsetX > input.clientWidth - SPINNER_PX) return;
    const start = Number(input.value) || 0;
    const step = Number(input.step) || 1;
    const by = Math.ceil(Math.max(step, 10 ** (Math.floor(Math.log10(Math.abs(start) || 1)) - 2)) / step) * step;
    const decimals = String(step).split('.')[1]?.length ?? 0;
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    let moved = false;
    const move = (m: MouseEvent) => {
      const dy = e.clientY - m.clientY;
      if (!moved && Math.abs(dy) < 4) return; // a click wobbles a little; that's not a drag
      if (!moved) (moved = true), document.documentElement.classList.add('number-dragging');
      const next = String(Number(Math.min(max, Math.max(min, start + Math.round(dy / NUMBER_DRAG_PX) * by)).toFixed(decimals)));
      if (next === input.value) return;
      setValue.call(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true })); // so React's onChange sees it
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!moved) return;
      document.documentElement.classList.remove('number-dragging');
      input.blur();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

// A number you can drag across to change, step with the buttons at each end, or click to type.
// Saves when a drag ends, or once the buttons or arrow keys have been left alone for a moment.
const PX_PER_STEP = 2;
const SETTLE_MS = 400;
export function Scrubber({
  value,
  min,
  max,
  step = 1,
  buttonStep = step,
  unit = '',
  label,
  onSave,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  buttonStep?: number;
  unit?: string;
  label: string;
  onSave: (n: number) => Promise<unknown> | void;
}) {
  const [draft, setDraft] = useState<number | null>(null); // shown until the save comes back
  const [editing, setEditing] = useState<string | null>(null); // the typed text while typing
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const latest = useRef(value);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = draft ?? value;
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  const commit = (n: number) => {
    clearTimeout(timer.current);
    if (n === value) return setDraft(null);
    void Promise.resolve(onSave(n)).finally(() => setDraft(null));
  };
  const show = (n: number) => {
    latest.current = clamp(n);
    setDraft(latest.current);
  };
  // Buttons and keys: show the new number now, save once they stop.
  const nudge = (by: number) => {
    show(shown + by);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(latest.current), SETTLE_MS);
  };
  const type = () => {
    const n = Number(editing);
    setEditing(null);
    if (editing?.trim() && Number.isFinite(n)) commit(clamp(n));
  };

  return (
    <div className="scrubber">
      <button type="button" aria-label={`Decrease ${label}`} disabled={shown <= min} onClick={() => nudge(-buttonStep)}>
        −
      </button>
      {editing !== null ? (
        <input
          className="scrubber-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={editing}
          aria-label={label}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={type}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(null);
          }}
        />
      ) : (
        <div
          className={`scrubber-track ${dragging ? 'dragging' : ''}`}
          role="spinbutton"
          tabIndex={0}
          aria-label={label}
          aria-valuenow={shown}
          aria-valuemin={min}
          aria-valuemax={max}
          title="Drag to change, or click to type"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, start: shown, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            if (!d.moved && Math.abs(dx) < 4) return; // a click wobbles a little; that's not a drag
            if (!d.moved) (d.moved = true), setDragging(true);
            show(d.start + Math.round(dx / PX_PER_STEP) * step);
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (!d) return;
            setDragging(false);
            if (d.moved) commit(latest.current);
            else setEditing(String(shown));
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            const by = (e.shiftKey ? 10 : 1) * step;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), nudge(by));
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), nudge(-by));
            if (e.key === 'Enter') setEditing(String(shown));
          }}
        >
          <span className="scrubber-fill" style={{ width: `${((shown - min) / (max - min)) * 100}%` }} />
          <span className="scrubber-value">
            {shown}
            {unit}
          </span>
        </div>
      )}
      <button type="button" aria-label={`Increase ${label}`} disabled={shown >= max} onClick={() => nudge(buttonStep)}>
        +
      </button>
    </div>
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
          <>
            <span className="key-capture-dot" aria-hidden="true" />
            {held.length > 0 ? (
              <>
                <Keycaps value={held.join('+')} />
                <span className="key-plus">+ …</span>
              </>
            ) : (
              <span className="key-capture-prompt">Press a key or combination</span>
            )}
          </>
        ) : (
          <Keycaps value={value} />
        )}
      </button>
      {problem ? (
        <span className="key-capture-problem" role="alert">
          {problem}
        </span>
      ) : (
        listening && <span className="key-capture-hint">Esc to cancel</span>
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
  // The option just clicked gets a short "pop" (not every selected option on page load).
  const [popped, setPopped] = useState<T | null>(null);
  return (
    <div className="choices" role="radiogroup" aria-label={label}>
      {options.map(([option, title, help]) => (
        <label
          key={option}
          className={`choice ${value === option ? 'selected' : ''} ${popped === option ? 'pop' : ''}`}
          onAnimationEnd={() => setPopped(null)}
        >
          <input type="radio" name={name} checked={value === option} onChange={() => (setPopped(option), onChange(option))} />
          <strong>{title}</strong>
          <span>{help}</span>
        </label>
      ))}
    </div>
  );
}

// A segmented control: a row of options with a highlight that slides to the chosen one.
export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // Measures the chosen button, again whenever the control resizes (its options can wrap onto two lines).
  useLayoutEffect(() => {
    const measure = () => {
      const chosen = group.current?.querySelector<HTMLElement>('[aria-checked="true"]');
      setBox(chosen ? { left: chosen.offsetLeft, top: chosen.offsetTop, width: chosen.offsetWidth, height: chosen.offsetHeight } : null);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(group.current!);
    return () => resize.disconnect();
  }, [value]);

  return (
    <div className="seg sliding" role="radiogroup" aria-label={label} ref={group}>
      {box && <span className="seg-indicator" style={box} aria-hidden="true" />}
      {options.map(([option, title]) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>
          {title}
        </button>
      ))}
    </div>
  );
}
