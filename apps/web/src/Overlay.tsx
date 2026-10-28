import { useEffect, useState } from 'react';
import type { ServerToOverlay } from '@fluxion/shared';

interface FeedItem {
  id: number;
  viewer: string;
  keyword: string;
}

const MAX_ITEMS = 6;
const ITEM_TTL_MS = 8000;

// Transparent page meant to sit on top of the stream as a browser source.
export function Overlay({ token }: { token: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    document.body.classList.add('overlay-body');
    let socket: WebSocket;
    let retry: number | undefined;
    let nextId = 0;
    let closed = false;

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/ws/overlay?token=${encodeURIComponent(token)}`);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerToOverlay;
        if (message.type === 'live') setLive(message.state === 'started');
        if (message.type === 'command') {
          const item = { id: nextId++, viewer: message.viewer, keyword: message.keyword };
          setLive(true);
          setItems((current) => [item, ...current].slice(0, MAX_ITEMS));
          setTimeout(() => setItems((current) => current.filter((i) => i.id !== item.id)), ITEM_TTL_MS);
        }
      };
      // A bad token is permanent (4001); anything else is worth retrying.
      socket.onclose = (event) => {
        if (!closed && event.code !== 4001) retry = window.setTimeout(connect, 3000);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      socket.close();
      document.body.classList.remove('overlay-body');
    };
  }, [token]);

  return (
    <div className="overlay">
      {live && items.length === 0 && <div className="overlay-hint">Type a command in chat to play!</div>}
      {items.map((item) => (
        <div key={item.id} className="overlay-item">
          <span className="overlay-viewer">{item.viewer}</span>
          <span className="overlay-keyword">{item.keyword}</span>
        </div>
      ))}
    </div>
  );
}
