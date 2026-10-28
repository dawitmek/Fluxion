// Keys a command may press, as KeyboardEvent.code names.
// Deliberately excluded: Meta/Win, Alt, Control, Tab, Escape and F-keys. Viewers' holds can overlap,
// so a held Control plus another viewer's KeyW would be Ctrl+W (close tab); Alt plus F4 closes apps.
const letters = Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`);
const digits = Array.from({ length: 10 }, (_, i) => `Digit${i}`);

export const ALLOWED_KEYS: readonly string[] = [
  ...letters,
  ...digits,
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Enter',
  'ShiftLeft',
  'ShiftRight',
];

const allowed = new Set(ALLOWED_KEYS);

export function isAllowedKey(key: string): boolean {
  return allowed.has(key);
}
