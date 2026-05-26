/* Shared, data-driven interface runtime for the p5 sketch site.
 *
 * Classic script (no modules): exposes a single global `SketchUI`. Each sketch
 * loads sketch.js (globals + setters + encodeSettings/applySettingsFromHash),
 * then this file, then a per-sketch config.js that builds a CONFIG object and
 * calls SketchUI.init(CONFIG). The runtime builds the HUD + controls panel DOM
 * from the config and wires every behaviour: slider drag, auto-cycle, trim
 * handles, glassy tips, share links and PNG export.
 *
 * sketch.js owns the share-link *settings* half (encodeSettings /
 * applySettingsFromHash); the runtime only appends the `sp_*` auto-cycle speed
 * params, so existing share links stay byte-compatible. sketch.js reads
 * `_sliderSpeeds` by bare name (rotating-sphere's _noteManual), so we publish it
 * on window before any setup() runs.
 *
 * Bespoke features are opt-in via config keys — a sketch that omits `trim`,
 * `modeToggle`, `canvasDrag`, `panelButtons` or `panelFooter` instantiates none
 * of that code path.
 */
(function () {
  'use strict';

  let CFG = null;
  const byId = {};            // slider id -> slider config

  // ── auto-cycle + shared state ──────────────────────────────────────────────
  const _sliderSpeeds     = {};
  const _sliderLastSpeeds = {};
  const _sliderBounceDir  = {};
  const _cyclePos         = {};
  const _oscBounds        = {};   // slider id -> {lo,hi}; only trim sliders
  let   _draggingSliderId = null;
  // True while a pointer is down on the HUD/controls UI. Sketches that own a
  // canvas interaction (e.g. fluid's mouse-push) read this to pause it while the
  // user is working a slider or button. Published on window.SketchUI as
  // controlsBusy().
  let   _uiPointerActive  = false;
  // True during a canvas drag. The drag dispatches `input` on its target
  // slider(s), so we suppress the per-slider tips those would trigger and show
  // the interaction's own tip instead (a 2D drag moves two sliders at once).
  let   _canvasDragActive = false;

  let tipsEnabled   = true;
  let _suppressTips = false;
  let _tipTimer     = null;
  let _toastTimer   = null;
  let _revealTimer  = null;

  // sketch.js references this by bare name — publish before setup() runs.
  window._sliderSpeeds = _sliderSpeeds;

  // ── id helpers (match the original element naming) ─────────────────────────
  const prefixOf    = id => id.replace('-slider', '');
  const valId       = id => prefixOf(id) + '-val';
  const speedId     = id => id + '-speed';
  const speedValId  = id => id + '-speed-val';
  const playId      = id => id + '-play-btn';

  const decimalsFromStep = step => {
    const s = parseFloat(step) || 0;
    return (s > 0 && s < 1) ? Math.min(6, Math.ceil(-Math.log10(s))) : 0;
  };
  const fmtDefault = (pos, step) => {
    const dec = decimalsFromStep(step);
    return dec > 0 ? pos.toFixed(dec) : String(Math.round(pos));
  };
  const _snap = (v, min, step) => (step > 0 ? min + Math.round((v - min) / step) * step : v);

  function storageKey(suffix) { return CFG.storagePrefix + '-' + suffix; }
  function modeToggle() {
    for (const sec of CFG.sections) if (sec.modeToggle) return sec.modeToggle;
    return null;
  }

  // ── public entry ───────────────────────────────────────────────────────────
  function init(config) {
    CFG = config;
    for (const s of CFG.sliders) byId[s.id] = s;
    // Defer DOM build + hydration to load so p5's preload()/setup() (which runs
    // applySettingsFromHash) has populated the globals first.
    window.addEventListener('load', boot);
  }

  let _booted = false;
  function boot() {
    if (_booted) return;   // load can fire more than once; build the UI just once
    _booted = true;
    tipsEnabled = localStorage.getItem(storageKey('tips')) !== '0';
    buildDOM();
    wireEvents();
    _syncTipsBtn();
    if (!localStorage.getItem(storageKey('info-seen'))) {
      document.getElementById('info-panel').classList.add('open');
      document.getElementById('info-btn').classList.add('active');
    }
    // Mirror the original load cascade exactly (timing-sensitive hydration).
    setTimeout(syncControlsFromState, 0);
    setTimeout(applySpeedsFromHash, 50);
    setTimeout(updateAllTrimUI, 0);
    requestAnimationFrame(_cycleLoop);
  }

  // ── DOM construction ─────────────────────────────────────────────────────--
  function sliderGroupHTML(s) {
    const pos = s.default;
    const labelStyle = s.labelColor ? ' style="color:' + s.labelColor + ';"' : '';
    const valText = s.format ? s.format(pos) : fmtDefault(pos, s.step);
    let h = '<div class="slider-group"><div class="ctrl-row">' +
      '<button class="reset-btn" data-reset="' + s.id + '">&#8634;</button>' +
      '<span class="ctrl-label"' + labelStyle + '>' + s.label + '</span>' +
      '<input id="' + s.id + '" type="range" min="' + s.min + '" max="' + s.max +
        '" step="' + s.step + '" value="' + pos + '">' +
      '<span class="ctrl-value" id="' + valId(s.id) + '">' + valText + '</span>';
    if (s.speed) {
      h += '<button class="speed-play-btn" id="' + playId(s.id) + '" data-play="' + s.id + '">▶</button>';
    }
    h += '</div>';
    if (s.trim) {
      const p = prefixOf(s.id);
      h += '<div class="trim-row"><span class="trim-label">↕ cycle range</span>' +
        '<div class="trim-range" id="' + p + '-trim"><div class="trim-track" id="' + p + '-trim-track">' +
        '<div class="trim-fill" id="' + p + '-trim-fill"></div>' +
        '<div class="trim-handle" id="' + p + '-trim-lo" data-slider="' + s.id + '" data-bound="lo"></div>' +
        '<div class="trim-handle" id="' + p + '-trim-hi" data-slider="' + s.id + '" data-bound="hi"></div>' +
        '</div></div><span class="trim-value" id="' + p + '-trim-val"></span></div>';
    }
    if (s.speed) {
      const sv = s.speed;
      const dec = decimalsFromStep(sv.step);
      h += '<div class="speed-row"><span class="speed-label">↻ speed</span>' +
        '<input id="' + speedId(s.id) + '" data-speed-for="' + s.id + '" type="range" min="' + sv.min +
          '" max="' + sv.max + '" step="' + sv.step + '" value="0">' +
        '<span class="speed-value" id="' + speedValId(s.id) + '">' + (0).toFixed(dec) + '</span></div>';
    }
    h += '</div>';
    return h;
  }

  function slidersForGroupHTML(sectionId, group) {
    let h = '';
    for (const s of CFG.sliders) {
      if (s.section !== sectionId) continue;
      if (group != null) { if (s.group !== group) continue; }
      else if (s.group) continue;
      if (s.subheadingBefore) h += '<div class="ctrl-heading">' + s.subheadingBefore + '</div>';
      h += sliderGroupHTML(s);
    }
    return h;
  }

  function sectionHTML(sec) {
    const subnote = sec.subnote
      ? '  <span style="font-weight:400;color:#666;font-size:0.85rem;">' + sec.subnote + '</span>' : '';
    const marginTop = sec.marginTop ? ' style="margin-top:1rem;"' : '';
    const resetTitle = sec.resetTitle || ('Reset ' + sec.heading.toLowerCase());
    let h = '<div class="ctrl-heading section-heading"' + marginTop + '>' +
      '<button class="reset-btn" data-reset-section="' + sec.id + '" title="' + resetTitle + '">&#8634;</button>' +
      '<span>' + sec.heading + subnote + '</span>';
    if (sec.modeToggle) {
      const mt = sec.modeToggle;
      const cur = mt.getMode();
      const idx = Math.max(0, mt.modes.findIndex(m => m.key === cur));
      const next = mt.modes[(idx + 1) % mt.modes.length];
      h += '<div style="flex:1"></div><button class="speed-play-btn" id="' + mt.buttonId +
        '" data-mode-toggle="1">' + next.name + '</button>';
    }
    h += '</div>';
    if (sec.modeToggle) {
      const cur = sec.modeToggle.getMode();
      for (const m of sec.modeToggle.modes) {
        h += '<div id="' + m.group + '-mode" style="display:' + (m.key === cur ? '' : 'none') + ';">' +
          slidersForGroupHTML(sec.id, m.group) + '</div>';
      }
    } else {
      h += slidersForGroupHTML(sec.id, null);
    }
    return h;
  }

  // Single note line describing the sketch's default canvas interaction. Tapping
  // it (when a tip is supplied) shows the glassy tip overlay.
  function interactionNoteHTML(ix) {
    const tappable = ix.tip ? ' data-interaction-tip="1"' : '';
    const hint = ix.tip ? '<span class="ix-hint">tip</span>' : '';
    return '<div class="interaction-note"' + tappable + '>' +
      '<span class="ix-icon">' + (ix.icon || '&#9995;') + '</span>' +
      '<span class="ix-text">' + ix.text + '</span>' + hint + '</div>';
  }

  function buildDOM() {
    // HUD. Each button carries data-hud-tip so a glassy tip describing its action
    // appears on hover (desktop) or long-press (touch) — see initHudTips.
    let hud = '<a class="back" href="' + (CFG.backHref || '../') +
      '" data-hud-tip="back">&#8592; <span class="hud-label">Back</span></a>';
    const hudCfg = CFG.hud || { info: true, controls: true, download: true, share: true };
    if (hudCfg.info)     hud += '<button id="info-btn" data-toggle-info="1" data-hud-tip="info">&#9432; <span class="hud-label">Description</span></button>';
    if (hudCfg.controls) hud += '<button id="ctrl-btn" data-toggle-controls="1" data-hud-tip="controls">&#9881; <span class="hud-label">Controls</span></button>';
    if (hudCfg.download) hud += '<button id="shot-btn" data-export="1" data-hud-tip="download">&#8595; <span class="hud-label">Download</span></button>';
    if (hudCfg.share)    hud += '<button id="share-btn" data-share="1" data-hud-tip="share">&#11014; <span class="hud-label">Share</span></button>';

    // Description panel — sketch-specific info only (button actions live in the
    // hover/long-press HUD tips, not here).
    let info = '<button id="info-close" data-close-info="1">&#10005; Minimise</button>' +
      '<strong style="color:#eee;">' + (CFG.infoTitle || CFG.title) + '</strong>';
    if (CFG.infoHtml) info += CFG.infoHtml;

    // Controls panel toolbar + sections + footer
    let panel = '<div class="ctrl-row" style="margin-bottom:0.75rem;">' +
      '<button class="speed-play-btn" data-reset-all="1">&#8634; Reset all</button>';
    for (const b of (CFG.panelButtons || [])) panel += '<button class="speed-play-btn" id="' + b.id + '">' + b.html + '</button>';
    panel += '<button class="speed-play-btn" id="tips-btn" data-toggle-tips="1">&#128161; Tips</button>' +
      '<div style="flex:1"></div>' +
      '<button class="speed-play-btn" id="pause-all-btn" data-toggle-play="1">&#9654; Play all</button></div>';
    if (CFG.interaction) panel += interactionNoteHTML(CFG.interaction);
    for (const sec of CFG.sections) panel += sectionHTML(sec);
    if (CFG.panelFooter) panel += CFG.panelFooter;

    const root = document.createElement('div');
    root.innerHTML =
      '<div id="overlay"><div id="hud">' + hud + '</div>' +
      '<div id="info-panel">' + info + '</div>' +
      '<div id="controls-panel">' + panel + '</div></div>' +
      '<div id="toast" role="status" aria-live="polite"></div>' +
      '<div id="tip-overlay" aria-hidden="true">' +
        '<div class="tip-eyebrow" id="tip-eyebrow"></div>' +
        '<div class="tip-headline" id="tip-headline"></div>' +
        '<div id="tip-lower"><div class="tip-lead" id="tip-lead"></div><div class="tip-note" id="tip-note"></div></div>' +
      '</div>';
    while (root.firstChild) document.body.appendChild(root.firstChild);

    // Register trim bounds for sliders that opt into trim handles.
    for (const s of CFG.sliders) if (s.trim) _oscBounds[s.id] = { lo: s.trim.default.lo, hi: s.trim.default.hi };
  }

  // ── event wiring ───────────────────────────────────────────────────────────
  function wireEvents() {
    const panel = document.getElementById('controls-panel');

    // HUD + info-close (outside the panel — not subject to the drag guard).
    bindClick('info-btn',   toggleInfo);
    bindClick('ctrl-btn',   toggleControls);
    bindClick('shot-btn',   exportScreenshot);
    bindClick('share-btn',  copyShareLink);
    bindClick('info-close', closeInfo);

    // Per-button onClick map for config-supplied panel buttons.
    const pbtns = {};
    for (const b of (CFG.panelButtons || [])) pbtns[b.id] = b.onClick;

    // Delegated panel clicks (bubble phase) so the drag guard's capture-phase
    // stopImmediatePropagation can suppress accidental triggers mid-drag.
    panel.addEventListener('click', e => {
      const t = e.target;
      let el;
      if (t.closest('[data-interaction-tip]'))       { _showTipObj(CFG.interaction && CFG.interaction.tip, true); return; }
      if ((el = t.closest('[data-reset]')))          { resetSlider(el.dataset.reset); return; }
      if ((el = t.closest('[data-reset-section]')))  { resetSection(el.dataset.resetSection); return; }
      if ((el = t.closest('[data-play]')))           { toggleSliderSpeed(el.dataset.play); return; }
      if (t.closest('[data-reset-all]'))             { resetAll(); return; }
      if (t.closest('[data-toggle-tips]'))           { toggleTips(); return; }
      if (t.closest('[data-toggle-play]'))           { toggleAllPlay(); return; }
      if (t.closest('[data-mode-toggle]'))           { toggleMode(); return; }
      const btn = t.closest('.speed-play-btn');
      if (btn && pbtns[btn.id]) pbtns[btn.id]();
    });

    // Slider input: setter + label (+ tip) for main sliders; speed for speed rows.
    panel.addEventListener('input', e => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== 'range') return;
      if (el.dataset.speedFor) { setSliderSpeed(el.dataset.speedFor, el.value); return; }
      const cfg = byId[el.id];
      if (!cfg) return;
      applySliderValue(cfg, el);
      _showTip(el.id);
    });

    // Row highlight on hover/focus/input.
    const _hTimers = {};
    function highlight(e) {
      const group = e.target.closest('.slider-group');
      if (!group) return;
      const key = group.querySelector('input[type="range"]') && group.querySelector('input[type="range"]').id;
      if (!key) return;
      if (_hTimers[key]) clearTimeout(_hTimers[key]);
      group.classList.add('highlighted');
      _hTimers[key] = setTimeout(() => { group.classList.remove('highlighted'); delete _hTimers[key]; }, 3000);
    }
    panel.addEventListener('mouseover', highlight);
    panel.addEventListener('focusin',   highlight);
    panel.addEventListener('input',      highlight);

    // Tap-to-reveal while the panel is dimmed during auto-play (needed on iOS).
    document.getElementById('overlay').addEventListener('pointerdown', e => {
      if (!panel.classList.contains('auto-playing')) return;
      if (panel.classList.contains('revealed')) return;
      if (e.target.closest('.speed-play-btn, .reset-btn')) { e.stopPropagation(); e.preventDefault(); }
      panel.classList.add('revealed');
      clearTimeout(_revealTimer);
      _revealTimer = setTimeout(() => panel.classList.remove('revealed'), 3000);
    }, { passive: false, capture: true });

    // Track whether a pointer is down on the UI so canvas-owning sketches can
    // pause their own interaction (capture phase: fires before slider handlers).
    document.getElementById('overlay').addEventListener('pointerdown', () => { _uiPointerActive = true; }, true);
    ['pointerup', 'pointercancel'].forEach(ev =>
      document.addEventListener(ev, () => { _uiPointerActive = false; }));

    initSliderDrag();
    initTrimDrag();
    initButtonGuard();
    initHudTips();
    if (CFG.canvasDrag) initCanvasDrag();
  }

  // HUD button help: glassy tip on hover (pointer devices) or long-press (touch).
  function initHudTips() {
    const hud = document.getElementById('hud');
    if (!hud) return;
    const canHover = () => !window.matchMedia || window.matchMedia('(hover: hover)').matches;

    hud.querySelectorAll('[data-hud-tip]').forEach(b => {
      const tip = _hudTips[b.dataset.hudTip];
      if (!tip) return;
      b.addEventListener('mouseenter', () => { if (canHover()) _showTipObj(tip, true); });
      b.addEventListener('mouseleave', () => { if (canHover()) _hideTip(); });
    });

    // Long-press on touch: hold a button to reveal its tip without firing the
    // button's action (the trailing click is swallowed).
    let _timer = null, _pid = null, _x = 0, _y = 0, _fired = false;
    hud.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      const b = e.target.closest('[data-hud-tip]');
      const tip = b && _hudTips[b.dataset.hudTip];
      if (!tip) return;
      _pid = e.pointerId; _x = e.clientX; _y = e.clientY; _fired = false;
      clearTimeout(_timer);
      _timer = setTimeout(() => { _fired = true; _showTipObj(tip, true); }, 450);
    });
    hud.addEventListener('pointermove', e => {
      if (e.pointerId === _pid && Math.hypot(e.clientX - _x, e.clientY - _y) > 10) clearTimeout(_timer);
    });
    ['pointerup', 'pointercancel'].forEach(ev =>
      hud.addEventListener(ev, e => { if (e.pointerId === _pid) { clearTimeout(_timer); _pid = null; } }));
    hud.addEventListener('click', e => {
      if (_fired) { e.stopImmediatePropagation(); e.preventDefault(); _fired = false; }
    }, true);
  }

  function bindClick(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // ── panels ───────────────────────────────────────────────────────────────--
  function toggleControls() {
    const open = document.getElementById('controls-panel').classList.toggle('open');
    document.getElementById('ctrl-btn').classList.toggle('active', open);
    if (open) {
      document.getElementById('info-panel').classList.remove('open');
      document.getElementById('info-btn').classList.remove('active');
      localStorage.setItem(storageKey('info-seen'), '1');
    }
  }
  function toggleInfo() {
    const open = document.getElementById('info-panel').classList.toggle('open');
    document.getElementById('info-btn').classList.toggle('active', open);
    if (open) {
      document.getElementById('controls-panel').classList.remove('open');
      document.getElementById('ctrl-btn').classList.remove('active');
      localStorage.setItem(storageKey('info-seen'), '1');
    }
  }
  function closeInfo() {
    document.getElementById('info-panel').classList.remove('open');
    document.getElementById('info-btn').classList.remove('active');
    localStorage.setItem(storageKey('info-seen'), '1');
  }

  // ── slider value application ────────────────────────────────────────────────
  function applySliderValue(cfg, el) {
    const pos = parseFloat(el.value);
    const arg = cfg.toValue ? cfg.toValue(pos) : pos;
    const fn = window[cfg.set];
    if (typeof fn === 'function') fn(arg);
    const lbl = document.getElementById(valId(cfg.id));
    if (lbl) lbl.textContent = cfg.format ? cfg.format(pos) : fmtDefault(pos, el.step);
  }

  // ── reset ───────────────────────────────────────────────────────────────---
  function resetSlider(id) {
    const cfg = byId[id]; if (!cfg) return;
    const slider = document.getElementById(id); if (!slider) return;
    slider.value = cfg.default;
    _suppressTips = true;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    _suppressTips = false;
    const sp = document.getElementById(speedId(id));
    if (sp) sp.value = 0;
    setSliderSpeed(id, 0);
    if (_oscBounds[id]) {
      _oscBounds[id] = { lo: parseFloat(slider.min), hi: parseFloat(slider.max) };
      _updateTrimUI(id);
    }
    _syncPlayingState();
  }
  function resetSection(sectionId) {
    for (const s of CFG.sliders) if (s.section === sectionId && document.getElementById(s.id)) resetSlider(s.id);
  }
  function resetAll() {
    for (const s of CFG.sliders) resetSlider(s.id);
  }

  // ── rotation-mode toggle (opt-in) ──────────────────────────────────────────
  function applyModeUI() {
    const mt = modeToggle(); if (!mt) return;
    const cur = mt.getMode();
    for (const m of mt.modes) {
      const el = document.getElementById(m.group + '-mode');
      if (el) el.style.display = (m.key === cur) ? '' : 'none';
    }
    const idx = Math.max(0, mt.modes.findIndex(m => m.key === cur));
    const next = mt.modes[(idx + 1) % mt.modes.length];
    const btn = document.getElementById(mt.buttonId);
    if (btn) btn.textContent = next.name;
  }
  function toggleMode() {
    const mt = modeToggle(); if (!mt) return;
    const cur = mt.getMode();
    const idx = Math.max(0, mt.modes.findIndex(m => m.key === cur));
    const next = mt.modes[(idx + 1) % mt.modes.length];
    const leavingGroup = mt.modes[idx].group;
    // Stop auto-cycling sliders we're about to hide so they don't keep mutating
    // state (and pinning the panel open) while invisible.
    for (const s of CFG.sliders) {
      if (s.group === leavingGroup) {
        const sp = document.getElementById(speedId(s.id));
        if (sp) sp.value = 0;
        setSliderSpeed(s.id, 0);
      }
    }
    const fn = window[mt.set];
    if (typeof fn === 'function') fn(next.key);
    applyModeUI();
    _syncPlayingState();
  }
  function hiddenGroupIds() {
    const set = new Set();
    const mt = modeToggle(); if (!mt) return set;
    const cur = mt.getMode();
    for (const s of CFG.sliders) {
      if (s.group && !mt.modes.some(m => m.key === cur && m.group === s.group)) set.add(s.id);
    }
    return set;
  }

  // ── glassy tips ─────────────────────────────────────────────────────────--
  function _applyFrostMask() {
    const el = document.getElementById('tip-headline');
    if (!el) return;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 48;
    const w  = Math.max(1, Math.ceil(el.clientWidth));
    const h  = Math.max(1, Math.ceil(el.clientHeight));
    const ff = cs.fontFamily;
    const ls = cs.letterSpacing === 'normal' ? '0' : cs.letterSpacing;
    const txt = el.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h + "'>" +
      "<text x='0' y='" + (h / 2).toFixed(1) + "' dominant-baseline='central' " +
      "font-family='" + ff + "' font-size='" + fs + "px' font-weight='" + cs.fontWeight +
      "' letter-spacing='" + ls + "' fill='black' stroke='black' stroke-width='3'>" + txt + "</text></svg>";
    const uri = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    el.style.webkitMaskImage = uri;
    el.style.maskImage = uri;
  }
  // Generic descriptions of each HUD button's action, shown in the glassy tip
  // overlay on hover (desktop) or long-press (touch).
  const _hudTips = {
    back:     { eyebrow: 'Navigate', headline: 'Back',
      lead: 'Return to the catalogue.',
      note: 'Leaves this sketch and goes back to the index of all sketches.' },
    info:     { eyebrow: 'Panel', headline: 'Description',
      lead: 'What this sketch does.',
      note: 'Opens a panel describing the sketch and how it works.' },
    controls: { eyebrow: 'Panel', headline: 'Controls',
      lead: 'Tune the sketch.',
      note: 'Opens the slider panel. Each slider has a <strong>▶</strong> to auto-cycle it and a <strong>↺</strong> to reset; <strong>Play all</strong> animates everything together.' },
    download: { eyebrow: 'Action', headline: 'Download',
      lead: 'Save a PNG.',
      note: 'Exports the current canvas as an image, with a card listing every parameter value.' },
    share:    { eyebrow: 'Action', headline: 'Share',
      lead: 'Copy a link.',
      note: 'Copies a URL that encodes all current settings (and any running auto-cycle speeds) so the exact configuration round-trips.' },
  };

  function _hideTip() {
    const o = document.getElementById('tip-overlay');
    if (o) o.classList.remove('show');
    clearTimeout(_tipTimer);
  }

  // Render a tip object into the glassy overlay. `force` bypasses the tips
  // toggle / suppression — used when the user explicitly taps the interaction note.
  function _showTipObj(info, force) {
    if (!info) return;
    if (!force && (!tipsEnabled || _suppressTips)) return;
    document.getElementById('tip-eyebrow').textContent  = info.eyebrow || '';
    document.getElementById('tip-headline').textContent = info.headline || '';
    document.getElementById('tip-lead').textContent     = info.lead || '';
    document.getElementById('tip-note').innerHTML       = info.note || '';
    _applyFrostMask();
    const o = document.getElementById('tip-overlay');
    o.classList.add('show');
    clearTimeout(_tipTimer);
    _tipTimer = setTimeout(() => o.classList.remove('show'), 2800);
  }
  function _showTip(id) {
    if (_canvasDragActive) return;   // canvas drag shows the interaction tip instead
    const cfg = byId[id]; if (!cfg || !cfg.tip) return;
    if (_sliderSpeeds[id]) return;   // manual only: skip while auto-cycling
    _showTipObj(cfg.tip, false);
  }
  function _syncTipsBtn() {
    const b = document.getElementById('tips-btn');
    if (b) b.classList.toggle('toggled-on', tipsEnabled);
  }
  function toggleTips() {
    tipsEnabled = !tipsEnabled;
    localStorage.setItem(storageKey('tips'), tipsEnabled ? '1' : '0');
    _syncTipsBtn();
    if (!tipsEnabled) {
      const o = document.getElementById('tip-overlay');
      if (o) o.classList.remove('show');
    }
  }

  // ── auto-cycle ─────────────────────────────────────────────────────────────
  function _getOscBounds(id) {
    if (_oscBounds[id]) return _oscBounds[id];
    const s = document.getElementById(id);
    return s ? { lo: parseFloat(s.min), hi: parseFloat(s.max) } : { lo: 0, hi: 1 };
  }
  function _updateTrimUI(sliderId) {
    const cfg = byId[sliderId];
    const bounds = _oscBounds[sliderId];
    const slider = document.getElementById(sliderId);
    if (!bounds || !slider || !cfg || !cfg.trim) return;
    const prefix = prefixOf(sliderId);
    const min = parseFloat(slider.min), max = parseFloat(slider.max);
    const span = max - min;
    const loFrac = (bounds.lo - min) / span;
    const hiFrac = (bounds.hi - min) / span;
    const loEl   = document.getElementById(prefix + '-trim-lo');
    const hiEl   = document.getElementById(prefix + '-trim-hi');
    const fillEl = document.getElementById(prefix + '-trim-fill');
    const valEl  = document.getElementById(prefix + '-trim-val');
    if (loEl)   loEl.style.left = (loFrac * 100) + '%';
    if (hiEl)   hiEl.style.left = (hiFrac * 100) + '%';
    if (fillEl) { fillEl.style.left = (loFrac * 100) + '%'; fillEl.style.width = ((hiFrac - loFrac) * 100) + '%'; }
    if (valEl) {
      const f = cfg.trim.format || (b => b.toFixed(1));
      valEl.textContent = f(bounds.lo) + ' – ' + f(bounds.hi);
    }
  }
  function updateAllTrimUI() {
    for (const s of CFG.sliders) if (s.trim) _updateTrimUI(s.id);
  }

  function _syncPlayingState() {
    const anyPlaying = Object.values(_sliderSpeeds).some(s => s !== 0);
    const panel = document.getElementById('controls-panel');
    panel.classList.toggle('auto-playing', anyPlaying);
    if (!anyPlaying) panel.classList.remove('revealed');
    const btn = document.getElementById('pause-all-btn');
    if (btn) btn.textContent = anyPlaying ? '⏸ Pause all' : '▶ Play all';
  }
  function pauseAll() {
    for (const id of Object.keys(_sliderSpeeds)) {
      if (!_sliderSpeeds[id]) continue;
      const sp = document.getElementById(speedId(id));
      if (sp) sp.value = 0;
      setSliderSpeed(id, 0);
    }
    _syncPlayingState();
  }
  function resumeAll() {
    const hidden = hiddenGroupIds();
    for (const s of CFG.sliders) {
      if (!s.speed || hidden.has(s.id)) continue;
      const speed = (_sliderLastSpeeds[s.id] !== undefined && _sliderLastSpeeds[s.id] !== null)
        ? _sliderLastSpeeds[s.id] : s.speed.default;
      const sp = document.getElementById(speedId(s.id));
      if (sp) sp.value = speed;
      setSliderSpeed(s.id, speed);
    }
    _syncPlayingState();
  }
  function toggleAllPlay() {
    const anyPlaying = Object.values(_sliderSpeeds).some(s => s !== 0);
    if (anyPlaying) pauseAll(); else resumeAll();
  }
  function toggleSliderSpeed(id) {
    const current = _sliderSpeeds[id] || 0;
    const def = (byId[id] && byId[id].speed) ? byId[id].speed.default : 0.01;
    const last = _sliderLastSpeeds[id];
    const newSpeed = current !== 0 ? 0 : ((last !== undefined && last !== null) ? last : (def != null ? def : 0.01));
    const sp = document.getElementById(speedId(id));
    if (sp) sp.value = newSpeed;
    setSliderSpeed(id, newSpeed);
    _syncPlayingState();
  }
  function setSliderSpeed(id, speedVal) {
    const speed = parseFloat(speedVal) || 0;
    _sliderSpeeds[id] = speed;
    if (speed !== 0) _sliderLastSpeeds[id] = speed;
    const sp  = document.getElementById(speedId(id));
    const vel = document.getElementById(speedValId(id));
    if (vel && sp) {
      const dec = decimalsFromStep(sp.step);
      vel.textContent = speed.toFixed(dec);
    }
    const btn = document.getElementById(playId(id));
    if (btn) btn.textContent = speed !== 0 ? '⏸' : '▶';
    const group = sp ? sp.closest('.slider-group') : null;
    if (group) group.classList.toggle('has-speed', speed !== 0);
  }

  function _advanceSliders() {
    for (const id in _sliderSpeeds) {
      const speed = _sliderSpeeds[id];
      if (!speed || id === _draggingSliderId) { delete _cyclePos[id]; continue; }
      const slider = document.getElementById(id);
      if (!slider) continue;
      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      const step = parseFloat(slider.step) || 0;
      const span = max - min;
      if (span <= 0) continue;
      const cur = parseFloat(slider.value);
      let v = _cyclePos[id];
      if (v === undefined || Math.abs(cur - _snap(v, min, step)) > (step || 0) * 1.5) v = cur;

      const cfg = byId[id];
      if (cfg && cfg.cycle === 'oscillate') {
        const ob = _getOscBounds(id);
        const lo = Math.max(min, ob.lo), hi = Math.min(max, ob.hi);
        if (_sliderBounceDir[id] === undefined) _sliderBounceDir[id] = 1;
        const prevDir = _sliderBounceDir[id];
        let dir = prevDir;
        v += Math.abs(speed) * dir;
        if (v > hi) { v = 2 * hi - v; dir = -1; }
        else if (v < lo) { v = 2 * lo - v; dir = 1; }
        v = Math.max(lo, Math.min(hi, v));
        _sliderBounceDir[id] = dir;
        if (dir !== prevDir && !slider.classList.contains('anim-hit-hi') && !slider.classList.contains('anim-hit-lo')) {
          const cls = dir === -1 ? 'anim-hit-hi' : 'anim-hit-lo';
          slider.classList.add(cls);
          slider.addEventListener('animationend', () => slider.classList.remove(cls), { once: true });
        }
      } else {
        v += speed;
        const wrapped = v > max || v < min;
        if (v > max)      v = min + ((v - min) % span);
        else if (v < min) v = max - ((min - v) % span);
        if (wrapped && !slider.classList.contains('anim-wrap')) {
          slider.classList.add('anim-wrap');
          slider.addEventListener('animationend', () => slider.classList.remove('anim-wrap'), { once: true });
        }
      }
      _cyclePos[id] = v;
      slider.value = _snap(v, min, step);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  function _cycleLoop() { _advanceSliders(); requestAnimationFrame(_cycleLoop); }

  // ── slider drag (delta-based, no jump on click) ────────────────────────────
  function initSliderDrag() {
    const panel = () => document.getElementById('controls-panel');
    let _slider = null, _pointerId = null, _startValue = 0, _startClientX = 0, _prevClientX = 0;

    function isWrap(id) { return byId[id] && byId[id].cycle === 'wrap'; }

    function setFromDelta(slider, deltaX, incremental) {
      const rect = slider.getBoundingClientRect();
      if (rect.width <= 0) return;
      const min = parseFloat(slider.min), max = parseFloat(slider.max);
      const step = parseFloat(slider.step) || 0;
      const span = max - min;
      let v = incremental
        ? (parseFloat(slider.value) || 0) + (deltaX / rect.width) * span
        : _startValue + (deltaX / rect.width) * span;
      if (step > 0) v = min + Math.round((v - min) / step) * step;
      if (isWrap(slider.id)) v = min + ((v - min) % span + span) % span;
      else                   v = Math.max(min, Math.min(max, v));
      const dec = decimalsFromStep(step);
      const str = dec > 0 ? v.toFixed(dec) : String(Math.round(v));
      if (slider.value !== str) {
        slider.value = str;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    function endDrag() {
      if (_slider && _pointerId != null) { try { _slider.releasePointerCapture(_pointerId); } catch (_) {} }
      _slider = null; _pointerId = null; _draggingSliderId = null;
      const p = panel(); if (p) p.classList.remove('dragging');
      const hud = document.getElementById('hud'); if (hud) hud.classList.remove('dragging');
    }
    document.addEventListener('pointerdown', e => {
      const t = e.target;
      let slider;
      if (t instanceof HTMLInputElement && t.type === 'range') slider = t;
      else if (t.closest('.ctrl-label') || t.closest('.ctrl-value')) {
        const row = t.closest('.ctrl-row');
        slider = row && row.querySelector('input[type="range"]');
      }
      if (!slider || !slider.closest('#controls-panel')) return;
      _slider = slider; _pointerId = e.pointerId;
      _startValue = parseFloat(slider.value) || 0;
      _startClientX = e.clientX; _prevClientX = e.clientX;
      _draggingSliderId = slider.id;
      panel().classList.add('dragging');
      const hud = document.getElementById('hud'); if (hud) hud.classList.add('dragging');
      try { slider.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    document.addEventListener('pointermove', e => {
      if (_slider && e.pointerId === _pointerId) {
        if (isWrap(_slider.id)) { setFromDelta(_slider, e.clientX - _prevClientX, true); _prevClientX = e.clientX; }
        else                    { setFromDelta(_slider, e.clientX - _startClientX, false); }
        e.preventDefault();
      }
    });
    ['pointerup', 'pointercancel'].forEach(ev =>
      document.addEventListener(ev, e => { if (_slider && e.pointerId === _pointerId) endDrag(); }));
  }

  // ── trim handle drag (opt-in via slider.trim) ──────────────────────────────
  function initTrimDrag() {
    let _active = null;
    document.addEventListener('pointerdown', e => {
      const h = e.target;
      if (!h.classList || !h.classList.contains('trim-handle')) return;
      const sliderId = h.dataset.slider;
      const bound = h.dataset.bound;
      const track = document.getElementById(prefixOf(sliderId) + '-trim-track');
      if (!track || !_oscBounds[sliderId]) return;
      const slider = document.getElementById(sliderId);
      const min = parseFloat(slider.min), max = parseFloat(slider.max);
      const val = bound === 'lo' ? _oscBounds[sliderId].lo : _oscBounds[sliderId].hi;
      _active = { sliderId, bound, pointerId: e.pointerId, startFrac: (val - min) / (max - min), startX: e.clientX, trackEl: track };
      try { h.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener('pointermove', e => {
      if (!_active || e.pointerId !== _active.pointerId) return;
      const { sliderId, bound, startFrac, startX, trackEl } = _active;
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const slider = document.getElementById(sliderId);
      const min = parseFloat(slider.min), max = parseFloat(slider.max);
      const step = parseFloat(slider.step) || 0.01;
      const span = max - min;
      const frac = Math.max(0, Math.min(1, startFrac + (e.clientX - startX) / rect.width));
      const v = min + Math.round((frac * span) / step) * step;
      const ob = _oscBounds[sliderId];
      if (bound === 'lo') ob.lo = Math.min(v, ob.hi - step);
      else                ob.hi = Math.max(v, ob.lo + step);
      _updateTrimUI(sliderId);
      e.preventDefault();
    });
    ['pointerup', 'pointercancel'].forEach(ev =>
      document.addEventListener(ev, e => { if (_active && e.pointerId === _active.pointerId) _active = null; }));
  }

  // ── play/reset button drag guard ───────────────────────────────────────────
  function initButtonGuard() {
    let _ptrId = null, _startX, _startY, _moved = false;
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('.speed-play-btn, .reset-btn')) return;
      if (!e.target.closest('#controls-panel')) return;
      _ptrId = e.pointerId; _startX = e.clientX; _startY = e.clientY; _moved = false;
    });
    document.addEventListener('pointermove', e => {
      if (e.pointerId !== _ptrId) return;
      const dx = e.clientX - _startX, dy = e.clientY - _startY;
      if (dx * dx + dy * dy > 64) _moved = true;
    });
    ['pointerup', 'pointercancel'].forEach(ev =>
      document.addEventListener(ev, e => { if (e.pointerId === _ptrId) _ptrId = null; }));
    document.getElementById('controls-panel').addEventListener('click', e => {
      if (_moved && e.target.closest('.speed-play-btn, .reset-btn')) {
        e.stopImmediatePropagation(); e.preventDefault(); _moved = false;
      }
    }, true);
  }

  // ── canvas drag → slider(s) (opt-in via CFG.canvasDrag) ────────────────────
  // Delta-based: each pointer axis maps onto a slider. A full-window drag changes
  // the target by `perWidth`/`perHeight` value-units; `mode` is 'wrap' (angles)
  // or 'clamp' (everything else). Use a negative span to invert (e.g. drag up to
  // increase). Shape: { x: {target, perWidth, mode}, y: {target, perHeight, mode} }.
  function initCanvasDrag() {
    const cd = CFG.canvasDrag;
    const specs = [];
    if (cd.x) specs.push({ screen: 'x', target: cd.x.target, span: cd.x.perWidth,  mode: cd.x.mode || 'clamp' });
    if (cd.y) specs.push({ screen: 'y', target: cd.y.target, span: cd.y.perHeight, mode: cd.y.mode || 'clamp' });

    let _active = false, _startX = 0, _startY = 0, _pid = null;
    const _starts = [];   // start value of each spec's target slider
    const isInOverlay = el => el && el.closest && el.closest('#overlay');

    document.addEventListener('pointerdown', e => {
      if (isInOverlay(e.target)) return;
      if (e.target instanceof HTMLInputElement) return;
      _active = true; _pid = e.pointerId; _startX = e.clientX; _startY = e.clientY;
      _starts.length = 0;
      for (const sp of specs) {
        const sl = document.getElementById(sp.target());
        _starts.push(sl ? (parseFloat(sl.value) || 0) : 0);
      }
      _canvasDragActive = true;
      if (CFG.interaction && CFG.interaction.tip) _showTipObj(CFG.interaction.tip, false);
      document.getElementById('overlay').classList.add('canvas-dragging');
    });
    document.addEventListener('pointermove', e => {
      if (!_active || e.pointerId !== _pid) return;
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      specs.forEach((sp, i) => {
        const slider = document.getElementById(sp.target());
        if (!slider) return;
        const frac = sp.screen === 'x' ? (e.clientX - _startX) / w : (e.clientY - _startY) / h;
        const min = parseFloat(slider.min), max = parseFloat(slider.max), span = max - min;
        let v = _starts[i] + frac * sp.span;
        if (sp.mode === 'wrap') v = min + ((v - min) % span + span) % span;
        else                    v = Math.max(min, Math.min(max, v));
        slider.value = v;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    ['pointerup', 'pointercancel'].forEach(ev =>
      document.addEventListener(ev, e => {
        if (e.pointerId === _pid) { _active = false; _canvasDragActive = false; document.getElementById('overlay').classList.remove('canvas-dragging'); }
      }));
  }

  // ── hydrate UI from current sketch state ───────────────────────────────────
  function syncControlsFromState() {
    for (const s of CFG.sliders) {
      if (typeof s.get !== 'function') continue;
      let pos;
      try { pos = s.get(); } catch (_) { continue; }
      if (pos === undefined || pos === null || (typeof pos === 'number' && Number.isNaN(pos))) continue;
      const el = document.getElementById(s.id);
      if (el) el.value = pos;
      const lbl = document.getElementById(valId(s.id));
      if (lbl) lbl.textContent = s.format ? s.format(parseFloat(pos)) : fmtDefault(parseFloat(pos), s.step);
    }
    applyModeUI();
    if (typeof CFG.onHydrate === 'function') { try { CFG.onHydrate(); } catch (_) {} }
  }

  // ── screenshot export ──────────────────────────────────────────────────────
  function exportScreenshot() {
    showToast('Saving PNG…');
    try {
      const p5canvas = document.getElementById('defaultCanvas0') || document.querySelector('body > canvas');
      if (!p5canvas) { showToast('PNG failed: no canvas'); return; }
      const ep = CFG.exportPanel || {};
      const SIZE = ep.size || 720;
      const PANEL_W = ep.panelW || 380;
      const H = SIZE, W = SIZE + PANEL_W;
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const sw = p5canvas.width, sh = p5canvas.height;
      const scale = Math.min(SIZE / sw, SIZE / sh);
      const dw = sw * scale, dh = sh * scale;
      ctx.drawImage(p5canvas, (SIZE - dw) / 2, (H - dh) / 2, dw, dh);
      _drawSettingsPanel(ctx, SIZE, 0, PANEL_W, H);
      const trigger = url => {
        const a = document.createElement('a');
        a.href = url; a.download = (CFG.pngPrefix || 'sketch') + '-' + Date.now() + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      };
      if (out.toBlob) {
        out.toBlob(blob => {
          if (!blob) { showToast('PNG save failed'); return; }
          const url = URL.createObjectURL(blob);
          trigger(url);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          showToast('PNG saved');
        }, 'image/png');
      } else {
        trigger(out.toDataURL('image/png'));
        showToast('PNG saved');
      }
    } catch (err) {
      showToast('PNG failed: ' + err.message);
    }
  }
  function _drawSettingsPanel(ctx, x, y, w, h) {
    const ep = CFG.exportPanel || {};
    const titleSize = ep.titleSize || 22;
    const cyStart   = ep.cyStart   || 52;
    const titleGap1 = ep.titleGap1 || 12;
    const titleGap2 = ep.titleGap2 || 20;
    const pxFrac    = ep.pxFrac    != null ? ep.pxFrac : 0.08;
    const valXFrac  = ep.valXFrac  != null ? ep.valXFrac : 0.55;
    const lineH     = ep.lineH     || 28;
    const rowFont   = ep.rowFont   || 14;
    const shareFont = ep.shareFont || 11;
    const shareLineH    = ep.shareLineH    || 15;
    const shareLabelGap = ep.shareLabelGap || 16;

    ctx.fillStyle = '#0d1117'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#58a6ff'; ctx.fillRect(x, y, w, 4);

    const px   = x + Math.round(w * pxFrac);
    const valX = x + Math.round(w * valXFrac);
    let cy = y + cyStart;

    ctx.font = 'bold ' + titleSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#e6edf3';
    ctx.fillText(ep.title || CFG.title || '', px, cy);
    cy += titleGap1;
    ctx.fillStyle = '#30363d';
    ctx.fillRect(px, cy, w - (px - x) * 2, 1);
    cy += titleGap2;

    const rows = (ep.rows ? ep.rows() : []);
    for (const [label, value] of rows) {
      ctx.font = rowFont + 'px monospace';
      ctx.fillStyle = '#6e7681'; ctx.fillText(label, px,   cy);
      ctx.fillStyle = '#58a6ff'; ctx.fillText(value, valX, cy);
      cy += lineH;
    }

    try {
      ctx.font = shareFont + 'px monospace';
      ctx.fillStyle = '#6e7681';
      const link = _shareUrl();
      const maxW = w - (px - x) * 2;
      const lines = _wrapText(ctx, link, maxW);
      let fy = y + h - 18 - Math.max(0, (lines.length - 1)) * shareLineH;
      ctx.fillText('share link:', px, fy - shareLabelGap);
      ctx.fillStyle = '#8b949e';
      for (const ln of lines) { ctx.fillText(ln, px, fy); fy += shareLineH; }
    } catch (_) {}
  }
  function _wrapText(ctx, text, maxW) {
    const out = []; let buf = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ctx.measureText(buf + ch).width > maxW) { out.push(buf); buf = ch; }
      else buf += ch;
    }
    if (buf) out.push(buf);
    return out;
  }

  // ── share link ─────────────────────────────────────────────────────────────
  function _encodeSpeedParams() {
    const keys = (CFG.share && CFG.share.speedParams) || {};
    return Object.entries(keys)
      .filter(([id]) => _sliderSpeeds[id])
      .map(([id, k]) => k + '=' + _sliderSpeeds[id])
      .join('&');
  }
  function _applySpeedsFromHash() {
    const keys = (CFG.share && CFG.share.speedParams) || {};
    const inv = {};
    for (const [id, k] of Object.entries(keys)) inv[k] = id;
    const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    const params = {};
    for (const kv of hash.split('&')) {
      const i = kv.indexOf('='); if (i < 0) continue;
      params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    }
    let anySet = false;
    for (const [k, id] of Object.entries(inv)) {
      if (!(k in params)) continue;
      const speed = parseFloat(params[k]);
      if (!Number.isFinite(speed) || speed === 0) continue;
      const sp = document.getElementById(speedId(id));
      if (sp) sp.value = speed;
      setSliderSpeed(id, speed);
      anySet = true;
    }
    if (anySet) _syncPlayingState();
  }
  function applySpeedsFromHash() { _applySpeedsFromHash(); }
  function _encodeSettings() {
    const name = (CFG.share && CFG.share.encodeSettings) || 'encodeSettings';
    const fn = window[name];
    return (typeof fn === 'function') ? fn() : '';
  }
  function _buildHash() {
    const hash = _encodeSettings();
    const speeds = _encodeSpeedParams();
    return speeds ? (hash ? hash + '&' + speeds : speeds) : hash;
  }
  function _shareUrl() { return location.origin + location.pathname + '#' + _buildHash(); }
  function copyShareLink() {
    showToast('Copying link…');
    let url;
    try {
      url = _shareUrl();
      try { history.replaceState(null, '', '#' + _buildHash()); } catch (_) {}
    } catch (err) { showToast('Share failed: ' + err.message); return; }
    const finish = ok => showToast(ok ? 'Link copied to clipboard' : 'Copy blocked — link is in the address bar');
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => finish(true), () => _fallbackCopy(url, finish));
    } else {
      _fallbackCopy(url, finish);
    }
  }
  function _fallbackCopy(text, cb) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta); cb(ok);
    } catch (e) { cb(false); }
  }
  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // True while the user is touching the HUD/controls (slider, button, trim).
  // Canvas-owning sketches call this to pause their pointer interaction.
  function controlsBusy() { return _uiPointerActive; }

  window.SketchUI = { init, controlsBusy };
})();
