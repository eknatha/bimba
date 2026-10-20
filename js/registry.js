/* Bimba — tool registry (metadata only; builders in js/tools/*.js)
   primary:true → oversized primary cards (top of page)
   g: '<i18n key>' → starts a secondary group section
   sens:true → responsible-use gate before the tool opens (see js/ethics.js)
   ai:true   → "on-device AI" chip
   Names/descriptions come from the language packs: tool.<id>.t / tool.<id>.d (English here is the fallback). */
window.Bimba = window.Bimba || { tools: {} };

window.Bimba.registry = [
  // ----- primary (oversized) -----
  { id: 'compress', ico: '⤓', t: 'Compress', d: 'Shrink file size with a live quality preview.', primary: true },
  { id: 'convert',  ico: '⇄', t: 'Convert',  d: 'PNG, JPEG, WebP — batch, one click.',          primary: true },
  { id: 'resize',   ico: '⤢', t: 'Resize',   d: 'Scale by pixels, percent, or fit.',            primary: true },

  // ----- secondary groups -----
  { g: 'grp.edit' },
  { id: 'crop',      ico: '⌗', t: 'Crop',          d: 'Drag a region or pick a fixed aspect ratio.' },
  { id: 'transform', ico: '⟳', t: 'Rotate & flip', d: 'Rotate 90° steps, flip horizontally / vertically.' },
  { id: 'watermark', ico: '※', t: 'Watermark',     d: 'Overlay text on one image or a whole batch.' },
  { id: 'restore',   ico: '✧', t: 'Photo restore & colorize', d: 'Fix fading, dust and noise; add a colour tint.', sens: true },

  { g: 'grp.utility' },
  { id: 'targetsize', ico: '⎙', t: 'Compress to size', d: 'Hit an exact limit: 50 KB, 100 KB, 200 KB, 500 KB or 1 MB.', sens: true },
  { id: 'docscan',    ico: '▤', t: 'Document scanner', d: 'Straighten a photo of a page, clean it up, save as PDF.', sens: true },
  { id: 'imgpdf',     ico: '▥', t: 'Image → PDF',      d: 'Combine images into one PDF — reorder, pick page size.' },
  { id: 'pixeldiff',  ico: '◐', t: 'Pixel diff',       d: 'Compare two images and highlight what changed.' },
  { id: 'favicon',    ico: '◧', t: 'Favicon set',      d: 'Generate 16–512px icons + ZIP from one image.' },
  { id: 'exif',       ico: '⊗', t: 'Strip EXIF',       d: 'Remove camera/location metadata. Re-encode clean.' },

  { g: 'grp.ai' },
  { id: 'bgremove', ico: '◑', t: 'Background remover',  d: 'Cut out the subject. Runs a small model on your device.', sens: true, ai: true },
  { id: 'upscale',  ico: '⤊', t: 'Upscaler',            d: 'Enlarge 2×–4× with an on-device ESRGAN model.',           sens: true, ai: true },
  { id: 'ocr',      ico: '≣', t: 'OCR — image to text', d: 'Read text from images in English and 9 Indian languages.', sens: true, ai: true }
];
