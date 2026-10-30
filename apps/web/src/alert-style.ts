import type { CSSProperties } from 'react';
import { DEFAULT_ALERT_STYLE, type AlertFont, type AlertStyle } from '@fluxion/shared';

// Fonts an alert can use: Geist and Oxanium come with Fluxion; the others are on Windows and macOS, with fallbacks.
export const ALERT_FONT_STACKS: Record<AlertFont, [string, string]> = {
  geist: ['Geist', "'Geist Variable', system-ui, sans-serif"],
  oxanium: ['Oxanium', "'Oxanium Variable', system-ui, sans-serif"],
  impact: ['Impact', "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif"],
  georgia: ['Georgia', "Georgia, 'Times New Roman', serif"],
  courier: ['Courier', "'Courier New', Courier, monospace"],
  comic: ['Comic Sans', "'Comic Sans MS', 'Comic Sans', 'Chalkboard SE', cursive"],
};

const fade = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;
const NONE = '0 0 #0000';

// An alert's look as a class and CSS variables for .overlay-alert (overlay.css), so the overlay and the dashboard's
// previews draw it the same way.
export function alertLook(style: AlertStyle | null): { className: string; style: CSSProperties } {
  const s = style ?? DEFAULT_ALERT_STYLE;
  const background =
    s.background === 'none'
      ? 'none'
      : s.background === 'solid'
        ? fade(s.color1, s.opacity)
        : `linear-gradient(${s.angle}deg, ${fade(s.color1, s.opacity)}, ${fade(s.color2, s.opacity)})`;
  return {
    className: `anim-${s.animation}${s.shine ? '' : ' no-shine'}`,
    style: {
      '--a-bg': background,
      '--a-ink': s.textColor,
      '--a-font': ALERT_FONT_STACKS[s.font][1],
      '--a-size': `${s.size}px`,
      '--a-weight': s.weight,
      '--a-radius': `${s.radius}px`,
      '--a-border': s.borderWidth ? `inset 0 0 0 ${s.borderWidth}px ${s.borderColor}` : NONE,
      '--a-glow': s.glow ? `0 18px 50px -12px ${fade(s.glowColor, s.glow)}, 0 0 60px -12px ${fade(s.glowColor, s.glow * 0.8)}` : NONE,
      '--a-text-shadow': s.textShadow ? '0 2px 6px rgba(0, 0, 0, 0.35)' : 'none',
      '--a-case': s.uppercase ? 'uppercase' : 'none',
    } as CSSProperties,
  };
}
