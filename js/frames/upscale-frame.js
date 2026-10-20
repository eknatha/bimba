/* Runs inside frames/upscale.html. Receives RGBA pixels from the page, returns an upscaled PNG data URL.
   Reports its own network requests to the parent so the "offline proof" panel can list them. */
(function () {
  const post = m => parent.postMessage(m, location.origin);

  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    try { post({ type: 'net', url: new URL(typeof input === 'string' ? input : input.url, location.href).href, method: ((init && init.method) || 'GET').toUpperCase(), body: !!(init && init.body) }); } catch (e) {}
    return _fetch.apply(this, arguments);
  };

  const cache = {};
  async function getUpscaler(scale) {
    if (cache[scale]) return cache[scale];
    const up = new Upscaler({
      model: {
        scale, modelType: 'layers',
        path: new URL('../models/esrgan-slim/x' + scale + '/model.json', location.href).href,
        inputRange: [0, 255], outputRange: [0, 255]
      }
    });
    await up.getModel();
    return (cache[scale] = up);
  }

  window.addEventListener('message', async e => {
    if (e.origin !== location.origin || e.source !== parent) return;
    const m = e.data;
    if (!m || m.type !== 'run') return;
    try {
      const cv = document.createElement('canvas'); cv.width = m.width; cv.height = m.height;
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.buffer), m.width, m.height), 0, 0);
      const up = await getUpscaler(m.scale);
      const dataUrl = await up.upscale(cv, {
        patchSize: m.patchSize, padding: 4,
        progress: a => post({ type: 'progress', id: m.id, pct: Math.round(a * 100) })
      });
      post({ type: 'done', id: m.id, dataUrl, backend: window.tf ? tf.getBackend() : '' });
    } catch (err) {
      post({ type: 'error', id: m.id, message: String((err && err.message) || err) });
    }
  });

  post({ type: 'ready' });
})();
