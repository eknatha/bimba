/* Bimba tool: Rotate & flip */
(function (IL) {
  IL.register('transform', function (root) {
    let files = [];
    const list = IL.el('ul', 'files');
    root.appendChild(IL.dropZone(add, 'image/png,image/jpeg,image/webp', true));
    root.appendChild(list);
    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML = `<div class="field"><label>Rotate</label><select id="rot"><option value="0">None</option><option value="90">90° CW</option><option value="180">180°</option><option value="270">270° (90° CCW)</option></select></div>
    <div class="field"><label>Flip</label><select id="flip"><option value="none">None</option><option value="h">Horizontal</option><option value="v">Vertical</option><option value="both">Both</option></select></div>
    <div class="field"><label>Output</label><select id="fmt"><option value="">Same as input</option><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></div>`;
    root.appendChild(ctl);
    const actions = IL.el('div', 'actions'); const go = IL.el('button', 'btn', 'Apply'); go.disabled = true;
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
    function transform(img) {
      const rot = +root.querySelector('#rot').value, flip = root.querySelector('#flip').value;
      const swap = rot === 90 || rot === 270;
      const w = img.naturalWidth, h = img.naturalHeight;
      const cv = IL.el('canvas'); cv.width = swap ? h : w; cv.height = swap ? w : h;
      const ctx = cv.getContext('2d');
      ctx.translate(cv.width / 2, cv.height / 2);
      ctx.rotate(rot * Math.PI / 180);
      const sx = (flip === 'h' || flip === 'both') ? -1 : 1;
      const sy = (flip === 'v' || flip === 'both') ? -1 : 1;
      ctx.scale(sx, sy);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      return cv;
    }
    go.onclick = async () => {
      out.innerHTML = ''; const fmt = root.querySelector('#fmt').value; const results = [];
      try {
        for (let i = 0; i < files.length; i++) {
          log.set('Processing ' + (i + 1) + '/' + files.length + '…');
          const img = await IL.loadImage(files[i]);
          const cv = transform(img);
          const mime = fmt || files[i].type || 'image/png';
          const blob = await IL.canvasToBlob(cv, mime, .92);
          results.push({ name: IL.rename(files[i].name, IL.EXT[mime] || 'png'), blob });
        }
        if (results.length === 1) out.appendChild(IL.download(results[0].blob, results[0].name));
        else { const zip = await IL.zip(results); out.appendChild(IL.download(zip, 'bimba-transformed.zip')); }
        log.set('Done — ' + results.length + ' image' + (results.length > 1 ? 's' : '') + '.', 'ok');
      } catch (e) { log.set('Failed: ' + e.message, 'err'); }
    };
  });
})(window.Bimba);
