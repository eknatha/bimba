/* Bimba — offline proof.
   Load this FIRST: it wraps fetch / XHR / sendBeacon / WebSocket before anything else runs,
   and watches Resource Timing, so the panel can show every request the page makes.
   It reports only what this page can observe (not worker-internal or browser-level traffic);
   the strongest check is still: turn on airplane mode and use a tool. */
window.Bimba = window.Bimba || { tools: {} };
(function (IL) {
  const P = IL.proof = { log: [], assets: 0, uploads: 0, external: 0 };
  const SELF = location.origin;

  function classify(url, hasBody) {
    let origin = SELF;
    try {
      const u = new URL(url, location.href);
      if (u.protocol === 'data:' || u.protocol === 'blob:') return null;       // local-only
      origin = u.origin;
    } catch (e) { return null; }
    return { external: origin !== SELF, upload: !!hasBody, host: origin.replace(/^https?:\/\//, '') };
  }

  function record(url, method, hasBody, kind) {
    const c = classify(url, hasBody);
    if (!c) return;
    if (c.upload) P.uploads++;
    if (c.external) P.external++; else if (!c.upload) P.assets++;
    P.log.push({
      t: new Date(), kind, method, host: c.host, path: String(url).replace(/^https?:\/\/[^/]+/, '').slice(0, 80),
      scope: c.external ? 'external' : 'site', upload: c.upload
    });
    if (P.log.length > 300) P.log.shift();
    document.dispatchEvent(new CustomEvent('il-proof'));
  }

  // --- fetch ---
  const _fetch = window.fetch;
  if (_fetch) window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const body = !!((init && init.body) || (input && input.body));
      record(url, method, body, 'fetch');
    } catch (e) {}
    return _fetch.apply(this, arguments);
  };

  // --- XHR ---
  const _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__il = { m: (m || 'GET').toUpperCase(), u: u }; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    try { if (this.__il) record(this.__il.u, this.__il.m, b != null, 'xhr'); } catch (e) {}
    return _send.apply(this, arguments);
  };

  // --- beacon / websocket ---
  if (navigator.sendBeacon) {
    const _b = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) { try { record(u, 'POST', d != null, 'beacon'); } catch (e) {} return _b(u, d); };
  }
  if (window.WebSocket) {
    const _WS = window.WebSocket;
    window.WebSocket = function (u, p) { try { record(String(u).replace(/^ws/, 'http'), 'WS', true, 'websocket'); } catch (e) {} return new _WS(u, p); };
    window.WebSocket.prototype = _WS.prototype;
  }

  // --- script / css / img / worker loads (fetch + XHR are counted above, so skipped here) ---
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(e => {
        if (e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'beacon') return;
        record(e.name, 'GET', false, e.initiatorType || 'resource');
      });
    }).observe({ type: 'resource', buffered: true });
  } catch (e) {}

  // ---------- panel ----------
  let modal = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render() {
    if (!modal) return;
    const online = navigator.onLine;
    const rows = P.log.slice(-40).reverse().map(l =>
      '<li class="' + (l.scope === 'external' ? 'ext' : '') + (l.upload ? ' up' : '') + '">' +
      '<span class="k">' + esc(l.method) + '</span><span class="h">' + esc(l.host) + '</span>' +
      '<span class="p">' + esc(l.path) + '</span></li>').join('');
    modal.querySelector('.pf-body').innerHTML =
      '<div class="pf-state ' + (online ? 'on' : 'off') + '"><span class="dot"></span>' + (online ? IL.t('pf.online') : IL.t('pf.offline')) + '</div>' +
      '<div class="pf-stats">' +
        '<div><b>' + P.assets + '</b><span>' + IL.t('pf.assets') + '</span></div>' +
        '<div class="' + (P.uploads ? 'bad' : 'good') + '"><b>' + P.uploads + '</b><span>' + IL.t('pf.uploads') + '</span></div>' +
        '<div><b>' + P.external + '</b><span>' + IL.t('pf.external') + '</span></div>' +
      '</div>' +
      (P.external ? '<p class="pf-note">' + IL.t('pf.counter') + '</p>' : '') +
      '<p class="pf-note">' + IL.t('pf.csp') + '</p>' +
      '<h4>' + IL.t('pf.log') + '</h4>' +
      '<ul class="pf-log">' + (rows || '<li class="empty">' + IL.t('pf.empty') + '</li>') + '</ul>' +
      '<div class="actions"><button class="btn ghost" id="pfTest">' + IL.t('pf.test') + '</button></div>' +
      '<div class="log" id="pfTestOut"></div>' +
      '<p class="pf-note dim">' + IL.t('pf.how') + '</p>' +
      '<p class="pf-note dim">' + IL.t('pf.limits') + '</p>';
    modal.querySelector('#pfTest').onclick = selfTest;
  }

  async function selfTest() {
    const out = modal.querySelector('#pfTestOut');
    const before = P.log.length;
    // a real local round-trip: draw → resize → encode (no network involved)
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 512, 512); g.addColorStop(0, '#6366f1'); g.addColorStop(1, '#ec4899');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    const s = document.createElement('canvas'); s.width = s.height = 128; s.getContext('2d').drawImage(c, 0, 0, 128, 128);
    await new Promise(r => s.toBlob(r, 'image/jpeg', 0.8));
    await new Promise(r => setTimeout(r, 250));
    const n = P.log.length - before;
    out.innerHTML = '<span class="' + (n === 0 ? 'ok' : 'err') + '">' + IL.t('pf.testdone', { n: n }) + '</span>';
  }

  function open() {
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.className = 'modal open'; modal.id = 'pfModal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '<div class="modal-card wide"><button class="x pf-x" aria-label="' + IL.t('c.close') + '">✕</button>' +
      '<div class="modal-ico">◉</div><h2>' + IL.t('pf.title') + '</h2><p class="modal-lead">' + IL.t('pf.lead') + '</p>' +
      '<div class="pf-body"></div></div>';
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) close(); };
    modal.querySelector('.pf-x').onclick = close;
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    render();
    modal.querySelector('.pf-x').focus();
  }
  function close() { if (modal) { modal.remove(); modal = null; } }

  P.open = open; P.close = close;
  P.note = (url, method, body, kind) => record(url, method || 'GET', !!body, kind || 'frame');   // for sandboxed frames
  document.addEventListener('il-proof', render);
  document.addEventListener('il-lang', () => { if (modal) open(); });
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  document.addEventListener('DOMContentLoaded', () => {
    ['proofBtn', 'proofLink'].forEach(id => { const b = document.getElementById(id); if (b) b.onclick = e => { e.preventDefault(); open(); }; });
  });
})(window.Bimba);
