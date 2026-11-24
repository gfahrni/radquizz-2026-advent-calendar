/* =========================================================
   Case page.
   - one page = one case; the tabs are its series (axial, coronal, …)
   - scrollable image stack (native scroll-snap)
   - embedded Google Form, prefilled (case + participant id)
   ========================================================= */
(() => {
  'use strict';

  const { initTheme, store } = window.RQ;

  const BASE = document.body.dataset.base || '';
  const CASE_ID = document.body.dataset.case || '';
  const VERSION = document.body.dataset.version || '';

  const params = new URLSearchParams(location.search);

  /* ?catherine-mode=1 unwraps a case for the author. See assets/home.js. */
  const PREVIEW = params.has('catherine-mode');

  /* One slice out of two by default: 2.5 mm instead of 1.25 mm, half the weight
     and half the scrolling. ?skip=1 reads every slice, ?skip=4 one out of four.
     Only the kept slices are fetched. A reading option, not a build option: the
     files on disk stay complete. */
  const skipped = parseInt(params.get('skip') ?? '2', 10);
  const SKIP = Number.isFinite(skipped) ? Math.min(16, Math.max(1, skipped)) : 2;
  const decimate = (list) => (SKIP === 1 ? list : list.filter((_, i) => i % SKIP === 0));

  /* Two gestures, two speeds. The wheel (a desk, a trackpad) keeps the precise
     90 px per slice; the drag (a thumb, a mouse) crosses four times as many
     slices, which is what makes the stack usable on a phone.
     ?wheel_speed=4 / ?scroll_speed=1 tune either one. */
  const clampSpeed = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(16, Math.max(0.5, n)) : fallback;
  };
  const WHEEL_SPEED = clampSpeed(params.get('wheel_speed') ?? '1', 1);
  const DRAG_SPEED = clampSpeed(params.get('scroll_speed') ?? '4', 4);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const url = (path) => BASE + path;

  const state = {
    data: null,
    form: { formId: '', entries: {} },
    serie: null,
    manifests: new Map(),
    positions: {},
    cineloop: null,
    pid: participantId(),
  };

  /* ---------------- Participant identity ---------------- */

  function participantId() {
    let pid = store.get('pid', null);
    if (!pid) {
      pid = (crypto.randomUUID && crypto.randomUUID()) ||
        'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
      store.set('pid', pid);
    }
    return pid;
  }

  /* ---------------- Data ---------------- */

  async function getJSON(path) {
    const res = await fetch(url(path), { cache: 'no-cache' });
    if (!res.ok) throw new Error(path + ' → HTTP ' + res.status);
    return res.json();
  }

  async function loadManifest(serie) {
    if (state.manifests.has(serie.id)) return state.manifests.get(serie.id);
    let files = [];
    try {
      files = await getJSON(String(serie.folder).replace(/\/+$/, '') + '/manifest.json');
      if (!Array.isArray(files)) files = [];
    } catch (err) {
      console.warn('[radquizz] manifest manquant pour', serie.id, err);
    }
    state.manifests.set(serie.id, files);
    return files;
  }

  const imageUrl = (serie, file) =>
    url(String(serie.folder).replace(/\/+$/, '') + '/' + encodeURIComponent(file));

  /* ---------------- Background prefetch ----------------
     Once the first slice is on screen, the whole series is streamed, then the
     other series of the case: a radiologist reads on a good link and a black
     frame mid-stack is not acceptable, so there is no connection check here.
     The bytes go through throwaway Image objects, so they land in the HTTP
     cache; the DOM images only get a src near the cursor, which keeps decoded
     memory bounded. Interacting pauses the stream for a moment.
     ------------------------------------------------- */
  const prefetch = (() => {
    const CONCURRENCY = 4;
    const done = new Set();
    const queued = new Set();
    let queue = [];
    let active = 0;
    let pausedUntil = 0;
    let timer = 0;
    const inflight = new Map(); // probe image -> url
    let watch = new Set();   // urls of the series on screen
    let watchDone = 0;
    let notify = null;

    const report = () => { if (notify) notify(watchDone, watch.size); };

    function pump() {
      clearTimeout(timer);
      if (Date.now() < pausedUntil) {
        timer = setTimeout(pump, pausedUntil - Date.now());
        return;
      }
      while (active < CONCURRENCY && queue.length) {
        const { url: u } = queue.shift();
        queued.delete(u);
        if (done.has(u)) continue;
        active += 1;
        const img = new Image();
        img.decoding = 'async';
        inflight.set(img, u);
        const finish = () => {
          inflight.delete(img);
          done.add(u);
          active -= 1;
          if (watch.has(u)) { watchDone += 1; report(); }
          pump();
        };
        img.onload = finish;
        img.onerror = finish;
        img.src = u;
      }
    }

    function enqueue(urls) {
      for (const u of urls) {
        if (done.has(u) || queued.has(u)) continue;
        queued.add(u);
        queue.push({ url: u });
      }
      pump();
    }

    return {
      plan(priority, rest) {
        queue = [];
        queued.clear();
        watch = new Set(priority);
        watchDone = priority.reduce((n, u) => n + (done.has(u) ? 1 : 0), 0);
        enqueue(priority);
        enqueue(rest);
        report();
      },
      onProgress(fn) { notify = fn; report(); },
      // the reader took over: drop the probes in flight so the slice under the
      // cursor gets the whole connection, and put them back in the queue
      hold(ms) {
        pausedUntil = Math.max(pausedUntil, Date.now() + ms);
        if (!inflight.size) return;
        for (const [img, u] of inflight) {
          img.onload = null;
          img.onerror = null;
          img.src = '';
          active -= 1;
          if (!done.has(u) && !queued.has(u)) { queued.add(u); queue.unshift({ url: u }); }
        }
        inflight.clear();
        if (active < 0) active = 0;
      },
    };
  })();

  /* ---------------- Loading status ----------------
     Small line in the top-left corner: "loading 12/241 slices", the count of
     the series on screen. It fades out when everything is cached.
     ------------------------------------------------- */
  function initLoadStatus() {
    const el = document.createElement('p');
    el.className = 'load-status';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);

    let hide = 0;
    prefetch.onProgress((done, total) => {
      if (!total) return;
      el.textContent = `loading ${done}/${total} slices`;
      clearTimeout(hide);
      if (done >= total) {
        hide = setTimeout(() => el.classList.remove('is-on'), 450);
      } else {
        el.classList.add('is-on');
      }
    });
  }

  initLoadStatus();

  /* ---------------- Form ----------------
     The answer form is our own <form>, posting straight to Google's
     formResponse endpoint: same Google Form, same Sheet, but in English
     and styled like the site. If the extra entry ids are missing from
     content/form.json, it falls back to the embedded Google iframe.
     ------------------------------------------------- */

  function googleFormId() {
    const raw = String(state.form.formId || '');
    if (!raw) return '';
    const match = /\/d\/e\/([^/]+)/.exec(raw);
    if (match) return match[1];
    if (/^https?:/i.test(raw)) return '';
    return raw;
  }

  function buildNativeForm(data) {
    const { entries = {} } = state.form;
    const id = googleFormId();
    const needed = ['case', 'participant', 'diagnosis', 'name', 'email', 'status'];
    if (!id || needed.some((key) => !entries[key])) return null;

    const form = document.createElement('form');
    form.className = 'answer-form';
    form.method = 'POST';
    form.action = 'https://docs.google.com/forms/d/e/' + encodeURIComponent(id) + '/formResponse';
    form.target = 'rq-sink';

    const hidden = {
      [entries.case]: data.formLabel || data.title || data.id,
      [entries.participant]: state.pid,
    };

    form.innerHTML = `
      ${Object.entries(hidden).map(([name, value]) =>
        `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join('')}
      <div class="field">
        <label for="f-diagnosis">Diagnosis <span class="req" aria-hidden="true">*</span></label>
        <textarea id="f-diagnosis" name="${entries.diagnosis}" rows="4" required
          placeholder="Your diagnosis in a few words"></textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-name">Name <span class="req" aria-hidden="true">*</span></label>
          <input id="f-name" name="${entries.name}" type="text" required autocomplete="name">
        </div>
        <div class="field">
          <label for="f-email">Email <span class="req" aria-hidden="true">*</span></label>
          <input id="f-email" name="${entries.email}" type="email" required autocomplete="email">
        </div>
      </div>
      <fieldset class="field">
        <legend>Status <span class="req" aria-hidden="true">*</span></legend>
        <div class="radio-row">
          <label class="radio"><input type="radio" name="${entries.status}" value="Junior" required> Junior</label>
          <label class="radio"><input type="radio" name="${entries.status}" value="Senior"> Senior</label>
        </div>
      </fieldset>
      <button class="cta form-send" type="submit">Send my answer</button>
      <p class="form-note">Your answer goes to a Google Sheet. One submission per case is enough.</p>`;

    return form;
  }

  function buildFormSrc(data) {
    const { formId, entries = {} } = state.form;
    if (!formId) return null;

    const base = /^https?:/i.test(formId)
      ? formId
      : 'https://docs.google.com/forms/d/e/' + encodeURIComponent(formId) + '/viewform';

    let link;
    try { link = new URL(base); } catch { return null; }

    link.searchParams.set('embedded', 'true');

    const prefill = {
      case: data.formLabel || data.title || data.id,
      participant: state.pid,
    };
    let used = false;
    for (const [key, value] of Object.entries(prefill)) {
      const entry = entries[key];
      if (entry && value) { link.searchParams.set(entry, value); used = true; }
    }
    if (used) link.searchParams.set('usp', 'pp_url');
    return link.toString();
  }

  function showThanks(shell, data) {
    shell.innerHTML = `
      <div class="form-thanks">
        <svg class="thanks-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none"
             stroke="currentColor" stroke-width="1.6"><path d="M4 12.5 9.5 18 20 6.5"/></svg>
        <p class="ph-title">Thank you — your answer is in.</p>
        <p class="thanks-sub">${escapeHtml(data.formLabel || data.title || '')}</p>
      </div>`;
  }

  function renderForm(data) {
    const shell = $('#form-shell');
    if (!shell) return;
    shell.replaceChildren();

    const native = buildNativeForm(data);
    const src = native ? null : buildFormSrc(data);

    if (!native && !src) {
      const box = document.createElement('div');
      box.className = 'form-placeholder';
      box.innerHTML = `
        <p class="ph-title">Form not connected yet (expected on first run)</p>
        <p>Create your Google Form, then paste its id and the field ids into
           <code>content/form.json</code>:</p>
        <p><code>{ "formId": "1FAIpQLS…", "entries": { "case": "entry.111", "diagnosis": "entry.222", … } }</code></p>
        <p>The walkthrough is in the <code>README.md</code>. Everything else works until then.</p>`;
      shell.append(box);
      return;
    }

    if (!native) {
      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = 'Answer form — ' + (data.title || 'case');
      frame.loading = 'lazy';
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      shell.append(frame);
      return;
    }

    // hidden target: the POST never leaves the page
    const sink = document.createElement('iframe');
    sink.name = 'rq-sink';
    sink.className = 'form-sink';
    sink.title = 'Form submission';
    sink.setAttribute('aria-hidden', 'true');
    sink.tabIndex = -1;

    let sent = false;
    sink.addEventListener('load', () => { if (sent) showThanks(shell, data); });

    native.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!native.reportValidity()) return;
      const btn = $('.form-send', native);
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      sent = true;
      native.submit();
    });

    shell.append(native, sink);
  }

  /* ---------------- Case header ---------------- */

  function renderHead(data) {
    document.title = data.title + ' · RadQuizz';
    $('#case-title').textContent = data.title;
    $('#case-stem').textContent = data.stem || '';

    const total = data.series.reduce((n, s) => n + (state.manifests.get(s.id) || []).length, 0);
    const parts = [
      data.exam,
      `${data.series.length} series`,
      `${total} slices`,
    ].filter(Boolean);
    $('#case-meta').textContent = parts.join('  ·  ');

    const tag = $('#answer-tag');
    if (tag) tag.textContent = data.formLabel || data.title;
  }

  /* ---------------- Tabs = the case series ---------------- */

  function renderTabs(data) {
    const nav = $('#tabs');
    if (data.series.length < 2) { nav.hidden = true; return; }
    nav.hidden = false;
    nav.replaceChildren();

    data.series.forEach((serie, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab';
      btn.id = 'tab-' + serie.id;
      btn.dataset.id = serie.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('aria-controls', 'stage');
      btn.tabIndex = -1;
      btn.innerHTML = `<span class="tab-index">${String(i + 1).padStart(2, '0')}</span>` +
        escapeHtml(serie.tab || serie.id);
      btn.addEventListener('click', () => selectSerie(serie.id));
      nav.append(btn);
    });

    nav.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = $$('.tab', nav);
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      selectSerie(next.dataset.id);
    });
  }

  function syncTabs() {
    $$('.tab').forEach((btn) => {
      const on = btn.dataset.id === state.serie?.id;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
  }

  /* ---------------- Image stack ----------------
     The frame never scrolls: one slice is visible at a time, and moving
     through the series swaps the visible image. That is how a CT is read —
     the frame stays put, only the content changes. Laying the slices out in a
     scroll container (what we did before) made touch devices slide one slice
     under the next: a stack of pages, not a CT.
     Input: wheel / trackpad, drag, tap zones, keyboard, scrubber, cine loop.
     ------------------------------------------------- */

  const PRELOAD = 4;      // slices decoded on each side
  const SLICE_STEP = 90;  // wheel pixels per slice (a 3-line notch is 99 px)
  const DRAG_SLICES = 8;  // a full-height drag crosses about this many slices
  const TAP_TOP = 0.4;    // top 40 % of the frame = previous slice

  function renderStage(serie) {
    const stage = $('#stage');
    const files = decimate(state.manifests.get(serie.id) || []);
    const total = files.length;

    const viewer = document.createElement('div');
    viewer.className = 'viewer';

    const stack = document.createElement('div');
    stack.className = 'stack';
    stack.id = 'stack';
    stack.tabIndex = 0;
    stack.setAttribute('role', 'group');
    stack.setAttribute('aria-label', total
      ? `Image stack of ${total} slices. Use the up and down arrows, the wheel, or drag.`
      : 'No images');

    if (!total) {
      stack.innerHTML = `<p class="notice" style="margin:24px;color:#c9d1d9">
        No slices for this series. Add JPGs to
        <code>${escapeHtml(serie.folder)}</code>, then run
        <code>npm run build</code>.</p>`;
    } else {
      // Only the first slices get a src. The others are filled in by preload()
      // as the reader moves: with a 481-slice stack, setting every src at once
      // made the browser fetch the whole series on load (12 MB before the
      // first slice was readable, on a phone).
      files.forEach((file, i) => {
        const img = document.createElement('img');
        img.className = 'slice' + (i === 0 ? ' is-active' : '');
        img.alt = `Slice ${i + 1} of ${total}`;
        img.decoding = 'async';
        img.draggable = false;
        img.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
        if (i === 0) img.fetchPriority = 'high';
        if (i <= PRELOAD) img.src = imageUrl(serie, file);
        stack.append(img);
      });
    }

    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerHTML = `
      <div class="counter"><span class="pos">1</span><span class="of"> / ${total || 0}</span></div>
      <div class="rationale">
        <button class="icon-btn cineloop" type="button" aria-pressed="false" title="Autoplay (cine)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>
        </button>
      </div>`;

    viewer.append(stack);
    if (total > 1) {
      const scrub = document.createElement('div');
      scrub.className = 'scrub';
      scrub.tabIndex = 0;
      scrub.setAttribute('role', 'scrollbar');
      scrub.setAttribute('aria-orientation', 'vertical');
      scrub.setAttribute('aria-controls', 'stack');
      scrub.setAttribute('aria-valuemin', '1');
      scrub.setAttribute('aria-valuemax', String(total));
      scrub.setAttribute('aria-valuenow', '1');
      scrub.setAttribute('aria-label', 'Position in the slice stack');
      scrub.innerHTML = '<div class="scrub-track"><div class="scrub-thumb"></div></div>';
      viewer.append(scrub);
    }
    if (total) viewer.append(hud);

    stage.replaceChildren(viewer);

    // the viewer appears once the first slice is ready: no black rectangle
    if (total) {
      viewer.style.opacity = '0';
      viewer.style.transition = 'opacity 140ms ease';
    }
    clearTimeout(state.prefetchTimer);
    if (total) {
      state.prefetchTimer = setTimeout(() => {
        const key = CASE_ID + ':' + serie.id;
        const center = Math.min(files.length - 1, Math.max(0, state.positions[key] || 0));
        const priority = [];
        for (let d = 0; d < files.length; d++) {
          if (center + d < files.length) priority.push(imageUrl(serie, files[center + d]));
          if (d && center - d >= 0) priority.push(imageUrl(serie, files[center - d]));
        }
        const rest = [];
        for (const other of (state.data?.series || [])) {
          if (other.id === serie.id) continue;
          for (const f of decimate(state.manifests.get(other.id) || [])) rest.push(imageUrl(other, f));
        }
        prefetch.plan(priority, rest);
      }, 350);
    }

    const meta = $('#serie-meta');
    if (meta) {
      const note = serie.note || '';
      meta.textContent = note + (SKIP > 1 ? (note ? ' · ' : '') + `1 slice out of ${SKIP}` : '');
      meta.hidden = !meta.textContent;
    }

    if (total) wireViewer({ viewer, stack, files, total, serie });
  }

  function wireViewer({ viewer, stack, files, total, serie }) {
    const posEl = $('.pos', viewer);
    const countEl = $('.of', viewer);
    const scrub = $('.scrub', viewer);
    const track = scrub ? $('.scrub-track', scrub) : null;
    const thumb = scrub ? $('.scrub-thumb', scrub) : null;

    const key = CASE_ID + ':' + serie.id;
    const maxIndex = total - 1;
    const slices = $$('.slice', stack);
    const decoded = new Set();
    let current = 0;

    // a drag of the whole frame crosses the series in one go, whatever its length
    const dragStep = () => Math.max(30, Math.min(60, (stack.clientHeight || 1) / DRAG_SLICES)) / DRAG_SPEED;

    let lastPreloadAt = 0;

    function preload(center) {
      // During a scrubber drag this is called ~60 times a second, and each
      // call queues nine more images: at 2 MB/s they filled the pipe and the
      // slice under the cursor waited behind all of them.
      const t = (window.performance || Date).now();
      if (t - lastPreloadAt < 150) return;
      lastPreloadAt = t;

      for (let d = -PRELOAD; d <= PRELOAD; d++) {
        const i = center + d;
        if (i < 0 || i > maxIndex) continue;
        const img = slices[i];
        if (!img) continue;
        if (!img.hasAttribute('src')) img.src = imageUrl(serie, files[i]);
        if (img.decode && !decoded.has(i)) {
          decoded.add(i);
          img.decode().catch(() => {});
        }
      }
    }

    function paint() {
      if (posEl) posEl.textContent = String(current + 1);
      if (countEl) countEl.textContent = ' / ' + total;
      if (scrub) {
        scrub.setAttribute('aria-valuenow', String(current + 1));
        scrub.setAttribute('aria-valuetext', `Slice ${current + 1} of ${total}`);
        if (track) track.style.setProperty('--p', String(maxIndex ? current / maxIndex : 0));
      }
      state.positions[key] = current;
      preload(current);
    }

    /* the only thing that changes is which slice is visible: no motion.
       The swap waits for the slice to be decoded: on a slow link the frame
       keeps showing the previous slice instead of going black, which is what
       a console does when it cannot follow. `current` is the position asked
       for (counter, scrubber, saved position); `shown` is what is on screen. */
    let shown = 0;

    function paintSlice(i) {
      if (i === shown) return;
      slices[shown].classList.remove('is-active');
      slices[shown].setAttribute('aria-hidden', 'true');
      shown = i;
      slices[shown].classList.add('is-active');
      slices[shown].setAttribute('aria-hidden', 'false');
    }

    let revealed = false;
    function reveal() {
      if (revealed) return;
      revealed = true;
      viewer.style.opacity = '1';
    }

    /* A scrubber drag fires ~60 times a second, and every call would fetch a
       slice and cancel the previous one: none of them had time to arrive, so
       the image froze on a stale slice until the finger was lifted. Big jumps
       are therefore coalesced to one request every COALESCE ms; stepping by
       one stays immediate. */
    /* A scrubber drag fires ~60 times a second. The counter and the scrubber
       follow it immediately, but asking for a new image every time made each
       request cancel the previous one before it arrived: the frame stayed on a
       stale slice until the finger was lifted. Images are therefore requested
       at most every COALESCE ms on a big jump; one-slice steps stay immediate.
       Requests already issued for the slice we stopped on are never dropped. */
    const COALESCE = 90;       // floor; raised on a slow link (see `latency`)
    let imgTimer = 0;
    let lastImgAt = -COALESCE;
    let pendingImg = -1;
    let lastRequest = -1;
    let latency = COALESCE;    // running estimate of one slice, ms

    const interval = () => Math.min(500, Math.max(COALESCE, latency * 1.3));

    const askedAt = new Map();   // index -> when its request was issued
    let busy = -1;               // slice whose image is on its way
    let busyAt = 0;

    function requestSlice(i) {
      lastRequest = i;
      const now = (window.performance || Date).now();
      // One visible request at a time: issuing a new one on every step
      // cancelled the previous before it arrived, and nothing was ever painted.
      // A big jump (the reader threw the scrubber across the stack) overrides it.
      if (busy >= 0 && now - busyAt < 1200 && Math.abs(i - busy) < 24) return;
      busy = i;
      busyAt = now;
      const asked = now;
      const img = slices[i];
      if (!img.hasAttribute('src')) img.src = imageUrl(serie, files[i]);
      askedAt.set(i, now);

      // Drop the requests that are now out of the window, otherwise the slice
      // we stopped on waits behind every intermediate one. Anything asked less
      // than GRACE ms ago is left alone: on a slow link it needs that time to
      // arrive, and cancelling it on every step is what froze the frame.
      const GRACE = 400;
      for (let k = 0; k < slices.length; k++) {
        if (k === i || k === shown || k === busy || Math.abs(k - i) <= PRELOAD) continue;
        if (now - (askedAt.get(k) || 0) < GRACE) continue;
        const other = slices[k];
        if (other.hasAttribute('src') && !other.complete) other.removeAttribute('src');
      }

      if (img.complete && img.naturalWidth > 0) {
        if (busy === i) busy = -1;
        paintSlice(i);
        reveal();
        return;
      }
      // `load` rather than decode(): decode() resolved ~190 ms later even on a
      // local server, which inflated the coalescing window and left the frame
      // trailing the cursor. The browser paints the slice as soon as it has it.
      const ready = () => {
        if (busy === i) busy = -1;
        const took = (window.performance || Date).now() - asked;
        latency = latency * 0.7 + took * 0.3;     // follow the link
        if (lastRequest === i) { paintSlice(i); reveal(); }
        // the cursor moved on while this one was loading: go after it, so the
        // frame ends on the slice the reader stopped at, even on a slow link
        if (current !== i && current !== lastRequest) requestSlice(current);
      };
      img.addEventListener('load', ready, { once: true });
      img.addEventListener('error', ready, { once: true });
    }

    function show(i) {
      const next = Math.min(maxIndex, Math.max(0, i));
      current = next;
      prefetch.hold(250);
      paint();

      const now = (window.performance || Date).now();
      const gap = interval();
      if (Math.abs(next - shown) > 2 && now - lastImgAt < gap) {
        pendingImg = next;
        if (!imgTimer) {
          imgTimer = setTimeout(() => {
            imgTimer = 0;
            const v = pendingImg;
            pendingImg = -1;
            // no `v === current` test: during a continuous drag the cursor has
            // always moved on by the time the timer fires, and nothing was ever
            // requested — that is what left the frame frozen
            if (v >= 0) {
              lastImgAt = (window.performance || Date).now();
              requestSlice(v);
            }
          }, gap - (now - lastImgAt));
        }
        return;
      }
      lastImgAt = now;
      requestSlice(next);
    }

    /* scrubber thumb height */
    if (track) {
      const sizeThumb = () => {
        const h = Math.max(22, track.clientHeight / total);
        track.style.setProperty('--thumb', h + 'px');
      };
      sizeThumb();
      if ('ResizeObserver' in window) new ResizeObserver(sizeThumb).observe(track);
      else window.addEventListener('resize', sizeThumb, { passive: true });
    }

    /* --- cine loop: advances on its own, stops at the end --- */
    const btn = $('.cineloop', viewer);
    const svg = btn ? $('svg', btn) : null;
    const iconPlay = '<path d="M4 2.5v11l9-5.5z" fill="currentColor"/>';
    const iconPause = '<path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/>';

    function stop() {
      clearInterval(state.cineloop);
      state.cineloop = null;
      if (!btn) return;
      btn.setAttribute('aria-pressed', 'false');
      if (svg) svg.innerHTML = iconPlay;
    }

    if (btn) {
      btn.addEventListener('click', () => {
        if (state.cineloop) { stop(); return; }
        if (current >= maxIndex) show(0);
        btn.setAttribute('aria-pressed', 'true');
        if (svg) svg.innerHTML = iconPause;
        state.cineloop = setInterval(() => {
          if (current >= maxIndex) { stop(); return; }
          show(current + 1);
        }, 240);
      });
    }

    /* --- wheel / trackpad: one slice per notch, no animation --- */
    let acc = 0;
    let accTimer = 0;
    const resetAcc = () => {
      clearTimeout(accTimer);
      accTimer = setTimeout(() => { acc = 0; }, 220);
    };

    viewer.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) return;           // keep pinch-zoom
      const dy = e.deltaMode === 1 ? e.deltaY * 33
        : e.deltaMode === 2 ? e.deltaY * (stack.clientHeight || 1)
        : e.deltaY;

      // at either end, let the page scroll (to reach the form)
      if ((current <= 0 && dy < 0) || (current >= maxIndex && dy > 0)) return;

      e.preventDefault();
      stop();
      if (dy * acc < 0) acc = 0;                    // direction change
      acc += dy;
      const step = SLICE_STEP / WHEEL_SPEED;
      const steps = Math.trunc(acc / step);
      if (steps) {
        acc -= steps * step;
        show(current + steps);
      }
      resetAcc();
    }, { passive: false });

    /* --- keyboard --- */
    stack.addEventListener('keydown', (e) => {
      const dirs = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 };
      if (e.key in dirs) { e.preventDefault(); stop(); show(current + dirs[e.key]); return; }
      if (e.key === 'Home') { e.preventDefault(); stop(); show(0); }
      if (e.key === 'End') { e.preventDefault(); stop(); show(maxIndex); }
    });

    /* --- scrubber: click, drag, keyboard --- */
    if (scrub && track && thumb) {
      let dragging = false;

      const ratioAt = (clientY) => {
        const r = track.getBoundingClientRect();
        const th = thumb.offsetHeight;
        const span = Math.max(1, r.height - th);
        return Math.min(1, Math.max(0, (clientY - r.top - th / 2) / span));
      };
      const seek = (clientY) => {
        stop();
        show(Math.round(ratioAt(clientY) * maxIndex));
      };

      scrub.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        dragging = true;
        scrub.classList.add('is-dragging');
        scrub.focus({ preventScroll: true });
        try { scrub.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        seek(e.clientY);
      });
      scrub.addEventListener('pointermove', (e) => { if (dragging) seek(e.clientY); });
      const endDrag = () => {
        dragging = false;
        scrub.classList.remove('is-dragging');
      };
      scrub.addEventListener('pointerup', endDrag);
      scrub.addEventListener('pointercancel', endDrag);

      scrub.addEventListener('keydown', (e) => {
        const dirs = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
        if (e.key in dirs) { e.preventDefault(); stop(); show(current + dirs[e.key]); return; }
        if (e.key === 'Home') { e.preventDefault(); stop(); show(0); }
        if (e.key === 'End') { e.preventDefault(); stop(); show(maxIndex); }
      });
    }

    /* --- drag and tap: the touch model ---
       The frame swallows the gesture (touch-action: none), so a finger on the
       image never scrolls the page by accident: it moves through the slices.
       A tap on the bottom goes forward, a tap on the top goes back. */
    let drag = null;

    stack.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, y: e.clientY, x: e.clientX, from: current, steps: 0, moved: false };
      stack.classList.add('is-dragging');
      try { stack.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });

    stack.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(e.clientY - drag.y) < 4 && Math.abs(e.clientX - drag.x) < 4) return;
        drag.moved = true;
        stop();
      }
      const steps = Math.trunc((drag.y - e.clientY) / dragStep());
      if (steps === drag.steps) return;
      drag.steps = steps;
      show(drag.from + steps);
    });

    const endPointer = (e) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      stack.classList.remove('is-dragging');
      if (moved || !e || e.type !== 'pointerup') return;
      if (e.pointerType === 'mouse') return;        // desktop has the wheel
      const r = stack.getBoundingClientRect();
      const y = (e.clientY || 0) - r.top;
      stop();
      show(current + (y < r.height * TAP_TOP ? -1 : 1));
    };

    stack.addEventListener('pointerup', endPointer);
    stack.addEventListener('pointercancel', endPointer);

    /* every load starts on the first slice */
    show(0);
  }

  /* ---------------- Switching series ---------------- */

  async function selectSerie(id, { push = true } = {}) {
    const data = state.data;
    const serie = data.series.find((s) => s.id === id) || data.series[0];
    if (!serie) return;

    if (state.cineloop) { clearInterval(state.cineloop); state.cineloop = null; }

    state.serie = serie;
    if (push) history.pushState(null, '', '#/' + serie.id);

    syncTabs();
    await loadManifest(serie);
    renderStage(serie);
  }

  function idFromHash() {
    const m = /^#\/(.+)$/.exec(location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ---------------- Locked case ---------------- */

  function renderLocked(data) {
    document.title = 'A wrapped window · RadQuizz';
    $('#case-kicker').textContent = 'Window closed';
    $('#case-title').textContent = 'A wrapped window';
    $('#case-stem').textContent = '';
    $('#case-meta').textContent = '';

    if ($('#tabs')) $('#tabs').hidden = true;
    for (const sel of ['.hint', '#cta', '#answer', '#serie-meta']) {
      const el = $(sel);
      if (el) el.remove();
    }

    $('#stage').innerHTML = `
      <div class="locked-window">
        <svg class="locked-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none"
             stroke="currentColor" stroke-width="1.4">
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.6"/>
          <path d="M5.5 7V5.4a2.5 2.5 0 0 1 5 0V7"/>
        </svg>
        <p class="locked-message">This window is still wrapped.</p>
        <p class="locked-date">Opens ${escapeHtml(data.opensOn || 'later in December')}</p>
        <a class="locked-back" href="${BASE}">Back to the calendar</a>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /* ---------------- Hint ----------------
     The gesture differs between a mouse and a finger; say the right one. */
  function setHint() {
    const el = $('#hint-text');
    if (!el) return;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    el.textContent = coarse
      ? 'Drag up or down to go through the slices'
      : 'Mouse wheel, drag or ↑ ↓ arrows to go through the slices';
  }

  /* ---------------- Boot ---------------- */

  async function boot() {
    initTheme();
    setHint();

    if (location.protocol === 'file:') {
      $('#stage').innerHTML = `<div class="notice"><strong>Opened from file://</strong><br>
        Browsers block JSON files from a local file.
        Run <code>npm start</code> or <code>python3 -m http.server 8000</code>, then open
        <code>http://localhost:8000</code>.</div>`;
      return;
    }

    if (!CASE_ID) {
      $('#stage').innerHTML = `<div class="notice"><strong>Page generated without a case id.</strong><br>
        This page must be created by <code>npm run build</code>.</div>`;
      return;
    }

    try {
      const [data, formCfg] = await Promise.all([
        getJSON(`content/cases/${CASE_ID}.json`),
        getJSON('content/form.json').catch(() => ({})),
      ]);

      state.data = data;
      state.form = { ...state.form, ...(formCfg || {}) };

      if (VERSION) $('#version').textContent = 'v' + VERSION;

      // A case can stay wrapped: the page still exists, but shows the closed window.
      if (data.open === false && !PREVIEW) { renderLocked(data); return; }
      if (PREVIEW) {
        const brand = $('.brand');
        if (brand) brand.href = BASE + '?catherine-mode=1';
      }

      if (!Array.isArray(data.series) || !data.series.length) {
        throw new Error('This case declares no series.');
      }

      await Promise.all(data.series.map((s) => loadManifest(s)));

      renderHead(data);
      renderTabs(data);
      renderForm(data);

      const cta = $('#cta');
      if (cta) cta.addEventListener('click', (e) => {
        e.preventDefault();
        $('#answer').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      await selectSerie(idFromHash() || data.series[0].id, { push: false });

      window.addEventListener('popstate', () => {
        const id = idFromHash();
        if (id && id !== state.serie?.id) selectSerie(id, { push: false });
      });

    } catch (err) {
      console.error(err);
      $('#stage').innerHTML = `<div class="notice"><strong>Could not load this case.</strong><br>
        ${escapeHtml(err.message)}<br>
        Check <code>content/cases/${escapeHtml(CASE_ID)}.json</code> and run
        <code>npm run build</code>.</div>`;
    }
  }

  boot();
})();
