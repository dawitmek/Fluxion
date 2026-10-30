// Line icons, 24-unit grid, drawn in currentColor: the dashboard's set (apps/web/src/icons.tsx), the ones used here.
const paths = {
  logo: <path d="M4 16c3-8 6-8 8 0s5 8 8 0" />,
  commands: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  chat: <path d="M4 5h16v11H9l-5 4V5z" />,
  feed: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  voice: <path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  play: <path d="M7 4v16l13-8z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  check: <path d="m5 12 5 5 9-10" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, strokeWidth = 2 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

// A section's heading: a tinted icon, the title and what the section is for.
export function SectionHead({ id, icon, hue, title, children }: { id: string; icon: IconName; hue: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="section-head">
      <span className={`hue-icon ${hue}`}>
        <Icon name={icon} />
      </span>
      <div>
        <h2 id={id}>{title}</h2>
        {children && <p className="muted small">{children}</p>}
      </div>
    </div>
  );
}
