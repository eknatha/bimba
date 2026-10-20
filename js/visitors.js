/* Bimba — visitor counter.
   TOTAL: global count from counterapi.dev **v2** (v1 was shut down on 7 Aug 2026). It is incremented once per browser tab-session
          and cached in localStorage so the last known number still shows if the service is unreachable.
   TODAY: "visits from this browser today" — a local counter, NOT a global figure (there is no server to ask).
   Only a number is exchanged; no image data ever reaches this file. All storage access is guarded
   (private windows / blocked storage must never break the page). */
(function () {
  // NOTE: KEY is a data identifier, not branding — it must stay 'imagelab-total' or the existing global count resets to 0.
  const NS = 'eknathalabs', KEY = 'imagelab-total';
  const API = 'https://api.counterapi.dev/v2/' + NS + '/' + KEY;   // v2 base; '/up' increments, no suffix reads

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  // The v2 response body is not formally documented, so accept every shape it is known/likely to use:
  // {count}, {value}, {hits}, {data:{value|count|up_count[,down_count]}}  (up_count − down_count when both exist)
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v)) ? +v : null;
  function readCount(d) {
    if (!d || typeof d !== 'object') return null;
    const x = (d.data && typeof d.data === 'object') ? d.data : d;
    for (const o of [x, d]) {
      for (const k of ['value', 'count', 'hits']) { const v = num(o[k]); if (v != null) return v; }
      const up = num(o.up_count); if (up != null) return up - (num(o.down_count) || 0);
    }
    return null;
  }
  const fmt = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString();
  function put(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove('loading');
  }

  // ── TODAY (this browser, local calendar day) ──
  const day = new Date();
  const todayStr = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
  let count = parseInt(ls.get('il-today-count') || '0', 10) || 0;
  if (ls.get('il-seen-date') !== todayStr) {          // new day (or first ever visit) → start again from zero
    count = 0;
    ls.set('il-seen-date', todayStr);
  }
  if (ss.get('il-counted') !== '1') {                 // one count per tab session
    count += 1;
    ss.set('il-counted', '1');
  }
  ls.set('il-today-count', String(count));
  put('todayCount', '+' + fmt(count) + ' today');

  // ── TOTAL (global, counterapi.dev) ──
  const hit = ss.get('il-total-hit') !== '1';         // increment once per session, otherwise just read
  const cached = ls.get('il-total-cache');
  if (cached) put('totalCount', fmt(Number(cached)));

  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : null;

  fetch(hit ? API + '/up' : API, ctl ? { signal: ctl.signal } : undefined)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => {
      const val = readCount(d);
      if (val == null) throw new Error('no count field');
      if (hit) ss.set('il-total-hit', '1');
      ls.set('il-total-cache', String(val));
      put('totalCount', fmt(val));
    })
    .catch(() => put('totalCount', cached ? fmt(Number(cached)) : '—'))
    .then(() => { if (timer) clearTimeout(timer); });
})();
