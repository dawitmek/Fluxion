import { useState } from 'react';
import { ALERT_ANIMATIONS, ALERT_FONTS, ALERT_PRESETS, ALERT_STYLE_LIMITS, DEFAULT_ALERT_STYLE, type AlertAnimation, type AlertStyle } from '@fluxion/shared';
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

// Every part of an alert pop-up's look: pick a preset, then change anything. The alert preview above updates as
// you go; onReplay shows its entrance again.
export function AlertLookEditor({ value, onChange, onReplay }: { value: AlertStyle | null; onChange: (style: AlertStyle) => void; onReplay: () => void }) {
  const style = value ?? DEFAULT_ALERT_STYLE;
  const preset = ALERT_PRESETS.find((p) => same(style, p.style));
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<AlertStyle>) => onChange({ ...style, ...patch });
  const range = (key: keyof typeof ALERT_STYLE_LIMITS) => ({ min: ALERT_STYLE_LIMITS[key][0], max: ALERT_STYLE_LIMITS[key][1] });

  return (
    <div className="alert-look stack">
      <div className="field">
        Pop-up style
        <span className="hint">{preset ? `The ${preset.label} preset.` : 'Your own style. Pick a preset to start over from it.'}</span>
        <div className="look-presets" role="radiogroup" aria-label="Pop-up style preset">
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

      <button type="button" className="line-expand" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide style settings' : 'Change colors, font, shape and effects'}
        <Icon name="chevron" />
      </button>

      {open && (
        <div className="look-groups">
          <fieldset className="look-group">
            <legend>Background</legend>
            <Seg<AlertStyle['background']>
              label="Background"
              value={style.background}
              options={[
                ['gradient', 'Gradient'],
                ['solid', 'Solid'],
                ['none', 'None'],
              ]}
              onChange={(background) => set({ background })}
            />
            {style.background !== 'none' && (
              <>
                <div className="look-row">
                  <ColorField label={style.background === 'gradient' ? 'From' : 'Color'} value={style.color1} onChange={(color1) => set({ color1 })} />
                  {style.background === 'gradient' && <ColorField label="To" value={style.color2} onChange={(color2) => set({ color2 })} />}
                </div>
                {style.background === 'gradient' && (
                  <div className="field">
                    Direction
                    <Scrubber value={style.angle} {...range('angle')} buttonStep={15} unit="°" label="Gradient direction" onSave={(angle) => set({ angle })} />
                  </div>
                )}
                <div className="field">
                  Opacity
                  <Scrubber value={style.opacity} {...range('opacity')} buttonStep={5} unit="%" label="Background opacity" onSave={(opacity) => set({ opacity })} />
                </div>
              </>
            )}
          </fieldset>

          <fieldset className="look-group">
            <legend>Text</legend>
            <div className="look-row">
              <ColorField label="Color" value={style.textColor} onChange={(textColor) => set({ textColor })} />
              <label className="field">
                Font
                <select className="input" value={style.font} onChange={(e) => set({ font: e.target.value as AlertStyle['font'] })}>
                  {ALERT_FONTS.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: ALERT_FONT_STACKS[f][1] }}>
                      {ALERT_FONT_STACKS[f][0]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="look-row">
              <div className="field">
                Size
                <Scrubber value={style.size} {...range('size')} buttonStep={2} unit="px" label="Text size" onSave={(size) => set({ size })} />
              </div>
              <label className="field">
                Weight
                <select className="input" value={style.weight} onChange={(e) => set({ weight: Number(e.target.value) })}>
                  {WEIGHTS.map(([w, label]) => (
                    <option key={w} value={w}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Toggle label="All capitals" checked={style.uppercase} onChange={(uppercase) => set({ uppercase })} />
            <Toggle label="Shadow behind the text" checked={style.textShadow} onChange={(textShadow) => set({ textShadow })} />
          </fieldset>

          <fieldset className="look-group">
            <legend>Shape</legend>
            <div className="field">
              Corner roundness
              <Scrubber value={style.radius} {...range('radius')} buttonStep={2} unit="px" label="Corner roundness" onSave={(radius) => set({ radius })} />
            </div>
            <div className="look-row">
              <div className="field">
                Border
                <Scrubber value={style.borderWidth} {...range('borderWidth')} unit="px" label="Border width" onSave={(borderWidth) => set({ borderWidth })} />
              </div>
              {style.borderWidth > 0 && <ColorField label="Border color" value={style.borderColor} onChange={(borderColor) => set({ borderColor })} />}
            </div>
          </fieldset>

          <fieldset className="look-group">
            <legend>Effects</legend>
            <div className="look-row">
              <div className="field">
                Glow
                <Scrubber value={style.glow} {...range('glow')} buttonStep={5} unit="%" label="Glow strength" onSave={(glow) => set({ glow })} />
              </div>
              {style.glow > 0 && <ColorField label="Glow color" value={style.glowColor} onChange={(glowColor) => set({ glowColor })} />}
            </div>
            <label className="field">
              Entrance
              <span className="row" style={{ flexWrap: 'nowrap' }}>
                <select
                  className="input"
                  value={style.animation}
                  onChange={(e) => (set({ animation: e.target.value as AlertAnimation }), onReplay())}
                >
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
            <Toggle label="Shine as it arrives" checked={style.shine} onChange={(shine) => (set({ shine }), onReplay())} />
          </fieldset>
        </div>
      )}
    </div>
  );
}

// A color swatch with its hex. A preset's transparency (#rrggbbaa) is kept when only the color is changed.
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field color-field">
      {label}
      <span className="color-input">
        <input type="color" value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value + value.slice(7))} />
        <span className="num">{value.slice(0, 7).toUpperCase()}</span>
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
