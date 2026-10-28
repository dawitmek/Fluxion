import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_RUNNING = 2;
const MAX_WAITING = 10; // beyond this, lines are dropped rather than queued for minutes
const TIMEOUT_MS = 20_000;

// Wraps raw 16-bit mono PCM in a WAV header so browsers can decode it.
export function wav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Natural-sounding offline voices (https://github.com/rhasspy/piper), run as a separate process per line.
// A voice is a `<name>.onnx` model plus its `<name>.onnx.json` config in the voices directory.
export class Piper {
  private running = 0;
  private waiting: (() => void)[] = [];
  private voiceList: Promise<string[]> | null = null;

  constructor(
    private bin: string | undefined,
    private voicesDir: string | undefined,
    private binArgs: string[] = [], // tests run a fake Piper as `node fake-piper.mjs`
  ) {}

  async voices(): Promise<string[]> {
    if (!this.bin || !this.voicesDir) return [];
    const dir = this.voicesDir;
    this.voiceList ??= readdir(dir)
      .then((files) => files.filter((f) => f.endsWith('.onnx') && files.includes(`${f}.json`)).map((f) => f.slice(0, -5)).sort())
      .catch(() => []);
    return this.voiceList;
  }

  async synthesize(text: string, voice: string | null): Promise<Buffer> {
    const voices = await this.voices();
    const name = voice && voices.includes(voice) ? voice : voices[0];
    if (!name) throw new Error('No Piper voices installed');
    const model = join(this.voicesDir!, `${name}.onnx`);
    const { audio } = JSON.parse(await readFile(`${model}.json`, 'utf8')) as { audio: { sample_rate: number } };

    await this.slot();
    try {
      return wav(await this.run(model, text), audio.sample_rate);
    } finally {
      // Hand the slot straight to the next waiting line, so a newcomer can't jump in between.
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }

  private async slot() {
    if (this.running < MAX_RUNNING) {
      this.running++;
      return;
    }
    if (this.waiting.length >= MAX_WAITING) throw new Error('Piper is busy');
    await new Promise<void>((resolve) => this.waiting.push(resolve)); // resolved with a slot already held
  }

  private run(model: string, text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin!, [...this.binArgs, '--model', model, '--output_raw'], { stdio: ['pipe', 'pipe', 'pipe'] });
      const out: Buffer[] = [];
      let err = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
      child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => (err = (err + chunk.toString()).slice(-500)));
      child.on('error', (e) => (clearTimeout(timer), reject(e)));
      child.on('close', (code) => {
        clearTimeout(timer);
        const pcm = Buffer.concat(out);
        if (code === 0 && pcm.length > 0) resolve(pcm);
        else reject(new Error(`Piper exited with ${code}: ${err.trim()}`));
      });
      // One line in, one utterance out; newlines would split it into several.
      child.stdin.end(`${text.replace(/\s+/g, ' ')}\n`);
    });
  }
}
