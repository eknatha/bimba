/* Bimba tool: Upscaler (2×–4×).
   ESRGAN-slim (MIT) via UpscalerJS + TensorFlow.js, self-hosted in vendor/ and models/.
   Runs on-device (WebGL when available, CPU fallback). The result is *generated* detail, not original pixels. */
(function (IL) {
  const MAX_OUT_MP = 36;                            // protect device memory
  // TensorFlow.js needs 'unsafe-eval', so it runs in an isolated same-origin frame (frames/upscale.html)
  // with its own strict CSP; the page itself never gets unsafe-eval.
  let frameP = null, seq = 0;
  const waiting = {};

  function getFrame() {
    if (frameP) return frameP;
    frameP = new Promise((res, rej) => {
      const f = document.createElement('iframe');
      f.src = 'frames/upscale.html'; f.title = 'upscale runner'; f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      const t = setTimeout(() => { frameP = null; rej(new Error('Upscaler frame did not start — is frames/upscale.html present?')); }, 30000);
      window.addEventListener('message', function onMsg(e) {
        if (e.origin !== location.origin || e.source !== f.contentWindow) return;
        const m = e.data || {};
        if (m.type === 'ready') { clearTimeout(t); res(f); }
        else if (m.type === 'net') { IL.proof && IL.proof.note(m.url, m.method, m.body, 'upscaler'); }
        else if (m.id != null && waiting[m.id]) waiting[m.id](m);
      });
      document.body.appendChild(f);
    });
    return frameP;
  }

  async function runUpscale(canvas, scale, patchSize, onProgress) {
    const f = await getFrame();
    // the model works on RGB: flatten transparency onto white first
    const flat = IL.el('canvas'); flat.width = canvas.width; flat.height = canvas.height;
    const fx = flat.getContext('2d'); fx.fillStyle = '#fff'; fx.fillRect(0, 0, flat.width, flat.height); fx.drawImage(canvas, 0, 0);
    const img = fx.getImageData(0, 0, flat.width, flat.height);
    const id = ++seq;
    return new Promise((res, rej) => {
      waiting[id] = m => {
        if (m.type === 'progress') onProgress && onProgress(m.pct);
        else if (m.type === 'done') { delete waiting[id]; res(m); }
        else if (m.type === 'error') { delete waiting[id]; rej(new Error(m.message)); }
      };
      f.contentWindow.postMessage({ type: 'run', id, scale, patchSize, width: img.width, height: img.height, buffer: img.data.buffer }, location.origin, [img.data.buffer]);
    });
  }

  IL.register('upscale', function (root) {
    let img = null, name = 'image';

    root.appendChild(IL.dropZone(async fs => {
      try {
        img = await IL.loadImage(fs[0]); name = fs[0].name; out.innerHTML = '';
        go.disabled = false; showInfo();
      } catch (e) { log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
    }, 'image/*', false));

    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML = '<div class="field"><label>' + IL.t('up.scale') + '</label><select id="upS">' +
      '<option value="2">2×</option><option value="3">3×</option><option value="4" selected>4×</option></select></div>';
    root.appendChild(ctl);
    root.appendChild(IL.el('div', 'note', IL.t('up.note') + ' ' + IL.t('c.modelnote')));

    const actions = IL.el('div', 'actions');
    const go = IL.el('button', 'btn', IL.t('up.run')); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const prog = IL.progress(root);
    const log = IL.logger(root);
    const info = IL.el('div', 'up-info'); root.appendChild(info);
    const prev = IL.el('div', 'preview'); prev.style.display = 'none';
    prev.innerHTML = '<div class="pane"><h4>' + IL.t('c.original') + '</h4><img id="upO" alt=""><div class="sz" id="upOs"></div></div>' +
                     '<div class="pane"><h4>' + IL.t('c.result') + '</h4><img id="upN" alt=""><div class="sz" id="upNs"></div></div>';
    root.appendChild(prev);
    const out = IL.el('div', 'out'); root.appendChild(out);
    const $ = s => root.querySelector(s);
    $('#upS').onchange = showInfo;

    const limitMP = s => Math.floor(MAX_OUT_MP / (s * s));
    function showInfo() {
      if (!img) return;
      const s = +$('#upS').value, mp = img.naturalWidth * img.naturalHeight / 1e6;
      info.innerHTML = img.naturalWidth + '×' + img.naturalHeight + ' → ' + (img.naturalWidth * s) + '×' + (img.naturalHeight * s) +
        (mp > limitMP(s) ? '<div class="pd-warn">' + IL.t('up.limit', { s: s, mp: limitMP(s) }) + '</div>' : '');
    }

    go.onclick = async () => {
      go.disabled = true; out.innerHTML = '';
      const s = +$('#upS').value;
      try {
        // keep the input inside the memory budget
        let k = Math.min(1, Math.sqrt(limitMP(s) * 1e6 / (img.naturalWidth * img.naturalHeight)));
        const src = IL.toCanvas(img, Math.max(8, Math.floor(img.naturalWidth * k)), Math.max(8, Math.floor(img.naturalHeight * k)));
        log.set(IL.t('c.loading', { what: 'ESRGAN', pct: '…' })); prog.set(null);
        const result = await runUpscale(src, s, s === 3 ? 129 : 128, p => { prog.set(p); log.set(IL.t('up.progress', { pct: p })); });
        const dataUrl = result.dataUrl;
        const res = new Image();
        await new Promise((ok, bad) => { res.onload = ok; res.onerror = () => bad(new Error('decode failed')); res.src = dataUrl; });
        const cv = IL.toCanvas(res);
        const blob = await IL.canvasToBlob(cv, 'image/png');
        $('#upO').src = src.toDataURL('image/jpeg', 0.7);
        $('#upN').src = URL.createObjectURL(blob);
        $('#upOs').textContent = src.width + '×' + src.height;
        $('#upNs').innerHTML = IL.t('up.out', { w: cv.width, h: cv.height }) + ' · ' + IL.fmtBytes(blob.size) +
          ' · ' + (result.backend || '');
        prev.style.display = 'grid';
        out.appendChild(IL.download(blob, IL.rename(name, 'png').replace(/\.png$/, '-' + s + 'x.png')));
        prog.hide(); log.set(IL.t('c.done'), 'ok');
      } catch (e) { prog.hide(); log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
      go.disabled = false;
    };
  });
})(window.Bimba);
