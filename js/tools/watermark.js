/* Bimba tool: Watermark (text overlay, single or batch) */
(function (IL) {
  IL.register('watermark', function (root) {
    let files = [];
    const list = IL.el('ul', 'files');
    root.appendChild(IL.dropZone(add, 'image/png,image/jpeg,image/webp', true));
    root.appendChild(list);
    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML = `<div class="field"><label>Text</label><input id="txt" value="© EknathaLabs"></div>
    <div class="field"><label>Position</label><select id="pos"><option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option><option value="c">Center</option><option value="tile">Tiled</option></select></div>
    <div class="field"><label>Opacity</label><select id="op"><option value="0.5">Medium</option><option value="0.3">Subtle</option><option value="0.8">Strong</option></select></div>
    <div class="field"><label>Color</label><select id="col"><option value="255,255,255">White</option><option value="0,0,0">Black</option></select></div>`;
    root.appendChild(ctl);
    const actions = IL.el('div', 'actions'); const go = IL.el('button', 'btn', 'Apply watermark'); go.disabled = true;
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
    function stamp(img) {
      const cv = IL.toCanvas(img); const ctx = cv.getContext('2d');
      const txt = root.querySelector('#txt').value || '';
      const pos = root.querySelector('#pos').value;
      const op = +root.querySelector('#op').value;
      const col = root.querySelector('#col').value;
      const size = Math.max(14, Math.round(cv.width / 28));
      ctx.font = `600 ${size}px ui-monospace, monospace`;
      ctx.fillStyle = `rgba(${col},${op})`;
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(txt).width, pad = size;
      if (pos === 'tile') {
        ctx.save(); ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(-Math.PI / 9); ctx.translate(-cv.width / 2, -cv.height / 2);
        for (let y = 0; y < cv.height * 1.4; y += size * 4) for (let x = -cv.width * .2; x < cv.width * 1.2; x += tw + size * 3) ctx.fillText(txt, x, y);
        ctx.restore();
      } else {
        let x, y;
        if (pos.includes('l')) x = pad; else if (pos.includes('r')) x = cv.width - tw - pad; else x = (cv.width - tw) / 2;
        if (pos.includes('t')) y = pad; else if (pos.includes('b')) y = cv.height - pad; else y = cv.height / 2;
        ctx.fillText(txt, x, y);
      }
      return cv;
    }
    go.onclick = async () => {
      out.innerHTML = ''; const results = [];
      try {
        for (let i = 0; i < files.length; i++) {
          log.set('Stamping ' + (i + 1) + '/' + files.length + '…');
          const img = await IL.loadImage(files[i]);
          const cv = stamp(img);
          const mime = files[i].type || 'image/png';
          const blob = await IL.canvasToBlob(cv, mime, .92);
          results.push({ name: IL.rename(files[i].name, IL.EXT[mime] || 'png').replace(/(\.\w+)$/, '-wm$1'), blob });
        }
        if (results.length === 1) out.appendChild(IL.download(results[0].blob, results[0].name));
        else { const zip = await IL.zip(results); out.appendChild(IL.download(zip, 'bimba-watermarked.zip')); }
        log.set('Done — ' + results.length + ' image' + (results.length > 1 ? 's' : '') + '.', 'ok');
      } catch (e) { log.set('Failed: ' + e.message, 'err'); }
    };
  });
})(window.Bimba);
