// Ready-made profiles for popular games: each game's default keyboard controls as chat commands.
// Fluxion presses keys only (no mouse), so these are games that play well from the keyboard.
// Hold times are longer for moving and driving, short for one-off presses.

export interface GameTemplate {
  id: string;
  name: string;
  process: string; // the Windows executable, as the companion lists it
  commands: { keyword: string; key: string; holdMs: number }[];
}

export const GAME_TEMPLATES: readonly GameTemplate[] = [
  {
    id: 'gta5',
    name: 'GTA V',
    process: 'gta5.exe',
    commands: [
      { keyword: 'forward', key: 'KeyW', holdMs: 1500 },
      { keyword: 'back', key: 'KeyS', holdMs: 1000 },
      { keyword: 'left', key: 'KeyA', holdMs: 600 },
      { keyword: 'right', key: 'KeyD', holdMs: 600 },
      { keyword: 'run', key: 'Shift+KeyW', holdMs: 1500 },
      { keyword: 'jump', key: 'Space', holdMs: 300 },
      { keyword: 'enter', key: 'KeyF', holdMs: 300 },
      { keyword: 'reload', key: 'KeyR', holdMs: 200 },
      { keyword: 'horn', key: 'KeyE', holdMs: 500 },
    ],
  },
  {
    id: 'minecraft',
    name: 'Minecraft',
    process: 'javaw.exe',
    commands: [
      { keyword: 'forward', key: 'KeyW', holdMs: 1000 },
      { keyword: 'back', key: 'KeyS', holdMs: 600 },
      { keyword: 'left', key: 'KeyA', holdMs: 600 },
      { keyword: 'right', key: 'KeyD', holdMs: 600 },
      { keyword: 'jump', key: 'Space', holdMs: 300 },
      { keyword: 'sneak', key: 'ShiftLeft', holdMs: 1000 },
      { keyword: 'inventory', key: 'KeyE', holdMs: 100 },
      { keyword: 'drop', key: 'KeyQ', holdMs: 100 },
      { keyword: 'swap', key: 'KeyF', holdMs: 100 },
      { keyword: 'slot1', key: 'Digit1', holdMs: 100 },
      { keyword: 'slot2', key: 'Digit2', holdMs: 100 },
      { keyword: 'slot3', key: 'Digit3', holdMs: 100 },
    ],
  },
  {
    id: 'roblox',
    name: 'Roblox',
    process: 'robloxplayerbeta.exe',
    commands: [
      { keyword: 'forward', key: 'KeyW', holdMs: 1000 },
      { keyword: 'back', key: 'KeyS', holdMs: 600 },
      { keyword: 'left', key: 'KeyA', holdMs: 600 },
      { keyword: 'right', key: 'KeyD', holdMs: 600 },
      { keyword: 'jump', key: 'Space', holdMs: 300 },
      { keyword: 'turnleft', key: 'ArrowLeft', holdMs: 400 },
      { keyword: 'turnright', key: 'ArrowRight', holdMs: 400 },
      { keyword: 'tool1', key: 'Digit1', holdMs: 100 },
      { keyword: 'tool2', key: 'Digit2', holdMs: 100 },
    ],
  },
  {
    id: 'ets2',
    name: 'Euro Truck Simulator 2',
    process: 'eurotrucks2.exe',
    commands: [
      { keyword: 'gas', key: 'KeyW', holdMs: 2000 },
      { keyword: 'brake', key: 'KeyS', holdMs: 1000 },
      { keyword: 'left', key: 'KeyA', holdMs: 700 },
      { keyword: 'right', key: 'KeyD', holdMs: 700 },
      { keyword: 'handbrake', key: 'Space', holdMs: 300 },
      { keyword: 'horn', key: 'KeyH', holdMs: 500 },
      { keyword: 'lights', key: 'KeyL', holdMs: 100 },
      { keyword: 'engine', key: 'KeyE', holdMs: 100 },
      { keyword: 'cruise', key: 'KeyC', holdMs: 100 },
    ],
  },
  {
    id: 'celeste',
    name: 'Celeste',
    process: 'celeste.exe',
    commands: [
      { keyword: 'left', key: 'ArrowLeft', holdMs: 400 },
      { keyword: 'right', key: 'ArrowRight', holdMs: 400 },
      { keyword: 'up', key: 'ArrowUp', holdMs: 200 },
      { keyword: 'down', key: 'ArrowDown', holdMs: 200 },
      { keyword: 'jump', key: 'KeyC', holdMs: 250 },
      { keyword: 'dash', key: 'KeyX', holdMs: 100 },
      { keyword: 'grab', key: 'KeyZ', holdMs: 800 },
    ],
  },
];
