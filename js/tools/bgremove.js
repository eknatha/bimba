/* Bimba tool: Background remover.
   U²-Net (small, Apache-2.0) via onnxruntime-web (MIT). Both are self-hosted under vendor/ and models/,
   loaded lazily on first use, and run on-device. No image data leaves the browser. */
(function (IL) {
  const ORT_DIR = 'vendor/ort/';
  const MODEL = 'models/u2netp.onnx';
  const SIZE = 320;
  let sessionP = null;

  function getSession(onProgress) {
    if (sessionP) return sessionP;
    sessionP = (async () => {
      await IL.loadScript(ORT_DIR + 'ort.wasm.min.js');
      ort.env.wasm.wasmPaths = new URL(ORT_DIR, document.baseURI).href;   // dynamic import() needs an absolute URL
      ort.env.wasm.numThreads = 1;                 // works without cross-origin isolation
      // fetch with progress; ort re-reads the same files from the HTTP cache afterwards
      const total = 14 + 4.6;                       // MB, rough weights for the combined bar
      let done = 0;
      await IL.fetchBuffer(ORT_DIR + 'ort-wasm-simd-threaded.wasm', p => onProgress(Math.round((p || 0) / 100 * 14 / total * 100)));
      done = 14;
      const buf = await IL.fetchBuffer(MODEL, p => onProgress(Math.round((done + (p || 0) / 100 * 4.6) / total * 100)));
      return ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    })().catch(e => { sessionP = null; throw e; });
    return sessionP;
  }

  // returns a SIZE×SIZE Float32 mask in 0..1
  async function predict(session, img) {
    const c = IL.toCanvas(img, SIZE, SIZE);
    const d = c.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    let mx = 1; for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, d[i], d[i + 1], d[i + 2]);
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225], plane = SIZE * SIZE;
    const f = new Float32Array(3 * plane);
    for (let p = 0, i = 0; p < plane; p++, i += 4)
      for (let ch = 0; ch < 3; ch++) f[ch * plane + p] = (d[i + ch] / mx - mean[ch]) / std[ch];
    const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, SIZE, SIZE]) });
    const o = res[session.outputNames[0]].data;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < o.length; i++) { if (o[i] < lo) lo = o[i]; if (o[i] > hi) hi = o[i]; }
    const m = new Float32Array(o.length), span = (hi - lo) || 1;
    for (let i = 0; i < o.length; i++) m[i] = (o[i] - lo) / span;
    return m;
  }

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  IL.register('bgremove', function (root) {
    let img = null, name = 'image', maskFull = null;       // maskFull: Uint8ClampedArray W*H (0..255)

    root.appendChild(IL.dropZone(async fs => {
      try {
        img = await IL.loadImage(fs[0]); name = fs[0].name; maskFull = null;
        prev.style.display = 'none'; out.innerHTML = '';
        go.disabled = false; log.set(fs[0].name + ' · ' + img.naturalWidth + '×' + img.naturalHeight);
      } catch (e) { log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
    }, 'image/*', false));

    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML =
      '<div class="field"><label>' + IL.t('bg.bg') + '</label><select id="bgB">' +
        '<option value="t">' + IL.t('bg.transparent') + '</option><option value="w">' + IL.t('bg.white') + '</option>' +
        '<option value="k">' + IL.t('bg.black') + '</option><option value="c">' + IL.t('bg.custom') + '</option></select></div>' +
      '<div class="field" id="bgCW" style="display:none"><label>' + IL.t('bg.custom') + '</label><input type="color" id="bgC" value="#4f46e5"></div>' +
      '<div class="field range"><label>' + IL.t('bg.soft') + '</label><input type="range" id="bgS" min="0" max="100" value="45"></div>';
    root.appendChild(ctl);
    root.appendChild(IL.el('div', 'note', IL.t('bg.note') + ' ' + IL.t('c.modelnote')));

    const actions = IL.el('div', 'actions');
    const go = IL.el('button', 'btn', IL.t('bg.run')); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const prog = IL.progress(root);
    const log = IL.logger(root);
    const prev = IL.el('div', 'bg-prev checker'); prev.style.display = 'none';
    const cv = IL.el('canvas'); prev.appendChild(cv); root.appendChild(prev);
    const out = IL.el('div', 'out'); root.appendChild(out);
    const $ = s => root.querySelector(s);

    $('#bgB').onchange = () => { $('#bgCW').style.display = $('#bgB').value === 'c' ? '' : 'none'; compose(); };
    $('#bgC').oninput = compose;
    $('#bgS').oninput = compose;

    function compose() {
      if (!maskFull) return;
      const W = img.naturalWidth, H = img.naturalHeight;
      const cut = IL.el('canvas'); cut.width = W; cut.height = H;
      const cx = cut.getContext('2d'); cx.drawImage(img, 0, 0, W, H);
      const id = cx.getImageData(0, 0, W, H), d = id.data;
      const e = 0.04 + 0.46 * (+$('#bgS').value / 100);
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * smooth(0.5 - e, 0.5 + e, i / 255));
      for (let p = 0, i = 3; p < maskFull.length; p++, i += 4) d[i] = Math.round(d[i] * lut[maskFull[p]] / 255);
      cx.putImageData(id, 0, 0);
      const sel = $('#bgB').value;
      cv.width = W; cv.height = H;
      const x = cv.getContext('2d');
      const col = sel === 'w' ? '#ffffff' : sel === 'k' ? '#000000' : sel === 'c' ? $('#bgC').value : null;
      if (col) { x.fillStyle = col; x.fillRect(0, 0, W, H); }
      x.drawImage(cut, 0, 0);
      prev.classList.toggle('checker', !col);
      prev.style.display = '';
      cv.style.maxWidth = '100%';
      IL.canvasToBlob(cv, 'image/png').then(b => {
        out.innerHTML = ''; out.appendChild(IL.download(b, IL.rename(name, 'png').replace(/\.png$/, '-nobg.png')));
      });
    }

    go.onclick = async () => {
      go.disabled = true; out.innerHTML = '';
      try {
        log.set(IL.t('c.loading', { what: 'U²-Net', pct: 0 }));
        const session = await getSession(p => { prog.set(p); log.set(IL.t('c.loading', { what: 'U²-Net', pct: p })); });
        prog.set(null); log.set(IL.t('bg.detecting'));
        await IL.tick();
        const m = await predict(session, img);
        // scale mask up to full resolution
        const mc = IL.el('canvas'); mc.width = mc.height = SIZE;
        const mi = mc.getContext('2d').createImageData(SIZE, SIZE);
        for (let p = 0; p < m.length; p++) { const v = Math.round(m[p] * 255); mi.data[p * 4] = mi.data[p * 4 + 1] = mi.data[p * 4 + 2] = v; mi.data[p * 4 + 3] = 255; }
        mc.getContext('2d').putImageData(mi, 0, 0);
        const W = img.naturalWidth, H = img.naturalHeight;
        const big = IL.el('canvas'); big.width = W; big.height = H;
        const bx = big.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(mc, 0, 0, W, H);
        const bd = bx.getImageData(0, 0, W, H).data;
        maskFull = new Uint8ClampedArray(W * H);
        for (let p = 0; p < maskFull.length; p++) maskFull[p] = bd[p * 4];
        prog.hide(); log.set(IL.t('c.done'), 'ok');
        compose();
      } catch (e) { prog.hide(); log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
      go.disabled = false;
    };
  });
})(window.Bimba);
