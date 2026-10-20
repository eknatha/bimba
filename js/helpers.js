/* Bimba — shared helpers + global namespace.
   Each tool registers into Bimba.tools[id] = builderFn(rootEl). */
window.Bimba = window.Bimba || { tools: {} };

(function (IL) {
  // translation fallback — js/i18n.js replaces this with the real thing
  IL.t = IL.t || function (k, d) { return d != null ? d : k; };

  IL.el = function (tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  IL.fmtBytes = function (b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  };

  IL.MIME = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' };
  IL.EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

  // load a File into an HTMLImageElement
  IL.loadImage = function (file) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { res(img); };
      img.onerror = () => rej(new Error('Could not read image: ' + file.name));
      img.src = url;
    });
  };

  // draw an image (or canvas) onto a fresh canvas at given size
  IL.toCanvas = function (img, w, h) {
    const c = IL.el('canvas');
    c.width = w || img.naturalWidth || img.width;
    c.height = h || img.naturalHeight || img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };

  // canvas → Blob with format + quality
  IL.canvasToBlob = function (canvas, mime, quality) {
    return new Promise(res => canvas.toBlob(res, mime, quality));
  };

  IL.dropZone = function (onFiles, accept, multi) {
    const d = IL.el('div', 'drop',
      IL.t(multi ? 'c.dropN' : 'c.drop1', 'Drop image' + (multi ? 's' : '') + ' here or <b>browse</b>') +
      '<div class="hint">' + IL.t('c.hint', 'processed locally · nothing uploaded') + '</div>');
    const inp = IL.el('input');
    inp.type = 'file'; inp.accept = accept || 'image/*'; inp.multiple = !!multi; inp.style.display = 'none';
    d.appendChild(inp);
    d.onclick = () => inp.click();
    inp.onchange = () => { if (inp.files.length) onFiles([...inp.files]); };
    d.ondragover = e => { e.preventDefault(); d.classList.add('drag'); };
    d.ondragleave = () => d.classList.remove('drag');
    d.ondrop = e => {
      e.preventDefault(); d.classList.remove('drag');
      if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
    };
    return d;
  };

  IL.logger = function (parent) {
    const l = IL.el('div', 'log');
    parent.appendChild(l);
    return { set: (m, cls) => { l.innerHTML = cls ? `<span class="${cls}">${m}</span>` : m; } };
  };

  IL.download = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = IL.el('a', null, `<span>${name}</span><span class="dl">${IL.t('c.download', '↓ download')}</span>`);
    a.href = url; a.download = name;
    return a;
  };

  // zip a list of {name, blob} via fflate, return a single Blob
  IL.zip = async function (entries) {
    if (!window.fflate) throw new Error('ZIP library not loaded.');
    const files = {};
    for (const e of entries) {
      const buf = new Uint8Array(await e.blob.arrayBuffer());
      files[e.name] = buf;
    }
    return new Promise((res, rej) => {
      fflate.zip(files, { level: 6 }, (err, data) => {
        if (err) rej(err); else res(new Blob([data], { type: 'application/zip' }));
      });
    });
  };

  // swap a file extension
  IL.rename = function (name, ext) {
    return name.replace(/\.[^.]+$/, '') + '.' + ext;
  };

  // ---- lazy script loading (deduped) ----
  const _scripts = {};
  IL.loadScript = function (src) {
    if (_scripts[src]) return _scripts[src];
    return (_scripts[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => res();
      s.onerror = () => { delete _scripts[src]; rej(new Error('Could not load ' + src + ' — is the file present?')); };
      document.head.appendChild(s);
    }));
  };

  // ---- fetch with progress (same-origin static assets: models, wasm, etc.) ----
  IL.fetchBuffer = async function (url, onProgress) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Could not load ' + url + ' (' + r.status + ')');
    const total = +r.headers.get('content-length') || 0;
    if (!r.body || !onProgress) return r.arrayBuffer();
    const reader = r.body.getReader(); const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(total ? Math.min(100, Math.round(got / total * 100)) : null, got, total);
    }
    const out = new Uint8Array(got); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out.buffer;
  };

  // ---- simple progress bar ----
  IL.progress = function (parent) {
    const wrap = IL.el('div', 'prog'); wrap.style.display = 'none';
    const bar = IL.el('div', 'bar'); wrap.appendChild(bar);
    parent.appendChild(wrap);
    return {
      set(p) { wrap.style.display = 'block'; bar.style.width = (p == null ? 100 : Math.max(2, p)) + '%'; wrap.classList.toggle('indet', p == null); },
      hide() { wrap.style.display = 'none'; }
    };
  };

  // ---- per-tool caution strip (text comes from i18n) ----
  IL.caution = function (key) {
    const d = IL.el('div', 'caution');
    d.innerHTML = '<b>' + IL.t('eth.caution', 'Caution') + '</b> ' + IL.t(key, IL.t('warn.generic'));
    return d;
  };

  // yield to the browser so long loops don't freeze the tab
  IL.tick = function () { return new Promise(r => setTimeout(r, 0)); };

  IL.copyText = async function (text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = IL.el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  };

  IL.register = function (id, builderFn) { IL.tools[id] = builderFn; };
})(window.Bimba);
