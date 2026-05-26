/* Rotating Sphere — controls config consumed by ../common/ui.js.
   The feature-rich sketch: a rotation-mode toggle (axis-angle ↔ RGB axes),
   trim handles on the warp sliders, a log scale on exponent (a), a two-segment
   scale on imaginary (b), canvas-drag-to-rotate, a viz toggle and an axis
   readout. encodeSettings/applySettingsFromHash live in sketch.js; the runtime
   only adds the sp_* speed params, keeping share links byte-compatible.

   Wrapped in an IIFE so the two-segment scale helpers stay sketch-local; the
   slider closures (toValue/format/get) capture them lexically. */
(function () {
  // Imaginary (b) two-segment scale: the slider's first half maps 0→π (the busy
  // low range), the second half maps π→50 linearly. Slider value is a 0..1
  // position; b is derived from it.
  const _B_MAX = 50, _B_MID = Math.PI;
  const _imagFromPos = p => p <= 0.5 ? (p / 0.5) * _B_MID
                                     : _B_MID + ((p - 0.5) / 0.5) * (_B_MAX - _B_MID);
  const _imagToPos = b => b <= _B_MID ? (b / _B_MID) * 0.5
                                      : 0.5 + ((b - _B_MID) / (_B_MAX - _B_MID)) * 0.5;
  const deg = r => (r * 180 / Math.PI).toFixed(1) + '°';

  SketchUI.init({
    title: 'Rotating Sphere',
    pngPrefix: 'rotating-sphere',
    storagePrefix: 'sphere-v2',

    infoItems: [
      ['Drag canvas', 'rotate the sphere'],
      ['&#9881; Controls', 'adjust axis, warp &amp; centre parameters'],
      ['&#8595; Download', 'export a settings panel + image'],
      ['&#11014; Share', 'copy a link with all current settings'],
      ['▶ button', 'click to start auto-cycling a slider; click again to stop'],
      ['Trim handles', 'drag the range handles to set cycle bounds'],
    ],

    // Viz overlay toggle lives in the panel toolbar (between Reset all and Tips).
    panelButtons: [
      { id: 'viz-mode-btn', html: '&#9638; Surface', onClick: () => {
          const on = (typeof vizSurface !== 'undefined') ? !vizSurface : true;
          if (typeof setVizSurface === 'function') setVizSurface(on);
          const btn = document.getElementById('viz-mode-btn');
          if (btn) btn.innerHTML = on ? '&#9638; Surface' : '&#9679; Dots';
          if (typeof noteParamChange === 'function') noteParamChange();
      } },
    ],

    // Dragging the canvas drives the active rotation slider (mode-dependent).
    canvasDrag: {
      target: () => (typeof rotMode !== 'undefined' && rotMode === 'rgb') ? 'rotb-slider' : 'rot-offset-slider',
      rotationsPerWidth: 8,
    },

    panelFooter: '<div class="axis-readout">axis: (<span id="axis-display">0.577, 0.577, 0.577</span>)</div>',
    onHydrate: () => {
      const el = document.getElementById('axis-display');
      if (el && typeof rotationVector !== 'undefined' && rotationVector) {
        const v = rotationVector;
        el.textContent = v.x.toFixed(3) + ', ' + v.y.toFixed(3) + ', ' + v.z.toFixed(3);
      }
    },

    share: {
      speedParams: {
        'theta-slider': 'sp_t', 'phi-slider': 'sp_p', 'rot-offset-slider': 'sp_r',
        'rotr-slider': 'sp_rr', 'rotg-slider': 'sp_rg', 'rotb-slider': 'sp_rb',
        'exp-slider': 'sp_a', 'expimag-slider': 'sp_b',
        'cx-slider': 'sp_cx', 'cy-slider': 'sp_cy', 'cz-slider': 'sp_cz',
      },
    },

    exportPanel: {
      size: 720, panelW: 480, title: 'Rotating Sphere',
      titleSize: 26, cyStart: 56, titleGap1: 14, titleGap2: 22,
      pxFrac: 0.07, valXFrac: 0.46, lineH: 30, rowFont: 15,
      shareFont: 12, shareLineH: 16, shareLabelGap: 18,
      rows: () => {
        const rot = (typeof rotMode !== 'undefined' && rotMode === 'rgb')
          ? [['rotate R', deg(rotR)], ['rotate G', deg(rotG)], ['rotate B', deg(rotB)]]
          : [['axis θ', deg(axisTheta)], ['axis φ', deg(axisPhi)], ['rotation', (rotOffset * 180 / Math.PI).toFixed(1) + '°']];
        return rot.concat([
          ['exp a',    coordExp.toFixed(2)],
          ['exp b',    coordExpImag.toFixed(1)],
          ['centre R', coordCenterX.toFixed(2)],
          ['centre G', coordCenterY.toFixed(2)],
          ['centre B', coordCenterZ.toFixed(2)],
        ]);
      },
    },

    sections: [
      { id: 'rotation', heading: 'Rotation', resetTitle: 'Reset rotation',
        modeToggle: {
          buttonId: 'rot-mode-btn', set: 'setRotMode',
          getMode: () => (typeof rotMode !== 'undefined' ? rotMode : 'axis'),
          modes: [
            { key: 'axis', group: 'rot-axis', name: 'Axis + angle' },
            { key: 'rgb',  group: 'rot-rgb',  name: 'RGB axes' },
          ],
        } },
      { id: 'warp', heading: 'Colour warp', subnote: '(applied before normalise)', marginTop: true, resetTitle: 'Reset colour warp' },
      { id: 'centre', heading: 'Coordinate centre', subnote: '(shift origin before warp)', marginTop: true, resetTitle: 'Reset coordinate centre' },
    ],

    sliders: [
      // ── Rotation: axis-angle mode ──
      { id: 'rot-offset-slider', section: 'rotation', group: 'rot-axis', label: 'Rotation',
        min: 0, max: 360, step: 1, default: 0,
        set: 'setRotOffset', toValue: pos => pos * Math.PI / 180,
        format: pos => pos.toFixed(0) + '°', get: () => rotOffset * 180 / Math.PI,
        cycle: 'wrap', speed: { min: -10, max: 10, step: 0.1, default: 3 },
        tip: { eyebrow: 'Rotation', headline: 'Spin',
          lead: 'Turns the whole shape about its axis.',
          note: 'Every surface colour rotates together — each point’s hue is its <strong>direction</strong> after the spin.' } },

      { id: 'theta-slider', section: 'rotation', group: 'rot-axis', subheadingBefore: 'Rotation axis',
        label: 'Polar (θ)', min: -180, max: 180, step: 0.1, default: 54.7,
        set: 'setAxisTheta', format: pos => pos.toFixed(1) + '°', get: () => axisTheta * 180 / Math.PI,
        cycle: 'wrap', speed: { min: -2, max: 2, step: 0.05, default: 0.5 },
        tip: { eyebrow: 'Rotation axis', headline: 'Polar θ',
          lead: 'Tilts the axis away from the blue (up) axis.',
          note: '0° points straight up the B axis; 90° lays it flat. The cyan arc in the overlay shows the tilt.' } },

      { id: 'phi-slider', section: 'rotation', group: 'rot-axis', label: 'Azimuth (φ)',
        min: 0, max: 360, step: 0.1, default: 45.0,
        set: 'setAxisPhi', format: pos => pos.toFixed(1) + '°', get: () => axisPhi * 180 / Math.PI,
        cycle: 'wrap', speed: { min: -3, max: 3, step: 0.05, default: 0.75 },
        tip: { eyebrow: 'Rotation axis', headline: 'Azimuth φ',
          lead: 'Swings the axis around the up axis — its compass heading.',
          note: 'Like a clock face seen from above; the magenta arc sweeps round from the R axis.' } },

      // ── Rotation: RGB-axis mode ──
      { id: 'rotr-slider', section: 'rotation', group: 'rot-rgb', label: 'Rotate R', labelColor: '#f87',
        min: 0, max: 360, step: 1, default: 0,
        set: 'setRotR', format: pos => pos.toFixed(0) + '°', get: () => rotR * 180 / Math.PI,
        cycle: 'wrap', speed: { min: -10, max: 10, step: 0.1, default: 1.5 },
        tip: { eyebrow: 'Rotation', headline: 'Rotate R',
          lead: 'Spins the shape about the red (X) axis.',
          note: 'One of three independent turns — combine R, G and B to orient the shape any way in colour space.' } },

      { id: 'rotg-slider', section: 'rotation', group: 'rot-rgb', label: 'Rotate G', labelColor: '#8d8',
        min: 0, max: 360, step: 1, default: 0,
        set: 'setRotG', format: pos => pos.toFixed(0) + '°', get: () => rotG * 180 / Math.PI,
        cycle: 'wrap', speed: { min: -10, max: 10, step: 0.1, default: 1.5 },
        tip: { eyebrow: 'Rotation', headline: 'Rotate G',
          lead: 'Spins the shape about the green (Y) axis.',
          note: 'One of three independent turns — combine R, G and B to orient the shape any way in colour space.' } },

      { id: 'rotb-slider', section: 'rotation', group: 'rot-rgb', label: 'Rotate B', labelColor: '#7cf',
        min: 0, max: 360, step: 1, default: 0,
        set: 'setRotB', format: pos => pos.toFixed(0) + '°', get: () => rotB * 180 / Math.PI,
        cycle: 'wrap', speed: { min: -10, max: 10, step: 0.1, default: 1.5 },
        tip: { eyebrow: 'Rotation', headline: 'Rotate B',
          lead: 'Spins the shape about the blue (Z) axis.',
          note: 'One of three independent turns — combine R, G and B to orient the shape any way in colour space.' } },

      // ── Colour warp (trim handles) ──
      { id: 'exp-slider', section: 'warp', label: 'Exponent (a)',
        min: -3, max: 3, step: 0.01, default: 0,
        set: 'setCoordExp', toValue: pos => Math.exp(pos),
        format: pos => Math.exp(pos).toFixed(2), get: () => Math.log(Math.max(0.0498, coordExp)),
        cycle: 'oscillate', trim: { default: { lo: -3, hi: 3 }, format: b => Math.exp(b).toFixed(2) },
        speed: { min: 0, max: 0.5, step: 0.005, default: 0.03 },
        tip: { eyebrow: 'Colour warp', headline: 'Exponent',
          lead: 'Bends each coordinate before it becomes a colour.',
          note: 'Large values push points far outside the unit sphere, so <strong>bounds</strong> — how far the shape reaches — grows, and overshooting points get a white highlight.' } },

      { id: 'expimag-slider', section: 'warp', label: 'Imaginary (b)',
        min: 0, max: 1, step: 0.001, default: 0,
        set: 'setCoordExpImag', toValue: pos => _imagFromPos(pos),
        format: pos => _imagFromPos(pos).toFixed(1), get: () => _imagToPos(coordExpImag),
        cycle: 'oscillate', trim: { default: { lo: 0, hi: 1 }, format: b => _imagFromPos(b).toFixed(1) },
        speed: { min: 0, max: 0.05, step: 0.001, default: 0.006 },
        tip: { eyebrow: 'Colour warp', headline: 'Imaginary',
          lead: 'Adds spiralling colour bands.',
          note: 'Complex exponentiation twists the bands around the shape.' } },

      // ── Coordinate centre ──
      { id: 'cx-slider', section: 'centre', label: 'Centre R', labelColor: '#f87',
        min: -2, max: 2, step: 0.01, default: 0,
        set: 'setCoordCenterX', format: pos => pos.toFixed(2), get: () => coordCenterX,
        cycle: 'oscillate', speed: { min: 0, max: 0.05, step: 0.001, default: 0.012 },
        tip: { eyebrow: 'Centre offset', headline: 'Centre R',
          lead: 'Shifts the warp’s origin along the red axis, inside the colour cube.',
          note: '<strong>|RGB|</strong> is how far you’ve shifted the origin — different from <strong>bounds</strong>, which is how far the warped shape itself reaches in colour space.' } },

      { id: 'cy-slider', section: 'centre', label: 'Centre G', labelColor: '#8d8',
        min: -2, max: 2, step: 0.01, default: 0,
        set: 'setCoordCenterY', format: pos => pos.toFixed(2), get: () => coordCenterY,
        cycle: 'oscillate', speed: { min: 0, max: 0.05, step: 0.001, default: 0.012 },
        tip: { eyebrow: 'Centre offset', headline: 'Centre G',
          lead: 'Shifts the warp’s origin along the green axis, inside the colour cube.',
          note: '<strong>|RGB|</strong> is how far you’ve shifted the origin — different from <strong>bounds</strong>, which is how far the warped shape itself reaches in colour space.' } },

      { id: 'cz-slider', section: 'centre', label: 'Centre B', labelColor: '#7cf',
        min: -2, max: 2, step: 0.01, default: 0,
        set: 'setCoordCenterZ', format: pos => pos.toFixed(2), get: () => coordCenterZ,
        cycle: 'oscillate', speed: { min: 0, max: 0.05, step: 0.001, default: 0.012 },
        tip: { eyebrow: 'Centre offset', headline: 'Centre B',
          lead: 'Shifts the warp’s origin along the blue axis, inside the colour cube.',
          note: '<strong>|RGB|</strong> is how far you’ve shifted the origin — different from <strong>bounds</strong>, which is how far the warped shape itself reaches in colour space.' } },
    ],
  });
})();
