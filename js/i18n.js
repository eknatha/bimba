/* Bimba — i18n engine.
   Language packs live in js/lang/<code>.js and register into Bimba.lang[code]:
     { meta:{ native, dir, beta }, s:{ key: 'text with {vars}' }, legacy:{ 'English text': 'translation' } }
   - IL.t(key, fallback|vars, vars)   dynamic strings (missing keys fall back to English)
   - data-i18n / data-i18n-html / data-i18n-attr   static markup
   - legacy:  exact English text nodes inside the tool workspace are translated automatically,
              so older tools need no edits (strings with dynamic parts stay English). */
(function (IL) {
  IL.lang = IL.lang || {};
  const ORDER = ['en', 'hi', 'te', 'ta', 'kn', 'ml', 'mr', 'bn', 'or', 'pa', 'es', 'ru'];
  const LS = 'il-lang';
  let cur = 'en';
  const globals = {};            // default {vars} (e.g. tool count)

  function pack(code) { return IL.lang[code]; }

  IL.t = function (key, fallback, vars) {
    if (fallback && typeof fallback === 'object') { vars = fallback; fallback = null; }
    let s = pack(cur) && pack(cur).s[key];
    if (s == null && pack('en')) s = pack('en').s[key];
    if (s == null) s = fallback != null ? fallback : key;
    const v = Object.assign({}, globals, vars || {});
    return s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
  };

  function list() {
    return ORDER.filter(c => pack(c)).map(c => Object.assign({ code: c }, pack(c).meta));
  }

  // ---------- static markup ----------
  function applyStatic(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = IL.t(e.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(e => { e.innerHTML = IL.t(e.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-attr]').forEach(e => {
      e.dataset.i18nAttr.split(';').forEach(pair => {
        const i = pair.indexOf(':'); if (i < 1) return;
        e.setAttribute(pair.slice(0, i).trim(), IL.t(pair.slice(i + 1).trim()));
      });
    });
  }

  // ---------- legacy text-node translation ----------
  function legacyMap() { return (cur !== 'en' && pack(cur) && pack(cur).legacy) || null; }

  function translateTree(root) {
    if (!root) return;
    const map = legacyMap();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const src = n.__il_en != null ? n.__il_en : n.nodeValue;
      const key = src.trim();
      if (!key) continue;
      let next = src;
      if (map && map[key]) { next = src.replace(key, map[key]); if (n.__il_en == null) n.__il_en = src; }
      else if (n.__il_en != null) { next = n.__il_en; }
      if (n.nodeValue !== next) n.nodeValue = next;
    }
    if (root.querySelectorAll) {
      root.querySelectorAll('[placeholder],[title]').forEach(e => {
        ['placeholder', 'title'].forEach(a => {
          if (!e.hasAttribute(a)) return;
          const k = '__il_' + a;
          const src = e[k] != null ? e[k] : e.getAttribute(a);
          const tr = map && map[src.trim()];
          if (tr) { e[k] = src; if (e.getAttribute(a) !== tr) e.setAttribute(a, tr); }
          else if (e[k] != null && e.getAttribute(a) !== e[k]) e.setAttribute(a, e[k]);
        });
      });
    }
  }

  let observer = null, queued = false;
  function observe(el) {
    if (!el || observer) return;
    observer = new MutationObserver(() => {
      if (queued) return; queued = true;
      Promise.resolve().then(() => { queued = false; translateTree(el); });
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
  }

  // ---------- language switching ----------
  function set(code, persist) {
    if (!pack(code)) code = 'en';
    cur = code;
    if (persist !== false) { try { localStorage.setItem(LS, code); } catch (e) {} }
    const m = pack(code).meta || {};
    document.documentElement.lang = code;
    document.documentElement.dir = m.dir || 'ltr';
    applyStatic(document);
    translateTree(document.getElementById('ws'));
    const sel = document.getElementById('langSel');
    if (sel) sel.value = code;
    document.dispatchEvent(new CustomEvent('il-lang', { detail: code }));
  }

  function detect() {
    let saved = null;
    try { saved = localStorage.getItem(LS); } catch (e) {}
    if (saved && pack(saved)) return saved;
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return pack(nav) ? nav : 'en';
  }

  function buildSelector(host) {
    if (!host || document.getElementById('langSel')) return;
    const sel = IL.el('select', 'lang-select');
    sel.id = 'langSel';
    sel.setAttribute('aria-label', 'Language');
    list().forEach(l => {
      const o = IL.el('option'); o.value = l.code;
      o.textContent = l.native + (l.beta ? ' (beta)' : '');
      sel.appendChild(o);
    });
    sel.onchange = () => set(sel.value);
    host.insertBefore(sel, host.firstChild);
  }

  IL.i18n = {
    set, list, applyStatic, translateTree, observe, buildSelector, detect,
    get: () => cur,
    setGlobals: g => Object.assign(globals, g)
  };
})(window.Bimba);
