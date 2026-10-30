import { useState } from 'react';
import { ALERT_ANIMATIONS, ALERT_FONTS, ALERT_PRESETS, ALERT_STYLE_LIMITS, type AlertAnimation, type AlertStyle } from '@fluxion/shared';
import { alertLook, ALERT_FONT_STACKS } from '../alert-style';
import { Icon } from '../icons';
import { Scrubber, Seg } from '../ui';

const ANIMATION_LABELS: Record<AlertAnimation, string> = {
  pop: 'Pop in',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down',
  fade: 'Fade in',
  bounce: 'Drop and bounce',
  zoom: 'Zoom in',
};
const WEIGHTS: [number, string][] = [
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semibold'],
  [700, 'Bold'],
  [800, 'Extra bold'],
  [900, 'Black'],
];

const same = (a: AlertStyle, b: AlertStyle) => (Object.keys(b) as (keyof AlertStyle)[]).every((k) => a[k] === b[k]);

// Every part of an alert pop-up's look. A preset to start from and the colors are always in view; font, size,
// shape and animation are one click further. The preview beside it updates as you go; onReplay shows its entrance
// again.
export function AlertLookEditor({ value, onChange, onReplay }: { value: AlertStyle; onChange: (style: AlertStyle) => void; onReplay: () => void }) {
  const preset = ALERT_PRESETS.find((p) => same(value, p.style));
  const [more, setMore] = useState(false);
  const set = (patch: Partial<AlertStyle>) => onChange({ ...value, ...patch });
  const range = (key: keyof typeof ALERT_STYLE_LIMITS) => ({ min: ALERT_STYLE_LIMITS[key][0], max: ALERT_STYLE_LIMITS[key][1] });

  return (
    <div className="alert-look stack">
      <div className="field">
        Start from a preset
        <span className="hint">{preset ? `${preset.label}. Change any color below to make it your own.` : 'Your own style. Pick a preset to start over from it.'}</span>
        <div className="look-presets" role="radiogroup" aria-label="Preset">
          {ALERT_PRESETS.map((p) => {
            const look = alertLook(p.style);
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset?.id === p.id}
                className="look-preset"
                onClick={() => (onChange({ ...p.style }), onReplay())}
              >
                <span className="look-preset-stage">
                  <span className={`overlay-alert ${look.className}`} style={look.style}>
                    Aa
                  </span>
                </span>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        Colors
        <span className="hint">Click a color to pick any color you like.</span>
        <div className="look-colors">
          {value.background === 'none' ? (
            <button type="button" className="btn look-color-off" onClick={() => set({ background: 'solid' })}>
              No background. Add one
            </button>
          ) : (
            <>
              <ColorField label={value.background === 'gradient' ? 'Background, left' : 'Background'} value={value.color1} onChange={(color1) => set({ color1 })} />
              {value.background === 'gradient' && <ColorField label="Background, right" value={value.color2} onChange={(color2) => set({ color2 })} />}
            </>
          )}
          <ColorField label="Text" value={value.textColor} onChange={(textColor) => set({ textColor })} />
          {/* Picking a color for a border or glow that's off turns it on, so the pick shows. */}
          <ColorField
            label="Border"
            value={value.borderColor}
            onChange={(borderColor) => set({ borderColor, ...(value.borderWidth === 0 && { borderWidth: 2 }) })}
          />
          <ColorField label="Glow" value={value.glowColor} onChange={(glowColor) => set({ glowColor, ...(value.glow === 0 && { glow: 60 }) })} />
        </div>
      </div>

      <button type="button" className="look-more" aria-expanded={more} onClick={() => setMore(!more)}>
        <Icon name="settings" size={15} />
        {more ? 'Hide font, size, shape and animation' : 'Font, size, shape and animation'}
        <Icon name="chevron" size={15} />
      </button>

      {more && (
        <div className="look-groups">
          <fieldset className="look-group">
            <legend>Background</legend>
            <Seg<AlertStyle['background']>
              label="Background"
              value={value.background}
              options={[
                ['gradient', 'Two colors'],
                ['solid', 'One color'],
                ['none', 'None'],
              ]}
              onChange={(background) => set({ background })}
            />
            {value.background === 'gradient' && (
              <div className="field">
                Direction
                <Scrubber value={value.angle} {...range('angle')} buttonStep={15} unit="°" label="Gradient direction" onSave={(angle) => set({ angle })} />
              </div>
            )}
            {value.background !== 'none' && (
              <div className="field">
                Opacity
                <Scrubber value={value.opacity} {...range('opacity')} buttonStep={5} unit="%" label="Background opacity" onSave={(opacity) => set({ opacity })} />
              </div>
            )}
          </fieldset>

          <fieldset className="look-group">
            <legend>Text</legend>
            <label className="field">
              Font
              <select className="input" value={value.font} onChange={(e) => set({ font: e.target.value as AlertStyle['font'] })}>
                {ALERT_FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: ALERT_FONT_STACKS[f][1] }}>
                    {ALERT_FONT_STACKS[f][0]}
                  </option>
                ))}
              </select>
            </label>
            <div className="look-row">
              <div className="field">
                Size
                <Scrubber value={value.size} {...range('size')} buttonStep={2} unit="px" label="Text size" onSave={(size) => set({ size })} />
              </div>
              <label className="field">
                Weight
                <select className="input" value={value.weight} onChange={(e) => set({ weight: Number(e.target.value) })}>
                  {WEIGHTS.map(([w, label]) => (
                    <option key={w} value={w}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Toggle label="All capitals" checked={value.uppercase} onChange={(uppercase) => set({ uppercase })} />
            <Toggle label="Shadow behind the text" checked={value.textShadow} onChange={(textShadow) => set({ textShadow })} />
          </fieldset>

          <fieldset className="look-group">
            <legend>Shape</legend>
            <div className="field">
              Corner roundness
              <Scrubber value={value.radius} {...range('radius')} buttonStep={2} unit="px" label="Corner roundness" onSave={(radius) => set({ radius })} />
            </div>
            <div className="field">
              Border thickness
              <Scrubber value={value.borderWidth} {...range('borderWidth')} unit="px" label="Border thickness" onSave={(borderWidth) => set({ borderWidth })} />
            </div>
            <div className="field">
              Glow strength
              <Scrubber value={value.glow} {...range('glow')} buttonStep={5} unit="%" label="Glow strength" onSave={(glow) => set({ glow })} />
            </div>
          </fieldset>

          <fieldset className="look-group">
            <legend>Animation</legend>
            <label className="field">
              How it arrives
              <span className="row" style={{ flexWrap: 'nowrap' }}>
                <select className="input" value={value.animation} onChange={(e) => (set({ animation: e.target.value as AlertAnimation }), onReplay())}>
                  {ALERT_ANIMATIONS.map((a) => (
                    <option key={a} value={a}>
                      {ANIMATION_LABELS[a]}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm" onClick={onReplay}>
                  <Icon name="play" size={14} />
                  Play
                </button>
              </span>
            </label>
            <Toggle label="Shine as it arrives" checked={value.shine} onChange={(shine) => (set({ shine }), onReplay())} />
          </fieldset>
        </div>
      )}
    </div>
  );
}

// A large color swatch to click, with its name and hex. A preset's transparency (#rrggbbaa) is kept when only the
// color is changed.
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="look-color">
      <span className="look-color-swatch" style={{ background: value }}>
        <input type="color" value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value + value.slice(7))} aria-label={`${label} color`} />
      </span>
      <span>
        <strong>{label}</strong>
        <span className="muted small num">{value.slice(0, 7).toUpperCase()}</span>
      </span>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
