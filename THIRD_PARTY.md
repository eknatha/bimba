# Third-party components

Everything below is self-hosted in this repository (nothing is loaded from a CDN) and is used under a permissive licence.
Re-create the files with `bash scripts/vendor.sh`.

| Component | Used for | Version | Licence |
|---|---|---|---|
| [fflate](https://github.com/101arrowz/fflate) | ZIP downloads | bundled | MIT |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | runs the background-removal model (WebAssembly) | 1.30.0 | MIT |
| [U²-Net-p](https://github.com/xuebinqin/U-2-Net) (ONNX via [rembg](https://github.com/danielgatis/rembg)) | background remover model, `models/u2netp.onnx` | — | Apache-2.0 |
| [TensorFlow.js](https://github.com/tensorflow/tfjs) | upscaler runtime | 4.11.0 | Apache-2.0 |
| [UpscalerJS](https://github.com/thekevinscott/UpscalerJS) + `@upscalerjs/esrgan-slim` | upscaler + ESRGAN-slim weights (x2/x3/x4) | 1.0.0 | MIT |
| [Tesseract.js](https://github.com/naptha/tesseract.js) + tesseract.js-core | OCR | 7.0.0 | Apache-2.0 |
| [tessdata_best](https://github.com/tesseract-ocr/tessdata_best) (integer-quantised) | OCR language data (10 languages) | 4.0.0_best_int | Apache-2.0 |

Deliberately **not** used: `@imgly/background-removal` (AGPL-3.0), which would require this whole project to be AGPL.
The full U²-Net model (176 MB) is also not used because it exceeds GitHub's 100 MB file limit; the small `u2netp` is used instead.
