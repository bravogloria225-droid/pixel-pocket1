/* Pixel Pocket - main app */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ---------- safe localStorage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  window.PP_STORE = store;

  function toast(msg, ms = 2200) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), ms);
  }

  // ---------- navigation ----------
  function go(name) {
    if (!$('#view-' + name)) name = 'home';
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    window.scrollTo(0, 0);
  }
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $$('[data-href]').forEach((b) => b.addEventListener('click', () => (location.href = b.dataset.href)));
  go(location.hash.slice(1) || 'home');

  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone) $('#install-hint').hidden = true;

  // ---------- systems ----------
  const SYSTEMS = {
    gb:     { label: 'GB/GBC',  core: 'gb',     color: '#a7f070' },
    gba:    { label: 'GBA',     core: 'gba',    color: '#b05ef0' },
    nes:    { label: 'NES',     core: 'nes',    color: '#ef7d57' },
    snes:   { label: 'SNES',    core: 'snes',   color: '#94b0c2' },
    segaMD: { label: 'GENESIS', core: 'segaMD', color: '#41a6f6' },
    psx:    { label: 'PS1',     core: 'psx',    color: '#ffcd75' },
  };
  const EXT = {
    gb: 'gb', gbc: 'gb', sgb: 'gb',
    gba: 'gba',
    nes: 'nes', fds: 'nes', unf: 'nes',
    sfc: 'snes', smc: 'snes', fig: 'snes',
    md: 'segaMD', gen: 'segaMD', smd: 'segaMD',
    chd: 'psx', pbp: 'psx', iso: 'psx', img: 'psx', cue: 'psx',
  };
  function guessSystem(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (EXT[ext]) return EXT[ext];
    if (ext === 'bin') return file.size > 8 * 1024 * 1024 ? 'psx' : 'segaMD';
    return null; // zip, 7z, unknown -> ask
  }

  // ---------- IndexedDB ----------
  const DB_NAME = 'pixelpocket', STORE = 'games';
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tx(mode, fn) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Storage full?'));
    });
  }
  // list metadata only (keeps the blob out of memory)
  async function listGames() {
    const db = await openDB();
    return new Promise((res, rej) => {
      const out = [];
      const req = db.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return res(out.sort((a, b) => (b.lastPlayed || b.added) - (a.lastPlayed || a.added)));
        const { data, ...meta } = c.value; out.push(meta); c.continue();
      };
      req.onerror = () => rej(req.error);
    });
  }

  // ---------- library UI ----------
  let filter = 'all';
  function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB'; }
  function prettyName(fn) { return fn.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s*[\(\[].*?[\)\]]/g, '').trim() || fn; }

  async function renderLibrary() {
    const games = await listGames().catch(() => []);
    const lib = $('#library');
    const chips = $('#filter-chips');
    const present = ['all', ...Object.keys(SYSTEMS).filter((s) => games.some((g) => g.system === s))];
    if (!present.includes(filter)) filter = 'all';
    chips.innerHTML = present.length > 2 ? present.map((s) =>
      `<button data-f="${s}" class="${s === filter ? 'on' : ''}">${s === 'all' ? 'ALL' : SYSTEMS[s].label}</button>`).join('') : '';
    chips.querySelectorAll('button').forEach((b) => b.onclick = () => { filter = b.dataset.f; renderLibrary(); });

    const shown = games.filter((g) => filter === 'all' || g.system === filter);
    if (!shown.length) {
      lib.innerHTML = `<div class="empty">NO GAMES YET<br><br>TAP "+ ADD GAME FILE"</div>`;
    } else {
      lib.innerHTML = '';
      for (const g of shown) {
        const s = SYSTEMS[g.system];
        const el = document.createElement('div');
        el.className = 'game';
        el.style.setProperty('--c', s.color);
        el.innerHTML = `<div class="badge">${s.label}</div>
          <div class="meta"><div class="name"></div><div class="sub">${fmtSize(g.size)}</div></div>
          <button class="btn green" data-play>PLAY</button>
          <button class="btn ghost" data-del aria-label="Delete">X</button>`;
        el.querySelector('.name').textContent = g.title;
        el.querySelector('[data-play]').onclick = () => play(g.id);
        el.querySelector('[data-del]').onclick = async () => {
          if (!confirm(`Delete "${g.title}" from Pixel Pocket?`)) return;
          await tx('readwrite', (s) => s.delete(g.id));
          renderLibrary();
        };
        lib.appendChild(el);
      }
    }
    const last = games.find((g) => g.lastPlayed);
    const cont = $('#home-continue');
    cont.onclick = () => last ? play(last.id) : go('arcade');
    cont.lastChild.textContent = last ? 'CONTINUE' : 'QUICK PLAY';

    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      $('#storage-info').textContent = `STORAGE: ${fmtSize(e.usage || 0)} USED` + (e.quota ? ` / ${fmtSize(e.quota)}` : '');
    }
  }

  function play(id) { location.href = 'play.html?id=' + encodeURIComponent(id); }

  function askSystem(file) {
    return new Promise((resolve) => {
      $('#sys-file').textContent = file.name;
      const box = $('#sys-buttons');
      box.innerHTML = '';
      for (const [k, s] of Object.entries(SYSTEMS)) {
        const b = document.createElement('button');
        b.className = 'btn'; b.textContent = s.label; b.style.background = s.color; b.style.color = '#1a1c2c';
        b.onclick = () => { $('#sys-modal').hidden = true; resolve(k); };
        box.appendChild(b);
      }
      $('#sys-cancel').onclick = () => { $('#sys-modal').hidden = true; resolve(null); };
      $('#sys-modal').hidden = false;
    });
  }

  $('#rom-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    let added = 0;
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'cue') { toast('.CUE FILES NEED THEIR .BIN. USE .CHD OR .PBP INSTEAD', 3500); continue; }
      const system = guessSystem(file) || await askSystem(file);
      if (!system) continue;
      toast('SAVING ' + file.name.slice(0, 24) + '...', 10000);
      try {
        const rec = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: prettyName(file.name),
          fileName: file.name,
          system, size: file.size, added: Date.now(), lastPlayed: 0,
          data: file.slice(0, file.size, file.type || 'application/octet-stream'),
        };
        await tx('readwrite', (s) => s.put(rec));
        added++;
      } catch (err) {
        toast('COULD NOT SAVE: ' + (err && err.message || 'storage full'), 4000);
      }
    }
    if (added) toast(added + ' GAME' + (added > 1 ? 'S' : '') + ' ADDED!');
    renderLibrary();
  });

  renderLibrary();

  // ---------- links ----------
  const ANIME = [
    ['CRUNCHYROLL', 'https://www.crunchyroll.com/'],
    ['TUBI ANIME', 'https://tubitv.com/category/anime'],
    ['PLUTO TV', 'https://pluto.tv/'],
    ['RETROCRUSH', 'https://www.retrocrush.tv/'],
  ];
  const HOMEBREW = [
    ['GB HOMEBREW HUB', 'https://hh.gbdev.io/'],
    ['ITCH: GAME BOY', 'https://itch.io/games/free/tag-game-boy'],
    ['ITCH: NES', 'https://itch.io/games/free/tag-nes'],
    ['ITCH: GENESIS', 'https://itch.io/games/free/tag-sega-genesis'],
  ];
  function linkBtn(name, url) {
    const a = document.createElement('a');
    a.className = 'btn'; a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = name;
    return a;
  }
  ANIME.forEach(([n, u]) => $('#links-anime').appendChild(linkBtn(n, u)));
  HOMEBREW.forEach(([n, u]) => $('#links-homebrew').appendChild(linkBtn(n, u)));

  function renderMine() {
    const box = $('#links-mine');
    const mine = store.get('pp_links', []);
    box.innerHTML = mine.length ? '' : '<p class="tiny">Save your favorite sites here.</p>';
    mine.forEach((l, i) => {
      const a = linkBtn(l.name, l.url);
      a.classList.add('mine');
      const x = document.createElement('i'); x.textContent = 'x';
      x.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); mine.splice(i, 1); store.set('pp_links', mine); renderMine(); };
      a.appendChild(x);
      box.appendChild(a);
    });
  }
  $('#link-form').addEventListener('submit', (e) => {
    e.preventDefault();
    let url = $('#link-url').value.trim();
    const name = $('#link-name').value.trim().toUpperCase();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { return toast('THAT LINK LOOKS WRONG'); }
    const mine = store.get('pp_links', []);
    mine.push({ name: name || new URL(url).hostname.replace(/^www\./, '').toUpperCase(), url });
    store.set('pp_links', mine);
    $('#link-url').value = ''; $('#link-name').value = '';
    renderMine();
  });
  renderMine();

  // ---------- arcade ----------
  const games = window.ARCADE || [];
  const list = $('#arcade-list');
  games.forEach((g) => {
    const el = document.createElement('div');
    el.className = 'game';
    el.style.setProperty('--c', g.color);
    el.innerHTML = `<div class="badge">${g.tag}</div>
      <div class="meta"><div class="name">${g.name}</div><div class="sub">${g.desc}<br>HI: <span data-hi>${store.get('hi_' + g.id, 0)}</span></div></div>
      <button class="btn green">PLAY</button>`;
    el.querySelector('button').onclick = () => startArcade(g);
    list.appendChild(el);
  });

  const screen = $('#arcade-screen');
  const canvas = $('#arcade-canvas');
  const ctx = canvas.getContext('2d');
  let current = null, raf = 0, lastT = 0;
  const held = {};

  function startArcade(g) {
    screen.hidden = false;
    $('#arcade-title').textContent = g.name;
    $('#arcade-score').textContent = '0';
    const api = {
      held,
      W: canvas.width, H: canvas.height,
      score(n) { $('#arcade-score').textContent = n; },
      hi(n) {
        const k = 'hi_' + g.id, old = store.get(k, 0);
        if (n != null && n > old) { store.set(k, n); return n; }
        return old;
      },
    };
    current = g.create(ctx, api);
    lastT = performance.now();
    cancelAnimationFrame(raf);
    const loop = (t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
      current.tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function stopArcade() {
    cancelAnimationFrame(raf); current = null; screen.hidden = true;
    $$('[data-hi]').forEach((s, i) => s.textContent = store.get('hi_' + games[i].id, 0));
  }
  $('#arcade-exit').onclick = stopArcade;

  function press(k) { held[k] = true; current && current.press && current.press(k); }
  function release(k) { held[k] = false; }
  $$('.pad [data-k]').forEach((b) => {
    const k = b.dataset.k;
    const down = (e) => { e.preventDefault(); b.classList.add('down'); press(k); if (navigator.vibrate) navigator.vibrate(8); };
    const up = (e) => { e.preventDefault(); b.classList.remove('down'); release(k); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  });
  // swipe on the screen
  let sx = 0, sy = 0;
  canvas.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return press('a'), release('a');
    const k = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    press(k); release(k);
  });
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'a', z: 'a', Enter: 'a' };
  addEventListener('keydown', (e) => { if (!current || !KEYS[e.key]) return; e.preventDefault(); if (!e.repeat) press(KEYS[e.key]); });
  addEventListener('keyup', (e) => { if (KEYS[e.key]) release(KEYS[e.key]); });
  // stop iOS double-tap zoom in arcade
  screen.addEventListener('dblclick', (e) => e.preventDefault());

  // ---------- offline ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
