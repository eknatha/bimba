/* Bimba tool: Strip EXIF (re-encode via canvas drops all metadata) */
(function (IL) {
  IL.register('exif', function (root) {
    let files = [];
    const list = IL.el('ul', 'files');
    root.appendChild(IL.dropZone(add, 'image/png,image/jpeg,image/webp', true));
    root.appendChild(list);
    root.appendChild(IL.el('div', 'note', 'Re-encoding through a canvas discards all embedded metadata — camera model, GPS location, timestamps, software tags. The image pixels are preserved; only the hidden data is removed.'));
    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML = `<div class="field"><label>Output</label><select id="fmt"><option value="">Same as input</option><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div>
    <div class="field"><label>Quality</label><select id="q"><option value="0.95">High</option><option value="0.85">Good</option></select></div>`;
    root.appendChild(ctl);
    const actions = IL.el('div', 'actions'); const go = IL.el('button', 'btn', 'Strip metadata'); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const log = IL.logger(root); const out = IL.el('div', 'out'); root.appendChild(out);

    function add(fs) { files = files.concat(fs.filter(f => /image\/(png|jpeg|webp)/.test(f.type))); render(); }
    function render() {
      list.innerHTML = ''; go.disabled = !files.length;
      files.forEach((f, i) => {
        const li = IL.el('li');
        li.innerHTML = `<span class="nm">${f.name}</span><span class="mt">${IL.fmtBytes(f.size)}</span><button>✕</button>`;
        li.querySelector('button').onclick = () => { files.splice(i, 1); render(); };
        list.appendChild(li);
      });
    }
    go.onclick = async () => {
      out.innerHTML = ''; const fmt = root.querySelector('#fmt').value, q = +root.querySelector('#q').value; const results = [];
      try {
        for (let i = 0; i < files.length; i++) {
          log.set('Cleaning ' + (i + 1) + '/' + files.length + '…');
          const img = await IL.loadImage(files[i]);
          const cv = IL.toCanvas(img);
          const mime = fmt || files[i].type || 'image/png';
          const blob = await IL.canvasToBlob(cv, mime, q);
          results.push({ name: IL.rename(files[i].name, IL.EXT[mime] || 'png').replace(/(\.\w+)$/, '-clean$1'), blob });
        }
        if (results.length === 1) out.appendChild(IL.download(results[0].blob, results[0].name));
        else { const zip = await IL.zip(results); out.appendChild(IL.download(zip, 'bimba-clean.zip')); }
        log.set('Done — metadata stripped from ' + results.length + ' image' + (results.length > 1 ? 's' : '') + '.', 'ok');
      } catch (e) { log.set('Failed: ' + e.message, 'err'); }
    };
  });
})(window.Bimba);
