// eSpeak NG compiled to WebAssembly (GPL-3.0, https://github.com/espeak-ng/espeak-ng). Robotic, but it runs
// inside the overlay, so its audio goes through OBS like the alert sounds. Loaded only when first needed:
// the module is ~18 MB, compiled once and reused for every line.
import wasmUrl from 'espeak-ng/dist/espeak-ng.wasm?url';

let compiled: Promise<WebAssembly.Module> | null = null;

export async function espeakWav(text: string, voice: string): Promise<ArrayBuffer> {
  const { default: ESpeakNg } = await import('espeak-ng');
  compiled ??= fetch(wasmUrl)
    .then((res) => res.arrayBuffer())
    .then((bytes) => WebAssembly.compile(bytes));
  const module = await compiled;
  const espeak = await ESpeakNg({
    // A leading "-" would be read as a command-line option.
    arguments: ['-w', '/out.wav', '-v', voice, text.replace(/^[\s-]+/, '')],
    instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) {
      void WebAssembly.instantiate(module, imports).then(done);
      return {};
    },
    print: () => {},
    printErr: () => {},
  });
  const wav: Uint8Array = espeak.FS.readFile('/out.wav');
  return wav.slice().buffer;
}
