/* Bimba tool: Compress to a target file size (50 KB … 1 MB, or custom).
   Strategy: binary-search the quality at full size; if even a decent quality can't fit,
   shrink the dimensions in small steps and search again. Everything stays in the browser. */
(function (IL) {
  const PRESETS = [50, 100, 200, 500, 1024];                // KB
  const MIN_GOOD_Q = 0.45;                                    // below this, prefer shrinking pixels
  const label = kb => (kb >= 1024 ? (kb / 1024) + ' MB' : kb + ' KB');

  IL.register('targetsize', function (root) {
    let files = [];
    const list = IL.el('ul', 'files');
    root.appendChild(IL.dropZone(add, 'image/*', true));
    root.appendChild(list);

    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML =
      '<div class="field"><label>' + IL.t('ts.target') + '</label><select id="tsT">' +
        PRESETS.map(k => `<option value="${k}">${label(k)}</option>`).join('') +
        '<option value="custom">' + IL.t('ts.custom') + '</option></select></div>' +
      '<div class="field" id="tsCW" style="display:none"><label>' + IL.t('ts.custom') + '</label>' +
        '<input id="tsC" type="number" min="5" max="20000" value="150"></div>' +
      '<div class="field"><label>' + IL.t('ts.format') + '</label><select id="tsF">' +
        '<option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></div>';
    root.appendChild(ctl);
    root.appendChild(IL.el('div', 'note', IL.t('ts.note')));

    const actions = IL.el('div', 'actions');
    const go = IL.el('button', 'btn', IL.t('ts.run')); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const prog = IL.progress(root);
    const log = IL.logger(root);
    const out = IL.el('div', 'out'); root.appendChild(out);

    const $ = s => root.querySelector(s);
    $('#tsT').onchange = () => { $('#tsCW').style.display = $('#tsT').value === 'custom' ? '' : 'none'; };

    function targetBytes() {
      const v = $('#tsT').value === 'custom' ? +$('#tsC').value : +$('#tsT').value;
      return Math.max(2, Math.round(v)) * 1024;
    }
    function add(fs) {
      files = files.concat(fs.filter(f => /^image\//.test(f.type)));
      render();
    }
    function render() {
      list.innerHTML = ''; go.disabled = !files.length;
      files.forEach((f, i) => {
        const li = IL.el('li');
        li.innerHTML = `<span class="nm"></span><span class="mt">${IL.fmtBytes(f.size)}</span><button aria-label="remove">✕</button>`;
        li.querySelector('.nm').textContent = f.name;
        li.querySelector('button').onclick = () => { files.splice(i, 1); render(); };
        list.appendChild(li);
      });
    }

    // draw source at scale s; JPEG gets a white background so transparency doesn't turn black
    function drawAt(img, s, mime) {
      const w = Math.max(16, Math.round(img.naturalWidth * s)), h = Math.max(16, Math.round(img.naturalHeight * s));
      const c = IL.el('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      if (mime === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, w, h);
      return c;
    }

    // best quality whose blob fits in `limit` bytes (null if even q=0.05 doesn't)
    async function searchQuality(cv, mime, limit) {
      let lo = 0.05, hi = 0.95, best = null;
      const top = await IL.canvasToBlob(cv, mime, hi);
      if (top.size <= limit) return { blob: top, q: hi };
      const floor = await IL.canvasToBlob(cv, mime, lo);
      if (floor.size > limit) return { blob: floor, q: lo, miss: true };
      best = { blob: floor, q: lo };
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        const b = await IL.canvasToBlob(cv, mime, mid);
        if (b.size <= limit) { best = { blob: b, q: mid }; lo = mid; } else hi = mid;
      }
      return best;
    }

    async function fit(file, limit, mime) {
      const img = await IL.loadImage(file);
      let scale = 1, last = null;
      for (let step = 0; step < 40; step++) {
        const cv = drawAt(img, scale, mime);
        const r = await searchQuality(cv, mime, limit);
        last = { blob: r.blob, q: r.q, w: cv.width, h: cv.height, miss: !!r.miss };
        if (!r.miss && r.q >= MIN_GOOD_Q) return last;                    // good enough
        if (!r.miss && scale <= 0.12) return last;
        if (Math.min(cv.width, cv.height) <= 24) break;
        scale *= 0.85;
        await IL.tick();
      }
      return last;
    }

    go.onclick = async () => {
      out.innerHTML = ''; go.disabled = true;
      const mime = $('#tsF').value, ext = IL.EXT[mime], limit = targetBytes();
      const results = [];
      try {
        for (let i = 0; i < files.length; i++) {
          prog.set(Math.round(i / files.length * 100));
          log.set(IL.t('c.working') + ' ' + (i + 1) + '/' + files.length + ' — ' + files[i].name);
          const r = await fit(files[i], limit, mime);
          const ok = r.blob.size <= limit;
          results.push({ name: IL.rename(files[i].name, ext), blob: r.blob });
          const row = IL.el('div', 'tsrow ' + (ok ? 'ok' : 'miss'));
          row.innerHTML =
            '<b>' + (ok ? '✓ ' + IL.t('ts.ok', { target: label(limit / 1024), size: IL.fmtBytes(r.blob.size) })
                        : '△ ' + IL.t('ts.miss', { size: IL.fmtBytes(r.blob.size), target: label(limit / 1024) })) + '</b>' +
            '<span>' + IL.t('ts.meta', { w: r.w, h: r.h, q: Math.round(r.q * 100) }) + '</span>';
          out.appendChild(row);
          if (files.length === 1) out.appendChild(IL.download(r.blob, results[0].name));
        }
        if (files.length > 1) out.appendChild(IL.download(await IL.zip(results), IL.t('c.zipname')));
        prog.hide(); log.set(IL.t('c.done'), 'ok');
      } catch (e) { prog.hide(); log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
      go.disabled = !files.length;
    };
  });
})(window.Bimba);
