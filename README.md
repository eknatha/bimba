# Bimba

Offline image toolkit — part of the [EknathaLabs](https://eknathalabs.com) ecosystem.

**No uploads. No backend. Every operation, including the AI tools, runs entirely in your browser.**

Live: [bimba.eknathalabs.com](https://bimba.eknathalabs.com) · Sibling project: [Patram](https://patram.eknathalabs.com) (PDF toolkit)

## Tools (16)

| Group | Tool | Notes |
|---|---|---|
| Primary | Convert · Compress · Resize | batch + ZIP |
| Edit | Crop · Rotate & flip · Watermark · **Photo restore & colorize** | restore = fade/cast fix, dust & scratch removal, denoise, sharpen, colour tint |
| Utility | **Image → PDF** (any number of images, reorder, A4 / Letter / fit-to-image, margins) · **Compress to size** (50 KB / 100 KB / 200 KB / 500 KB / 1 MB / custom) · **Document scanner** · **Image → PDF** · **Pixel diff** · Favicon set · Strip EXIF | scanner = perspective fix, auto-detect corners, multi-page PDF; Image → PDF = many images → one PDF, reorder, A4 / Letter / fit-to-image |
| On-device AI | **Background remover** · **Upscaler (2–4×)** · **OCR (English + 9 Indian languages)** | models load on first use, then are cached |

### Also in this version
- **Multi-language UI** — English, हिन्दी, తెలుగు, தமிழ், ಕನ್ನಡ, മലയാളം, मराठी, বাংলা, ଓଡ଼ିଆ (beta), ਪੰਜਾਬੀ, Español, Русский. The UI language is auto-detected from the browser and can be changed from the header.
- **Offline proof** — header badge opens a panel that logs every request the page makes (assets / uploads / external), with a self-test. Works with the service worker so the site reloads with no network after the first visit.
- **Ethical-use guard** — first-visit "Use responsibly" notice, a caution strip on every tool, and an acknowledgement gate on the sensitive ones (restore, compress-to-size, scanner, background remover, upscaler, OCR).

## Architecture

Multi-file vanilla HTML/CSS/JS — no build step, no framework. Tools self-register with `Bimba.register(id, fn(root))`; metadata lives in `js/registry.js`.

```
├── index.html            # shell + CSP + script tags
├── sw.js                 # service worker: core network-first, vendor/ & models/ cache-first
├── css/styles.css
├── js/
│   ├── proof.js          # offline proof (loaded FIRST so it can wrap fetch/XHR/beacon/WebSocket)
│   ├── helpers.js        # canvas/zip utils, IL.loadScript / fetchBuffer / progress / caution
│   ├── i18n.js           # translation engine (+ legacy text translator, RTL, per-script fonts)
│   ├── lang/*.js         # one pack per language; en.js is the master
│   ├── ethics.js         # first-visit modal, per-tool caution, acknowledgement gate
│   ├── registry.js  sample.js  app.js  hero-demo.js  visitors.js
│   └── tools/*.js        # one file per tool
├── frames/upscale.html   # isolated frame for TensorFlow.js (needs 'unsafe-eval'; has its own strict CSP)
├── js/frames/upscale-frame.js
├── vendor/               # ort/ tfjs/ upscaler/ tesseract/ fflate — self-hosted
├── models/               # u2netp.onnx, esrgan-slim/
└── scripts/vendor.sh     # re-creates vendor/ and models/ from upstream
```

### Adding a tool
1. `js/tools/<id>.js` → `IL.register('<id>', root => { … })`
2. Add an entry to `js/registry.js` (`sens:true` for the acknowledgement gate, `ai:true` for the AI badge).
3. Add `tool.<id>.t`, `tool.<id>.d` and `warn.<id>` to `js/lang/en.js` (and ideally the other packs).
4. Add the `<script>` tag in `index.html` (and the file to `CORE` in `sw.js`).

### Adding a language
1. Copy `js/lang/en.js` to `js/lang/<code>.js`; keep **every key**, keep `{placeholders}` and HTML tags unchanged, translate the values.
2. Fill `legacy` — exact English UI strings of the older tools mapped to the translation.
3. Set `meta: { native, dir: 'ltr'|'rtl', beta: true }`, add the code to `ORDER` in `i18n.js` and the `<script>` tag in `index.html`.
Missing keys fall back to English. Packs can be checked with a small Node script that compares keys, placeholders and tags against `en.js`.

## Privacy & the "offline" claim — exactly what it means
- Images are never sent anywhere. The page's CSP only allows connections to this site and `api.counterapi.dev`.
- The **visitor counter** is the one external request (a number, no image data). The counter key is still `imagelab-total` on purpose (renaming it would reset the global count to 0). Remove `js/visitors.js` and the host in the CSP to make the site fully network-silent; the Offline proof panel lists it when it fires.
- The proof panel sees only what the page itself requests (not browser-internal or worker-internal traffic). The strongest check is airplane mode, or DevTools → Network.

## Known limits (honest)
- **Colorize is a tint, not AI colorization.** Colours are an artistic grade and not historically accurate (the UI says so).
- **Upscaling invents detail** (ESRGAN-slim); it is not a forensic enhancement. Large inputs are limited (~36 MP output) to protect memory.
- **Background remover uses U²-Net-p (4.6 MB)** — good on clear subjects, weaker on fine hair, glass and busy backgrounds than the full model.
- **OCR** covers English + 9 Indian languages (Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Odia, Punjabi). Accuracy depends on image quality and the picture is auto-scaled to a text size the engine likes; always proof-read the result. The UI can be Spanish/Russian but OCR is not offered for those scripts yet.
- **Translations are machine-assisted drafts** and need review by native speakers — especially Odia (marked beta); Spanish and Russian too.
- First use of an AI tool downloads 5–15 MB from this site (cached afterwards). Offline use requires one online visit first.
- WebP/AVIF encode support depends on the browser; JPEG/WebP re-encode is lossy; EXIF stripping works by re-encoding.
- Document-scanner auto-detect is approximate; adjust the corners.

## Run locally
```
python3 -m http.server 8000     # open http://localhost:8000  (not file://)
```

## Deploy (GitHub Pages)
Push the whole tree (keep `css/ js/ frames/ vendor/ models/`), Pages → `main` / root. `CNAME` binds the domain; `.nojekyll` keeps Pages from filtering paths. Largest file is ~14 MB (ORT wasm), well under GitHub's 100 MB limit.

## Licence
Project code: as per this repository. Third-party components: see [THIRD_PARTY.md](THIRD_PARTY.md) (all MIT / Apache-2.0).
