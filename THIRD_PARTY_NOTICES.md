# Third-party notices

Fluxion uses these components for text-to-speech and its interface. Each keeps its own license.

| Component | Used for | License |
| --- | --- | --- |
| [eSpeak NG](https://github.com/espeak-ng/espeak-ng), via the [`espeak-ng`](https://github.com/ianmarmour/espeak-ng.js) WebAssembly build | The "eSpeak" voice engine, run inside the overlay | GPL-3.0-or-later |
| [Piper](https://github.com/rhasspy/piper) 2023.11.14-2 | The "Piper" voice engine, run by the server (Docker image only) | MIT (bundles eSpeak NG data, GPL-3.0) |
| Piper voice `en_GB-alba-medium`, trained on the [Alba dataset](https://datashare.ed.ac.uk/handle/10283/3270) | Piper voice | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Piper voice `en_US-libritts_r-medium` (904 speakers), trained on [LibriTTS-R](http://www.openslr.org/141/) | Piper voice | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Piper voice `en_GB-vctk-medium` (109 speakers), trained on [VCTK](https://datashare.ed.ac.uk/handle/10283/3443) | Piper voice | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Piper voice `en_US-kristin-medium`, trained on [LibriVox](https://librivox.org) recordings | Piper voice | Public domain |
| Piper voice `en_GB-northern_english_male-medium`, trained on [OpenSLR 83](http://www.openslr.org/83/) | Piper voice | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| [Geist](https://github.com/vercel/geist-font) font, via [`@fontsource-variable/geist`](https://fontsource.org/fonts/geist) | Typeface of the dashboard and companion app, bundled with them | [SIL Open Font License 1.1](https://openfontlicense.org) |

Only voices whose training data allows commercial use are bundled. If you add more Piper voices (drop the
`.onnx` and `.onnx.json` files into `PIPER_VOICES_DIR`), check each voice's `MODEL_CARD`: several popular
voices (for example `lessac`, `ryan`, `hfc_*`) are non-commercial only.
