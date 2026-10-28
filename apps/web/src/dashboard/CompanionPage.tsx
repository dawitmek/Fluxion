import { useCallback, useEffect, useState } from 'react';
import { api, type Companion } from '../api';
import { Card, ErrorNotice, useError } from '../ui';
import type { PageProps } from './Dashboard';

export function CompanionPage({ status }: PageProps) {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const { error, guard } = useError();
  const load = useCallback(() => api<Companion[]>('GET', '/companions').then(setCompanions), []);
  // A device that just paired shows up as online; list it without a manual refresh.
  useEffect(() => void load(), [load, status.companionsOnline]);

  return (
    <div className="stack">
      <Card
        title="Pair a companion"
        description="The companion app runs on your gaming PC and presses keys in your game. Create a code here, then enter it in the companion along with this server's address."
        actions={
          <a className="btn btn-ghost" href="/download" target="_blank" rel="noreferrer">
            Download the app
          </a>
        }
      >
        <ErrorNotice error={error} />
        <div className="pairing">
          <div className="inset">
            <div className="muted small">Server address</div>
            <code className="pairing-address">{location.origin}</code>
          </div>
          <div className="inset">
            <div className="muted small">Pairing code</div>
            {pairing ? (
              <>
                <strong className="pairing-code">{pairing.code}</strong>
                <div className="muted small">Valid until {new Date(pairing.expiresAt).toLocaleTimeString()}</div>
              </>
            ) : (
              <button className="btn btn-primary" style={{ marginTop: 6 }} onClick={guard(() => api<typeof pairing>('POST', '/companions/pairing-code').then(setPairing))}>
                Create pairing code
              </button>
            )}
          </div>
        </div>
      </Card>
      <Card
        title="Paired devices"
        description={`${status.companionsOnline} online now. Revoking a device disconnects it; pair it again with a new code.`}
        actions={
          <button className="btn btn-ghost" onClick={() => (setPairing(null), load())}>
            Refresh
          </button>
        }
      >
        {companions.length === 0 ? (
          <p className="empty">No devices paired yet.</p>
        ) : (
          <ul className="list">
            {companions.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                <span className="muted">{c.lastSeenAt ? `last seen ${new Date(c.lastSeenAt).toLocaleString()}` : 'never connected'}</span>
                <span className="spacer" />
                <button className="btn btn-ghost btn-sm" onClick={guard(() => api('DELETE', `/companions/${c.id}`).then(load))}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
