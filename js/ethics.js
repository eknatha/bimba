/* Bimba — responsible-use notices.
   - first visit: a one-time notice (re-openable from the footer)
   - every tool: a caution strip at the top of the workspace
   - sensitive tools (registry: sens:true): must be acknowledged once before the tool opens
   Nothing is sent anywhere; acknowledgements are kept in localStorage only. */
(function (IL) {
  const KEY_GLOBAL = 'il-ethics-v1';
  const KEY_TOOL = id => 'il-ack-' + id + '-v1';
  const get = k => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
  const put = k => { try { localStorage.setItem(k, '1'); } catch (e) {} };

  let modal = null;

  function buildModal() {
    if (modal) modal.remove();
    modal = IL.el('div', 'modal'); modal.id = 'ethModal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'ethTitle');
    modal.innerHTML =
      '<div class="modal-card">' +
        '<div class="modal-ico">⚑</div>' +
        '<h2 id="ethTitle">' + IL.t('eth.title') + '</h2>' +
        '<p class="modal-lead">' + IL.t('eth.intro') + '</p>' +
        '<ul class="modal-list">' +
          [1, 2, 3, 4, 5].map(i => '<li>' + IL.t('eth.p' + i) + '</li>').join('') +
        '</ul>' +
        '<div class="actions"><button class="btn" id="ethOk">' + IL.t('eth.accept') + '</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    const ok = modal.querySelector('#ethOk');
    ok.onclick = () => { put(KEY_GLOBAL); close(); };
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') { put(KEY_GLOBAL); close(); } });
    return ok;
  }

  function open() { const ok = buildModal(); modal.classList.add('open'); ok.focus(); }
  function close() { if (modal) { modal.remove(); modal = null; } }

  // Wrap a tool: show caution (and a gate if sensitive) then call build(root)
  function guard(tool, root, build) {
    const warnKey = 'warn.' + tool.id;
    const hasWarn = IL.lang.en.s[warnKey] != null;
    const render = () => {
      root.innerHTML = '';
      root.appendChild(IL.caution(hasWarn ? warnKey : 'warn.generic'));
      const body = IL.el('div'); root.appendChild(body);
      build(body);
    };
    if (tool.sens && !get(KEY_TOOL(tool.id))) {
      root.innerHTML = '';
      const card = IL.el('div', 'gate');
      card.innerHTML =
        '<div class="gate-ico">⚑</div><h3>' + IL.t('eth.title') + '</h3>' +
        '<p>' + IL.t(hasWarn ? warnKey : 'warn.generic') + '</p>' +
        '<ul class="modal-list">' + [1, 2, 3].map(i => '<li>' + IL.t('eth.p' + i) + '</li>').join('') + '</ul>';
      const act = IL.el('div', 'actions');
      const btn = IL.el('button', 'btn', IL.t('eth.continue'));
      btn.onclick = () => { put(KEY_TOOL(tool.id)); render(); };
      act.appendChild(btn); card.appendChild(act); root.appendChild(card);
      btn.focus();
      return;
    }
    render();
  }

  IL.ethics = {
    open, close, guard,
    init() {
      if (!get(KEY_GLOBAL)) open();
      document.addEventListener('il-lang', () => { if (modal) open(); });
      const link = document.getElementById('ethLink');
      if (link) link.onclick = e => { e.preventDefault(); open(); };
    }
  };
})(window.Bimba);
