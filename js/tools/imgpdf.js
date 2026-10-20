/* Bimba tool: Image → PDF.
   Combine any number of images into one PDF (one image per page), reorder / remove, choose page size and margin.
   Uses the same dependency-free PDF writer as the document scanner (JPEG pages, DCTDecode). Nothing is uploaded. */
(function (IL) {
  const MAX_SIDE = 4000;                                   // downscale huge photos so the PDF stays reasonable

  IL.register('imgpdf', function (root) {
    const items = [];                                      // { name, canvas, w, h, thumb }
    let uid = 0;

    root.appendChild(IL.dropZone(async fs => {
      for (const f of fs) {
        try {
          const img = await IL.loadImage(f);
          const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
          const cv = IL.toCanvas(img, Math.max(1, Math.round(img.naturalWidth * s)), Math.max(1, Math.round(img.naturalHeight * s)));
          const th = IL.toCanvas(img, 64, Math.max(1, Math.round(64 * img.naturalHeight / img.naturalWidth)));
          items.push({ id: ++uid, name: f.name, canvas: cv, w: cv.width, h: cv.height, thumb: th.toDataURL('image/jpeg', 0.6) });
        } catch (e) { log.set(f.name + ': ' + IL.t('c.failed') + ' — ' + e.message, 'err'); }
      }
      out.innerHTML = ''; draw();
    }, 'image/*', true));

    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML =
      '<div class="field"><label>' + IL.t('ds.psize') + '</label><select id="ipS">' +
        '<option value="a4">' + IL.t('ds.a4') + '</option><option value="letter">' + IL.t('ds.letter') + '</option>' +
        '<option value="fit">' + IL.t('ds.fit') + '</option></select></div>' +
      '<div class="field"><label>' + IL.t('ip.margin') + '</label><select id="ipM">' +
        '<option value="0">' + IL.t('ip.m.none') + '</option><option value="18" selected>' + IL.t('ip.m.small') + '</option>' +
        '<option value="36">' + IL.t('ip.m.large') + '</option></select></div>' +
      '<div class="field range"><label>' + IL.t('ip.quality') + '</label><input type="range" id="ipQ" min="50" max="95" value="85"></div>';
    root.appendChild(ctl);
    root.appendChild(IL.el('div', 'note', IL.t('ip.note')));

    const list = IL.el('div', 'ip-list'); root.appendChild(list);
    const actions = IL.el('div', 'actions');
    const go = IL.el('button', 'btn', IL.t('ip.make')); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const log = IL.logger(root);
    const out = IL.el('div', 'out'); root.appendChild(out);
    const $ = s => root.querySelector(s);

    function draw() {
      go.disabled = !items.length;
      list.innerHTML = '';
      if (!items.length) { list.appendChild(IL.el('div', 'ds-empty', IL.t('ds.empty'))); return; }
      list.appendChild(IL.el('h4', '', IL.t('ds.pages', { n: items.length })));
      items.forEach((it, i) => {
        const row = IL.el('div', 'ip-row');
        row.innerHTML = '<span class="ip-n">' + (i + 1) + '</span><img alt="" src="' + it.thumb + '">' +
          '<span class="ip-name"></span><span class="ip-dim">' + it.w + '×' + it.h + '</span>';
        row.querySelector('.ip-name').textContent = it.name;
        const mk = (txt, title, fn, dis) => { const b = IL.el('button', 'btn ghost sm', txt); b.title = title; b.setAttribute('aria-label', title); b.disabled = !!dis; b.onclick = fn; row.appendChild(b); };
        mk('↑', IL.t('ip.up'), () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); }, i === 0);
        mk('↓', IL.t('ip.down'), () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); }, i === items.length - 1);
        mk('✕', IL.t('ds.remove'), () => { items.splice(i, 1); out.innerHTML = ''; draw(); });
        list.appendChild(row);
      });
    }
    draw();

    go.onclick = async () => {
      go.disabled = true; out.innerHTML = ''; log.set(IL.t('c.working'));
      try {
        const q = +$('#ipQ').value / 100, pages = [];
        for (const it of items) {
          const flat = IL.el('canvas'); flat.width = it.w; flat.height = it.h;   // JPEG has no alpha: flatten onto white
          const x = flat.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, it.w, it.h); x.drawImage(it.canvas, 0, 0);
          const b = await IL.canvasToBlob(flat, 'image/jpeg', q);
          pages.push({ w: it.w, h: it.h, jpeg: new Uint8Array(await b.arrayBuffer()) });
        }
        const blob = IL.docscan.buildPDF(pages, $('#ipS').value, +$('#ipM').value);
        const base = items.length === 1 ? items[0].name.replace(/\.[^.]+$/, '') : 'bimba-images';
        out.appendChild(IL.download(blob, base + '.pdf'));
        log.set(IL.t('ip.done', { n: pages.length, size: IL.fmtBytes(blob.size) }), 'ok');
      } catch (e) { log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
      go.disabled = !items.length;
    };
  });
})(window.Bimba);
