/* Bimba tool: Resize (px, percent, fit) */
(function (IL) {
  IL.register('resize', function (root) {
    let files = [], firstDim = null;
    const list = IL.el('ul', 'files');
    root.appendChild(IL.dropZone(add, 'image/png,image/jpeg,image/webp', true));
    root.appendChild(list);
    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML = `<div class="field"><label>Mode</label><select id="mode"><option value="px">By pixels</option><option value="pct">By percent</option><option value="fit">Fit within box</option></select></div>
    <div class="field"><label>Width</label><input id="w" type="number" placeholder="px" style="min-width:90px"></div>
    <div class="field"><label>Height</label><input id="h" type="number" placeholder="px" style="min-width:90px"></div>
    <div class="field"><label>Percent</label><input id="pct" type="number" value="50" style="min-width:80px" disabled></div>`;
    root.appendChild(ctl);
    const row = IL.el('div', 'row');
    row.innerHTML = `<label class="swatch"><input type="checkbox" id="ar" checked> keep aspect ratio</label>
    <div class="field"><label>Output</label><select id="fmt"><option value="">Same as input</option><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></div>`;
    root.appendChild(row);
    const actions = IL.el('div', 'actions'); const go = IL.el('button', 'btn', 'Resize'); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const log = IL.logger(root); const out = IL.el('div', 'out'); root.appendChild(out);

    const mode = root.querySelector('#mode'), wEl = root.querySelector('#w'), hEl = root.querySelector('#h'),
          pctEl = root.querySelector('#pct'), arEl = root.querySelector('#ar');
    mode.onchange = () => {
      const m = mode.value;
      pctEl.disabled = m !== 'pct';
      wEl.disabled = m === 'pct'; hEl.disabled = m === 'pct';
    };
    wEl.oninput = () => { if (arEl.checked && firstDim && mode.value !== 'pct' && wEl.value) hEl.value = Math.round(wEl.value / firstDim.ratio); };
    hEl.oninput = () => { if (arEl.checked && firstDim && mode.value !== 'pct' && hEl.value) wEl.value = Math.round(hEl.value * firstDim.ratio); };

    async function add(fs) {
      files = files.concat(fs.filter(f => /image\/(png|jpeg|webp)/.test(f.type))); render();
      if (files.length && !firstDim) {
        const img = await IL.loadImage(files[0]);
        firstDim = { w: img.naturalWidth, h: img.naturalHeight, ratio: img.naturalWidth / img.naturalHeight };
        if (!wEl.value) { wEl.value = firstDim.w; hEl.value = firstDim.h; }
      }
    }
    function render() {
      list.innerHTML = ''; go.disabled = !files.length;
      files.forEach((f, i) => {
        const li = IL.el('li');
        li.innerHTML = `<span class="nm">${f.name}</span><span class="mt">${IL.fmtBytes(f.size)}</span><button>✕</button>`;
        li.querySelector('button').onclick = () => { files.splice(i, 1); render(); };
        list.appendChild(li);
      });
    }
    function targetSize(img) {
      const m = mode.value, ow = img.naturalWidth, oh = img.naturalHeight;
      if (m === 'pct') { const p = (+pctEl.value || 100) / 100; return [Math.round(ow * p), Math.round(oh * p)]; }
      let w = +wEl.value || ow, h = +hEl.value || oh;
      if (m === 'fit') { const s = Math.min(w / ow, h / oh); return [Math.round(ow * s), Math.round(oh * s)]; }
      if (arEl.checked) { if (wEl.value && !hEl.value) h = Math.round(w / (ow / oh)); else if (hEl.value && !wEl.value) w = Math.round(h * (ow / oh)); }
      return [w, h];
    }
    go.onclick = async () => {
      out.innerHTML = ''; const fmt = root.querySelector('#fmt').value; const results = [];
      try {
        for (let i = 0; i < files.length; i++) {
          log.set('Resizing ' + (i + 1) + '/' + files.length + '…');
          const img = await IL.loadImage(files[i]);
          const [w, h] = targetSize(img);
          const cv = IL.toCanvas(img, w, h);
          const mime = fmt || files[i].type || 'image/png';
          const blob = await IL.canvasToBlob(cv, mime, .92);
          results.push({ name: IL.rename(files[i].name, IL.EXT[mime] || 'png'), blob });
        }
        if (results.length === 1) out.appendChild(IL.download(results[0].blob, results[0].name));
        else { const zip = await IL.zip(results); out.appendChild(IL.download(zip, 'bimba-resized.zip')); }
        log.set('Done — ' + results.length + ' image' + (results.length > 1 ? 's' : '') + '.', 'ok');
      } catch (e) { log.set('Failed: ' + e.message, 'err'); }
    };
  });
})(window.Bimba);
