/* Bimba tool: Photo restore & colorize.
   Classical, on-device restoration: dust/light-scratch removal, edge-preserving denoise,
   fade + colour-cast correction, sharpening, and an optional *colour tint* (gradient / split toning).
   NOTE: the tint is an artistic grade — it is NOT AI colorization and colours are not historically accurate. */
(function (IL) {
  const MAX_SIDE = 3000;

  const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v);

  // ---- 1. dust & light scratches: replace isolated outliers with the median of their neighbours ----
  function despeckle(img, strength) {
    const w = img.width, h = img.height, d = img.data;
    const T = 70 - 45 * strength;                            // luma deviation that counts as a speck
    const L = new Float32Array(w * h);
    for (let p = 0, i = 0; p < L.length; p++, i += 4) L[p] = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
    const src = new Uint8ClampedArray(d);                    // read from a copy so fixes don't cascade
    const nb = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
    const tmp = new Array(8);
    let fixed = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      let m = 0, mn = 1e9, mx = -1e9;
      for (let k = 0; k < 8; k++) { const v = L[p + nb[k]]; m += v; if (v < mn) mn = v; if (v > mx) mx = v; }
      m /= 8;
      const dv = L[p] - m;
      // outlier vs the neighbourhood AND outside its range (so real edges/texture are left alone)
      if (Math.abs(dv) > T && (L[p] > mx + T * 0.4 || L[p] < mn - T * 0.4)) {
        for (let c = 0; c < 3; c++) {
          for (let k = 0; k < 8; k++) tmp[k] = src[(p + nb[k]) * 4 + c];
          tmp.sort((a, b) => a - b);
          d[p * 4 + c] = (tmp[3] + tmp[4]) / 2;
        }
        fixed++;
      }
    }
    return fixed;
  }

  // ---- 2. edge-preserving denoise (5×5 bilateral) ----
  async function denoise(img, strength, onRows) {
    const w = img.width, h = img.height, src = new Uint8ClampedArray(img.data), d = img.data;
    const sr = 10 + 38 * strength;
    const lut = new Float32Array(766);
    for (let i = 0; i < 766; i++) lut[i] = Math.exp(-(i * i) / (2 * sr * sr * 3));
    const R = 2, sw = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) sw.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * 1.5 * 1.5))]);
    for (let y = R; y < h - R; y++) {
      for (let x = R; x < w - R; x++) {
        const i = (y * w + x) * 4, r0 = src[i], g0 = src[i + 1], b0 = src[i + 2];
        let sr_ = 0, sg = 0, sb = 0, ws = 0;
        for (let k = 0; k < sw.length; k++) {
          const j = ((y + sw[k][1]) * w + x + sw[k][0]) * 4;
          const dist = Math.abs(src[j] - r0) + Math.abs(src[j + 1] - g0) + Math.abs(src[j + 2] - b0);
          const wt = sw[k][2] * lut[dist];
          sr_ += src[j] * wt; sg += src[j + 1] * wt; sb += src[j + 2] * wt; ws += wt;
        }
        d[i] = sr_ / ws; d[i + 1] = sg / ws; d[i + 2] = sb / ws;
      }
      if (y % 48 === 0) { onRows && onRows(y / h); await IL.tick(); }
    }
  }

  // ---- 3. fading + colour cast ----
  function fixTone(img, strength) {
    const w = img.width, h = img.height, d = img.data, n = w * h;
    const lo = [0, 0, 0], hi = [255, 255, 255], mean = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const hist = new Uint32Array(256); let s = 0;
      for (let i = c; i < d.length; i += 4) { hist[d[i]]++; s += d[i]; }
      mean[c] = s / n;
      let a = 0; for (let t = 0; t < 256; t++) { a += hist[t]; if (a >= n * 0.005) { lo[c] = t; break; } }
      a = 0; for (let t = 255; t >= 0; t--) { a += hist[t]; if (a >= n * 0.005) { hi[c] = t; break; } }
    }
    const gm = (mean[0] + mean[1] + mean[2]) / 3;
    const bal = mean.map(m => (m > 5 ? gm / m : 1));                       // gray-world gain
    const mix = 0.35 + 0.65 * strength;
    const lut = [0, 1, 2].map(c => {
      const t = new Uint8ClampedArray(256), span = Math.max(24, hi[c] - lo[c]);
      for (let v = 0; v < 256; v++) {
        const st = clamp((v - lo[c]) / span * 255), k = 0.45 + 0.35 * strength;   // never a full stretch: avoids crushed shadows
        let x = v + (st - v) * k;
        x = x * (1 - mix + mix * bal[c]);                                  // blend white balance
        x = clamp(x);
        const s = x / 255;                                                  // gentle S-curve contrast
        t[v] = clamp(255 * (s + 0.6 * strength * (s * s * (3 - 2 * s) - s)));
      }
      return t;
    });
    // faded prints are low-chroma: give saturation a gentle lift
    let chroma = 0;
    for (let i = 0; i < d.length; i += 4) chroma += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    chroma /= n;
    const sat = chroma > 8 ? 1 + 0.25 * strength * Math.max(0, 1 - chroma / 90) : 1;
    for (let i = 0; i < d.length; i += 4) {
      let r = lut[0][d[i]], g = lut[1][d[i + 1]], b = lut[2][d[i + 2]];
      if (sat !== 1) { const y = r * .299 + g * .587 + b * .114; r = clamp(y + (r - y) * sat); g = clamp(y + (g - y) * sat); b = clamp(y + (b - y) * sat); }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }

  // ---- 4. sharpen (unsharp mask) ----
  function sharpen(img, strength) {
    const w = img.width, h = img.height, d = img.data, amt = 0.4 + 1.1 * strength;
    const blur = new Float32Array(w * h * 3), tmp = new Float32Array(w * h * 3);
    const r = 2;
    for (let c = 0; c < 3; c++) {
      for (let y = 0; y < h; y++) {
        let s = 0, cnt = 0;
        for (let x = -r; x <= r; x++) if (x >= 0 && x < w) { s += d[(y * w + x) * 4 + c]; cnt++; }
        for (let x = 0; x < w; x++) {
          tmp[(y * w + x) * 3 + c] = s / cnt;
          const a = x - r, b = x + r + 1;
          if (a >= 0) { s -= d[(y * w + a) * 4 + c]; cnt--; }
          if (b < w) { s += d[(y * w + b) * 4 + c]; cnt++; }
        }
      }
      for (let x = 0; x < w; x++) {
        let s = 0, cnt = 0;
        for (let y = -r; y <= r; y++) if (y >= 0 && y < h) { s += tmp[(y * w + x) * 3 + c]; cnt++; }
        for (let y = 0; y < h; y++) {
          blur[(y * w + x) * 3 + c] = s / cnt;
          const a = y - r, b = y + r + 1;
          if (a >= 0) { s -= tmp[(a * w + x) * 3 + c]; cnt--; }
          if (b < h) { s += tmp[(b * w + x) * 3 + c]; cnt++; }
        }
      }
    }
    for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) {
      const i = p * 4 + c, b = blur[p * 3 + c];
      d[i] = clamp(d[i] + (d[i] - b) * amt);
    }
  }

  // ---- 5. colour tint (gradient map / split toning) ----
  const hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const RAMPS = {
    sepia: [hex('#2e1f10'), hex('#9a7850'), hex('#f6e8cc')],
    mono: [[0, 0, 0], [128, 128, 128], [255, 255, 255]]
  };
  function tint(img, kind, strength) {
    if (kind === 'none') return;
    const d = img.data, mix = 0.35 + 0.65 * strength;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], y = (r * .299 + g * .587 + b * .114) / 255;
      let tr, tg, tb;
      if (RAMPS[kind]) {
        const rp = RAMPS[kind], t = y < .5 ? y * 2 : (y - .5) * 2, a = y < .5 ? rp[0] : rp[1], z = y < .5 ? rp[1] : rp[2];
        tr = a[0] + (z[0] - a[0]) * t; tg = a[1] + (z[1] - a[1]) * t; tb = a[2] + (z[2] - a[2]) * t;
      } else if (kind === 'warm') { tr = r * 1.10 + 6; tg = g * 1.00 + 2; tb = b * 0.86; }
      else if (kind === 'cool') { tr = r * 0.90; tg = g * 1.00 + 2; tb = b * 1.10 + 6; }
      else {                                                              // teal & orange split-toning
        const sh = 1 - y, hl = y;
        tr = r + 38 * hl - 22 * sh; tg = g + 6 * hl + 6 * sh; tb = b - 30 * hl + 34 * sh;
      }
      d[i] = clamp(r + (tr - r) * mix); d[i + 1] = clamp(g + (tg - g) * mix); d[i + 2] = clamp(b + (tb - b) * mix);
    }
  }

  async function run(canvas, opt, onProgress) {
    const w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, w, h);
    const s = opt.strength, step = (p, t) => { onProgress && onProgress(p); return IL.tick(); };
    let fixed = 0;
    if (opt.dust) { await step(5); fixed = despeckle(img, s); fixed += despeckle(img, s); }
    if (opt.noise) { await step(15); await denoise(img, s, f => onProgress && onProgress(15 + Math.round(f * 55))); }
    if (opt.fix) { await step(72); fixTone(img, s); }
    if (opt.sharp) { await step(85); sharpen(img, s); }
    if (opt.tint !== 'none') { await step(94); tint(img, opt.tint, s); }
    const out = IL.el('canvas'); out.width = w; out.height = h;
    out.getContext('2d').putImageData(img, 0, 0);
    out.__fixed = fixed;
    return out;
  }

  IL.register('restore', function (root) {
    let img = null, name = 'photo', before = null, after = null, split = 0.5, drag = false;

    root.appendChild(IL.dropZone(async fs => {
      try {
        img = await IL.loadImage(fs[0]); name = fs[0].name.replace(/\.[^.]+$/, '');
        const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        before = IL.toCanvas(img, Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
        after = null; out.innerHTML = ''; go.disabled = false;
        draw(); log.set(fs[0].name + ' · ' + before.width + '×' + before.height);
      } catch (e) { log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
    }, 'image/*', false));

    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML =
      '<label class="chk"><input type="checkbox" id="rsF" checked> ' + IL.t('rs.fix') + '</label>' +
      '<label class="chk"><input type="checkbox" id="rsD" checked> ' + IL.t('rs.dust') + '</label>' +
      '<label class="chk"><input type="checkbox" id="rsN"> ' + IL.t('rs.noise') + '</label>' +
      '<label class="chk"><input type="checkbox" id="rsS" checked> ' + IL.t('rs.sharp') + '</label>';
    root.appendChild(ctl);
    const c2 = IL.el('div', 'ctl');
    c2.innerHTML =
      '<div class="field range"><label>' + IL.t('rs.strength') + ' <span id="rsV">60</span>%</label><input type="range" id="rsK" min="0" max="100" value="60"></div>' +
      '<div class="field"><label>' + IL.t('rs.tint') + '</label><select id="rsT">' +
        ['none', 'sepia', 'warm', 'cool', 'teal', 'mono'].map(k => `<option value="${k}">${IL.t('rs.t.' + k)}</option>`).join('') + '</select></div>';
    root.appendChild(c2);
    root.appendChild(IL.el('div', 'note', IL.t('rs.note')));

    const actions = IL.el('div', 'actions');
    const go = IL.el('button', 'btn', IL.t('rs.run')); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const prog = IL.progress(root);
    const log = IL.logger(root);
    const view = IL.el('div', 'pd-view'); const cv = IL.el('canvas'); view.appendChild(cv); view.style.display = 'none'; root.appendChild(view);
    const out = IL.el('div', 'out'); root.appendChild(out);
    const $ = s => root.querySelector(s);
    $('#rsK').oninput = () => { $('#rsV').textContent = $('#rsK').value; };

    function draw() {
      if (!before) return;
      view.style.display = '';
      const w = before.width, h = before.height; cv.width = w; cv.height = h;
      const x = cv.getContext('2d');
      if (!after) { x.drawImage(before, 0, 0); return; }
      x.drawImage(after, 0, 0);
      x.save(); x.beginPath(); x.rect(0, 0, w * split, h); x.clip(); x.drawImage(before, 0, 0); x.restore();
      x.fillStyle = '#c084fc'; const lw = Math.max(2, w / 400); x.fillRect(w * split - lw / 2, 0, lw, h);
      cv.style.cursor = 'ew-resize';
    }
    const mv = e => { const r = cv.getBoundingClientRect(); split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); draw(); };
    cv.onpointerdown = e => { if (after) { drag = true; cv.setPointerCapture(e.pointerId); mv(e); } };
    cv.onpointermove = e => { if (drag) mv(e); };
    cv.onpointerup = () => { drag = false; };

    go.onclick = async () => {
      go.disabled = true; out.innerHTML = '';
      try {
        prog.set(2); log.set(IL.t('rs.working', { pct: 0 }));
        after = await run(before, {
          dust: $('#rsD').checked, noise: $('#rsN').checked, fix: $('#rsF').checked, sharp: $('#rsS').checked,
          tint: $('#rsT').value, strength: +$('#rsK').value / 100
        }, p => { prog.set(p); log.set(IL.t('rs.working', { pct: p })); });
        split = 0.5; draw();
        const blob = await IL.canvasToBlob(after, 'image/png');
        out.appendChild(IL.download(blob, name + '-restored.png'));
        prog.hide(); log.set(IL.t('c.done'), 'ok');
      } catch (e) { prog.hide(); log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
      go.disabled = false;
    };
  });

  IL.restore = { run, despeckle, fixTone, sharpen, tint };     // exposed for tests
})(window.Bimba);
