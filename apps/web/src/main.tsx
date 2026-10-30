import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fluxion/theme/theme.css';
import { Auth } from './Auth';
import { ActivityWindow } from './dashboard/ActivityWindow';
import { Dashboard } from './dashboard/Dashboard';
import { HomePage } from './site/HomePage';
import { DownloadPage, FaqPage, FeaturesPage, HowItWorksPage, SelfHostingPage } from './site/pages';
import { Overlay } from './Overlay';
import { usePath } from './router';
import { installNumberDrag } from './ui';
import './app.css';
import './overlay.css';

// After an update, a tab that is still open asks for bundle files that no longer exist. Reload once to pick up
// the new version, but not again within a minute, so a genuinely missing file can't cause a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('fluxion-reloaded-at'));
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('fluxion-reloaded-at', String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  location.reload();
});

installNumberDrag();

const overlayToken = location.pathname.match(/^\/overlay\/([^/]+)/)?.[1];
// Set before the first paint so the overlay never flashes the dashboard background.
if (overlayToken) document.documentElement.classList.add('overlay-page');

function App() {
  const path = usePath();
  if (path === '/dashboard/activity-window') return <ActivityWindow />;
  if (path.startsWith('/dashboard')) return <Dashboard />;
  if (path === '/login') return <Auth key="login" mode="login" />;
  if (path === '/signup') return <Auth key="signup" mode="signup" />;
  if (path === '/features') return <FeaturesPage />;
  if (path === '/how-it-works') return <HowItWorksPage />;
  if (path === '/self-hosting') return <SelfHostingPage />;
  if (path === '/faq') return <FaqPage />;
  if (path === '/download') return <DownloadPage />;
  return <HomePage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{overlayToken ? <Overlay token={decodeURIComponent(overlayToken)} /> : <App />}</StrictMode>,
);
