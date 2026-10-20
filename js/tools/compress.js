/* Bimba tool: Compress (quality slider + before/after) */
(function (IL) {
  IL.register('compress', function (root) {
    let files = [];
    const list = IL.el('ul', 'files');
    root.appendChild(IL.dropZone(add, 'image/png,image/jpeg,image/webp', true));
    root.appendChild(list);
    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML = `<div class="field range"><label>Quality <span id="qv">70%</span></label><input type="range" id="q" min="10" max="95" value="70"></div>
    <div class="field"><label>Output format</label><select id="fmt"><option value="image/jpeg">JPEG</option><option value="image/webp">WebP (smaller)</option></select></div>`;
    root.appendChild(ctl);
    const preview = IL.el('div', 'preview'); preview.style.display = 'none';
    preview.innerHTML = `<div class="pane"><h4>Original</h4><img id="pOrig"><div class="sz" id="sOrig"></div></div>
    <div class="pane"><h4>Compressed</h4><img id="pNew"><div class="sz" id="sNew"></div></div>`;
    root.appendChild(preview);
    const actions = IL.el('div', 'actions'); const go = IL.el('button', 'btn', 'Compress'); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const log = IL.logger(root); const out = IL.el('div', 'out'); root.appendChild(out);

    const qEl = root.querySelector('#q'), qv = root.querySelector('#qv');
    qEl.oninput = () => { qv.textContent = qEl.value + '%'; if (files.length === 1) livePreview(); };
    root.querySelector('#fmt').onchange = () => { if (files.length === 1) livePreview(); };

    function add(fs) { files = files.concat(fs.filter(f => /image\/(png|jpeg|webp)/.test(f.type))); render(); if (files.length === 1) livePreview(); }
    function render() {
      list.innerHTML = ''; go.disabled = !files.length;
      preview.style.display = files.length === 1 ? 'grid' : 'none';
      files.forEach((f, i) => {
        const li = IL.el('li');
        li.innerHTML = `<span class="nm">${f.name}</span><span class="mt">${IL.fmtBytes(f.size)}</span><button>✕</button>`;
        li.querySelector('button').onclick = () => { files.splice(i, 1); render(); };
        list.appendChild(li);
      });
    }
    async function compressOne(file) {
      const img = await IL.loadImage(file);
      const cv = IL.toCanvas(img);
      const mime = root.querySelector('#fmt').value, q = +qEl.value / 100;
      const blob = await IL.canvasToBlob(cv, mime, q);
      return { blob, mime };
    }
    async function livePreview() {
      try {
        const f = files[0];
        root.querySelector('#pOrig').src = URL.createObjectURL(f);
        root.querySelector('#sOrig').textContent = IL.fmtBytes(f.size);
        const { blob } = await compressOne(f);
        root.querySelector('#pNew').src = URL.createObjectURL(blob);
        const pct = Math.round((1 - blob.size / f.size) * 100);
        root.querySelector('#sNew').innerHTML = IL.fmtBytes(blob.size) + (pct > 0 ? ` · <b>−${pct}%</b>` : '');
      } catch (e) { log.set('Preview failed: ' + e.message, 'err'); }
    }
    go.onclick = async () => {
      out.innerHTML = ''; const ext = IL.EXT[root.querySelector('#fmt').value]; const results = [];
      try {
        for (let i = 0; i < files.length; i++) {
          log.set('Compressing ' + (i + 1) + '/' + files.length + '…');
          const { blob } = await compressOne(files[i]);
          results.push({ name: IL.rename(files[i].name, ext), blob });
        }
        if (results.length === 1) out.appendChild(IL.download(results[0].blob, results[0].name));
        else { const zip = await IL.zip(results); out.appendChild(IL.download(zip, 'bimba-compressed.zip')); }
        log.set('Done — ' + results.length + ' image' + (results.length > 1 ? 's' : '') + '.', 'ok');
      } catch (e) { log.set('Failed: ' + e.message, 'err'); }
    };
  });
})(window.Bimba);
