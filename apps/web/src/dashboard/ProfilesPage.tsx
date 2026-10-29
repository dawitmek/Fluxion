import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Profile } from '../api';
import { Card, ErrorNotice, TextCell, useError } from '../ui';
import type { PageProps } from './Dashboard';

export function ProfilesPage({ host, refreshHost }: PageProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState('');
  const [gameProcess, setGameProcess] = useState('');
  const { error, guard } = useError();
  const load = useCallback(() => api<Profile[]>('GET', '/profiles').then(setProfiles), []);
  useEffect(() => void load(), [load]);

  // refreshHost too, so the header's profile list and name follow.
  const patch = (id: string, body: Partial<Profile>) => guard(() => api('PATCH', `/profiles/${id}`, body).then(load).then(refreshHost))();
  const activate = (id: string) => guard(() => api('POST', `/profiles/${id}/activate`).then(refreshHost))();
  const remove = (id: string) => guard(() => api('DELETE', `/profiles/${id}`).then(load).then(refreshHost))();
  const add = (e: FormEvent) => {
    e.preventDefault();
    guard(() =>
      api('POST', '/profiles', { name, gameProcess: gameProcess.trim() || null }).then(() => {
        setName('');
        setGameProcess('');
        return load().then(refreshHost);
      }),
    )();
  };

  return (
    <Card
      title="Game profiles"
      description={
        <>
          Each profile has its own commands, key-press actions and crowd mode. Switching applies immediately, even while live. If a
          profile names its game's process as the companion lists it (e.g. <code>gta5.exe</code> on Windows or{' '}
          <code>minecraft</code> on macOS), the companion switches to that game too.
        </>
      }
    >
      <ErrorNotice error={error} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Profile</th>
              <th>Game process</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <TextCell value={p.name} required onSave={(v) => patch(p.id, { name: v })} label="Profile name" />
                </td>
                <td>
                  <TextCell value={p.gameProcess ?? ''} placeholder="none" onSave={(v) => patch(p.id, { gameProcess: v || null })} label="Game process" />
                </td>
                <td className="actions">
                  {p.active ? (
                    <span className="tag teal">Active</span>
                  ) : (
                    <>
                      <button className="btn btn-sm" onClick={() => activate(p.id)}>
                        Switch to
                      </button>
                      <button className="btn btn-ghost btn-sm btn-delete" onClick={() => remove(p.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="row add-row" onSubmit={add}>
        <input className="input" placeholder="New profile name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={48} aria-label="New profile name" />
        <input className="input" placeholder="Game process (optional)" value={gameProcess} onChange={(e) => setGameProcess(e.target.value)} aria-label="Game process" />
        <button className="btn btn-primary">Add, copying {host.profileName}</button>
      </form>
    </Card>
  );
}
