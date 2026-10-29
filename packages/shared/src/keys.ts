// Keys a command may press, as KeyboardEvent.code names, optionally held together with modifiers:
// "KeyE", or a combination like "Control+Shift+KeyE" (modifiers first, in MODIFIERS order).
// Never pressable: Meta/Win/Cmd (in any combination), Tab, Escape, F-keys, and Control or Alt on their own.
// The companion presses a combination on its own (no other key held), so viewers' overlapping holds can't
// combine into one either. The companion enforces all of this again; keep keys.rs in sync.
const letters = Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`);
const digits = Array.from({ length: 10 }, (_, i) => `Digit${i}`);
const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export const ALLOWED_KEYS: readonly string[] = [...letters, ...digits, ...arrows, 'Space', 'Enter', 'ShiftLeft', 'ShiftRight'];

export const MODIFIERS = ['Control', 'Alt', 'Shift'] as const;
export type Modifier = (typeof MODIFIERS)[number];

export interface KeyCombo {
  modifiers: Modifier[];
  key: string;
}

// Combinations that do something outside the game: close or quit it, open system menus, switch desktops,
// keyboard layouts or input languages. A combination is blocked when it includes a rule's modifiers (and maybe
// more) with one of its keys. Some keys here can't be pressed anyway; they're listed so the rules read as
// people know them.
export const BLOCKED_COMBOS: readonly { modifiers: Modifier[]; keys: string[]; label: string; reason: string }[] = [
  { modifiers: ['Control', 'Alt'], keys: ['Delete'], label: 'Ctrl+Alt+Del', reason: 'opens the security screen' },
  { modifiers: ['Control', 'Shift'], keys: ['Escape'], label: 'Ctrl+Shift+Esc', reason: 'opens Task Manager' },
  { modifiers: ['Alt'], keys: ['F4'], label: 'Alt+F4', reason: 'closes the game' },
  { modifiers: ['Alt'], keys: ['Tab'], label: 'Alt+Tab', reason: 'switches away from the game' },
  { modifiers: ['Control'], keys: ['KeyW'], label: 'Ctrl+W', reason: 'closes windows and tabs' },
  { modifiers: ['Control'], keys: ['KeyQ'], label: 'Ctrl+Q', reason: 'quits apps' },
  { modifiers: ['Alt'], keys: ['Space'], label: 'Alt+Space', reason: 'opens the window menu' },
  { modifiers: ['Alt'], keys: ['Enter'], label: 'Alt+Enter', reason: 'switches the game out of fullscreen' },
  { modifiers: ['Control'], keys: ['Space'], label: 'Ctrl+Space', reason: 'switches the input language' },
  { modifiers: ['Control'], keys: arrows, label: 'Ctrl+arrow keys', reason: 'switch desktops on macOS and rotate the screen on some PCs' },
  { modifiers: ['Control'], keys: ['ShiftLeft', 'ShiftRight'], label: 'Ctrl+Shift', reason: 'switches the keyboard layout' },
  { modifiers: ['Alt'], keys: ['ShiftLeft', 'ShiftRight'], label: 'Alt+Shift', reason: 'switches the keyboard layout' },
];

const allowed = new Set(ALLOWED_KEYS);

// Splits "Control+Shift+KeyE". null if it isn't well formed (unknown or repeated modifiers, wrong order).
export function parseKey(value: string): KeyCombo | null {
  const parts = value.split('+');
  const key = parts.pop()!;
  const modifiers = parts as Modifier[];
  const order = modifiers.map((m) => MODIFIERS.indexOf(m));
  if (order.some((i, n) => i < 0 || (n > 0 && i <= order[n - 1]!))) return null;
  return { modifiers, key };
}

export function formatKey({ modifiers, key }: KeyCombo): string {
  return [...MODIFIERS.filter((m) => modifiers.includes(m)), key].join('+');
}

// Why a combination is blocked, or null if it isn't.
export function blockedReason({ modifiers, key }: KeyCombo): string | null {
  const rule = BLOCKED_COMBOS.find((r) => r.keys.includes(key) && r.modifiers.every((m) => modifiers.includes(m)));
  return rule ? `${rule.label} ${rule.reason}` : null;
}

// Why a key can't be used for a command, or null if it can.
export function keyProblem(value: string): string | null {
  const combo = parseKey(value);
  if (!combo) return 'Not a key combination Fluxion understands';
  const blocked = blockedReason(combo);
  if (blocked) return blocked;
  if (!allowed.has(combo.key)) return `${combo.key} can't be pressed by Fluxion`;
  if (combo.modifiers.includes('Shift') && combo.key.startsWith('Shift')) return 'Shift is already the key';
  return null;
}

export function isAllowedKey(value: string): boolean {
  return keyProblem(value) === null;
}
