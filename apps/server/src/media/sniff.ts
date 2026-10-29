import type { MediaKind } from '@fluxion/shared';

// What a file is, judged by its first bytes. Only formats every browser (and OBS) plays are accepted;
// SVG and HTML never are, since they can run scripts.
export function sniff(bytes: Buffer): { kind: MediaKind; mime: string } | null {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('latin1');
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { kind: 'image', mime: 'image/png' };
  if (starts(0xff, 0xd8, 0xff)) return { kind: 'image', mime: 'image/jpeg' };
  if (ascii(0, 4) === 'GIF8') return { kind: 'image', mime: 'image/gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { kind: 'image', mime: 'image/webp' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { kind: 'audio', mime: 'audio/wav' };
  if (ascii(0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg' };
  if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return { kind: 'audio', mime: 'audio/mpeg' };
  if (starts(0x1a, 0x45, 0xdf, 0xa3)) return { kind: 'video', mime: 'video/webm' };
  if (ascii(4, 8) === 'ftyp') {
    // M4A is audio in an MP4 container.
    return ascii(8, 11) === 'M4A' ? { kind: 'audio', mime: 'audio/mp4' } : { kind: 'video', mime: 'video/mp4' };
  }
  return null;
}
