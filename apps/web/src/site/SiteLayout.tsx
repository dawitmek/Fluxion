import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Icon, Logo } from '../icons';
import { GITHUB_URL } from '../release';
import { Glow } from './Glow';
import { Link, usePath } from '../router';
import './site.css';

export { GITHUB_URL };

const PAGES = [
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/self-hosting', label: 'Self-hosting' },
  { href: '/faq', label: 'FAQ' },
];
const DOWNLOAD = { href: '/download', label: 'Download' };

// What slides in as it scrolls into view: section headings, cards, feature rows, steps and questions.
// The hero is already on screen, so it doesn't.
const REVEAL = [
  '.s-carousel-head', '.s-card', '.s-center', '.s-box', '.s-flow-copy', '.s-flow-art', '.s-split > *', '.s-feature-row',
  '.s-timeline > li', '.s-faq details', '.s-downloads > *', '.s-download-source', '.s-cta .s-wrap > :not(.s-footer)',
].join(', ');

// Content fades and slides up a little as it scrolls into view, neighbours one after another. Without JavaScript,
// or with reduced motion, it's simply there.
function useScrollReveal(path: string) {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const site = document.querySelector('.site');
    if (!site) return;
    const items = [...site.querySelectorAll<HTMLElement>(REVEAL)];
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('revealed');
          seen.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    for (const item of items) {
      const siblings = [...(item.parentElement?.children ?? [])].filter((el) => el.matches(REVEAL));
      item.style.setProperty('--reveal-delay', `${Math.min(siblings.indexOf(item), 4) * 90}ms`);
      item.classList.add('reveal');
      seen.observe(item);
    }
    return () => {
      seen.disconnect();
      for (const item of items) item.classList.remove('reveal', 'revealed');
    };
  }, [path]);
}

// Signed-in visitors get a way back into the app instead of Log in / Sign up.
function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    api('GET', '/auth/me').then(
      () => setSignedIn(true),
      () => setSignedIn(false),
    );
  }, []);
  return signedIn;
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const path = usePath();
  const signedIn = useSignedIn();
  useScrollReveal(path);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);

  const download = (
    <Link href={DOWNLOAD.href} className="s-btn s-btn-line s-btn-sm" aria-current={path === DOWNLOAD.href ? 'page' : undefined}>
      <Icon name="download" size={16} />
      {DOWNLOAD.label}
    </Link>
  );
  const actions = signedIn ? (
    <>
      {download}
      <Link href="/dashboard" className="s-btn s-btn-solid s-btn-sm">
        Open dashboard
      </Link>
    </>
  ) : (
    <>
      {download}
      <Link href="/login" className="s-text-link">
        Log in
      </Link>
      <Link href="/signup" className="s-btn s-btn-solid s-btn-sm">
        Sign up
      </Link>
    </>
  );

  return (
    <div className="site">
      <header className="s-nav">
        <div className="s-wrap">
          <Link href="/" className="s-brand">
            <Logo size={30} />
            Fluxion
          </Link>
          <nav className="s-nav-links" aria-label="Site">
            {PAGES.map((p) => (
              <Link key={p.href} href={p.href} aria-current={path === p.href ? 'page' : undefined}>
                {p.label}
              </Link>
            ))}
          </nav>
          <div className="s-nav-actions">{actions}</div>
          <button className="s-menu-btn" aria-expanded={menuOpen} aria-controls="site-menu" onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
            <span className="sr-only">Menu</span>
          </button>
        </div>
        <nav id="site-menu" className={`s-mobile-menu ${menuOpen ? 'open' : ''}`} aria-label="Site">
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href}>
              {p.label}
            </Link>
          ))}
          <Link href={DOWNLOAD.href} className="s-btn s-btn-line">
            <Icon name="download" size={18} />
            Download the companion
          </Link>
          {signedIn ? (
            <Link href="/dashboard" className="s-btn s-btn-solid">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup" className="s-btn s-btn-solid">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      <main>{children}</main>

      <section className="s-cta" aria-labelledby="cta-title">
        <Glow />
        <div className="s-wrap">
          <span className="s-brand">
            <Logo size={36} />
            Fluxion
          </span>
          <h2 id="cta-title">
            Pair it. Map it. <span className="s-gradient">Go live.</span>
          </h2>
          <div className="s-cta-buttons">
            <Link href={signedIn ? '/dashboard' : '/signup'} className="s-btn s-btn-solid">
              {signedIn ? 'Open dashboard' : 'Get started'}
            </Link>
            <a href={GITHUB_URL} className="s-btn s-btn-line">
              View on GitHub
            </a>
          </div>
          <p className="s-cta-note">Free and open source under the GPL-3.0</p>
          <footer className="s-footer">
            <span>© 2026 Fluxion. Not affiliated with TikTok.</span>
            <nav aria-label="Footer">
              {[...PAGES, DOWNLOAD].map((p) => (
                <Link key={p.href} href={p.href}>
                  {p.label}
                </Link>
              ))}
              <a href={GITHUB_URL}>GitHub</a>
            </nav>
          </footer>
        </div>
      </section>
    </div>
  );
}
