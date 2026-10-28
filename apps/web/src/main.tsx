import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fluxion/theme/theme.css';
import { Auth } from './Auth';
import { Dashboard } from './dashboard/Dashboard';
import { HomePage } from './site/HomePage';
import { FaqPage, FeaturesPage, HowItWorksPage, SelfHostingPage } from './site/pages';
import { Overlay } from './Overlay';
import { usePath } from './router';
import './app.css';
import './overlay.css';

const overlayToken = location.pathname.match(/^\/overlay\/([^/]+)/)?.[1];
// Set before the first paint so the overlay never flashes the dashboard background.
if (overlayToken) document.documentElement.classList.add('overlay-page');

function App() {
  const path = usePath();
  if (path.startsWith('/dashboard')) return <Dashboard />;
  if (path === '/login') return <Auth key="login" mode="login" />;
  if (path === '/signup') return <Auth key="signup" mode="signup" />;
  if (path === '/features') return <FeaturesPage />;
  if (path === '/how-it-works') return <HowItWorksPage />;
  if (path === '/self-hosting') return <SelfHostingPage />;
  if (path === '/faq') return <FaqPage />;
  return <HomePage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{overlayToken ? <Overlay token={decodeURIComponent(overlayToken)} /> : <App />}</StrictMode>,
);
