import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './Dashboard';
import { Overlay } from './Overlay';
import './styles.css';

// Two pages, no router needed: the overlay (a browser source in the streaming app) and the dashboard.
const overlayToken = location.pathname.match(/^\/overlay\/([^/]+)/)?.[1];

createRoot(document.getElementById('root')!).render(
  <StrictMode>{overlayToken ? <Overlay token={decodeURIComponent(overlayToken)} /> : <Dashboard />}</StrictMode>,
);
