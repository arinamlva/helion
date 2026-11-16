/* HELION site logic. Plain JavaScript, no dependencies. */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  var smoothstep = function (p, e0, e1) { var t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  var easeIO = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  function rng(seed) { var s = seed >>> 0; return function () { return (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }; }
  var DEG = Math.PI / 180;

  /* Motion mode: five gates plus the manual switch */
  var GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  var MQLS = GATES.map(function (q) { return matchMedia(q); });
  var RM = MQLS[4];
  var manualOff = function () { return root.classList.contains('motion-off'); };
  var heroStatic = function () { return manualOff() || MQLS.some(function (m) { return m.matches; }); };
  var noMotion = function () { return manualOff() || RM.matches; };
  var modeFns = [];
  function fireMode() { modeFns.forEach(function (f) { f(); }); }
  MQLS.forEach(function (m) { m.addEventListener('change', fireMode); });

  var motionBtn = $('#motion-btn');
  function syncMotionBtn() { motionBtn.setAttribute('aria-pressed', manualOff() ? 'false' : 'true'); }
  motionBtn.addEventListener('click', function () {
    root.classList.toggle('motion-off');
    try { localStorage.setItem('helion-motion', manualOff() ? 'off' : 'on'); } catch (e) {}
    syncMotionBtn();
    fireMode();
  });
  syncMotionBtn();

  /* Loader */
  var bootDone = !root.classList.contains('booting');
  var bootFns = [];
  function finishBoot() {
    if (bootDone) return;
    bootDone = true;
    var el = $('#loader');
    el.classList.add('out');
    try { sessionStorage.setItem('helion-boot', '1'); } catch (e) {}
    setTimeout(function () { root.classList.remove('booting'); }, 700);
    bootFns.forEach(function (f) { f(); });
  }
  (function () {
    if (bootDone) return;
    var lines = $$('.loader-line'), bar = $('.loader-bar i');
    [150, 950, 1800].forEach(function (t, i) {
      setTimeout(function () { if (bootDone) return; lines[i].classList.add('on'); bar.style.setProperty('--p', (i + 1) / 3); }, t);
    });
    setTimeout(finishBoot, 2700);
    $('#loader-skip').addEventListener('click', finishBoot);
    addEventListener('keydown', function (e) { if (e.key === 'Escape') finishBoot(); });
  })();

  /* Hero scrub */
  var hero = $('#top'), stage = $('#stage'), video = $('#hero-video'), posterLayer = $('#poster'), ring = $('#ring');
  var VIDEO_URL = 'assets/hero-scrub.mp4';
  var VIDEO_BYTES = 11125928; // real byte size of the encoded file, the fallback when Content-Length is missing
  var POSTER_URL = 'assets/hero-poster.jpg';
  var altMark = $('#alt-mark'), altVal = $('#alt-val'), cue = $('#cue'), nav = $('#nav');

  // split headlines once, with seeded offsets
  $$('.band').forEach(function (band, bi) {
    var el = $('[data-split]', band);
    if (!el) return;
    var mode = el.dataset.split, fx = band.dataset.fx, rand = rng(1337 + bi * 97);
    var text = el.textContent.trim(), words = text.split(/\s+/);
    var total = mode === 'c' ? text.replace(/\s+/g, '').length : words.length;
    var spread = parseFloat(band.dataset.spread) || 0.5;
    el.textContent = '';
    var sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = text; el.appendChild(sr);
    var vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true'); el.appendChild(vis);
    var ci = 0;
    words.forEach(function (word, wi) {
      var w = document.createElement('span'); w.className = 'w';
      if (mode === 'w') {
        w.textContent = word;
        w.style.setProperty('--th', (wi / total * 0.5).toFixed(3));
      } else {
        word.split('').forEach(function (ch) {
          var c = document.createElement('span'); c.className = 'c'; c.textContent = ch;
          if (fx === 'grid') {
            c.style.setProperty('--th', (ci / total * spread + rand() * 0.06).toFixed(3));
            c.style.setProperty('--jx', Math.round(26 + rand() * 30) + 'px');
          } else {
            c.style.setProperty('--th', (rand() * 0.55).toFixed(3));
            c.style.setProperty('--jx', Math.round((rand() - 0.5) * 90) + 'px');
            c.style.setProperty('--jy', Math.round((rand() - 0.5) * 70) + 'px');
            c.style.setProperty('--jr', Math.round((rand() - 0.5) * 50) + 'deg');
          }
          ci++; w.appendChild(c);
        });
      }
      vis.appendChild(w);
      if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
    });
  });

  var bands = $$('.band').map(function (el) {
    return { el: el, a: +el.dataset.a, b: +el.dataset.b, ramp: +el.dataset.ramp || 0, op: -1, k: -1, live: null };
  });
  var heroTop = 0, heroRange = 1;
  function measureHero() { heroTop = hero.offsetTop; heroRange = Math.max(1, hero.offsetHeight - innerHeight); }
  function heroProgress() { return clamp((scrollY - heroTop) / heroRange, 0, 1); }

  var loadK = 0, loadStart = 0;
  var lastAp = -1, lastAlt = '', lastAltAt = 0, cueGone = null;
  function fmtAlt(p) {
    var m = 100000 * Math.pow(1 - p, 2.6);
    if (m >= 1000) return (m / 1000).toFixed(1).replace('.', ',') + ' км';
    return Math.round(m) + ' м';
  }
  function updateCaptions(p, now) {
    for (var i = 0; i < bands.length; i++) {
      var bd = bands[i], a = bd.a, b = bd.b;
      var f = Math.min(0.02, (b - a) / 3);
      var inn = i === 0 ? 1 : smoothstep(p, a, a + f);
      var out = i === bands.length - 1 ? 1 : 1 - smoothstep(p, b - f, b);
      var op = (p < a && i !== 0) || (p > b && i !== bands.length - 1) ? 0 : inn * out;
      var k = clamp((p - a) / (bd.ramp || Math.min(0.025, (b - a) * 0.35)), 0, 1);
      if (i === 0) k = Math.max(k, loadK);
      var live = op > 0.001;
      if (live !== bd.live) { bd.live = live; bd.el.classList.toggle('live', live); }
      if (Math.abs(op - bd.op) > 0.004 || (op === 0 || op === 1) && op !== bd.op) { bd.op = op; bd.el.style.opacity = op.toFixed(3); }
      if (Math.abs(k - bd.k) > 0.008 || (k === 0 || k === 1) && k !== bd.k) { bd.k = k; bd.el.style.setProperty('--k', k.toFixed(3)); }
    }
    if (Math.abs(p - lastAp) > 0.0015 || (p === 0 || p === 1) && p !== lastAp) { lastAp = p; altMark.style.setProperty('--ap', p.toFixed(4)); }
    now = now || performance.now();
    if (now - lastAltAt > 100 || p === 0 || p === 1) {
      var txt = fmtAlt(p);
      if (txt !== lastAlt) { lastAlt = txt; lastAltAt = now; altVal.textContent = txt; }
    }
    var gone = p > 0.015;
    if (gone !== cueGone) { cueGone = gone; cue.classList.toggle('gone', gone); }
  }

  var seekBusy = false, pendingTime = null;
  function requestSeek(t) {
    if (!video.duration) return;
    t = Math.min(t, video.duration - 0.04);
    if (seekBusy) { pendingTime = t; return; }
    if (Math.abs(video.currentTime - t) < 0.008) return;
    seekBusy = true;
    video.currentTime = t;
  }
  video.addEventListener('seeked', function () {
    seekBusy = false;
    if (pendingTime !== null) { var t = pendingTime; pendingTime = null; requestSeek(t); }
  });
  video.addEventListener('error', function () {
    seekBusy = false; pendingTime = null;
    if (video.getAttribute('src')) failVideo();
  });

  var target = 0, shown = 0, rafId = null, lastTick = 0, heroOnScreen = true, scrubOn = false;
  function tick(now) {
    var dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    var k = 0.16;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    var loading = false;
    if (loadStart && loadK < 1) {
      loadK = easeIO(clamp((now - loadStart) / 1500, 0, 1));
      loading = loadK < 1;
    }
    if (Math.abs(target - shown) < 0.0005) shown = target;
    if (shown === target && !loading) { rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
    requestSeek(shown * (video.duration || 0));
    updateCaptions(shown, now);
  }
  function kick() { if (rafId === null && scrubOn) rafId = requestAnimationFrame(tick); }
  function onScroll() {
    target = heroProgress();
    if (heroOnScreen) kick();
  }
  new IntersectionObserver(function (es) {
    heroOnScreen = es[0].isIntersecting;
    if (heroOnScreen && scrubOn) onScroll();
  }).observe(hero);

  var heroInited = false, fetchStarted = false;
  function failVideo() {
    stage.classList.add('video-failed');
  }
  function loadHeroBlob() {
    var ctrl = new AbortController();
    var watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('video ' + res.status);
      var total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
      var reader = res.body.getReader(), chunks = [], got = 0, lastRing = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          clearTimeout(watchdog);
          watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
          chunks.push(r.value); got += r.value.length;
          var frac = Math.min(1, got / total), now = performance.now();
          if (now - lastRing > 100 || frac === 1) { lastRing = now; ring.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
          return pump();
        });
      }
      return pump().then(function () {
        clearTimeout(watchdog);
        ring.style.setProperty('--ld', 0);
        video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
        video.load();
        video.addEventListener('canplay', function () {
          requestSeek(heroProgress() * video.duration);
          stage.classList.add('video-ready');
        }, { once: true });
      });
    });
  }
  function startBlobFetch() {
    if (fetchStarted) return;
    fetchStarted = true;
    loadHeroBlob().catch(failVideo);
  }
  function initHeroOnce() {
    if (heroInited) return;
    heroInited = true;
    posterLayer.style.backgroundImage = "url('" + POSTER_URL + "')";
    var img = new Image();
    img.onload = startBlobFetch; img.onerror = startBlobFetch; img.src = POSTER_URL;
    setTimeout(startBlobFetch, 4000);
  }
  function startLoadRamp() {
    if (loadStart) return;
    if (!scrubOn) { loadK = 1; return; }
    loadStart = performance.now(); kick();
  }
  function enableScrub() {
    if (scrubOn) return; scrubOn = true;
    initHeroOnce();
    measureHero();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(function (b) { b.op = -1; b.k = -1; });
    lastAp = -1;
    unpinFinalStates();
    target = shown = heroProgress();
    updateCaptions(shown);
    if (bootDone) startLoadRamp();
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return; scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
  }
  function applyHeroMode() {
    if (heroStatic()) disableScrub(); else enableScrub();
    if (noMotion()) pinToFinalStates(); else unpinFinalStates();
    syncNav();
  }
  bootFns.push(startLoadRamp);
  addEventListener('resize', function () { measureHero(); if (scrubOn) onScroll(); syncNav(); });

  /* Pins for motion-off */
  var pinFns = [], unpinFns = [], pinned = false;
  function pinToFinalStates() { pinned = true; pinFns.forEach(function (f) { f(); }); }
  function unpinFinalStates() { if (!pinned) return; pinned = false; unpinFns.forEach(function (f) { f(); }); }

  /* Nav */
  var navSolid = null;
  function syncNav() {
    var limit = scrubOn ? heroTop + heroRange - 40 : 40;
    var solid = scrollY > limit;
    if (solid !== navSolid) { navSolid = solid; nav.classList.toggle('solid', solid); }
  }
  addEventListener('scroll', syncNav, { passive: true });
  var menuBtn = $('#menu-btn'), navLinks = $$('#nav-links a');
  function setMenu(open) { nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
  navLinks.forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  var secIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var id = e.target.id;
      navLinks.forEach(function (a) { a.classList.toggle('cur', a.getAttribute('href') === '#' + id); });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['mission', 'helium3', 'technology', 'base', 'atlas', 'investors', 'news', 'contact', 'principles', 'top'].forEach(function (id) {
    var el = document.getElementById(id); if (el) secIO.observe(el);
  });

  /* Reveals, living sections, hidden tabs */
  var revIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      el.classList.add('in');
      setTimeout(function () { el.classList.add('settled'); }, 1700);
      revIO.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach(function (el) { revIO.observe(el); });
  var liveIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.target.classList.toggle('live', e.isIntersecting); });
  }, { rootMargin: '10% 0px' });
  $$('main > section, .road').forEach(function (el) { liveIO.observe(el); });
  document.addEventListener('visibilitychange', function () { document.body.classList.toggle('paused', document.hidden); });

  /* Counters */
  (function () {
    var els = $$('[data-count]'), done = false, raf = null;
    function setFinal() { els.forEach(function (el) { el.textContent = (el.dataset.pre || '') + el.dataset.count; }); }
    function run() {
      if (done) return; done = true;
      if (noMotion()) { setFinal(); return; }
      var t0 = performance.now(), last = [];
      (function step(now) {
        var t = easeIO(clamp((now - t0) / 1400, 0, 1));
        els.forEach(function (el, i) {
          var n = +el.dataset.count, from = el.dataset.plain ? n - 8 : 0;
          var s = (el.dataset.pre || '') + Math.round(from + (n - from) * t);
          if (s !== last[i]) { last[i] = s; el.textContent = s; }
        });
        raf = t < 1 ? requestAnimationFrame(step) : null;
      })(t0);
    }
    var st = $('.stats');
    new IntersectionObserver(function (es, io) { if (es[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.4 }).observe(st);
    pinFns.push(function () { if (raf) cancelAnimationFrame(raf); raf = null; setFinal(); });
  })();

  /* Atom: accordion and hover notes */
  (function () {
    var tabs = $$('.tab');
    tabs.forEach(function (tab) {
      $('.tab-head', tab).addEventListener('click', function () {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('open', on);
          $('.tab-head', t).setAttribute('aria-expanded', on ? 'true' : 'false');
        });
      });
    });
    var wrap = $('#atom-wrap'), tip = $('#atom-tip'), atom = $('#atom');
    function show(el, x, y) {
      tip.textContent = el.dataset.tip;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
      tip.classList.add('on');
    }
    $$('.hit', atom).forEach(function (el) {
      el.addEventListener('pointermove', function (e) { var r = wrap.getBoundingClientRect(); show(el, e.clientX - r.left, e.clientY - r.top); });
      el.addEventListener('pointerleave', function () { tip.classList.remove('on'); });
      el.addEventListener('focus', function () {
        var r = wrap.getBoundingClientRect(), b = el.getBoundingClientRect();
        show(el, b.left + b.width / 2 - r.left, b.top - r.top);
      });
      el.addEventListener('blur', function () { tip.classList.remove('on'); });
    });
    pinFns.push(function () { if (atom.pauseAnimations) atom.pauseAnimations(); });
    unpinFns.push(function () { if (atom.unpauseAnimations) atom.unpauseAnimations(); });
  })();

  /* Hold to heat the regolith */
  (function () {
    var sec = $('#heat'), btn = $('#hold-btn'), temp = $('#hold-temp'), label = $('#hold-label'), state = $('#hold-state');
    var h = 0, holding = false, done = false, raf = null, last = 0, lastH = -1, lastTxt = '', lastTxtAt = 0;
    var vid = $('#hold-video'), vidReady = false, vBusy = false, vPending = null;
    function vSeek(t) {
      if (!vidReady) return;
      if (vBusy) { vPending = t; return; }
      if (Math.abs(vid.currentTime - t) < 0.01) return;
      vBusy = true; vid.currentTime = t;
    }
    vid.addEventListener('seeked', function () { vBusy = false; if (vPending !== null) { var t = vPending; vPending = null; vSeek(t); } });
    vid.addEventListener('error', function () { vBusy = false; vPending = null; vidReady = false; btn.classList.remove('vid'); });
    whenNear(sec, function () {
      if (noMotion()) return;
      fetch('assets/rock-heat.mp4').then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (bl) {
        vid.src = URL.createObjectURL(bl); vid.load();
        vid.addEventListener('canplay', function () { vidReady = true; btn.classList.add('vid'); vSeek(h * (vid.duration - 0.05)); }, { once: true });
      }).catch(function () {});
    });
    /* Звук нагрева: всё синтезируется в браузере, без файлов */
    var heatAudio = (function () {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      var ac = null, ready = false, master, lp, oscA, oscB, shim, shimG, noiseG, bp, sleepT = null;
      function build() {
        ac = new AC();
        master = ac.createGain(); master.gain.value = 0;
        var comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
        lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.7; lp.connect(master);
        oscA = ac.createOscillator(); oscA.type = 'triangle'; oscA.frequency.value = 62;
        oscB = ac.createOscillator(); oscB.type = 'sine'; oscB.frequency.value = 62.7;
        var gA = ac.createGain(); gA.gain.value = 0.5; oscA.connect(gA); gA.connect(lp);
        var gB = ac.createGain(); gB.gain.value = 0.5; oscB.connect(gB); gB.connect(lp);
        shim = ac.createOscillator(); shim.type = 'sine'; shim.frequency.value = 330;
        shimG = ac.createGain(); shimG.gain.value = 0; shim.connect(shimG); shimG.connect(master);
        var len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), r = rng(31);
        for (var i = 0; i < len; i++) d[i] = (r() * 2 - 1) * (r() < 0.015 ? 1 : 0.22);
        var n = ac.createBufferSource(); n.buffer = buf; n.loop = true;
        bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
        noiseG = ac.createGain(); noiseG.gain.value = 0;
        n.connect(bp); bp.connect(noiseG); noiseG.connect(master);
        oscA.start(); oscB.start(); shim.start(); n.start();
        ready = true;
      }
      function sleepSoon(ms) {
        clearTimeout(sleepT);
        sleepT = setTimeout(function () { if (ac && ac.state === 'running') ac.suspend(); }, ms);
      }
      return {
        start: function () {
          clearTimeout(sleepT);
          try { if (!ac) build(); if (ac.state === 'suspended') ac.resume(); } catch (e) {}
        },
        set: function (h, on) {
          if (!ready) return;
          var t = ac.currentTime, k = 0.08;
          var vol = on ? 0.05 + 0.09 * h : 0.11 * h;
          master.gain.setTargetAtTime(vol, t, on ? 0.08 : 0.15);
          oscA.frequency.setTargetAtTime(62 + 70 * h, t, k);
          oscB.frequency.setTargetAtTime(62.7 + 71 * h, t, k);
          lp.frequency.setTargetAtTime(260 + 900 * h, t, k);
          shim.frequency.setTargetAtTime(330 + 330 * h, t, k);
          shimG.gain.setTargetAtTime(0.18 * h * h, t, k);
          noiseG.gain.setTargetAtTime(0.35 * h, t, k);
          bp.frequency.setTargetAtTime(700 + 1400 * h, t, k);
          if (!on && h <= 0.001) sleepSoon(900);
        },
        chime: function () {
          if (!ready) return;
          var t = ac.currentTime;
          master.gain.setTargetAtTime(0, t + 0.15, 0.35);
          [523.25, 783.99, 1046.5].forEach(function (f, i) {
            var o = ac.createOscillator(), g = ac.createGain(), s0 = t + i * 0.07;
            o.type = 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(0, s0);
            g.gain.linearRampToValueAtTime(0.07, s0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, s0 + 2.2);
            o.connect(g); g.connect(ac.destination);
            o.start(s0); o.stop(s0 + 2.3);
          });
          sleepSoon(2600);
        },
        sleep: function () { if (ac && ac.state === 'running') ac.suspend(); }
      };
    })();
    document.addEventListener('visibilitychange', function () { if (document.hidden && heatAudio) heatAudio.sleep(); });
    function paint(now) {
      if (Math.abs(h - lastH) > 0.004 || h === 0 || h === 1) { lastH = h; btn.style.setProperty('--h', h.toFixed(3)); }
      if (vidReady) vSeek(h * (vid.duration - 0.05));
      if (heatAudio) heatAudio.set(h, holding);
      var txt = Math.round(-170 + 870 * h) + ' °C';
      txt = txt.replace('-', '−');
      if ((now - lastTxtAt > 100 || h === 0 || h === 1) && txt !== lastTxt) { lastTxt = txt; lastTxtAt = now; temp.textContent = txt; }
    }
    function complete() {
      if (done) return;
      done = true; h = 1; holding = false;
      paint(performance.now());
      btn.classList.remove('heating'); btn.classList.add('done');
      sec.classList.add('done');
      if (heatAudio) heatAudio.chime();
      label.textContent = 'Газы вышли';
      state.textContent = 'Камень нагрет до 700 градусов. Из 100 тонн грунта вышел один грамм гелия-3.';
    }
    function loop(now) {
      var dt = Math.min(100, now - (last || now)); last = now;
      if (holding) h = Math.min(1, h + dt / 2400);
      else h = Math.max(0, h - dt / 1500);
      paint(now);
      if (h >= 1) { raf = null; last = 0; complete(); return; }
      if (h <= 0 && !holding) { raf = null; last = 0; label.textContent = 'Удерживайте, чтобы нагреть'; return; }
      raf = requestAnimationFrame(loop);
    }
    function press() {
      if (done) return;
      if (heatAudio) heatAudio.start();
      if (noMotion()) { complete(); return; }
      holding = true; btn.classList.add('heating'); label.textContent = 'Греем камень';
      if (raf === null) raf = requestAnimationFrame(loop);
    }
    function release() {
      if (done || !holding) return;
      holding = false; btn.classList.remove('heating'); label.textContent = 'Остывает';
      if (raf === null) raf = requestAnimationFrame(loop);
    }
    btn.addEventListener('pointerdown', function (e) { if (e.button) return; try { btn.setPointerCapture(e.pointerId); } catch (x) {} press(); });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    btn.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
    btn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') release(); });
    btn.addEventListener('blur', release);
    pinFns.push(function () { if (holding) complete(); });
  })();

  /* Process diagram with camera zoom */
  (function () {
    var DATA = [
      ['Орбитальный картограф и ровер ищут участки, где гелия-3 больше обычного.', 'На картографе стоит нейтронный спектрометр. Ровер берёт буровые пробы с глубины до двух метров.'],
      ['Харвестеры снимают верхний слой грунта.', 'Харвестер снимает слой толщиной до трёх метров и работает без оператора.'],
      ['Грунт нагревают, и из него выходят газы.', 'Печь греет грунт, пока из него не выйдут газы. Тепло собирают зеркала, которые фокусируют солнечный свет.'],
      ['Из смеси газов выделяют гелий-3.', 'Вместе с ним из грунта выходят водород, обычный гелий, азот и вода. Гелий-3 отделяют при температуре около −270 °C.'],
      ['Гелий-3 хранят в герметичных ёмкостях до отправки.', 'Ёмкости стоят на дне кратера, куда не попадает солнце. Датчики проверяют давление и температуру каждую секунду.'],
      ['Гелий-3 отправляют на Землю.', 'Литр газообразного гелия-3 стоит несколько тысяч долларов, поэтому возить его имеет смысл даже малыми партиями.']
    ];
    var CX = [150, 330, 510, 690, 870, 1050];
    var FULL = [0, 0, 1200, 440];
    var svg = $('#proc-svg'), frame = $('#proc-frame'), detail = $('#proc-detail');
    var main = $('#proc-main');
    var steps = $$('.step'), sts = $$('.st', svg);
    var vb = FULL.slice(), from = vb, to = vb, t0 = 0, raf = null, cur = 0, swapT = null;
    var hint = $('#proc-hint'), TOP = [178, 256, 206, 184, 230, 236];
    function hintAt(i) { hint.style.transform = 'translate(' + CX[i] + 'px,' + TOP[i] + 'px)'; }
    function hover(i) { if (frame.classList.contains('zoomed')) return; hintAt(i); frame.classList.add('hinting'); }
    function unhover() { frame.classList.remove('hinting'); if (!frame.classList.contains('seen')) hintAt(0); }
    hintAt(0);
    function setVB(v) { svg.setAttribute('viewBox', v.map(function (n) { return n.toFixed(1); }).join(' ')); }
    function anim(now) {
      var t = easeIO(clamp((now - t0) / 950, 0, 1));
      vb = from.map(function (f, i) { return f + (to[i] - f) * t; });
      setVB(vb);
      raf = t < 1 ? requestAnimationFrame(anim) : null;
    }
    function go(v) {
      to = v;
      if (noMotion()) { if (raf) cancelAnimationFrame(raf); raf = null; vb = v.slice(); setVB(vb); return; }
      from = vb.slice(); t0 = performance.now();
      if (raf === null) raf = requestAnimationFrame(anim);
    }
    function select(i, zoom) {
      cur = i;
      frame.classList.add('seen'); frame.classList.remove('hinting');
      steps.forEach(function (s, n) { s.setAttribute('aria-selected', n === i ? 'true' : 'false'); });
      sts.forEach(function (s, n) { s.classList.toggle('on', n === i); });
      clearTimeout(swapT);
      var write = function () { main.textContent = DATA[i][0]; detail.classList.remove('out'); };
      if (noMotion()) write(); else { detail.classList.add('out'); swapT = setTimeout(write, 240); }
      if (zoom) { frame.classList.add('zoomed'); go([CX[i] - 250, 172, 500, 183.3]); }
    }
    steps.concat(sts).forEach(function (s) {
      var n = +s.dataset.i;
      s.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hover(n); });
      s.addEventListener('pointerleave', unhover);
      s.addEventListener('focus', function () { hover(n); });
      s.addEventListener('blur', unhover);
    });
    steps.forEach(function (s, n) { s.addEventListener('click', function () { select(n, true); }); });
    sts.forEach(function (s, n) {
      s.addEventListener('click', function () { select(n, true); });
      s.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(n, true); } });
    });
    $('#proc-reset').addEventListener('click', function () { frame.classList.remove('zoomed'); go(FULL); });
    pinFns.push(function () { if (raf) { cancelAnimationFrame(raf); raf = null; vb = to.slice(); setVB(vb); } });
  })();

  /* Shared: lazy start for heavy canvases */
  function whenNear(el, fn) {
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { rootMargin: '700px 0px' });
    io.observe(el);
  }
  function swapCard(card, write) {
    if (noMotion()) { write(); return; }
    card.classList.add('out');
    setTimeout(function () { write(); card.classList.remove('out'); }, 220);
  }

  /* 04: explorable 3D base. Three.js with real light and shadows; the flat canvas drawing stays as a fallback */
  var BASE_INFO = [
    ['Добывающая станция', 'Сюда харвестеры привозят грунт и здесь же заряжаются.', [['Флот', '4 харвестера'], ['Режим', 'без экипажа']]],
    ['Блок переработки', 'Здесь стоят печи и установка, которая разделяет газы.', [['Мощность', '40 т грунта в час'], ['Печей', '2']]],
    ['Автономная робототехника', 'Роверы возят грунт и чинят оборудование. Людей на площадке нет.', [['Связь с Землёй', 'задержка 1,3 с'], ['Автономность', 'до 14 суток']]],
    ['Энергосистема', 'Солнечные панели стоят на гребне кратера. Солнце освещает его до 90% времени.', [['Мачт', '3'], ['Резерв', 'аккумуляторы на 72 ч']]],
    ['Исследовательская лаборатория', 'Пробы грунта анализируют прямо на площадке.', [['Приборы', 'масс-спектрометр'], ['Проб в сутки', 'до 60']]],
    ['Хранилище', 'Ёмкости с гелием-3 стоят в тени кратера, где температура ниже −200 °C.', [['Ёмкостей', '3'], ['Объём каждой', '2 м³']]]
  ];
  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
  function hasWebGL() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function resetBaseCanvas() {
    var old = $('#base-canvas'), cv = old.cloneNode(false);
    old.parentNode.replaceChild(cv, old);
    $('#base-markers').innerHTML = '';
  }
  whenNear($('#base-stage'), function () {
    if (!hasWebGL()) { legacyBase(); return; }
    import(THREE_URL).then(function (T) {
      try { threeBase(T); } catch (e) { resetBaseCanvas(); legacyBase(); }
    }, function () { legacyBase(); });
  });

  function threeBase(T) {
    var stageEl = $('#base-stage'), cv = $('#base-canvas'), mkBox = $('#base-markers'), card = $('#base-card');
    var renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    var scene = new T.Scene(), world = new T.Group();
    scene.add(world);
    var camera = new T.PerspectiveCamera(30, 1, 1, 200);
    var ACC = new T.Color('#FFCB2E');
    function V(x, y, z) { return new T.Vector3(x, y, z); }
    var UP = V(0, 1, 0);

    /* Light: a low hard sun like at the lunar pole, a cool sky fill and a blue rim */
    scene.add(new T.HemisphereLight(0xa8b8cc, 0x15181d, 0.35));
    var sun = new T.DirectionalLight(0xfff3e2, 3.2);
    sun.position.set(-15, 10, 9);
    sun.castShadow = true;
    var small = Math.min(innerWidth, innerHeight) < 700;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    var sc = sun.shadow.camera;
    sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    scene.add(sun);
    var rim = new T.DirectionalLight(0x79bfff, 0.8);
    rim.position.set(12, 7, -14);
    scene.add(rim);

    /* Procedural textures, nothing to download */
    var rr = rng(4242);
    function canvasTex(w, h, draw, srgb) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      var t = new T.CanvasTexture(c);
      if (srgb) t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }
    var regolith = canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = '#44484e'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 12000; i++) {
        var v = 46 + (rr() * 70 | 0);
        g.fillStyle = 'rgba(' + v + ',' + (v + 2) + ',' + (v + 6) + ',' + (0.2 + rr() * 0.45).toFixed(2) + ')';
        g.fillRect(rr() * w, rr() * h, 1 + rr() * 1.6, 1 + rr() * 1.6);
      }
      for (i = 0; i < 60; i++) {
        var x = rr() * w, y = rr() * h, rad = 4 + rr() * 18, gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(18,20,24,.4)'); gr.addColorStop(0.75, 'rgba(18,20,24,.18)'); gr.addColorStop(1, 'rgba(150,155,162,.14)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.fill();
      }
    }, true);
    regolith.wrapS = regolith.wrapT = T.RepeatWrapping; regolith.repeat.set(7, 7);
    var fade = canvasTex(256, 256, function (g, w) {
      var gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.68, '#fff'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
    var cells = canvasTex(128, 256, function (g, w, h) {
      g.fillStyle = '#101b34'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(150,175,220,.4)'; g.lineWidth = 1;
      for (var x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
      for (var y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    }, true);
    var fins = canvasTex(64, 64, function (g, w, h) {
      g.fillStyle = '#d4d8dc'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(90,98,108,.35)';
      for (var x = 0; x < w; x += 8) g.fillRect(x, 0, 2, h);
    }, true);
    fins.wrapS = fins.wrapT = T.RepeatWrapping; fins.repeat.set(3, 1);

    var M = {
      white: new T.MeshStandardMaterial({ color: 0xdadde1, roughness: 0.55, metalness: 0.06 }),
      panel: new T.MeshStandardMaterial({ color: 0xa9afb7, roughness: 0.7, metalness: 0.15 }),
      panel2: new T.MeshStandardMaterial({ color: 0xa9afb7, roughness: 0.7, metalness: 0.15, side: T.DoubleSide }),
      metal: new T.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.3, metalness: 0.85 }),
      dark: new T.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6, metalness: 0.3 }),
      mli: new T.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.25, metalness: 0.9 }),
      shell: new T.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.3, metalness: 0.85, side: T.DoubleSide }),
      foil: new T.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 0.95 }),
      solar: new T.MeshStandardMaterial({ map: cells, roughness: 0.2, metalness: 0.6 }),
      fins: new T.MeshStandardMaterial({ map: fins, roughness: 0.5, metalness: 0.1 }),
      berm: new T.MeshStandardMaterial({ map: regolith, color: 0xd2d6db, roughness: 1 }),
      dish: new T.MeshStandardMaterial({ color: 0xdadde1, roughness: 0.5, metalness: 0.2, side: T.DoubleSide }),
      glow: new T.MeshStandardMaterial({ color: 0x2a1c08, emissive: 0xffc34d, emissiveIntensity: 1.6, roughness: 0.6 }),
      lamp: new T.MeshStandardMaterial({ color: 0x1a1a14, emissive: 0xfff1c2, emissiveIntensity: 1.2 })
    };
    ['solar', 'glow', 'lamp', 'metal', 'mli', 'dark', 'berm', 'foil'].forEach(function (k) { M[k].userData.keep = true; });
    var envTex = canvasTex(512, 256, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#1b222c'); gr.addColorStop(0.42, '#5d6876'); gr.addColorStop(0.5, '#aab4c0'); gr.addColorStop(0.56, '#3d4148'); gr.addColorStop(1, '#16181c');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      var s = g.createRadialGradient(w * 0.12, h * 0.36, 0, w * 0.12, h * 0.36, 44);
      s.addColorStop(0, 'rgba(255,248,235,1)'); s.addColorStop(1, 'rgba(255,248,235,0)');
      g.fillStyle = s; g.fillRect(0, 0, w, h);
    }, true);
    envTex.mapping = T.EquirectangularReflectionMapping;
    var pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(envTex).texture;
    pmrem.dispose();

    /* Geometry helpers */
    function mesh(g, geo, m, x, y, z) {
      var o = new T.Mesh(geo, m);
      o.position.set(x || 0, y || 0, z || 0);
      o.castShadow = o.receiveShadow = true;
      g.add(o);
      return o;
    }
    function cyl(rt, rb, h, s) { return new T.CylinderGeometry(rt, rb, h, s || 32); }
    function rbox(w, h, d, rad) {
      rad = Math.min(rad || 0.06, w / 2 - 0.001, h / 2 - 0.001);
      var s = new T.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + rad, y); s.lineTo(x + w - rad, y); s.quadraticCurveTo(x + w, y, x + w, y + rad);
      s.lineTo(x + w, y + h - rad); s.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      s.lineTo(x + rad, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rad);
      s.lineTo(x, y + rad); s.quadraticCurveTo(x, y, x + rad, y);
      var bt = Math.min(0.03, d / 4);
      var geo = new T.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelSegments: 2, curveSegments: 4 });
      geo.center();
      return geo;
    }
    function rod(g, a, b, rad, m, seg) {
      var v = b.clone().sub(a), len = v.length();
      var o = mesh(g, cyl(rad, rad, len, seg || 12), m);
      o.position.copy(a).addScaledVector(v, 0.5);
      o.quaternion.setFromUnitVectors(UP, v.normalize());
      return o;
    }
    function bar(g, a, b, w, d, m) {
      var v = b.clone().sub(a), len = v.length();
      var o = mesh(g, new T.BoxGeometry(w, len, d), m);
      o.position.copy(a).addScaledVector(v, 0.5);
      o.quaternion.setFromUnitVectors(UP, v.normalize());
      return o;
    }
    function tube(g, pts, rad, m) {
      return mesh(g, new T.TubeGeometry(new T.CatmullRomCurve3(pts), Math.max(24, pts.length * 14), rad, 10, false), m);
    }
    function wheel(g, x, y, z, rad, wid) {
      mesh(g, cyl(rad, rad, wid, 28), M.dark, x, y, z).rotation.x = Math.PI / 2;
      mesh(g, cyl(rad * 0.42, rad * 0.42, wid + 0.02, 20), M.metal, x, y, z).rotation.x = Math.PI / 2;
      mesh(g, new T.TorusGeometry(rad, wid * 0.16, 8, 28), M.metal, x, y, z + wid * 0.32);
      mesh(g, new T.TorusGeometry(rad, wid * 0.16, 8, 28), M.metal, x, y, z - wid * 0.32);
    }
    function harvester(g0, x, y, z, ry) {
      var h = new T.Group(); h.position.set(x, y, z); h.rotation.y = ry; g0.add(h);
      mesh(h, rbox(1.75, 0.42, 1.05, 0.08), M.white, 0, 0.7, 0);
      mesh(h, rbox(0.95, 0.3, 0.72, 0.05), M.panel, -0.25, 1.06, 0);
      mesh(h, new T.BoxGeometry(0.7, 0.02, 0.9), M.fins, 0.45, 0.93, 0);
      [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].forEach(function (p) { wheel(h, p[0], 0.36, p[1], 0.36, 0.24); });
      var a = V(0.85, 0.64, 0), b = V(2.05, 0.1, 0);
      bar(h, a, b, 0.14, 0.26, M.metal);
      for (var t = 0.08; t < 1; t += 0.14) {
        var p = a.clone().lerp(b, t);
        mesh(h, new T.BoxGeometry(0.09, 0.07, 0.3), M.dark, p.x, p.y + 0.1, p.z).rotation.z = -0.42;
      }
      mesh(h, cyl(0.16, 0.16, 0.3, 20), M.metal, b.x, b.y, 0).rotation.x = Math.PI / 2;
      rod(h, V(0.55, 0.92, 0), V(1.15, 0.6, 0), 0.04, M.metal);
      rod(h, V(-0.62, 0.9, 0.32), V(-0.62, 1.62, 0.32), 0.025, M.metal);
      mesh(h, new T.BoxGeometry(0.12, 0.1, 0.3), M.dark, -0.62, 1.66, 0.32);
      bar(h, V(-0.85, 1.0, 0), V(-1.35, 1.3, 0), 0.32, 0.34, M.panel);
    }

    var groups = [], picks = [];
    var FOOT = [[0.4, -0.2, 3.2], [0, 0, 2.9], [0.7, 0.5, 3.0], [0, 0.4, 3.1], [0.3, 0.6, 2.8], [0, 0.3, 3.1]];
    function group(i, x, z) { var g = new T.Group(); g.position.set(x, 0, z); world.add(g); groups[i] = g; return g; }

    /* 0. Mining station: charging pad with lights, two harvesters, regolith spoil heaps */
    (function () {
      var g = group(0, -6.6, 3.6);
      mesh(g, cyl(2.5, 2.6, 0.12, 8), M.panel, 0, 0.06, 0);
      for (var k = 0; k < 8; k++) {
        var a = k / 8 * Math.PI * 2 + Math.PI / 8;
        mesh(g, cyl(0.06, 0.06, 0.05, 10), M.lamp, Math.cos(a) * 2.35, 0.14, Math.sin(a) * 2.35);
      }
      rod(g, V(-1.3, 0.12, -1.3), V(-1.3, 1.5, -1.3), 0.07, M.metal);
      mesh(g, rbox(0.34, 0.28, 0.34, 0.04), M.white, -1.3, 1.6, -1.3);
      harvester(g, 0.25, 0.12, 0.2, -0.35);
      harvester(g, 2.6, 0, -1.9, -0.9);
    })();

    /* 1. Processing: two regolith furnaces (after the Wisconsin HEAT rig), gas separation column, radiators, covered conveyor */
    (function () {
      var g = group(1, 0, 0.2);
      mesh(g, rbox(4.8, 0.22, 3.3, 0.08), M.panel, 0, 0.11, 0);
      [-1, 1].forEach(function (s) {
        var x = s * 0.95, z = -0.35, y0 = 0.22;
        mesh(g, cyl(0.64, 0.26, 0.45, 40), M.metal, x, y0 + 0.225, z).rotation.x = Math.PI;
        mesh(g, cyl(0.64, 0.64, 1.7, 48), M.mli, x, y0 + 0.45 + 0.85, z);
        mesh(g, cyl(0.5, 0.64, 0.2, 40), M.metal, x, y0 + 2.25, z);
        mesh(g, cyl(0.44, 0.12, 0.5, 32), M.metal, x, y0 + 2.6, z);
        [0.75, 1.3, 1.85].forEach(function (yy) { mesh(g, new T.TorusGeometry(0.65, 0.03, 8, 56), M.metal, x, y0 + yy, z).rotation.x = Math.PI / 2; });
        mesh(g, cyl(0.13, 0.13, 0.08, 24), M.glow, x, y0 + 1.1, z + 0.63).rotation.x = Math.PI / 2;
        [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (q) {
          rod(g, V(x + q[0] * 0.35, y0 + 0.5, z + q[1] * 0.35), V(x + q[0] * 0.6, y0, z + q[1] * 0.6), 0.04, M.metal);
        });
        tube(g, [V(x, y0 + 2.36, z + 0.2), V(x * 0.7, y0 + 2.9, z + 0.7), V(0, y0 + 3.05, 0.95)], 0.06, M.metal);
      });
      mesh(g, cyl(0.22, 0.22, 2.9, 28), M.metal, 0, 0.22 + 1.45, 0.95);
      mesh(g, new T.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.metal, 0, 0.22 + 2.9, 0.95);
      [0.9, 1.8].forEach(function (yy) { mesh(g, cyl(0.42, 0.42, 0.04, 28), M.panel, 0, 0.22 + yy, 0.95); });
      mesh(g, rbox(0.55, 0.5, 0.5, 0.05), M.white, 0.75, 0.47, 1.15);
      mesh(g, rbox(0.55, 0.5, 0.5, 0.05), M.white, -0.75, 0.47, 1.15);
      [-1.15, 1.15].forEach(function (x) {
        mesh(g, new T.BoxGeometry(1.9, 1.25, 0.04), M.fins, x, 0.22 + 0.95, -1.5);
        rod(g, V(x - 0.85, 0.22, -1.5), V(x - 0.85, 0.36, -1.5), 0.03, M.metal);
        rod(g, V(x + 0.85, 0.22, -1.5), V(x + 0.85, 0.36, -1.5), 0.03, M.metal);
      });
      var c0 = V(-4.6, 0.75, 2.0), c1 = V(-1.0, 2.95, -0.25);
      rod(g, c0, c1, 0.14, M.panel, 20);
      [0.22, 0.5, 0.78].forEach(function (t) { var p = c0.clone().lerp(c1, t); rod(g, V(p.x, 0, p.z), V(p.x, p.y - 0.18, p.z), 0.045, M.metal); });
    })();

    /* 2. Robotics: shelter hangar and a six-instrument rover with a manipulator arm, after NASA VIPER */
    (function () {
      var g = group(2, 6.0, 4.4);
      mesh(g, rbox(3.0, 0.08, 2.8, 0.04), M.panel, 0, 0.04, 0);
      mesh(g, new T.CylinderGeometry(1.3, 1.3, 2.8, 48, 1, true, 0, Math.PI), M.shell, 0, 0.08, 0).rotation.z = Math.PI / 2;
      [-1.4, -0.47, 0.47, 1.4].forEach(function (x) { mesh(g, new T.TorusGeometry(1.32, 0.05, 8, 40, Math.PI), M.metal, x, 0.08, 0).rotation.y = Math.PI / 2; });
      mesh(g, new T.CircleGeometry(1.3, 40, 0, Math.PI), M.panel2, -1.4, 0.08, 0).rotation.y = Math.PI / 2;
      mesh(g, cyl(0.07, 0.07, 0.06, 12), M.lamp, 1.42, 1.25, 0).rotation.z = Math.PI / 2;
      var rv = new T.Group(); rv.position.set(2.3, 0, 1.4); rv.rotation.y = -0.5; g.add(rv);
      mesh(rv, rbox(1.3, 0.36, 0.95, 0.07), M.white, 0, 0.7, 0);
      [-1, 1].forEach(function (s) { mesh(rv, new T.BoxGeometry(1.1, 0.55, 0.02), M.solar, 0, 0.8, s * 0.5); });
      [[-0.5, -0.55], [0.5, -0.55], [-0.5, 0.55], [0.5, 0.55]].forEach(function (p) { wheel(rv, p[0], 0.3, p[1], 0.3, 0.2); });
      rod(rv, V(-0.45, 0.88, 0), V(-0.45, 1.75, 0), 0.03, M.metal);
      mesh(rv, new T.BoxGeometry(0.16, 0.14, 0.36), M.dark, -0.45, 1.8, 0);
      [-0.1, 0.1].forEach(function (z) { mesh(rv, cyl(0.035, 0.035, 0.05, 14), M.metal, -0.36, 1.8, z).rotation.z = Math.PI / 2; });
      var j0 = V(0.6, 0.78, 0.25), j1 = V(1.05, 1.2, 0.3), j2 = V(1.5, 0.7, 0.32), j3 = V(1.55, 0.22, 0.32);
      [j0, j1, j2].forEach(function (p) { mesh(rv, new T.SphereGeometry(0.07, 16, 12), M.metal, p.x, p.y, p.z); });
      rod(rv, j0, j1, 0.045, M.white); rod(rv, j1, j2, 0.04, M.white); rod(rv, j2, j3, 0.03, M.metal);
      mesh(rv, new T.BoxGeometry(0.14, 0.08, 0.14), M.dark, j3.x, j3.y, j3.z);
    })();

    /* 3. Energy: three tall vertical solar masts, after NASA's VSAT concept for the lunar south pole */
    (function () {
      var g = group(3, -5.6, -5.4);
      [[-2.2, 0.3], [0, -0.3], [2.2, 0.3]].forEach(function (p) {
        var t = new T.Group(); t.position.set(p[0], 0, p[1]); g.add(t);
        mesh(t, cyl(0.45, 0.55, 0.16, 8), M.panel, 0, 0.08, 0);
        mesh(t, cyl(0.07, 0.1, 3.7, 14), M.metal, 0, 0.16 + 1.85, 0);
        var arr = new T.Group(); arr.position.set(0, 3.55, 0); arr.rotation.y = -1.2; t.add(arr);
        mesh(arr, new T.BoxGeometry(1.25, 2.7, 0.05), M.solar, 0, 0, 0.09);
        mesh(arr, new T.BoxGeometry(1.31, 2.76, 0.03), M.metal, 0, 0, 0.05);
        mesh(arr, cyl(0.09, 0.09, 0.3, 14), M.metal, 0, 0, 0).rotation.x = Math.PI / 2;
      });
      [-1, 1].forEach(function (s) {
        mesh(g, rbox(1.1, 0.62, 0.7, 0.05), M.white, s * 1.1, 0.31, 1.6);
        mesh(g, new T.BoxGeometry(0.9, 0.02, 0.5), M.fins, s * 1.1, 0.63, 1.6);
      });
    })();

    /* 4. Research lab: two pressurised modules and a node, dish antenna, radiator */
    (function () {
      var g = group(4, 5.6, -4.6);
      mesh(g, new T.CapsuleGeometry(0.72, 2.3, 10, 32), M.white, -0.6, 1.05, 0).rotation.z = Math.PI / 2;
      mesh(g, new T.SphereGeometry(0.78, 32, 24), M.white, 1.3, 1.05, 0);
      mesh(g, new T.CapsuleGeometry(0.62, 1.6, 10, 32), M.white, 1.3, 1.0, 1.75).rotation.x = Math.PI / 2;
      [-1.6, -0.6, 0.4].forEach(function (x) { mesh(g, new T.TorusGeometry(0.73, 0.035, 8, 48), M.metal, x, 1.05, 0).rotation.y = Math.PI / 2; });
      [1.1, 2.1].forEach(function (z) { mesh(g, new T.TorusGeometry(0.63, 0.035, 8, 48), M.metal, 1.3, 1.0, z); });
      [-1.4, -0.9, -0.4, 0.1].forEach(function (x) { mesh(g, new T.BoxGeometry(0.22, 0.14, 0.04), M.lamp, x, 1.25, 0.71); });
      [-1.5, 0.3].forEach(function (x) { mesh(g, rbox(0.34, 0.5, 1.25, 0.04), M.panel, x, 0.25, 0); });
      mesh(g, rbox(1.1, 0.45, 0.3, 0.04), M.panel, 1.3, 0.22, 1.75);
      rod(g, V(1.3, 1.8, 0), V(1.3, 2.6, 0), 0.04, M.metal);
      var dish = mesh(g, new T.SphereGeometry(0.55, 32, 12, 0, Math.PI * 2, 0, 0.9), M.dish, 1.3, 3.12, 0);
      dish.rotation.x = Math.PI + 0.5;
      mesh(g, new T.BoxGeometry(1.5, 0.9, 0.04), M.fins, -0.6, 0.62, -1.15);
      rod(g, V(-1.3, 0, -1.15), V(-1.3, 0.2, -1.15), 0.03, M.metal);
      rod(g, V(0.1, 0, -1.15), V(0.1, 0.2, -1.15), 0.03, M.metal);
    })();

    /* 5. Storage: three spherical cryogenic tanks in insulation on legs, manifold and a pipe to processing */
    (function () {
      var g = group(5, 0.4, -7.6);
      [-2.1, 0, 2.1].forEach(function (x) {
        mesh(g, rbox(1.7, 0.1, 1.7, 0.05), M.panel, x, 0.05, 0);
        mesh(g, new T.SphereGeometry(0.86, 40, 28), M.mli, x, 1.55, 0);
        mesh(g, new T.TorusGeometry(0.87, 0.04, 8, 56), M.metal, x, 1.55, 0).rotation.x = Math.PI / 2;
        [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (q) { rod(g, V(x + q[0] * 0.55, 1.45, q[1] * 0.55), V(x + q[0] * 0.72, 0.1, q[1] * 0.72), 0.045, M.metal); });
        mesh(g, cyl(0.08, 0.08, 0.4, 16), M.metal, x, 2.55, 0);
        mesh(g, new T.BoxGeometry(0.16, 0.12, 0.16), M.dark, x, 2.8, 0);
        rod(g, V(x, 0.72, 0), V(x, 0.42, 0.55), 0.05, M.metal);
      });
      tube(g, [V(-2.1, 0.42, 0.55), V(0, 0.42, 0.55), V(2.1, 0.42, 0.55)], 0.07, M.metal);
      tube(g, [V(0, 0.42, 0.55), V(-0.2, 0.35, 2.6), V(-0.4, 0.35, 6.1)], 0.07, M.metal);
      [1.6, 3.2, 4.8].forEach(function (z) { mesh(g, new T.BoxGeometry(0.18, 0.3, 0.18), M.panel, -0.2 - (z / 6.1) * 0.2, 0.15, z); });
    })();

    /* Ground: regolith disc that fades out at the edge, faint survey rings, blue power and data cables */
    var ground = new T.Mesh(new T.CircleGeometry(16, 96), new T.MeshStandardMaterial({ map: regolith, color: 0x7f848b, roughness: 1, metalness: 0, alphaMap: fade, transparent: true, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.renderOrder = -1;
    world.add(ground);
    var ringMat = new T.LineBasicMaterial({ color: 0xd9dde1, transparent: true, opacity: 0.08 });
    [4, 8, 12].forEach(function (r0) {
      var pts = [];
      for (var i = 0; i <= 120; i++) { var a = i / 120 * Math.PI * 2; pts.push(V(Math.sin(a) * r0, 0.015, Math.cos(a) * r0)); }
      world.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), ringMat));
    });
    var cableMat = new T.LineDashedMaterial({ color: 0x79bfff, dashSize: 0.25, gapSize: 0.2, transparent: true, opacity: 0.75 });
    [[V(-4.2, 0.02, -4.4), V(-2.4, 0.02, -1.0)], [V(3.9, 0.02, -3.6), V(2.4, 0.02, -0.9)], [V(4.4, 0.02, 3.6), V(2.5, 0.02, 1.5)]].forEach(function (s) {
      var l = new T.Line(new T.BufferGeometry().setFromPoints(s), cableMat);
      l.computeLineDistances(); world.add(l);
    });

    /* Each object gets its own materials so the selected one can be tinted in the accent */
    world.updateMatrixWorld(true);
    groups.forEach(function (g, i) {
      var cache = {};
      g.traverse(function (o) {
        if (!o.isMesh) return;
        var m = o.material;
        if (!cache[m.uuid]) { cache[m.uuid] = m.clone(); cache[m.uuid].userData.keep = !!m.userData.keep; }
        o.material = cache[m.uuid];
        o.userData.i = i;
        picks.push(o);
      });
      g.userData.mats = Object.keys(cache).map(function (k) { return cache[k]; });
      var b = new T.Box3().setFromObject(g), f = FOOT[i];
      g.userData.anchor = V(g.position.x + f[0], b.max.y + 0.55, g.position.z + f[1]);
      g.userData.rad = f[2];
    });
    var ringSel = new T.Mesh(new T.RingGeometry(0.975, 1, 128), new T.MeshBasicMaterial({ color: ACC, transparent: true, opacity: 0.9, depthWrite: false }));
    ringSel.rotation.x = -Math.PI / 2; ringSel.position.y = 0.025;
    world.add(ringSel);

    var markers = BASE_INFO.map(function (inf, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mk'; b.textContent = i + 1;
      b.setAttribute('aria-label', inf[0]); b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { select(i, true); });
      mkBox.appendChild(b);
      return b;
    });

    var W = 0, H = 0, D = 40, TY = 0.7, yaw = 0.45, pitch = 0.56, yawT = null, sel = 0;
    var auto = true, onScreen = false, raf = null, last = 0, dirty = true, drag = null;
    var tmp = V(0, 0, 0);
    function tint(i) {
      groups.forEach(function (g, n) {
        g.userData.mats.forEach(function (m) {
          if (m.userData.keep || !m.emissive) return;
          m.emissive.copy(ACC); m.emissiveIntensity = n === i ? 0.06 : 0;
        });
      });
      var g = groups[i], r0 = g.userData.rad;
      ringSel.position.x = g.userData.anchor.x; ringSel.position.z = g.userData.anchor.z;
      ringSel.scale.set(r0, r0, 1);
    }
    function size() {
      var r = cv.getBoundingClientRect(); W = r.width; H = r.height;
      if (!W || !H) return;
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      var tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect, narrow = W < 700;
      D = Math.max((narrow ? 10.5 : 14.5) / th, (narrow ? 8 : 8.8) / tv);
      if (narrow) camera.clearViewOffset(); else camera.setViewOffset(W, H, W * 0.1, 0, W, H);
      camera.updateProjectionMatrix();
      dirty = true; wake();
    }
    function placeMarkers() {
      groups.forEach(function (g, i) {
        tmp.copy(g.userData.anchor).applyMatrix4(world.matrixWorld);
        var depth = tmp.distanceTo(camera.position);
        tmp.project(camera);
        markers[i].style.transform = 'translate(' + Math.round((tmp.x + 1) / 2 * W) + 'px,' + Math.round((1 - tmp.y) / 2 * H) + 'px)';
        markers[i].style.zIndex = String(1000 - Math.round(depth * 10));
      });
    }
    function render() {
      dirty = false;
      world.rotation.y = yaw;
      camera.position.set(0, TY + D * Math.sin(pitch), D * Math.cos(pitch));
      camera.lookAt(0, TY, 0);
      world.updateMatrixWorld();
      renderer.render(scene, camera);
      placeMarkers();
    }
    function loop(now) {
      var dt = Math.min(100, now - (last || now)); last = now;
      var moving = false;
      if (yawT !== null) {
        var diff = Math.atan2(Math.sin(yawT - yaw), Math.cos(yawT - yaw));
        if (Math.abs(diff) < 0.002) { yaw = yawT; yawT = null; } else { yaw += diff * (1 - Math.pow(1 - 0.12, dt / 16.667)); moving = true; }
        dirty = true;
      } else if (auto && onScreen && !noMotion() && !drag) { yaw += dt * 0.00009; dirty = true; moving = true; }
      if (dirty && W) render();
      if (moving || drag) raf = requestAnimationFrame(loop); else { raf = null; last = 0; }
    }
    function wake() { if (raf === null) raf = requestAnimationFrame(loop); }
    function select(i, turn) {
      sel = i; auto = false;
      markers.forEach(function (m, n) { m.setAttribute('aria-pressed', n === i ? 'true' : 'false'); });
      swapCard(card, function () {
        $('#base-n').textContent = '0' + (i + 1) + ' / 06';
        $('#base-title').textContent = BASE_INFO[i][0];
        $('#base-text').textContent = BASE_INFO[i][1];
        $('#base-spec').innerHTML = BASE_INFO[i][2].map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
      });
      tint(i);
      if (turn) {
        var a = groups[i].userData.anchor, t = -Math.atan2(a.x, a.z) + 0.35;
        if (noMotion()) { yaw = t; yawT = null; } else yawT = t;
      }
      dirty = true; wake();
    }
    var ray = new T.Raycaster(), ndc = new T.Vector2();
    function pickAt(e) {
      var r = cv.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      var hit = ray.intersectObjects(picks, false)[0];
      return hit ? hit.object.userData.i : -1;
    }
    var lastHover = 0, hoverI = -1;
    cv.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch, moved: 0 };
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      stageEl.classList.add('drag'); auto = false; yawT = null; wake();
    });
    cv.addEventListener('pointermove', function (e) {
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        yaw = drag.yaw + dx * 0.008;
        pitch = clamp(drag.pitch + dy * 0.004, 0.3, 1.15);
        dirty = true;
        return;
      }
      if (e.pointerType !== 'mouse') return;
      var now = performance.now();
      if (now - lastHover < 60) return;
      lastHover = now;
      var i = pickAt(e);
      if (i !== hoverI) { hoverI = i; cv.style.cursor = i >= 0 ? 'pointer' : ''; }
    });
    function end(e) {
      if (!drag) return;
      var moved = drag.moved; drag = null; stageEl.classList.remove('drag');
      if (moved < 6 && e && e.type === 'pointerup') { var i = pickAt(e); if (i >= 0) select(i, false); }
    }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    stageEl.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { auto = false; yawT = null; yaw += e.key === 'ArrowLeft' ? -0.2 : 0.2; dirty = true; wake(); }
    });
    new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; if (onScreen) wake(); }).observe(stageEl);
    if (window.ResizeObserver) new ResizeObserver(size).observe(cv); else addEventListener('resize', size);
    stageEl.classList.add('webgl');
    tint(0);
    size();
  }

  /* Fallback: the flat canvas drawing for browsers without WebGL or without network access to the library */
  function legacyBase() {
    var stageEl = $('#base-stage'), cv = $('#base-canvas'), ctx = cv.getContext('2d'), mkBox = $('#base-markers');
    if (!ctx) return;
    var INFO = BASE_INFO;
    var faces = [], anchors = [], links = [];
    function quad(g, a, b, c, d) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      var n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(n[0], n[1], n[2]) || 1;
      faces.push({ g: g, p: [a, b, c, d], n: [n[0] / l, n[1] / l, n[2] / l] });
    }
    function box(g, x, z, w, h, d, y0) {
      y0 = y0 || 0; var x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h;
      quad(g, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
      quad(g, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
      quad(g, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
      quad(g, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
      quad(g, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    }
    function cyl(g, x, z, r, h, y0, seg) {
      y0 = y0 || 0; seg = seg || 14; var top = [];
      for (var i = 0; i < seg; i++) {
        var a0 = i / seg * 2 * Math.PI, a1 = (i + 1) / seg * 2 * Math.PI;
        var p0 = [x + Math.sin(a0) * r, 0, z + Math.cos(a0) * r], p1 = [x + Math.sin(a1) * r, 0, z + Math.cos(a1) * r];
        quad(g, [p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y0 + h, p1[2]], [p0[0], y0 + h, p0[2]]);
        top.push([p0[0], y0 + h, p0[2]]);
      }
      faces.push({ g: g, p: top, n: [0, 1, 0] });
    }
    function dome(g, x, z, r, y0, seg, rings) {
      y0 = y0 || 0; seg = seg || 14; rings = rings || 4;
      for (var j = 0; j < rings; j++) {
        var t0 = j / rings * Math.PI / 2, t1 = (j + 1) / rings * Math.PI / 2;
        for (var i = 0; i < seg; i++) {
          var a0 = i / seg * 2 * Math.PI, a1 = (i + 1) / seg * 2 * Math.PI;
          var P = function (a, t) { return [x + Math.sin(a) * Math.cos(t) * r, y0 + Math.sin(t) * r, z + Math.cos(a) * Math.cos(t) * r]; };
          quad(g, P(a0, t0), P(a1, t0), P(a1, t1), P(a0, t1));
        }
      }
    }
    // 0 mining station
    box(0, -6.4, 3.2, 3.2, 1.2, 2.2); box(0, -6.4, 3.2, 1.4, 0.6, 1.2, 1.2); box(0, -8.6, 5.4, 1.3, 0.6, 0.8); box(0, -4.6, 6.2, 1.3, 0.6, 0.8); box(0, -7.2, 6.6, 1.3, 0.6, 0.8);
    // 1 processing unit
    box(1, 0, 0.2, 4.4, 1.7, 3.2); cyl(1, 1.3, -0.5, 0.75, 1.9, 1.7); cyl(1, -1.1, 0.6, 0.55, 1.2, 1.7); box(1, 0, 2.4, 2, 0.7, 1.2);
    // 2 robotics
    box(2, 5.8, 4.6, 2.6, 0.9, 1.8); box(2, 5.8, 4.6, 0.3, 1.6, 0.3, 0.9); box(2, 6.5, 4.6, 1.5, 0.22, 0.3, 2.3); box(2, 7.6, 6.6, 1, 0.5, 0.7); box(2, 4, 6.8, 1, 0.5, 0.7);
    // 3 energy
    [[-7.4, -4.2], [-5.4, -4.2], [-3.4, -4.2], [-7.4, -6.4], [-5.4, -6.4], [-3.4, -6.4]].forEach(function (p) {
      box(3, p[0], p[1], 0.14, 0.9, 0.14); box(3, p[0], p[1], 1.7, 0.1, 1.4, 0.9);
    });
    // 4 research lab
    dome(4, 5.2, -4.4, 1.7); dome(4, 7.6, -5.8, 1.15); box(4, 6.5, -5.1, 1.4, 0.6, 0.6);
    // 5 storage
    [-1.4, 0.5, 2.4].forEach(function (x) { cyl(5, x, -7, 0.8, 2.1); dome(5, x, -7, 0.8, 2.1, 14, 3); });
    anchors = [[-6.4, 2.6, 3.2], [0, 4.4, 0.2], [5.8, 3.2, 4.6], [-5.4, 1.9, -5.3], [5.6, 2.6, -4.6], [0.5, 3.7, -7]];
    links = [[-4.8, 3.2, -2.2, 1], [4.5, 4.4, 2.2, 1.4], [-4.4, -4.4, -2.2, -1], [4, -3.6, 2.2, -1], [0.5, -6, 0.3, -1.4]];
    var L = (function () { var v = [-0.55, 0.72, 0.42], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
    faces.forEach(function (f) { f.lit = 0.22 + 0.78 * Math.max(0, f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2]); });

    var markers = INFO.map(function (inf, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mk'; b.textContent = i + 1;
      b.setAttribute('aria-label', inf[0]); b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { select(i, true); });
      mkBox.appendChild(b); return b;
    });
    var W = 0, H = 0, dpr = 1, yaw = 0.62, pitch = 0.56, yawT = null, sel = 0, auto = true, onScreen = false, raf = null, last = 0, dirty = true, drag = null;
    function size() {
      var r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); dirty = true; wake();
    }
    function proj(p, cy, sy, cp, sp, s, ox, oy) {
      var x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy;
      return [ox + x * s, oy - (p[1] * cp - z * sp) * s, p[1] * sp + z * cp];
    }
    function shade(l, hot) {
      var r = 18 + 80 * l, g = 22 + 84 * l, b = 28 + 90 * l;
      if (hot) { r = r * 0.55 + 255 * 0.45 * (0.5 + l * 0.5); g = g * 0.6 + 203 * 0.4 * (0.5 + l * 0.5); b = b * 0.6 + 46 * 0.4 * (0.5 + l * 0.5); }
      return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    }
    function render() {
      dirty = false;
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var narrow = W < 700, s = Math.min(W / (narrow ? 22 : 30), H / 15), ox = W * (narrow ? 0.5 : 0.42), oy = H * 0.6;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      // ground rings and spokes
      ctx.strokeStyle = 'rgba(217,221,225,.09)';
      [3.5, 7, 10.5, 14].forEach(function (r) {
        ctx.beginPath();
        for (var i = 0; i <= 48; i++) { var a = i / 48 * 2 * Math.PI, q = proj([Math.sin(a) * r, 0, Math.cos(a) * r], cy, sy, cp, sp, s, ox, oy); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
        ctx.stroke();
      });
      for (var k = 0; k < 12; k++) {
        var a = k / 12 * 2 * Math.PI, q0 = proj([Math.sin(a) * 3.5, 0, Math.cos(a) * 3.5], cy, sy, cp, sp, s, ox, oy), q1 = proj([Math.sin(a) * 14, 0, Math.cos(a) * 14], cy, sy, cp, sp, s, ox, oy);
        ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
      }
      // service lines
      ctx.strokeStyle = 'rgba(121,191,255,.55)'; ctx.setLineDash([5, 6]);
      links.forEach(function (l) {
        var q0 = proj([l[0], 0.02, l[1]], cy, sy, cp, sp, s, ox, oy), q1 = proj([l[2], 0.02, l[3]], cy, sy, cp, sp, s, ox, oy);
        ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
      });
      ctx.setLineDash([]);
      // solids
      var vis = [];
      for (var i = 0; i < faces.length; i++) {
        var f = faces[i], n = f.n;
        var nz = -n[0] * sy + n[2] * cy;
        if (n[1] * sp + nz * cp <= 0.001) continue;
        var pts = [], d = 0;
        for (var j = 0; j < f.p.length; j++) { var q = proj(f.p[j], cy, sy, cp, sp, s, ox, oy); pts.push(q); d += q[2]; }
        vis.push({ f: f, pts: pts, d: d / f.p.length });
      }
      vis.sort(function (a, b) { return a.d - b.d; });
      for (i = 0; i < vis.length; i++) {
        var v = vis[i], hot = v.f.g === sel;
        ctx.beginPath(); ctx.moveTo(v.pts[0][0], v.pts[0][1]);
        for (j = 1; j < v.pts.length; j++) ctx.lineTo(v.pts[j][0], v.pts[j][1]);
        ctx.closePath();
        ctx.fillStyle = shade(v.f.lit, hot); ctx.fill();
        ctx.strokeStyle = hot ? 'rgba(255,217,92,.9)' : 'rgba(217,221,225,.3)'; ctx.stroke();
      }
      // markers follow their objects
      anchors.forEach(function (a, i) {
        var q = proj(a, cy, sy, cp, sp, s, ox, oy);
        markers[i].style.transform = 'translate(' + Math.round(q[0]) + 'px,' + Math.round(q[1]) + 'px)';
        markers[i].style.zIndex = String(100 + Math.round(q[2] * 3));
      });
    }
    function loop(now) {
      var dt = Math.min(100, now - (last || now)); last = now;
      var moving = false;
      if (yawT !== null) {
        var diff = Math.atan2(Math.sin(yawT - yaw), Math.cos(yawT - yaw));
        if (Math.abs(diff) < 0.002) { yaw = yawT; yawT = null; } else { yaw += diff * (1 - Math.pow(1 - 0.12, dt / 16.667)); moving = true; }
        dirty = true;
      } else if (auto && onScreen && !noMotion() && !drag) { yaw += dt * 0.00009; dirty = true; moving = true; }
      if (dirty) render();
      if (moving || drag) raf = requestAnimationFrame(loop); else { raf = null; last = 0; }
    }
    function wake() { if (raf === null) raf = requestAnimationFrame(loop); }
    var card = $('#base-card');
    function select(i, turn) {
      sel = i; auto = false;
      markers.forEach(function (m, n) { m.setAttribute('aria-pressed', n === i ? 'true' : 'false'); });
      swapCard(card, function () {
        $('#base-n').textContent = '0' + (i + 1) + ' / 06';
        $('#base-title').textContent = INFO[i][0];
        $('#base-text').textContent = INFO[i][1];
        $('#base-spec').innerHTML = INFO[i][2].map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
      });
      if (turn) {
        var a = anchors[i], t = -Math.atan2(a[0], a[2]) + 0.5;
        if (noMotion()) { yaw = t; yawT = null; } else yawT = t;
      }
      dirty = true; wake();
    }
    cv.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch, moved: 0 };
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      stageEl.classList.add('drag'); auto = false; yawT = null; wake();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      yaw = drag.yaw + dx * 0.008;
      pitch = clamp(drag.pitch + dy * 0.004, 0.3, 1.15);
      dirty = true;
    });
    function end(e) {
      if (!drag) return;
      var moved = drag.moved; drag = null; stageEl.classList.remove('drag');
      if (moved < 6 && e && e.type === 'pointerup') {
        var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = -1, bd = 70;
        markers.forEach(function (m, i) {
          var t = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(m.style.transform); if (!t) return;
          var d = Math.hypot(mx - t[1], my - (+t[2] + 30)); if (d < bd) { bd = d; best = i; }
        });
        if (best >= 0) select(best, false);
      }
    }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    stageEl.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { auto = false; yawT = null; yaw += e.key === 'ArrowLeft' ? -0.2 : 0.2; dirty = true; wake(); }
    });
    new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; if (onScreen) wake(); }).observe(stageEl);
    if (window.ResizeObserver) new ResizeObserver(size).observe(cv); else addEventListener('resize', size);
    size();
  }

  /* 05: Lunar Atlas (canvas globe, procedural relief, real coordinates) */
  whenNear($('#globe-wrap'), function () {
    var wrap = $('#globe-wrap'), cv = $('#globe'), ctx = cv.getContext('2d');
    if (!ctx) return;
    var LAYERS = {
      terrain: { tag: 'Рельеф', items: [
        { n: 'Кратер Шеклтон', lat: -89.9, lon: 0, z: 2.4, t: 'Кратер диаметром 21 км у самого южного полюса. На его дно не попадает солнечный свет.' },
        { n: 'Массив Малаперт', lat: -86, lon: 0, z: 2.4, t: 'Гора высотой около пяти километров. С вершины всегда видна Земля, это удобно для связи.' },
        { n: 'Кратер Тихо', lat: -43.3, lon: -11.4, t: 'Кратер диаметром 85 км. От него расходятся светлые лучи длиной до 1500 км.' },
        { n: 'Кратер Коперник', lat: 9.6, lon: -20.1, t: 'Кратер диаметром 93 км с террасами на склонах.' },
        { n: 'Море Спокойствия', lat: 8.5, lon: 31.4, t: 'Базальтовая равнина. Здесь сел «Аполлон-11».' },
        { n: 'Океан Бурь', lat: 18.4, lon: -57.4, t: 'Самая большая тёмная равнина видимой стороны.' },
        { n: 'Море Дождей', lat: 32.8, lon: -15.6, t: 'Ударный бассейн диаметром около 1100 км, залитый застывшей лавой.' }
      ] },
      resources: { tag: 'Ресурсы', items: [
        { n: 'Море Спокойствия', lat: 8.5, lon: 31.4, r: 11, k: 'Факт', t: 'Базальты с высоким содержанием титана. В образцах «Аполлона-11», взятых здесь, гелия-3 больше, чем в остальных.' },
        { n: 'Море Ясности', lat: 28, lon: 17.5, r: 9, k: 'Факт', t: 'Титановые базальты на востоке моря. Здесь в 1972 году работал экипаж «Аполлона-17».' },
        { n: 'Океан Бурь', lat: 18.4, lon: -57.4, r: 17, k: 'Оценка', t: 'Титана много на большой площади, это видно на снимках зонда «Клементина». Сколько здесь гелия-3, покажут пробы.' },
        { n: 'Полярные холодные ловушки', lat: -88, lon: 30, r: 6, z: 2.2, k: 'Гипотеза', t: 'В холодном грунте гелий-3 может удерживаться лучше. Это предположение проверят буровые пробы.' }
      ] },
      operations: { tag: 'Операции', items: [
        { n: 'Участок разведки А-1', lat: -88.6, lon: -80, z: 2.4, k: 'Проект', t: 'Вал кратера де Жерлаш. Первые буровые пробы до двух метров.' },
        { n: 'Трасса ровера', lat: -87.8, lon: -60, z: 2.4, k: 'Проект', t: 'Путь длиной около 120 км между комплексом и ретранслятором на Малаперте.', route: [[-89.45, -137], [-88.9, -100], [-88.2, -60], [-87.2, -25], [-86, 0]] },
        { n: 'Орбитальный картограф HELION-1', lat: -40, lon: 30, k: 'Проект', t: 'Полярная орбита высотой 100 км. Один виток занимает около двух часов.', orbit: 30 }
      ] },
      infrastructure: { tag: 'Инфраструктура', items: [
        { n: 'Опытный комплекс HELION', lat: -89.45, lon: -137, z: 2.3, k: 'Проект', t: 'Гребень между кратерами Шеклтон и де Жерлаш. Здесь будут стоять печи и хранилище.' },
        { n: 'Посадочная площадка', lat: -89.1, lon: -120, z: 2.3, k: 'Проект', t: 'Ровная площадка в двух километрах от комплекса, чтобы пыль от двигателей не долетала до оборудования.' },
        { n: 'Солнечное поле', lat: -89.7, lon: -160, z: 2.3, k: 'Проект', t: 'Гребень, освещённый почти круглый год.' },
        { n: 'Ретранслятор «Малаперт»', lat: -86, lon: 0, z: 2.4, k: 'Проект', t: 'С горы Малаперт видно и Землю, и комплекс.' }
      ] }
    };
    // procedural equirectangular relief, built once
    var TW = 1024, TH = 512, tex = (function () {
      var c = document.createElement('canvas'); c.width = TW; c.height = TH;
      var g = c.getContext('2d'), rand = rng(20261114);
      g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, TW, TH);
      function blob(x, y, rx, ry, col0, col1) {
        [-TW, 0, TW].forEach(function (off) {
          if (x + off + rx < 0 || x + off - rx > TW) return;
          g.save(); g.translate(x + off, y); g.scale(rx, ry);
          var gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, col0); gr.addColorStop(1, col1);
          g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 6.2832); g.fill(); g.restore();
        });
      }
      var X = function (lon) { return (lon / 360 + 0.5) * TW; }, Y = function (lat) { return (0.5 - lat / 180) * TH; };
      for (var i = 0; i < 700; i++) {
        var lat = Math.asin(2 * rand() - 1) / DEG, st = Math.min(5, 1 / Math.cos(lat * DEG)), r = 8 + rand() * 46, dk = rand() < 0.5;
        blob(rand() * TW, Y(lat), r * st, r, dk ? 'rgba(60,60,62,.16)' : 'rgba(205,205,205,.14)', dk ? 'rgba(60,60,62,0)' : 'rgba(205,205,205,0)');
      }
      [[-16, 33, 19], [17.5, 28, 11], [31, 8.5, 13], [-57, 18, 20], [-48, 30, 13], [-62, 4, 12], [-17, -21, 11], [-39, -24, 7], [59, 17, 8], [51, -8, 10], [35, -15, 6], [-5, 56, 9], [18, 56, 8], [-30, 52, 7], [-23, 9, 8]].forEach(function (m) {
        var st = 1 / Math.cos(m[1] * DEG), r = m[2] / 180 * TH;
        blob(X(m[0]), Y(m[1]), r * st * 1.15, r, 'rgba(38,40,46,.82)', 'rgba(38,40,46,0)');
        blob(X(m[0]) + r * 0.3, Y(m[1]) + r * 0.2, r * st * 0.7, r * 0.6, 'rgba(38,40,46,.5)', 'rgba(38,40,46,0)');
      });
      for (i = 0; i < 2400; i++) {
        lat = Math.asin(2 * rand() - 1) / DEG; st = Math.min(6, 1 / Math.cos(lat * DEG));
        r = 0.9 + Math.pow(rand(), 5) * 13; var x = rand() * TW, y = Y(lat);
        [-TW, 0, TW].forEach(function (off) {
          if (x + off + r * st < 0 || x + off - r * st > TW) return;
          g.save(); g.translate(x + off, y); g.scale(st, 1);
          g.fillStyle = 'rgba(40,40,44,.2)'; g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
          g.lineWidth = Math.max(0.6, r * 0.14);
          g.strokeStyle = 'rgba(235,235,235,.3)'; g.beginPath(); g.arc(0, 0, r, 0.5, 2.5); g.stroke();
          g.strokeStyle = 'rgba(20,20,24,.38)'; g.beginPath(); g.arc(0, 0, r * 0.84, 3.6, 5.7); g.stroke();
          g.restore();
        });
      }
      [[-11.4, -43.3, 34], [-20.1, 9.6, 22], [-47.4, 23.7, 14]].forEach(function (c2) {
        var cx = X(c2[0]), cyy = Y(c2[1]);
        g.strokeStyle = 'rgba(240,240,240,.13)'; g.lineWidth = 1.6;
        for (var k = 0; k < 16; k++) { var a = k / 16 * 6.2832 + rand(), len = c2[2] * (1.2 + rand() * 2.4); g.beginPath(); g.moveTo(cx, cyy); g.lineTo(cx + Math.cos(a) * len * 1.2, cyy + Math.sin(a) * len); g.stroke(); }
        blob(cx, cyy, 7, 6, 'rgba(250,250,250,.85)', 'rgba(250,250,250,0)');
      });
      var d = g.getImageData(0, 0, TW, TH).data, out = new Uint8Array(TW * TH);
      for (i = 0; i < out.length; i++) out[i] = clamp(d[i * 4] + (rand() - 0.5) * 22, 0, 255);
      return out;
    })();

    // south polar cap drawn in its own flat projection, so the pole stays sharp; crater positions are real
    var CS = 512, capS = (function () {
      var c = document.createElement('canvas'); c.width = c.height = CS;
      var g = c.getContext('2d'), rand = rng(8990), H2 = CS / 2, PX = H2 / 20;
      g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, CS, CS);
      var i, x, y, r, gr;
      for (i = 0; i < 260; i++) {
        x = rand() * CS; y = rand() * CS; r = 10 + rand() * 50; var dk = rand() < 0.55;
        gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, dk ? 'rgba(50,50,54,.2)' : 'rgba(210,210,210,.16)'); gr.addColorStop(1, dk ? 'rgba(50,50,54,0)' : 'rgba(210,210,210,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
      function crater(x, y, r, shade) {
        g.fillStyle = 'rgba(14,14,18,' + shade + ')'; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
        g.lineWidth = Math.max(0.7, r * 0.12);
        g.strokeStyle = 'rgba(238,238,238,.42)'; g.beginPath(); g.arc(x, y, r, 3.5, 5.9); g.stroke();
        g.strokeStyle = 'rgba(10,10,14,.45)'; g.beginPath(); g.arc(x, y, r * 1.04, 0.4, 2.7); g.stroke();
      }
      for (i = 0; i < 520; i++) crater(rand() * CS, rand() * CS, 0.8 + Math.pow(rand(), 5) * 12, 0.16 + rand() * 0.2);
      [[-89.9, 0, 21], [-88.5, -87, 32], [-88.1, 44.9, 51], [-87.3, 77, 39], [-87.4, -5, 51], [-85.2, 53.5, 73], [-84.9, -35.5, 98], [-84.5, 82.8, 101], [-84.9, 12.9, 69], [-82.1, 48.5, 103], [-79.3, -84.9, 149], [-81.4, 160, 92], [-83.6, -155, 60], [-86.5, 170, 44], [-77.5, 115, 120]].forEach(function (k) {
        var rho = (k[0] + 90) * PX, l = k[1] * DEG;
        crater(H2 + rho * Math.sin(l), H2 - rho * Math.cos(l), Math.max(2.2, k[2] / 30.3 / 2 * PX), 0.78);
      });
      var d = g.getImageData(0, 0, CS, CS).data, out = new Uint8Array(CS * CS);
      for (i = 0; i < out.length; i++) out[i] = clamp(d[i * 4] + (rand() - 0.5) * 20, 0, 255);
      return out;
    })();
    var CAP0 = -70 * DEG, CAP1 = -75 * DEG;

    var S = 0, css = 0, img = null, buf = null;
    var lon = 8, lat = -32, zoom = 1, lonT = lon, latT = lat, zoomT = 1;
    var layer = 'terrain', sel = -1, hover = -1, auto = true, onScreen = false, raf = null, last = 0, dirty = true, drag = null;
    var read = $('#globe-read'), lastRead = '', lastReadAt = 0;
    function size() {
      css = cv.getBoundingClientRect().width;
      var px = Math.round(Math.min(css * Math.min(2, devicePixelRatio || 1), 620));
      if (px === S || px < 10) return;
      S = px; cv.width = cv.height = S; img = ctx.createImageData(S, S); buf = img.data; dirty = true; wake();
    }
    function project(la, lo) {
      var dl = (lo - lon) * DEG, f = la * DEG, f0 = lat * DEG;
      var x1 = Math.cos(f) * Math.sin(dl), y1 = Math.sin(f), z1 = Math.cos(f) * Math.cos(dl);
      var y = y1 * Math.cos(f0) - z1 * Math.sin(f0), z = y1 * Math.sin(f0) + z1 * Math.cos(f0);
      var R = S * 0.45 * zoom;
      return [S / 2 + x1 * R, S / 2 - y * R, z];
    }
    function line(pts, close) {
      var pen = false;
      ctx.beginPath();
      pts.forEach(function (p) { var q = project(p[0], p[1]); if (q[2] > 0.02) { if (pen) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); pen = true; } else pen = false; });
      if (close) ctx.closePath();
    }
    function ringAround(la, lo, r) {
      var pts = [], f = la * DEG, l0 = lo * DEG, d = r * DEG;
      for (var i = 0; i <= 40; i++) {
        var b = i / 40 * 2 * Math.PI;
        var f2 = Math.asin(Math.sin(f) * Math.cos(d) + Math.cos(f) * Math.sin(d) * Math.cos(b));
        var l2 = l0 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f), Math.cos(d) - Math.sin(f) * Math.sin(f2));
        pts.push([f2 / DEG, l2 / DEG]);
      }
      return pts;
    }
    function render() {
      dirty = false;
      var R = S * 0.45 * zoom, c = S / 2, f0 = lat * DEG, cf = Math.cos(f0), sf = Math.sin(f0), l0 = lon * DEG;
      var Lx = -0.48, Ly = 0.36, Lz = 0.8, i = 0, TWO = 2 * Math.PI;
      for (var py = 0; py < S; py++) {
        var y = (c - py - 0.5) / R, yy = y * y;
        for (var px = 0; px < S; px++, i += 4) {
          var x = (px + 0.5 - c) / R, d = x * x + yy;
          if (d >= 1) { buf[i + 3] = 0; continue; }
          var z = Math.sqrt(1 - d);
          var y1 = y * cf + z * sf, z1 = -y * sf + z * cf;
          var lo = l0 + Math.atan2(x, z1), la = Math.asin(y1 > 1 ? 1 : y1 < -1 ? -1 : y1);
          var u = (lo / TWO + 0.5) % 1; if (u < 0) u += 1;
          var tx = (u * TW) | 0, ty = ((0.5 - la / Math.PI) * TH) | 0; if (ty >= TH) ty = TH - 1;
          var lum = tex[ty * TW + tx];
          if (la < CAP0) {
            var rho = (la / DEG + 90) / 20 * (CS / 2 - 1);
            var lc = capS[((CS / 2 - rho * Math.cos(lo)) | 0) * CS + ((CS / 2 + rho * Math.sin(lo)) | 0)];
            if (la < CAP1) lum = lc; else { var wq = (CAP0 - la) / (CAP0 - CAP1); lum = lum * (1 - wq) + lc * wq; }
          }
          var sh = (0.2 + 0.8 * Math.max(0, x * Lx + y * Ly + z * Lz)) * (0.72 + 0.28 * z);
          var edge = d > 0.96 ? 1 - (d - 0.96) * 14 : 1;
          var v = lum * sh * 1.25;
          buf[i] = v * 0.97; buf[i + 1] = v; buf[i + 2] = v * 1.06; buf[i + 3] = 255 * edge;
        }
      }
      ctx.putImageData(img, 0, 0);
      var px1 = S / css;
      ctx.lineWidth = px1;
      ctx.strokeStyle = 'rgba(121,191,255,.13)';
      for (var g = -60; g <= 60; g += 30) { var pts = []; for (var a = -180; a <= 180; a += 6) pts.push([g, a]); line(pts); ctx.stroke(); }
      for (g = -180; g < 180; g += 30) { pts = []; for (a = -84; a <= 84; a += 6) pts.push([a, g]); line(pts); ctx.stroke(); }
      var items = LAYERS[layer].items, accent = layer === 'terrain' ? '217,221,225' : layer === 'resources' ? '255,203,46' : '121,191,255';
      items.forEach(function (it, n) {
        if (it.r) { line(ringAround(it.lat, it.lon, it.r), true); ctx.fillStyle = 'rgba(255,203,46,' + (n === sel ? 0.42 : 0.24) + ')'; ctx.fill(); ctx.strokeStyle = 'rgba(255,131,85,.85)'; ctx.stroke(); }
        if (it.route) { ctx.setLineDash([5 * px1, 4 * px1]); line(it.route); ctx.strokeStyle = 'rgba(121,191,255,.95)'; ctx.lineWidth = 1.6 * px1; ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = px1; }
        if (it.orbit !== undefined) {
          pts = []; for (a = -90; a <= 90; a += 4) pts.push([a, it.orbit]); for (a = 90; a >= -90; a -= 4) pts.push([a, it.orbit + 180]);
          ctx.setLineDash([2 * px1, 5 * px1]); line(pts); ctx.strokeStyle = 'rgba(121,191,255,.8)'; ctx.stroke(); ctx.setLineDash([]);
        }
      });
      ctx.font = '500 ' + Math.round(11 * px1) + 'px "Inter",sans-serif'; ctx.textBaseline = 'middle';
      items.forEach(function (it, n) {
        var q = project(it.lat, it.lon); it._q = q;
        if (q[2] <= 0.05) return;
        var on = n === sel || n === hover, r = (on ? 6 : 4) * px1;
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.2832);
        ctx.fillStyle = n === sel ? '#FFCB2E' : 'rgba(8,10,13,.85)'; ctx.fill();
        ctx.strokeStyle = n === sel ? '#FFCB2E' : 'rgba(' + accent + ',1)'; ctx.lineWidth = 1.5 * px1; ctx.stroke();
        if (on) {
          ctx.beginPath(); ctx.arc(q[0], q[1], 12 * px1, 0, 6.2832); ctx.strokeStyle = 'rgba(255,203,46,.6)'; ctx.lineWidth = px1; ctx.stroke();
          var w = ctx.measureText(it.n).width, lx = q[0] + 18 * px1, flip = lx + w + 14 * px1 > S;
          if (flip) lx = q[0] - 18 * px1 - w;
          ctx.fillStyle = 'rgba(8,10,13,.82)'; ctx.fillRect(lx - 6 * px1, q[1] - 11 * px1, w + 12 * px1, 22 * px1);
          ctx.fillStyle = '#F5F6F7'; ctx.fillText(it.n, lx, q[1] + px1);
        }
        ctx.lineWidth = px1;
      });
    }
    function fmt(v, pos, neg) { return Math.abs(v).toFixed(1).replace('.', ',') + '° ' + (v >= 0 ? pos : neg); }
    function loop(now) {
      var dt = Math.min(100, now - (last || now)); last = now;
      var e = 1 - Math.pow(1 - 0.1, dt / 16.667), moving = false;
      if (auto && onScreen && !noMotion() && !drag) { lonT += dt * 0.0022; moving = true; }
      var dl = lonT - lon, dla = latT - lat, dz = zoomT - zoom;
      if (Math.abs(dl) > 0.02 || Math.abs(dla) > 0.02 || Math.abs(dz) > 0.002) {
        if (noMotion()) { lon = lonT; lat = latT; zoom = zoomT; } else { lon += dl * e; lat += dla * e; zoom += dz * e; moving = true; }
        dirty = true;
      }
      if (dirty && S) {
        render();
        var l = ((lon + 180) % 360 + 360) % 360 - 180, txt = fmt(lat, 'с. ш.', 'ю. ш.') + ' / ' + fmt(l, 'в. д.', 'з. д.');
        if (now - lastReadAt > 100 && txt !== lastRead) { lastRead = txt; lastReadAt = now; read.textContent = txt; }
      }
      if (moving || drag) raf = requestAnimationFrame(loop); else { raf = null; last = 0; }
    }
    function wake() { if (raf === null) raf = requestAnimationFrame(loop); }

    var listEl = $('#sites'), card = $('#site-card'), siteBtns = [];
    function fillList() {
      listEl.innerHTML = ''; siteBtns = [];
      LAYERS[layer].items.forEach(function (it, n) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'site'; b.setAttribute('aria-pressed', 'false');
        b.textContent = it.n;
        b.addEventListener('click', function () { select(n, true); });
        listEl.appendChild(b); siteBtns.push(b);
      });
    }
    function select(n, fly) {
      sel = n; auto = false;
      var it = LAYERS[layer].items[n];
      siteBtns.forEach(function (b, i) { b.setAttribute('aria-pressed', i === n ? 'true' : 'false'); });
      swapCard(card, function () {
        $('#site-title').textContent = it.n;
        $('#site-text').textContent = it.t;
        $('#site-coords').textContent = fmt(it.lat, 'с. ш.', 'ю. ш.') + ' / ' + fmt(it.lon, 'в. д.', 'з. д.');
      });
      if (fly) {
        var d = ((it.lon - lon + 540) % 360) - 180;
        lonT = lon + d; latT = clamp(it.lat * 0.86, -78, 78); zoomT = it.z || 1.5;
      }
      dirty = true; wake();
    }
    $$('.layer').forEach(function (b) {
      b.addEventListener('click', function () {
        layer = b.dataset.layer; sel = -1; hover = -1;
        $$('.layer').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        fillList(); select(0, true);
      });
    });
    function hit(e) {
      var r = cv.getBoundingClientRect(), k = S / r.width, mx = (e.clientX - r.left) * k, my = (e.clientY - r.top) * k, best = -1, bd = 16 * k;
      LAYERS[layer].items.forEach(function (it, n) { var q = it._q; if (!q || q[2] <= 0.05) return; var d = Math.hypot(mx - q[0], my - q[1]); if (d < bd) { bd = d; best = n; } });
      return best;
    }
    cv.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      drag = { x: e.clientX, y: e.clientY, lon: lon, lat: lat, moved: 0 };
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      wrap.classList.add('drag'); auto = false; lonT = lon; latT = lat; wake();
    });
    cv.addEventListener('pointermove', function (e) {
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = 0.32 / zoom;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        lon = lonT = drag.lon - dx * k; lat = latT = clamp(drag.lat + dy * k, -89, 89); dirty = true;
      } else {
        var h = hit(e);
        if (h !== hover) { hover = h; cv.style.cursor = h >= 0 ? 'pointer' : ''; dirty = true; wake(); }
      }
    });
    function end(e) {
      if (!drag) return;
      var moved = drag.moved; drag = null; wrap.classList.remove('drag');
      if (moved < 6 && e.type === 'pointerup') { var h = hit(e); if (h >= 0) select(h, false); }
    }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; dirty = true; wake(); } });
    $('#zoom-in').addEventListener('click', function () { auto = false; zoomT = clamp(zoomT * 1.4, 1, 3.4); wake(); });
    $('#zoom-out').addEventListener('click', function () { auto = false; zoomT = clamp(zoomT / 1.4, 1, 3.4); wake(); });
    cv.addEventListener('dblclick', function () { auto = false; zoomT = zoomT > 2.4 ? 1 : clamp(zoomT * 1.6, 1, 3.4); wake(); });
    new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; if (onScreen) wake(); }).observe(wrap);
    if (window.ResizeObserver) new ResizeObserver(size).observe(cv); else addEventListener('resize', size);
    fillList(); size();
  });

  /* Scanner reticle */
  (function () {
    var el = $('#reticle');
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var tx = 0, ty = 0, x = 0, y = 0, raf = null, last = 0, seen = false, hot = false;
    var HOT = 'a,button,summary,canvas,input,select,textarea,.hit,.st';
    function loop(now) {
      var dt = Math.min(100, now - (last || now)); last = now;
      var e = 1 - Math.pow(1 - 0.28, dt / 16.667);
      x += (tx - x) * e; y += (ty - y) * e;
      if (Math.abs(tx - x) < 0.2 && Math.abs(ty - y) < 0.2) { x = tx; y = ty; raf = null; last = 0; } else raf = requestAnimationFrame(loop);
      el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    }
    addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if (!seen) { seen = true; x = tx; y = ty; el.classList.add('on'); }
      var h = !!(e.target.closest && e.target.closest(HOT));
      if (h !== hot) { hot = h; el.classList.toggle('hot', h); }
      if (raf === null && !noMotion()) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener('pointerleave', function () { seen = false; el.classList.remove('on'); });
  })();

  /* Station ambience (off until asked) */
  (function () {
    var btn = $('#sound-btn'), ac = null, master = null, on = false;
    function build() {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ac = new AC(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
      var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.connect(master);
      [55, 55.6, 82.4].forEach(function (f, i) {
        var o = ac.createOscillator(), g = ac.createGain(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f; g.gain.value = i === 2 ? 0.25 : 0.16;
        o.connect(g); g.connect(lp); o.start();
      });
      var len = ac.sampleRate * 2, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0), r = rng(7);
      for (var i = 0; i < len; i++) d[i] = r() * 2 - 1;
      var n = ac.createBufferSource(); n.buffer = b; n.loop = true;
      var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
      var ng = ac.createGain(); ng.gain.value = 0.05; n.connect(bp); bp.connect(ng); ng.connect(master); n.start();
      return true;
    }
    btn.addEventListener('click', function () {
      if (!ac && !build()) return;
      on = !on; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) ac.resume();
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(on ? 0.22 : 0, ac.currentTime, 0.5);
    });
    document.addEventListener('visibilitychange', function () { if (ac && on) { if (document.hidden) ac.suspend(); else ac.resume(); } });
  })();

  /* Contact form: demo success state, nothing is sent */
  (function () {
    var form = $('#form'), interest = $('#f-int');
    $$('[data-interest]').forEach(function (a) {
      a.addEventListener('click', function () { interest.value = a.dataset.interest; });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#f-name'), mail = $('#f-mail'), bad = null;
      var okName = name.value.trim().length > 0, okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.value.trim());
      name.parentNode.classList.toggle('bad', !okName); mail.parentNode.classList.toggle('bad', !okMail);
      name.setAttribute('aria-invalid', okName ? 'false' : 'true'); mail.setAttribute('aria-invalid', okMail ? 'false' : 'true');
      if (!okName) bad = name; else if (!okMail) bad = mail;
      if (bad) { bad.focus(); return; }
      form.classList.add('sent');
      $$('input,select,textarea,button', form).forEach(function (el) { el.disabled = true; });
      setTimeout(function () { $('#form-ok').focus(); }, 80);
    });
  })();

  /* Go */
  modeFns.push(applyHeroMode);
  measureHero();
  applyHeroMode();
})();
