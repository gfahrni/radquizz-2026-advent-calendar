/* =========================================================
   Thème unique (Noël) + petits utilitaires partagés.
   Chargé avant app.js / home.js.

   Le calendrier de l'Avent n'a qu'une seule apparence : plus de
   bascule, plus de mémorisation, plus de ?theme=…
   ========================================================= */
window.RQ = (() => {
  'use strict';

  const THEME = 'noel';
  const THEME_COLOR = '#0f1d16';

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('rq.' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('rq.' + key, JSON.stringify(value)); } catch { /* mode privé */ }
    },
  };

  function initTheme() {
    document.documentElement.dataset.theme = THEME;
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.content = THEME_COLOR;
  }

  return { THEME, store, initTheme };
})();
