// The espeak-ng package ships no types; this covers the Emscripten module options we use.
declare module 'espeak-ng' {
  interface ESpeakModule {
    FS: { readFile(path: string): Uint8Array };
  }
  const ESpeakNg: (options: {
    arguments: string[];
    instantiateWasm?: (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => object;
    print?: (line: string) => void;
    printErr?: (line: string) => void;
  }) => Promise<ESpeakModule>;
  export default ESpeakNg;
}
