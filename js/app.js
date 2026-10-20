/* Bimba — app boot. Renders primary + secondary tools, opens tool builders,
   wires language, responsible-use notices, offline proof and the service worker. */
(function (IL) {
  const primaryWrap = document.getElementById('primary');
  const grid = document.getElementById('grid');
  const ws = document.getElementById('ws');
  const wsBody = document.getElementById('wsBody');
  const wsTitle = document.getElementById('wsTitle');
  const wsIco = document.getElementById('wsIco');

  const name = (tool) => IL.t('tool.' + tool.id + '.t', tool.t);
  const desc = (tool) => IL.t('tool.' + tool.id + '.d', tool.d);

  function openTool(tool) {
    const builder = IL.tools[tool.id];
    wsTitle.textContent = name(tool);
    wsIco.textContent = tool.ico;
    wsBody.innerHTML = '';
    ws.classList.add('open');
    if (typeof builder === 'function') IL.ethics.guard(tool, wsBody, root => builder(root));
    else wsBody.appendChild(IL.el('div', 'note', 'This tool failed to load. Check that js/tools/' + tool.id + '.js is present.'));
    IL.i18n.translateTree(wsBody);
  }
  function closeWs() { ws.classList.remove('open'); wsBody.innerHTML = ''; }

  document.getElementById('wsClose').onclick = closeWs;
  ws.onclick = e => { if (e.target === ws) closeWs(); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ws.classList.contains('open') && !document.querySelector('.modal.open')) closeWs();
  });

  function activate(el, tool) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.onclick = () => openTool(tool);
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTool(tool); } };
  }

  function render() {
    primaryWrap.innerHTML = ''; grid.innerHTML = '';
    // ----- primary tools (oversized) -----
    const primaries = IL.registry.filter(it => it.primary);
    if (primaries.length) {
      const row = IL.el('div', 'primary-tools');
      primaries.forEach(tool => {
        const c = IL.el('div', 'ptool');
        c.innerHTML = '<span class="go">→</span>' + `<div class="pico">${tool.ico}</div><h3></h3><p></p>`;
        c.querySelector('h3').textContent = name(tool);
        c.querySelector('p').textContent = desc(tool);
        activate(c, tool);
        row.appendChild(c);
      });
      primaryWrap.appendChild(row);
    }
    // ----- secondary tools (grouped) -----
    let curGrid = null;
    IL.registry.forEach(item => {
      if (item.primary) return;
      if (item.g) {
        const sec = IL.el('div', 'section');
        sec.innerHTML = '<div class="sec-head"><h2></h2><span class="rule"></span></div>';
        sec.querySelector('h2').textContent = IL.t(item.g);
        curGrid = IL.el('div', 'grid');
        sec.appendChild(curGrid);
        grid.appendChild(sec);
        return;
      }
      const c = IL.el('div', 'card' + (item.soon ? ' soon' : ''));
      c.innerHTML =
        (item.soon ? '<span class="badge">soon</span>' : '<span class="arrow">→</span>') +
        `<div class="top"><span class="ico">${item.ico}</span><h3></h3></div><p></p>` +
        (item.ai ? '<span class="chip ai"></span>' : '');
      c.querySelector('h3').textContent = name(item);
      c.querySelector('p').textContent = desc(item);
      const chip = c.querySelector('.chip'); if (chip) chip.textContent = IL.t('badge.ai');
      if (!item.soon) activate(c, item);
      (curGrid || grid).appendChild(c);
    });
  }

  // ----- boot -----
  IL.i18n.setGlobals({ n: IL.registry.filter(i => i.id && !i.soon).length });
  IL.i18n.buildSelector(document.querySelector('.nav-tag'));
  IL.i18n.observe(ws);
  document.addEventListener('il-lang', render);
  IL.i18n.set(IL.i18n.detect(), false);          // applies static text, fires il-lang → render()
  if (!grid.children.length) render();

  const start = document.getElementById('startBtn');
  if (start) start.onclick = () => { const t = document.getElementById('primary'); if (t) t.scrollIntoView({ behavior: 'smooth' }); };

  IL.ethics.init();

  // works offline after the first visit (core files + any model you have used are cached)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})(window.Bimba);
