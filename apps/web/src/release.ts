import { useEffect, useState } from 'react';

export const GITHUB_URL = 'https://github.com/dawitmek/Fluxion';
export const RELEASES_URL = `${GITHUB_URL}/releases`;

export type Platform = 'windows' | 'mac';

export interface CompanionRelease {
  version: string;
  downloads: Partial<Record<Platform, string>>;
}

interface GithubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

// The installers come from the release workflow: an NSIS setup .exe for Windows and a universal .dmg for macOS.
function pick(release: GithubRelease): CompanionRelease {
  const find = (test: (name: string) => boolean) => release.assets.find((a) => test(a.name))?.browser_download_url;
  return {
    version: release.tag_name.replace(/^companion-v/, ''),
    downloads: {
      windows: find((n) => n.endsWith('-setup.exe')) ?? find((n) => n.endsWith('.msi')),
      mac: find((n) => n.endsWith('.dmg')),
    },
  };
}

export function detectPlatform(): Platform | null {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh/.test(ua)) return 'mac';
  return null;
}

// undefined while loading, null when there's no published release (or GitHub can't be reached).
export function useCompanionRelease() {
  const [release, setRelease] = useState<CompanionRelease | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${GITHUB_URL.slice('https://github.com/'.length)}/releases/latest`)
      .then((res) => (res.ok ? (res.json() as Promise<GithubRelease>) : null))
      .then((r) => !cancelled && setRelease(r ? pick(r) : null))
      .catch(() => !cancelled && setRelease(null));
    return () => {
      cancelled = true;
    };
  }, []);
  return release;
}
