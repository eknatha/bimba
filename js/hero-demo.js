/* Bimba — hero demo: live before/after canvas wipe.
   Page-specific (not a tool). Reads Bimba.SAMPLE, processes with the
   same Canvas API the tools use, and lets the user drag to compare. */
(function (IL) {
  const cv = document.getElementById('demoCv');
  const frame = document.getElementById('frame');
  const handle = document.getElementById('demoHandle');
  const startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.onclick = () => {
    const t = document.getElementById('primary');
    (t || document.getElementById('grid')).scrollIntoView({ behavior: 'smooth' });
  };
  if (!cv || !IL.SAMPLE) return;

  const ctx = cv.getContext('2d');
  let split = 0.5, processed = null;
  const img = new Image();
  img.onload = () => { render(); };
  img.src = IL.SAMPLE;

  function process(src) {
    const w = src.width, h = src.height;
    const o = document.createElement('canvas'); o.width = w; o.height = h;
    const octx = o.getContext('2d');
    octx.drawImage(src, 0, 0);
    const d = octx.getImageData(0, 0, w, h), p = d.data;
    // vibrant magenta → indigo duotone (matches the brand gradient)
    for (let i = 0; i < p.length; i += 4) {
      const lum = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) / 255;
      p[i] = Math.round(60 + lum * 195);
      p[i + 1] = Math.round(20 + lum * 90);
      p[i + 2] = Math.round(120 + lum * 135);
    }
    octx.putImageData(d, 0, 0);
    return o;
  }
  function render() {
    const W = cv.width = img.width, H = cv.height = img.height;
    if (!processed) processed = process(img);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);
    const sx = Math.round(W * split);
    ctx.drawImage(processed, sx, 0, W - sx, H, sx, 0, W - sx, H);
  }
  function setSplit(clientX) {
    const r = frame.getBoundingClientRect();
    split = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    handle.style.left = (split * 100) + '%';
    render();
  }
  let drag = false;
  handle.addEventListener('mousedown', () => drag = true);
  window.addEventListener('mouseup', () => drag = false);
  window.addEventListener('mousemove', e => { if (drag) setSplit(e.clientX); });
  frame.addEventListener('click', e => { if (e.target !== handle && !handle.contains(e.target)) setSplit(e.clientX); });
  handle.addEventListener('touchmove', e => { setSplit(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
})(window.Bimba);
