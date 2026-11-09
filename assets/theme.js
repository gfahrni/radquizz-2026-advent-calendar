/* =========================================================
   Single theme (Christmas), snowfall and small shared helpers.
   Loaded before app.js / home.js.

   The advent calendar has one single look: no toggle, no memory,
   no ?theme=…
   ========================================================= */
window.RQ = (() => {
  'use strict';

  const THEME = 'noel';
  const THEME_COLOR = '#0f1d16';

  /* ---------------- Local storage ---------------- */

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('rq.' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('rq.' + key, JSON.stringify(value)); } catch { /* private mode */ }
    },
  };

  /* ---------------- Snowfall ----------------
     A full-screen canvas drawn with the SVG flakes from assets/neige/.
     Flakes fall, drift sideways and spin: a simple offset repeated
     pattern would be spotted immediately.
     Size, density and opacity are set by the constants below.
     ------------------------------------------------- */

  const FLAKES = ['flocon-1.svg', 'flocon-2.svg', 'flocon-3.svg'];
  const AREA_PER_FLAKE = 24000;   // one flake per ~24,000 px² of screen
  const MIN_FLAKES = 24;
  const MAX_FLAKES = 70;
  const MIN_SIZE = 15;            // diameter, in px
  const MAX_SIZE = 40;

  function snowDir() {
    // initSnow() is called from app.js / home.js: find the theme.js path
    // in the DOM instead of relying on document.currentScript.
    const here = document.currentScript;
    const el = (here && /theme\.js/.test(here.src || ''))
      ? here
      : Array.from(document.scripts).find((s) => /theme\.js/.test(s.src || ''));
    const src = el ? el.src : new URL('assets/theme.js', location.href).href;
    return new URL('neige/', new URL(src.replace(/[^/]*$/, ''), location.href));
  }

  function initSnow() {
    if (document.querySelector('.snow')) return;   // already running

    const canvas = document.createElement('canvas');
    canvas.className = 'snow';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dir = snowDir();
    // SVGs are rasterised once into a small canvas: drawing an SVG on every
    // frame (60 times per second) is expensive, especially on mobile.
    function rasterize(img, px = 128) {
      const c = document.createElement('canvas');
      c.width = c.height = px;
      c.getContext('2d').drawImage(img, 0, 0, px, px);
      return c;
    }

    const images = FLAKES.map((name) => {
      const img = new Image();
      img.ready = false;
      img.addEventListener('load', () => {
        img.sprite = rasterize(img);
        img.ready = true;
        if (!raf) draw(0);
      });
      img.src = new URL(name, dir).href;
      return img;
    });

    let width = 0;
    let height = 0;
    let flakes = [];
    let raf = 0;
    let last = 0;

    const rnd = (a, b) => a + Math.random() * (b - a);

    function makeFlake(spread) {
      const size = rnd(MIN_SIZE, MAX_SIZE);
      return {
        img: images[Math.floor(Math.random() * images.length)],
        x: rnd(0, width),
        y: spread ? rnd(0, height) : -size,
        size,
        vy: rnd(11, 32),                 // px/s
        amp: rnd(5, 20),                 // sideways drift, px
        freq: rnd(0.12, 0.42),           // rad/s
        phase: rnd(0, Math.PI * 2),
        rot: rnd(0, Math.PI * 2),
        spin: rnd(-0.22, 0.22),          // rad/s
        alpha: rnd(0.22, 0.55),
      };
    }

    function build() {
      const count = Math.max(MIN_FLAKES, Math.min(MAX_FLAKES,
        Math.round((width * height) / AREA_PER_FLAKE)));
      flakes = Array.from({ length: count }, () => makeFlake(true));
    }

    function measure() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function draw(t) {
      ctx.clearRect(0, 0, width, height);
      for (const f of flakes) {
        if (!f.img.ready) continue;
        ctx.save();
        ctx.globalAlpha = f.alpha;
        ctx.translate(f.x + Math.sin(t * f.freq + f.phase) * f.amp, f.y);
        ctx.rotate(f.rot);
        ctx.drawImage(f.img.sprite, -f.size / 2, -f.size / 2, f.size, f.size);
        ctx.restore();
      }
    }

    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      for (const f of flakes) {
        f.y += f.vy * dt;
        f.rot += f.spin * dt;
        if (f.y - f.size > height) {
          f.y = -f.size;
          f.x = rnd(0, width);
        }
      }
      draw(now / 1000);
      raf = requestAnimationFrame(step);
    }

    function start() {
      if (raf || reduce) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    measure();

    if (reduce) {
      // No animation: a still image, redrawn when the SVGs arrive.
      images.forEach((img) => img.addEventListener('load', () => draw(0)));
      draw(0);
    } else {
      start();
      window.addEventListener('resize', () => { stop(); measure(); start(); }, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else start();
      });
    }
  }

  /* ---------------- Theme ---------------- */

  function initTheme() {
    document.documentElement.dataset.theme = THEME;
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.content = THEME_COLOR;
    initSnow();
  }

  return { THEME, store, initTheme };
})();
