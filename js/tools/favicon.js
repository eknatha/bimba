/* Bimba tool: Favicon set (multi-size + ZIP) */
(function (IL) {
  IL.register('favicon', function (root) {
    let file = null;
    const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512];
    root.appendChild(IL.dropZone(fs => { file = fs[0]; info.textContent = file.name; go.disabled = false; }, 'image/png,image/jpeg,image/webp', false));
    const info = IL.el('div', 'log'); root.appendChild(info);
    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML = `<div class="field"><label>Background</label><select id="bg"><option value="transparent">Transparent (PNG)</option><option value="#ffffff">White</option><option value="#000000">Black</option></select></div>`;
    root.appendChild(ctl);
    root.appendChild(IL.el('div', 'note', 'Best results from a square source image. Generates ' + SIZES.join(', ') + 'px PNGs plus a copy-paste HTML snippet, bundled as a ZIP.'));
    const actions = IL.el('div', 'actions'); const go = IL.el('button', 'btn', 'Generate set'); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const log = IL.logger(root); const out = IL.el('div', 'out'); root.appendChild(out);

    go.onclick = async () => {
      out.innerHTML = ''; log.set('Generating…');
      try {
        const img = await IL.loadImage(file);
        const bg = root.querySelector('#bg').value;
        const entries = [];
        for (const s of SIZES) {
          const cv = IL.el('canvas'); cv.width = s; cv.height = s; const ctx = cv.getContext('2d');
          if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s); }
          const side = Math.min(img.naturalWidth, img.naturalHeight);
          const ox = (img.naturalWidth - side) / 2, oy = (img.naturalHeight - side) / 2;
          ctx.drawImage(img, ox, oy, side, side, 0, 0, s, s);
          const blob = await IL.canvasToBlob(cv, 'image/png');
          entries.push({ name: `favicon-${s}x${s}.png`, blob });
        }
        const snippet =
`<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180x180.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">`;
        entries.push({ name: 'snippet.html', blob: new Blob([snippet], { type: 'text/html' }) });
        const zip = await IL.zip(entries);
        out.appendChild(IL.download(zip, 'bimba-favicons.zip'));
        log.set('Done — ' + SIZES.length + ' sizes + HTML snippet.', 'ok');
      } catch (e) { log.set('Failed: ' + e.message, 'err'); }
    };
  });
})(window.Bimba);
