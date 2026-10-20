#!/usr/bin/env bash
# Re-creates vendor/ and models/ from upstream packages. Run from the repo root:  bash scripts/vendor.sh
# Needs: node + npm, curl. Everything fetched here is MIT / Apache-2.0 (see THIRD_PARTY.md).
# NOTE: do NOT add @imgly/background-removal — it is AGPL-3.0 and would force this project's licence.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --no-audit --no-fund --legacy-peer-deps \
  onnxruntime-web@1.30.0 \
  @tensorflow/tfjs@4.11.0 upscaler@1.0.0 @upscalerjs/esrgan-slim@1.0.0 \
  tesseract.js@7.0.0 tesseract.js-core@7.0.0 \
  @tesseract.js-data/eng @tesseract.js-data/hin @tesseract.js-data/ben @tesseract.js-data/tam @tesseract.js-data/tel \
  @tesseract.js-data/kan @tesseract.js-data/mal @tesseract.js-data/mar @tesseract.js-data/ori @tesseract.js-data/pan
NM="$TMP/node_modules"

# --- background remover runtime (onnxruntime-web) ---
mkdir -p "$ROOT/vendor/ort"
cp "$NM/onnxruntime-web/dist/ort.wasm.min.js" "$NM/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs" \
   "$NM/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm" "$ROOT/vendor/ort/"

# --- upscaler runtime (TensorFlow.js + UpscalerJS) ---
mkdir -p "$ROOT/vendor/tfjs" "$ROOT/vendor/upscaler" "$ROOT/models/esrgan-slim"
cp "$NM/@tensorflow/tfjs/dist/tf.min.js" "$ROOT/vendor/tfjs/"
cp "$NM/upscaler/dist/browser/umd/upscaler.min.js" "$NM/upscaler/LICENSE" "$ROOT/vendor/upscaler/"
for s in x2 x3 x4; do mkdir -p "$ROOT/models/esrgan-slim/$s"; cp "$NM/@upscalerjs/esrgan-slim/models/$s/"* "$ROOT/models/esrgan-slim/$s/"; done

# --- OCR (Tesseract.js 7: worker + core 7.0.0 — the core MUST match the worker major version — + best_int language data) ---
T="$ROOT/vendor/tesseract"; mkdir -p "$T/core" "$T/lang"
cp "$NM/tesseract.js/dist/tesseract.min.js" "$NM/tesseract.js/dist/worker.min.js" "$T/"
cp "$NM/tesseract.js/LICENSE.md" "$T/LICENSE"
cp "$NM/tesseract.js-core/"tesseract-core*lstm.wasm* "$NM/tesseract.js-core/LICENSE" "$T/core/"
for l in eng hin ben tam tel kan mal mar ori pan; do cp "$NM/@tesseract.js-data/$l/4.0.0_best_int/$l.traineddata.gz" "$T/lang/"; done

# --- segmentation model: U²-Net-p (Apache-2.0), ~4.6 MB ---
curl -fL https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx -o "$ROOT/models/u2netp.onnx"
echo "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8  $ROOT/models/u2netp.onnx" | sha256sum -c -

echo "done — ZIP helper vendor/fflate.min.js is kept in the repo as-is."
