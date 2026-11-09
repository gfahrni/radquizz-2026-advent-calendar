/* =========================================================
   Home page: the advent calendar (content/cases.json, generated).
   Four weeks, two doors each; closed weeks stay wrapped until their date.
   ========================================================= */
(() => {
  'use strict';

  const { initTheme, store } = window.RQ;
  const $ = (sel, root = document) => root.querySelector(sel);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const pad = (n) => String(n).padStart(2, '0');

  const LOCK = `<svg class="locked-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none"
      stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="7" width="9" height="6.5" rx="1.6"/>
      <path d="M5.5 7V5.4a2.5 2.5 0 0 1 5 0V7"/></svg>`;

  /* ---------------- Doors ---------------- */

  function openDoor(item) {
    const a = document.createElement('a');
    a.className = 'case-card';
    a.href = item.href;
    a.dataset.id = item.id;
    a.innerHTML = `
      <div class="thumb">
        ${item.thumb
          ? `<img src="${esc(item.thumb)}" alt="" loading="lazy" decoding="async">`
          : '<span class="thumb-empty">—</span>'}
        <span class="door-badge">${pad(item.number)}</span>
      </div>
      <div class="case-body">
        <p class="case-kicker">${esc(item.themeLabel)} · ${esc(item.exam)}</p>
        <h2>${esc(item.title)}</h2>
        <p class="case-stem">${esc(item.stem || '')}</p>
        <p class="case-foot">
          <span>${item.seriesCount} series</span>
          <span>${item.sliceCount} slices</span>
        </p>
      </div>`;
    return a;
  }

  function closedDoor(item) {
    const el = document.createElement('div');
    el.className = 'case-card is-locked';
    el.setAttribute('aria-label', `Case ${item.number} — opens ${item.opensOn}`);
    el.innerHTML = `
      <div class="locked-face">
        <span class="locked-number">${pad(item.number)}</span>
        ${LOCK}
        <p class="locked-text">Opens ${esc(item.opensOn)}</p>
      </div>`;
    return el;
  }

  const door = (item) => (item.open ? openDoor(item) : closedDoor(item));

  /* ---------------- Weeks ---------------- */

  function weekBlock(week) {
    const section = document.createElement('section');
    section.className = 'week';
    section.dataset.week = String(week.week);

    const state = week.open
      ? '<span class="week-state is-open">Open now</span>'
      : `<span class="week-state">Opens ${esc(week.opensOn)}</span>`;

    section.innerHTML = `
      <header class="week-head">
        <h2 class="week-title">Week ${week.week}</h2>
        <p class="week-dates">${esc(week.dates || '')}</p>
        ${state}
      </header>
      <div class="doors"></div>`;

    $('.doors', section).append(...week.cases.map(door));
    return section;
  }

  /* ---------------- Boot ---------------- */

  async function boot() {
    initTheme();
    const grid = $('#cases');

    try {
      const res = await fetch('content/cases.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      const version = data.version || '';
      if (version) $('#version').textContent = 'v' + version;

      const weeks = Array.isArray(data.weeks) ? data.weeks : [];
      if (!weeks.length) {
        grid.innerHTML = `<div class="notice">No cases published yet.
          Add a file to <code>content/cases/</code>, then run
          <code>npm run build</code>.</div>`;
        return;
      }

      grid.replaceChildren(...weeks.map(weekBlock));

      // small comfort: highlight the last case opened
      const last = store.get('lastCase', null);
      const el = last && grid.querySelector(`.case-card[data-id="${last}"]`);
      if (el) el.classList.add('is-last');
    } catch (err) {
      console.error(err);
      grid.innerHTML = `<div class="notice"><strong>Could not load the case list.</strong><br>
        ${esc(err.message)}<br>Run <code>npm run build</code> to generate
        <code>content/cases.json</code>.</div>`;
    }
  }

  boot();
})();
