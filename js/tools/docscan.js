/* Bimba tool: Document scanner.
   photo → pick/auto-detect 4 corners → perspective-correct → enhance → pages → PDF.
   All maths (homography, bilinear warp, adaptive threshold, PDF writer) is plain JS; no libraries. */
(function (IL) {
  const SRC_MAX = 4096;       // cap source long side (memory)
  const OUT_MAX = 2400;       // cap output long side
  const PREV_MAX = 640;       // live preview long side

  // ---------- geometry ----------
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // homography H mapping dst (u,v) → src (x,y); 4 point pairs, gaussian elimination
  function homography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = dst[i], [x, y] = src[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      const d = A[i][i] || 1e-12;
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / d;
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const h = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < n; c++) s -= A[i][c] * h[c];
      h[i] = s / (A[i][i] || 1e-12);
    }
    return h;
  }

  // warp the quad (TL,TR,BR,BL) of srcCanvas into an outW×outH canvas (bilinear)
  function warp(srcCanvas, quad, outW, outH) {
    const sw = srcCanvas.width, sh = srcCanvas.height;
    const sd = srcCanvas.getContext('2d').getImageData(0, 0, sw, sh).data;
    const out = IL.el('canvas'); out.width = outW; out.height = outH;
    const octx = out.getContext('2d'), od = octx.createImageData(outW, outH), o = od.data;
    const h = homography([[0, 0], [outW, 0], [outW, outH], [0, outH]], quad);
    for (let y = 0, p = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++, p += 4) {
        const w = h[6] * x + h[7] * y + 1;
        let sx = (h[0] * x + h[1] * y + h[2]) / w, sy = (h[3] * x + h[4] * y + h[5]) / w;
        sx = sx < 0 ? 0 : sx > sw - 1.001 ? sw - 1.001 : sx;
        sy = sy < 0 ? 0 : sy > sh - 1.001 ? sh - 1.001 : sy;
        const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        for (let c = 0; c < 3; c++) {
          const top = sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx;
          const bot = sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx;
          o[p + c] = top * (1 - fy) + bot * fy;
        }
        o[p + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  function outSize(q, maxSide) {
    let w = Math.round(Math.max(dist(q[0], q[1]), dist(q[3], q[2])));
    let h = Math.round(Math.max(dist(q[0], q[3]), dist(q[1], q[2])));
    const k = Math.min(1, maxSide / Math.max(w, h, 1));
    return [Math.max(32, Math.round(w * k)), Math.max(32, Math.round(h * k))];
  }

  // ---------- auto-detect ----------
  function autoDetect(srcCanvas) {
    const k = Math.min(1, 320 / Math.max(srcCanvas.width, srcCanvas.height));
    const w = Math.max(8, Math.round(srcCanvas.width * k)), h = Math.max(8, Math.round(srcCanvas.height * k));
    const c = IL.toCanvas(srcCanvas, w, h);
    const d = c.getContext('2d').getImageData(0, 0, w, h).data;
    let g = new Float32Array(w * h);
    for (let i = 0, p = 0; p < g.length; i += 4, p++) g[p] = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
    g = boxBlur(g, w, h, 2);
    // Otsu
    const hist = new Float64Array(256);
    for (let p = 0; p < g.length; p++) hist[g[p] | 0]++;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let wB = 0, sB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue; const wF = g.length - wB; if (!wF) break;
      sB += t * hist[t];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; th = t; }
    }
    for (const bright of [true, false]) {
      const mask = new Uint8Array(w * h);
      for (let p = 0; p < mask.length; p++) mask[p] = (bright ? g[p] > th : g[p] <= th) ? 1 : 0;
      const comp = largestComponent(mask, w, h);
      if (!comp) continue;
      const frac = comp.area / (w * h);
      if (frac < 0.12 || frac > 0.97) continue;
      const q = [comp.tl, comp.tr, comp.br, comp.bl].map(p => [p[0] / k, p[1] / k]);
      if (dist(q[0], q[1]) > 20 && dist(q[0], q[3]) > 20) return q;
    }
    const W = srcCanvas.width, H = srcCanvas.height, m = 0.08;
    return [[W * m, H * m], [W * (1 - m), H * m], [W * (1 - m), H * (1 - m)], [W * m, H * (1 - m)]];
  }

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let s = 0, n = 0;
      for (let x = -r; x <= r; x++) if (x >= 0 && x < w) { s += src[y * w + x]; n++; }
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / n;
        const a = x - r, b = x + r + 1;
        if (a >= 0) { s -= src[y * w + a]; n--; }
        if (b < w) { s += src[y * w + b]; n++; }
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let y = -r; y <= r; y++) if (y >= 0 && y < h) { s += tmp[y * w + x]; n++; }
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / n;
        const a = y - r, b = y + r + 1;
        if (a >= 0) { s -= tmp[a * w + x]; n--; }
        if (b < h) { s += tmp[b * w + x]; n++; }
      }
    }
    return out;
  }

  function largestComponent(mask, w, h) {
    const seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
    let best = null;
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      let sp = 0, area = 0;
      let tl = [0, 0], tr = [0, 0], br = [0, 0], bl = [0, 0];
      let mn = Infinity, mx = -Infinity, dn = Infinity, dx = -Infinity;
      stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p / w) | 0;
        area++;
        const a = x + y, b = x - y;
        if (a < mn) { mn = a; tl = [x, y]; } if (a > mx) { mx = a; br = [x, y]; }
        if (b > dx) { dx = b; tr = [x, y]; } if (b < dn) { dn = b; bl = [x, y]; }
        if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
        if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
      }
      if (!best || area > best.area) best = { area, tl, tr, br, bl };
    }
    return best;
  }

  // ---------- enhance ----------
  function enhance(canvas, mode) {
    if (mode === 'orig') return canvas;
    const w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const toGray = mode === 'gray' || mode === 'bw';
    if (toGray) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
    if (mode === 'bw') {
      const g = new Float32Array(w * h); for (let p = 0; p < g.length; p++) g[p] = d[p * 4];
      const r = Math.max(7, Math.round(Math.min(w, h) / 24));
      const m = boxBlur(g, w, h, r);
      for (let p = 0; p < g.length; p++) { const v = g[p] > m[p] * 0.9 - 4 ? 255 : 0; d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v; }
    } else {
      // percentile levels per channel (1% … 99%)
      for (let c = 0; c < (toGray ? 1 : 3); c++) {
        const hist = new Uint32Array(256);
        for (let i = c; i < d.length; i += 4) hist[d[i]]++;
        const tot = w * h; let lo = 0, hi = 255, acc = 0;
        for (let t = 0; t < 256; t++) { acc += hist[t]; if (acc >= tot * 0.01) { lo = t; break; } }
        acc = 0; for (let t = 255; t >= 0; t--) { acc += hist[t]; if (acc >= tot * 0.01) { hi = t; break; } }
        if (hi - lo < 20) continue;
        const sc = 255 / (hi - lo);
        for (let i = c; i < d.length; i += 4) { const v = (d[i] - lo) * sc; d[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
        if (toGray) for (let i = 0; i < d.length; i += 4) d[i + 1] = d[i + 2] = d[i];
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // ---------- minimal PDF writer (JPEG pages) ----------
  function buildPDF(pages, sizeMode, margin) {
    margin = Math.max(0, +margin || 0);                       // points; only used for A4 / Letter pages
    const enc = new TextEncoder(), parts = [], offs = [];
    let len = 0;
    const push = u8 => { parts.push(u8); len += u8.length; };
    const str = s => push(enc.encode(s));
    const obj = (id, body) => { offs[id] = len; str(id + ' 0 obj\n' + body + '\nendobj\n'); };
    str('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const n = pages.length, kids = [];
    for (let i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    pages.forEach((pg, i) => {
      const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
      let pw, ph;
      if (sizeMode === 'a4' || sizeMode === 'letter') {
        const [bw, bh] = sizeMode === 'a4' ? [595.28, 841.89] : [612, 792];
        [pw, ph] = pg.w > pg.h ? [bh, bw] : [bw, bh];
      } else { pw = pg.w * 72 / 150 + 2 * margin; ph = pg.h * 72 / 150 + 2 * margin; }
      const aw = Math.max(1, pw - 2 * margin), ah = Math.max(1, ph - 2 * margin);
      const s = Math.min(aw / pg.w, ah / pg.h), dw = pg.w * s, dh = pg.h * s, dx = (pw - dw) / 2, dy = (ph - dh) / 2;
      obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`);
      const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im0 Do Q`;
      obj(cid, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      offs[iid] = len;
      str(`${iid} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
      push(pg.jpeg); str('\nendstream\nendobj\n');
    });
    const total = 3 + n * 3, xref = len;
    let x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    str(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }

  // ---------- tool UI ----------
  IL.register('docscan', function (root) {
    let src = null, name = 'scan', quad = null, k = 1, drag = -1;
    const pages = [];

    const dz = IL.dropZone(async fs => {
      try {
        const img = await IL.loadImage(fs[0]);
        const s = Math.min(1, SRC_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        src = IL.toCanvas(img, Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
        name = fs[0].name.replace(/\.[^.]+$/, '');
        quad = autoDetect(src);
        editor.style.display = '';
        setup(); refresh();
      } catch (e) { log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
    }, 'image/*', false);
    root.appendChild(dz);

    const editor = IL.el('div', 'ds-editor'); editor.style.display = 'none';
    editor.innerHTML =
      '<p class="ds-hint">' + IL.t('ds.hint') + '</p>' +
      '<div class="ds-stage"><canvas id="dsEd"></canvas></div>' +
      '<div class="ctl">' +
        '<div class="field"><label>' + IL.t('ds.enh') + '</label><select id="dsM">' +
          '<option value="contrast">' + IL.t('ds.m.contrast') + '</option>' +
          '<option value="orig">' + IL.t('ds.m.orig') + '</option>' +
          '<option value="gray">' + IL.t('ds.m.gray') + '</option>' +
          '<option value="bw">' + IL.t('ds.m.bw') + '</option></select></div></div>' +
      '<div class="ds-prev"><canvas id="dsPv"></canvas></div>' +
      '<div class="actions">' +
        '<button class="btn ghost" id="dsAuto">' + IL.t('ds.auto') + '</button>' +
        '<button class="btn" id="dsAdd">' + IL.t('ds.add') + '</button>' +
        '<button class="btn ghost" id="dsImg">' + IL.t('ds.img') + '</button></div>' +
      '<div class="note">' + IL.t('ds.note') + '</div>';
    root.appendChild(editor);

    const pagesBox = IL.el('div', 'ds-pages');
    root.appendChild(pagesBox);
    const log = IL.logger(root);
    const out = IL.el('div', 'out'); root.appendChild(out);

    const $ = s => root.querySelector(s);
    const ed = () => $('#dsEd');

    function setup() {
      const W = Math.min(680, editor.clientWidth || 680);
      k = Math.min(1, W / src.width);
      const c = ed(); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      c.style.touchAction = 'none';
    }

    function drawEditor() {
      const c = ed(), x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(src, 0, 0, c.width, c.height);
      const q = quad.map(p => [p[0] * k, p[1] * k]);
      x.fillStyle = 'rgba(8,10,18,.55)';
      x.beginPath(); x.rect(0, 0, c.width, c.height);
      x.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(p => x.lineTo(p[0], p[1])); x.closePath();
      x.fill('evenodd');
      x.strokeStyle = '#c084fc'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(p => x.lineTo(p[0], p[1])); x.closePath(); x.stroke();
      q.forEach(p => {
        x.fillStyle = '#0b0d14'; x.strokeStyle = '#ec4899'; x.lineWidth = 3;
        x.beginPath(); x.arc(p[0], p[1], 9, 0, 7); x.fill(); x.stroke();
      });
    }

    let raf = 0;
    function refresh() {
      drawEditor();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // small preview: warp from a downscaled source for speed
        const ps = Math.min(1, 1200 / Math.max(src.width, src.height));
        const small = ps < 1 ? IL.toCanvas(src, Math.round(src.width * ps), Math.round(src.height * ps)) : src;
        const q = quad.map(p => [p[0] * ps, p[1] * ps]);
        const [w, h] = outSize(q, PREV_MAX);
        const pv = enhance(warp(small, q, w, h), $('#dsM').value);
        const c = $('#dsPv'); c.width = pv.width; c.height = pv.height;
        c.getContext('2d').drawImage(pv, 0, 0);
      });
    }

    function fullResult() {
      const [w, h] = outSize(quad, OUT_MAX);
      return enhance(warp(src, quad, w, h), $('#dsM').value);
    }

    function pos(e) {
      const r = ed().getBoundingClientRect();
      return [(e.clientX - r.left) * (ed().width / r.width), (e.clientY - r.top) * (ed().height / r.height)];
    }
    editor.addEventListener('pointerdown', e => {
      if (e.target !== ed()) return;
      const [px, py] = pos(e);
      let bi = -1, bd = 28;
      quad.forEach((p, i) => { const d = Math.hypot(p[0] * k - px, p[1] * k - py); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0) { drag = bi; ed().setPointerCapture(e.pointerId); }
    });
    editor.addEventListener('pointermove', e => {
      if (drag < 0) return;
      const [px, py] = pos(e);
      quad[drag] = [Math.min(src.width, Math.max(0, px / k)), Math.min(src.height, Math.max(0, py / k))];
      refresh();
    });
    editor.addEventListener('pointerup', () => { drag = -1; });
    editor.addEventListener('change', e => { if (e.target.id === 'dsM') refresh(); });
    editor.addEventListener('click', async e => {
      const id = e.target.id;
      if (id === 'dsAuto') { quad = autoDetect(src); refresh(); }
      else if (id === 'dsAdd') {
        log.set(IL.t('c.working'));
        await IL.tick();
        const cv = fullResult();
        const blob = await IL.canvasToBlob(cv, 'image/jpeg', 0.88);
        pages.push({ w: cv.width, h: cv.height, jpeg: new Uint8Array(await blob.arrayBuffer()), thumb: URL.createObjectURL(blob) });
        log.set(IL.t('c.done'), 'ok'); renderPages();
      } else if (id === 'dsImg') {
        const blob = await IL.canvasToBlob(fullResult(), 'image/png');
        out.innerHTML = ''; out.appendChild(IL.download(blob, name + '-scan.png'));
      }
    });

    function renderPages() {
      pagesBox.innerHTML = '';
      if (!pages.length) return;
      pagesBox.innerHTML = '<h4>' + IL.t('ds.pages', { n: pages.length }) + '</h4>';
      const row = IL.el('div', 'thumbs');
      pages.forEach((p, i) => {
        const th = IL.el('div', 'th');
        th.innerHTML = `<img alt=""><span class="n">${i + 1}</span>`;
        th.querySelector('img').src = p.thumb;
        const rm = IL.el('button', 'th-x', '✕'); rm.title = IL.t('ds.remove');
        rm.onclick = () => { pages.splice(i, 1); renderPages(); };
        th.appendChild(rm); row.appendChild(th);
      });
      pagesBox.appendChild(row);
      const ctl = IL.el('div', 'ctl');
      ctl.innerHTML = '<div class="field"><label>' + IL.t('ds.psize') + '</label><select id="dsPS">' +
        '<option value="fit">' + IL.t('ds.fit') + '</option><option value="a4">' + IL.t('ds.a4') + '</option>' +
        '<option value="letter">' + IL.t('ds.letter') + '</option></select></div>';
      pagesBox.appendChild(ctl);
      const act = IL.el('div', 'actions');
      const b = IL.el('button', 'btn', IL.t('ds.pdf'));
      b.onclick = () => {
        const blob = buildPDF(pages, pagesBox.querySelector('#dsPS').value);
        out.innerHTML = ''; out.appendChild(IL.download(blob, name + '-scan.pdf'));
      };
      act.appendChild(b); pagesBox.appendChild(act);
    }
  });

  IL.docscan = { homography, warp, buildPDF, autoDetect, enhance };   // exposed for tests
})(window.Bimba);
