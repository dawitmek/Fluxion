import { useState } from 'react';
import { Card } from '../ui';
import type { PageProps } from './Dashboard';

export function OverlayPage({ host }: PageProps) {
  const url = `${location.origin}/overlay/${host.overlayToken}`;
  const [copied, setCopied] = useState(false);
  return (
    <Card
      title="Stream overlay"
      description="Add this address as a browser source in TikTok LIVE Studio or OBS. It shows who sent each command, votes, alerts and the leaderboard, and plays alert sounds and voices. Keep it private."
    >
      <div className="row">
        <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Overlay address" />
        <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a className="btn" href={url} target="_blank" rel="noreferrer">
          Open preview
        </a>
      </div>
      <p className="muted small">The background is transparent, so size the source to cover your whole canvas.</p>
    </Card>
  );
}
