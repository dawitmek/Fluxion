import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

// A few pages don't justify a router library: the path lives in history, and links push to it.
const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export function navigate(path: string, { replace = false } = {}) {
  if (path === location.pathname) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
}

export function usePath() {
  return useSyncExternalStore(
    (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    () => location.pathname,
  );
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Let the browser handle new-tab clicks and anything off-site.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={click} {...rest} />;
}
