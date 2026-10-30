import { useCallback, useEffect, useState } from 'react';
import { api, type LiveStatus } from '../api';
import { navigate } from '../router';
import { ActivityFeed } from './ActivityFeed';
import { ViewerContext, ViewerPanel } from './ViewerPanel';

// Full activity on its own, in a window opened from the Live page: it fills the window, and keeps going if the
// dashboard tab is closed or moves to another page.
export function ActivityWindow() {
  const [signedIn, setSignedIn] = useState(false);
  const [status, setStatus] = useState<LiveStatus>({ live: false, companionsOnline: 0 });
  const [viewer, setViewer] = useState<string | null>(null);
  const closeViewer = useCallback(() => setViewer(null), []);

  useEffect(() => {
    document.title = 'Full activity - Fluxion';
    api('GET', '/auth/me')
      .then(() => setSignedIn(true))
      .catch(() => navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true }));
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    const load = () => api<LiveStatus>('GET', '/live/status').then(setStatus).catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [signedIn]);

  if (!signedIn) return null;
  return (
    <main className="activity-window">
      <ViewerContext.Provider value={setViewer}>
        <ActivityFeed status={status} window />
        {viewer && <ViewerPanel viewer={viewer} onClose={closeViewer} />}
      </ViewerContext.Provider>
    </main>
  );
}
