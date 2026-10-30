import { useCallback, useEffect, useState } from 'react';
import { levelForXp, POINTS_CHECK, xpForLevel } from '@fluxion/shared';
import { api, type Host, type LeaderboardEntry } from '../api';
import { Card, ErrorNotice, NumberCell, Switch, useError } from '../ui';
import type { PageProps } from './Dashboard';
import { ViewerLink } from './ViewerPanel';

export function LeaderboardPage({ host, refreshHost, feed }: PageProps) {
  return (
    <div className="stack">
      <LeaderboardCard host={host} live={feed.leaderboard} />
      <PointsCard host={host} refreshHost={refreshHost} />
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
      description={`${host.tiktokUsername ? `For @${host.tiktokUsername.replace(/^@/, '')}. Each TikTok account you set has its own leaderboard and points. ` : ''}Commands that pressed a key and gifts sent, per viewer, ranked by XP (1 per command plus gift coins). Updates every few seconds.`}
      actions={
        <button
          className="btn btn-ghost"
          onClick={guard(async () => {
            if (confirm('Reset the leaderboard? Viewers keep their points. This cannot be undone.')) await api('DELETE', '/leaderboard').then(load);
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
                {host.points && <th>Points</th>}
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
                  {host.points && <td className="num">{e.points.toLocaleString()}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const EARNING = [
  ['pointsPerChat', 'For chatting', 'At most once a minute per viewer.'],
  ['pointsPerDiamond', 'Per gift coin', 'A 5-coin gift at 10 is 50 points.'],
  ['pointsPerFollow', 'For following', 'Each time TikTok reports a follow.'],
  ['pointsPerShare', 'For sharing', 'Each time they share the stream.'],
] as const;

function PointsCard({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const { error, guard } = useError();
  const save = (patch: Partial<Host>) => guard(() => api('PATCH', '/settings', patch).then(refreshHost))();
  return (
    <Card
      title="Points"
      description="A balance viewers earn on your streams and spend on commands. Set what each command costs on the Commands page. Unlike XP, points go down when spent."
      actions={
        <button
          className="btn btn-ghost"
          onClick={guard(async () => {
            if (confirm("Set every viewer's points back to 0? This cannot be undone.")) await api('DELETE', '/leaderboard/points');
          })}
        >
          Reset points
        </button>
      }
    >
      <ErrorNotice error={error} />
      <Switch
        checked={host.points}
        onChange={(points) => save({ points })}
        hint="A command a viewer can't afford is ignored. Losing votes cost nothing, and key presses from actions are always free."
      >
        Points
      </Switch>
      <fieldset className="stack" disabled={!host.points}>
        <div className="form-grid">
          {EARNING.map(([field, label, hint]) => (
            <label key={field} className="field">
              {label}
              <span className="hint">{hint}</span>
              <NumberCell value={host[field]} min={0} max={10000} onSave={(value) => save({ [field]: value })} />
            </label>
          ))}
        </div>
        <Switch
          checked={host.pointsCheck}
          onChange={(pointsCheck) => save({ pointsCheck })}
          hint={`Typing ${POINTS_CHECK} in chat shows that viewer's points on the overlay, once every 10 seconds per viewer.`}
        >
          Let viewers check their points
        </Switch>
      </fieldset>
    </Card>
  );
}

function ProgressionCard({ host, refreshHost }: { host: Host; refreshHost: () => Promise<unknown> }) {
  const { error, guard } = useError();
  const save = (patch: Partial<Host>) => guard(() => api('PATCH', '/settings', patch).then(refreshHost))();
  return (
    <Card
      title="Viewer levels"
      description={`Viewers earn XP on your streams: 1 per command that presses a key, plus each gift's value in coins. Level 2 takes ${xpForLevel(2)} XP, level 3 ${xpForLevel(3)}, level 5 ${xpForLevel(5)}, level 10 ${xpForLevel(10)}.`}
    >
      <ErrorNotice error={error} />
      <Switch checked={host.progression} onChange={(progression) => save({ progression })} hint="Levels show on the overlay, with a shout-out when someone levels up.">
        Show XP and levels
      </Switch>
      <Switch
        checked={host.levelGating}
        disabled={!host.progression}
        onChange={(levelGating) => save({ levelGating })}
        hint="Commands can require a minimum level, set per command. Key presses from actions are never gated."
      >
        Level requirements
      </Switch>
    </Card>
  );
}
