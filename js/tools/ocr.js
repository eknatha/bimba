/* Bimba tool: OCR — image → text.
   Tesseract.js (Apache-2.0), worker + wasm core + language data all self-hosted in vendor/tesseract/.
   English + Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Odia, Punjabi. */
(function (IL) {
  const DIR = 'vendor/tesseract/';
  // ui language code → { tesseract code, english label }
  const LANGS = [
    ['en', 'eng', 'English'], ['hi', 'hin', 'Hindi'], ['te', 'tel', 'Telugu'], ['ta', 'tam', 'Tamil'],
    ['kn', 'kan', 'Kannada'], ['ml', 'mal', 'Malayalam'], ['mr', 'mar', 'Marathi'], ['bn', 'ben', 'Bengali'],
    ['or', 'ori', 'Odia'], ['pa', 'pan', 'Punjabi']
  ];
  let worker = null, workerKey = '';

  async function getWorker(langs, onLog) {
    const key = langs.join('+');
    if (worker && workerKey === key) return worker;
    if (worker) { try { await worker.terminate(); } catch (e) {} worker = null; }
    await IL.loadScript(DIR + 'tesseract.min.js');
    worker = await Tesseract.createWorker(langs, 1, {
      workerPath: DIR + 'worker.min.js',
      corePath: DIR + 'core/',
      langPath: DIR + 'lang/',
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: false,
      logger: onLog
    });
    workerKey = key;
    return worker;
  }

  // Tesseract is happiest when a text line is ~50-70 px tall. Measure the typical line (ink-row run) height and
  // scale to that, instead of blindly enlarging small images (which garbles already-large text).
  function lineHeight(img) {
    const s = Math.min(1, 1000 / img.naturalWidth), w = Math.max(8, Math.round(img.naturalWidth * s)), h = Math.max(8, Math.round(img.naturalHeight * s));
    const d = IL.toCanvas(img, w, h).getContext('2d').getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
    const hist = new Uint32Array(256);
    for (let i = 0, p = 0; p < g.length; i += 4, p++) { const v = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) | 0; g[p] = v; hist[v]++; }
    let a = 0, lo = 0, hi = 255; const tot = g.length;
    for (let t = 0; t < 256; t++) { a += hist[t]; if (a >= tot * 0.01) { lo = t; break; } }
    a = 0; for (let t = 255; t >= 0; t--) { a += hist[t]; if (a >= tot * 0.01) { hi = t; break; } }
    if (hi - lo < 30) return 0;
    const thr = (lo + hi) / 2; let med = 0, c = 0, cum = 0;
    for (let t = 0; t < 256; t++) { cum += hist[t]; if (cum >= tot / 2) { med = t; break; } }
    const darkText = med > thr;                                   // light page, dark ink (or the reverse)
    const runs = []; let run = 0;
    for (let y = 0; y < h; y++) {
      let ink = 0;
      for (let x = 0; x < w; x++) { const v = g[y * w + x]; if (darkText ? v < thr : v > thr) ink++; }
      if (ink > w * 0.004) run++; else { if (run >= 4) runs.push(run); run = 0; }
    }
    if (run >= 4) runs.push(run);
    if (!runs.length) return 0;
    runs.sort((p, q) => p - q);
    return runs[runs.length >> 1] / s;                           // median line height in original pixels
  }

  // grayscale + percentile contrast; resize so text lines land near the size Tesseract likes
  function prepare(img) {
    const lh = lineHeight(img);
    let k = 1;
    if (lh > 0) { k = Math.min(3, Math.max(0.5, 60 / lh)); if (k > 0.8 && k < 1.25) k = 1; }
    else { const m = Math.min(img.naturalWidth, img.naturalHeight); k = m < 900 ? Math.min(3, 1200 / m) : 1; }
    const c = IL.toCanvas(img, Math.max(8, Math.round(img.naturalWidth * k)), Math.max(8, Math.round(img.naturalHeight * k)));
    const x = c.getContext('2d'), id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
    const tot = c.width * c.height; let lo = 0, hi = 255, a = 0;
    for (let t = 0; t < 256; t++) { a += hist[t]; if (a >= tot * 0.01) { lo = t; break; } }
    a = 0; for (let t = 255; t >= 0; t--) { a += hist[t]; if (a >= tot * 0.01) { hi = t; break; } }
    if (hi - lo > 20) {
      const s = 255 / (hi - lo);
      for (let i = 0; i < d.length; i += 4) { const v = (d[i] - lo) * s; d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v; }
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  IL.register('ocr', function (root) {
    let img = null, name = 'text';

    root.appendChild(IL.dropZone(async fs => {
      try {
        img = await IL.loadImage(fs[0]); name = fs[0].name.replace(/\.[^.]+$/, '');
        go.disabled = false; log.set(fs[0].name + ' · ' + img.naturalWidth + '×' + img.naturalHeight);
      } catch (e) { log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
    }, 'image/*', false));

    const cur = IL.i18n ? IL.i18n.get() : 'en';
    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML =
      '<div class="field"><label>' + IL.t('ocr.lang') + '</label><select id="ocL">' +
        LANGS.map(([ui, tc, en]) => {
          const meta = IL.lang[ui] && IL.lang[ui].meta;
          const lbl = (meta && ui !== 'en' ? meta.native + ' · ' : '') + en;
          return `<option value="${tc}"${ui === cur ? ' selected' : ''}>${lbl}</option>`;
        }).join('') + '</select></div>' +
      '<label class="chk"><input type="checkbox" id="ocE" checked> ' + IL.t('ocr.alsoEn') + '</label>' +
      '<label class="chk"><input type="checkbox" id="ocH" checked> ' + IL.t('ocr.enh') + '</label>';
    root.appendChild(ctl);
    root.appendChild(IL.el('div', 'note', IL.t('ocr.note') + ' ' + IL.t('c.modelnote')));

    const actions = IL.el('div', 'actions');
    const go = IL.el('button', 'btn', IL.t('ocr.run')); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const prog = IL.progress(root);
    const log = IL.logger(root);
    const res = IL.el('div', 'ocr-res'); res.style.display = 'none';
    res.innerHTML = '<h4>' + IL.t('ocr.out') + ' <span id="ocC"></span></h4><textarea id="ocT" rows="10" spellcheck="false"></textarea>' +
      '<div class="actions"><button class="btn ghost" id="ocCp">' + IL.t('c.copy') + '</button>' +
      '<button class="btn ghost" id="ocSv">' + IL.t('ocr.save') + '</button></div>';
    root.appendChild(res);
    const $ = s => root.querySelector(s);

    const sync = () => {
      const l = $('#ocL').value;
      $('#ocE').disabled = l === 'eng';
    };
    $('#ocL').onchange = sync; sync();

    go.onclick = async () => {
      go.disabled = true; res.style.display = 'none';
      try {
        const l = $('#ocL').value;
        const langs = (l !== 'eng' && $('#ocE').checked) ? [l, 'eng'] : [l];
        prog.set(null); log.set(IL.t('c.loading', { what: 'OCR', pct: '…' }));
        const w = await getWorker(langs, m => {
          if (m.status === 'recognizing text') { const p = Math.round(m.progress * 100); prog.set(p); log.set(IL.t('ocr.running', { pct: p })); }
        });
        const src = $('#ocH').checked ? prepare(img) : IL.toCanvas(img);
        const blob = await IL.canvasToBlob(src, 'image/png');
        const { data } = await w.recognize(blob);
        $('#ocT').value = data.text.trim();
        $('#ocC').textContent = '· ' + IL.t('ocr.conf', { n: Math.round(data.confidence) });
        res.style.display = '';
        prog.hide(); log.set(IL.t('c.done'), 'ok');
      } catch (e) { prog.hide(); log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
      go.disabled = false;
    };
    $('#ocCp').onclick = async () => { if (await IL.copyText($('#ocT').value)) { $('#ocCp').textContent = IL.t('c.copied'); setTimeout(() => { $('#ocCp').textContent = IL.t('c.copy'); }, 1400); } };
    $('#ocSv').onclick = () => {
      const b = new Blob([$('#ocT').value], { type: 'text/plain;charset=utf-8' });
      const a = IL.el('a'); a.href = URL.createObjectURL(b); a.download = name + '.txt'; a.click();
    };
  });
})(window.Bimba);
