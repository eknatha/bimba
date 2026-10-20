/* Bimba tool: Crop (drag region or fixed ratio) */
(function (IL) {
  IL.register('crop', function (root) {
    let file = null, img = null, scale = 1;
    let sel = null, dragging = false, start = null;
    root.appendChild(IL.dropZone(load, 'image/png,image/jpeg,image/webp', false));
    const ctl = IL.el('div', 'ctl'); ctl.style.display = 'none';
    ctl.innerHTML = `<div class="field"><label>Aspect ratio</label><select id="ratio"><option value="free">Freeform</option><option value="1">1:1 square</option><option value="1.7778">16:9</option><option value="1.3333">4:3</option><option value="0.5625">9:16</option></select></div>
    <div class="field"><label>Output</label><select id="fmt"><option value="">Same as input</option><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></div>`;
    root.appendChild(ctl);
    const note = IL.el('div', 'note', 'Drag on the image to select a crop region. Choose a ratio to lock proportions.');
    note.style.display = 'none'; root.appendChild(note);
    const wrap = IL.el('div', 'cropwrap'); wrap.style.display = 'none';
    const cv = IL.el('canvas'); wrap.appendChild(cv); root.appendChild(wrap);
    const actions = IL.el('div', 'actions'); const go = IL.el('button', 'btn', 'Crop & download'); go.disabled = true;
    actions.appendChild(go); root.appendChild(actions);
    const log = IL.logger(root); const out = IL.el('div', 'out'); root.appendChild(out);
    const ctx = cv.getContext('2d');

    async function load(fs) {
      file = fs[0]; img = await IL.loadImage(file);
      const maxW = 680; scale = Math.min(1, maxW / img.naturalWidth);
      cv.width = img.naturalWidth * scale; cv.height = img.naturalHeight * scale;
      sel = null; draw();
      ctl.style.display = 'flex'; note.style.display = 'block'; wrap.style.display = 'inline-block'; go.disabled = true;
    }
    function draw() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      if (sel) {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.clearRect(sel.x, sel.y, sel.w, sel.h);
        ctx.drawImage(img, sel.x / scale, sel.y / scale, sel.w / scale, sel.h / scale, sel.x, sel.y, sel.w, sel.h);
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      }
    }
    function pos(e) {
      const r = cv.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      return { x: Math.max(0, Math.min(cv.width, cx * (cv.width / r.width))), y: Math.max(0, Math.min(cv.height, cy * (cv.height / r.height))) };
    }
    function applyRatio(w, h) {
      const r = root.querySelector('#ratio').value;
      if (r === 'free') return [w, h];
      const ratio = +r; let nw = Math.abs(w), nh = nw / ratio;
      if (nh > Math.abs(h)) { nh = Math.abs(h); nw = nh * ratio; }
      return [Math.sign(w || 1) * nw, Math.sign(h || 1) * nh];
    }
    function down(e) { e.preventDefault(); dragging = true; start = pos(e); }
    function move(e) {
      if (!dragging) return; e.preventDefault();
      const p = pos(e); let w = p.x - start.x, h = p.y - start.y;
      [w, h] = applyRatio(w, h);
      sel = { x: w < 0 ? start.x + w : start.x, y: h < 0 ? start.y + h : start.y, w: Math.abs(w), h: Math.abs(h) };
      draw();
    }
    function up() { dragging = false; go.disabled = !(sel && sel.w > 4 && sel.h > 4); }
    cv.onmousedown = down; cv.onmousemove = move; window.addEventListener('mouseup', up);
    cv.ontouchstart = down; cv.ontouchmove = move; cv.ontouchend = up;

    go.onclick = async () => {
      out.innerHTML = '';
      try {
        if (!sel) return;
        const oc = IL.el('canvas');
        oc.width = Math.round(sel.w / scale); oc.height = Math.round(sel.h / scale);
        oc.getContext('2d').drawImage(img, sel.x / scale, sel.y / scale, oc.width, oc.height, 0, 0, oc.width, oc.height);
        const mime = root.querySelector('#fmt').value || file.type || 'image/png';
        const blob = await IL.canvasToBlob(oc, mime, .92);
        out.appendChild(IL.download(blob, IL.rename(file.name, IL.EXT[mime] || 'png').replace(/(\.\w+)$/, '-crop$1')));
        log.set(`Done — ${oc.width}×${oc.height}px.`, 'ok');
      } catch (e) { log.set('Failed: ' + e.message, 'err'); }
    };
  });
})(window.Bimba);
