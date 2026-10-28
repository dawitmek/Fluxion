# Third-party notices

Fluxion uses these components for text-to-speech. Each keeps its own license.

| Component | Used for | License |
| --- | --- | --- |
| [eSpeak NG](https://github.com/espeak-ng/espeak-ng), via the [`espeak-ng`](https://github.com/ianmarmour/espeak-ng.js) WebAssembly build | The "eSpeak" voice engine, run inside the overlay | GPL-3.0-or-later |
| [Piper](https://github.com/rhasspy/piper) 2023.11.14-2 | The "Piper" voice engine, run by the server (Docker image only) | MIT (bundles eSpeak NG data, GPL-3.0) |
| Piper voice `en_GB-alba-medium`, trained on the [Alba dataset](https://datashare.ed.ac.uk/handle/10283/3270) | Piper voice | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Piper voice `en_US-libritts_r-medium`, trained on [LibriTTS-R](http://www.openslr.org/141/) | Piper voice | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Only voices whose training data allows commercial use are bundled. If you add more Piper voices (drop the
`.onnx` and `.onnx.json` files into `PIPER_VOICES_DIR`), check each voice's `MODEL_CARD`: several popular
voices (for example `lessac`, `ryan`, `hfc_*`) are non-commercial only.
