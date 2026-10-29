import { useCallback, useEffect, useState } from 'react';
import { levelForXp, xpForLevel } from '@fluxion/shared';
import { api, type Host, type LeaderboardEntry } from '../api';
import { Card, ErrorNotice, Switch, useError } from '../ui';
import type { PageProps } from './Dashboard';
import { ViewerLink } from './ViewerPanel';

export function LeaderboardPage({ host, refreshHost, feed }: PageProps) {
  return (
    <div className="stack">
      <LeaderboardCard host={host} live={feed.leaderboard} />
      <ProgressionCard host={host} refreshHost={refreshHost} />
    </div>
  );
}

function LeaderboardCard({ host, live }: { host: Host; live: LeaderboardEntry[] | null }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const { error, guard } = useError();
  const load = useCallback(() => api<LeaderboardEntry[]>('GET', '/leaderboard').then(setEntries), []);
  useEffect(() => void load(), [load]);
  // The live feed only carries the top few, so take it as a cue to reload the full list.
  useEffect(() => {
    if (live) void load();
  }, [live, load]);

  return (
    <Card
      title="Leaderboard"
      description="Commands that pressed a key and gifts sent, per viewer, ranked by XP (1 per command plus gift diamonds). Updates every few seconds."
      actions={
        <button
          className="btn btn-ghost"
          onClick={guard(async () => {
            if (confirm('Reset the leaderboard? This cannot be undone.')) await api('DELETE', '/leaderboard').then(load);
          })}
        >
          Reset
        </button>
      }
    >
      <ErrorNotice error={error} />
      {entries.length === 0 ? (
        <p className="empty">No activity yet. Viewers appear here once they press a key or send a gift.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Viewer</th>
                <th>Commands</th>
                <th>Gifts</th>
                {host.progression && <th>XP</th>}
                {host.progression && <th>Level</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.viewer}>
                  <td className="num">
                    <span className={`rank ${i < 3 ? ['violet', 'pink', 'sky'][i] : ''}`}>{i + 1}</span>
                  </td>
                  <td>
                    <ViewerLink name={e.viewer} />
                  </td>
                  <td className="num">{e.commands}</td>
                  <td className="num">{e.gifts}</td>
                  {host.progression && <td className="num">{e.xp}</td>}
                  {host.progression && <td className="num">{levelForXp(e.xp)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ProgressionCard({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const { error, guard } = useError();
  const save = (patch: Partial<Host>) => guard(() => api('PATCH', '/settings', patch).then(refreshHost))();
  return (
    <Card
      title="Viewer levels"
      description={`Viewers earn XP on your streams: 1 per command that presses a key, plus each gift's diamond value. Level 2 takes ${xpForLevel(2)} XP, level 3 ${xpForLevel(3)}, level 5 ${xpForLevel(5)}, level 10 ${xpForLevel(10)}.`}
    >
      <ErrorNotice error={error} />
      <Switch checked={host.progression} onChange={(progression) => save({ progression })} hint="Levels show on the overlay, with a shout-out when someone levels up.">
        Show XP and levels
      </Switch>
      <Switch
        checked={host.levelGating}
        disabled={!host.progression}
        onChange={(levelGating) => save({ levelGating })}
        hint="Commands can require a minimum level, set per command. Gift triggers are never gated."
      >
        Level requirements
      </Switch>
    </Card>
  );
}
