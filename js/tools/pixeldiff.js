/* Bimba tool: Pixel diff — compare two images, highlight what changed.
   Views: difference map (changes in red over a dimmed A), heatmap, swipe compare. */
(function (IL) {
  const MAX_SIDE = 3000;

  IL.register('pixeldiff', function (root) {
    let A = null, B = null;                           // {canvas, name}
    let dMap = null, changed = 0, total = 0, scaledB = false;

    const pick = IL.el('div', 'pd-pick');
    function slot(key, label) {
      const box = IL.el('div', 'pd-slot');
      box.innerHTML = '<h4>' + label + '</h4>';
      const nm = IL.el('div', 'pd-name', '—');
      box.appendChild(IL.dropZone(async fs => {
        try {
          const img = await IL.loadImage(fs[0]);
          let w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, MAX_SIDE / Math.max(w, h));
          const cv = IL.toCanvas(img, Math.round(w * k), Math.round(h * k));
          (key === 'a' ? (A = { canvas: cv, name: fs[0].name }) : (B = { canvas: cv, name: fs[0].name }));
          nm.textContent = fs[0].name + ' · ' + w + '×' + h;
          update();
        } catch (e) { log.set(IL.t('c.failed') + ': ' + e.message, 'err'); }
      }, 'image/*', false));
      box.appendChild(nm);
      return box;
    }
    pick.appendChild(slot('a', IL.t('pd.a')));
    pick.appendChild(slot('b', IL.t('pd.b')));
    root.appendChild(pick);

    const ctl = IL.el('div', 'ctl');
    ctl.innerHTML =
      '<div class="field range"><label>' + IL.t('pd.sens') + ' <span id="pdSv">25</span></label>' +
        '<input type="range" id="pdS" min="1" max="100" value="25"></div>' +
      '<div class="field"><label>' + IL.t('pd.mode') + '</label><select id="pdM">' +
        '<option value="map">' + IL.t('pd.m.map') + '</option>' +
        '<option value="heat">' + IL.t('pd.m.heat') + '</option>' +
        '<option value="swipe">' + IL.t('pd.m.swipe') + '</option></select></div>';
    root.appendChild(ctl);

    const stat = IL.el('div', 'pd-stat'); root.appendChild(stat);
    const view = IL.el('div', 'pd-view'); view.style.display = 'none';
    const cv = IL.el('canvas'); view.appendChild(cv); root.appendChild(view);
    const actions = IL.el('div', 'actions');
    const save = IL.el('button', 'btn ghost', IL.t('pd.save')); save.disabled = true;
    actions.appendChild(save); root.appendChild(actions);
    const log = IL.logger(root);
    root.appendChild(IL.el('div', 'note', IL.t('pd.note')));

    const $ = s => root.querySelector(s);
    let swipeX = 0.5, dragging = false;

    $('#pdS').oninput = () => { $('#pdSv').textContent = $('#pdS').value; update(); };
    $('#pdM').onchange = draw;

    // sensitivity 1..100 → threshold on the max channel difference (0..255); higher = more sensitive
    const thr = () => Math.round(255 * Math.pow(1 - (+$('#pdS').value) / 101, 2));

    function update() {
      if (!A || !B) { log.set(A || B ? IL.t('pd.need') : ''); return; }
      log.set('');
      const w = A.canvas.width, h = A.canvas.height;
      const bc = IL.el('canvas'); bc.width = w; bc.height = h;
      const bctx = bc.getContext('2d');
      const ra = A.canvas.width / A.canvas.height, rb = B.canvas.width / B.canvas.height;
      scaledB = B.canvas.width !== w || B.canvas.height !== h || Math.abs(ra - rb) > 0.01;
      bctx.drawImage(B.canvas, 0, 0, w, h);
      bc.__img = bctx.getImageData(0, 0, w, h);
      A.data = A.data && A.data.width === w ? A.data : A.canvas.getContext('2d').getImageData(0, 0, w, h);
      const a = A.data.data, b = bc.__img.data, T = thr();
      dMap = new Uint8Array(w * h);
      changed = 0; total = w * h;
      for (let i = 0, p = 0; i < a.length; i += 4, p++) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        dMap[p] = d;
        if (d > T) changed++;
      }
      update.bImg = bc;
      draw();
    }

    function draw() {
      if (!dMap) return;
      const w = A.canvas.width, h = A.canvas.height, T = thr(), mode = $('#pdM').value;
      view.style.display = '';
      cv.width = w; cv.height = h;
      const x = cv.getContext('2d');
      const pct = (changed / total * 100);
      stat.innerHTML = changed === 0 ? IL.t('pd.same')
        : IL.t('pd.stat', { pct: pct < 0.01 ? '<0.01' : pct.toFixed(2), n: changed.toLocaleString() });
      if (scaledB) stat.innerHTML += '<div class="pd-warn">' + IL.t('pd.scaled') + '</div>';

      if (mode === 'swipe') {
        x.drawImage(update.bImg, 0, 0);
        x.save(); x.beginPath(); x.rect(0, 0, w * swipeX, h); x.clip(); x.drawImage(A.canvas, 0, 0); x.restore();
        x.fillStyle = '#c084fc'; const lw = Math.max(2, w / 400); x.fillRect(w * swipeX - lw / 2, 0, lw, h);
        cv.style.cursor = 'ew-resize';
      } else {
        const src = A.data.data, o = x.createImageData(w, h), d = o.data;
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
          const v = dMap[p];
          if (mode === 'map') {
            const g = (src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11) * 0.45;      // dimmed grayscale A
            if (v > T) { d[i] = 255; d[i + 1] = 40; d[i + 2] = 90; } else { d[i] = d[i + 1] = d[i + 2] = g; }
          } else {                                       // heatmap: black → purple → orange → white
            const t = Math.min(1, v / 128);
            d[i] = Math.min(255, t * 2 * 255); d[i + 1] = Math.max(0, (t - .5) * 2 * 255); d[i + 2] = Math.min(255, t * 180) * (1 - Math.max(0, (t - .6) * 2));
          }
          d[i + 3] = 255;
        }
        x.putImageData(o, 0, 0);
        cv.style.cursor = 'default';
      }
      save.disabled = false;
    }

    // swipe drag
    function moveTo(e) {
      const r = cv.getBoundingClientRect();
      swipeX = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); draw();
    }
    cv.onpointerdown = e => { if ($('#pdM').value === 'swipe') { dragging = true; cv.setPointerCapture(e.pointerId); moveTo(e); } };
    cv.onpointermove = e => { if (dragging) moveTo(e); };
    cv.onpointerup = () => { dragging = false; };

    save.onclick = async () => {
      const blob = await IL.canvasToBlob(cv, 'image/png');
      const out = IL.el('div', 'out'); out.appendChild(IL.download(blob, 'pixel-diff.png'));
      const old = root.querySelector('.out'); if (old) old.remove();
      root.appendChild(out);
    };
  });
})(window.Bimba);
