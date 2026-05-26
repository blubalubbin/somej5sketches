/* Starship — controls config consumed by ../common/ui.js.
   Sliders are linear, so each `get` returns the global directly and the value
   doubles as the slider position. encodeSettings/applySettingsFromHash live in
   sketch.js; the runtime only adds the sp_* auto-cycle speed params. */
SketchUI.init({
  title: 'Starship',
  pngPrefix: 'starship',
  storagePrefix: 'starship',

  infoHtml: `<p style="margin:0.5rem 0 0.6rem;color:#aaa;font-size:0.87rem;max-width:64ch;">
      Fifty point-light particles are walked across the screen — each flashes
      exponentially, smears into a long glowing trail and is tinted by a
      per-channel sine, then the whole field is "tanh" tone-mapped over a sky
      gradient. The trails' cloudy depth uses procedural value noise in place of
      the original's texture. Original shader
      <a href="https://www.shadertoy.com/view/l3cfW4" style="color:#58a6ff;"
         target="_blank" rel="noopener">"Starship" by @XorDev on ShaderToy</a>,
      inspired by the debris from SpaceX's 7th Starship test.
    </p>`,
  // Default canvas interaction: drag maps onto existing sliders (x→exposure,
  // y→particle count, drag up for more). Always on — no toggle.
  canvasDrag: {
    x: { target: () => 'exposure-slider', perWidth: 2.8, mode: 'clamp' },
    y: { target: () => 'count-slider',    perHeight: -49, mode: 'clamp' },
  },
  interaction: {
    text: 'Drag the canvas to stir the debris',
    tip: { eyebrow: 'Canvas', headline: 'Drag to stir',
      lead: 'Drag across the canvas to drive the debris field by hand.',
      note: 'Left/right sets the <strong>exposure</strong> (brightness); up/down sets the <strong>particle</strong> count — drag up for more.' },
  },

  share: {
    speedParams: {
      'speed-slider': 'sp_s', 'count-slider': 'sp_n',
      'exposure-slider': 'sp_e', 'cr-slider': 'sp_cr',
      'cg-slider': 'sp_cg', 'cb-slider': 'sp_cb',
    },
  },

  exportPanel: {
    size: 720, panelW: 380, title: 'Starship', valXFrac: 0.58,
    rows: () => [
      ['time speed', timeSpeed.toFixed(2)],
      ['particles',  count.toFixed(0)],
      ['exposure',   exposure.toFixed(2)],
      ['color R',    colorR.toFixed(1)],
      ['color G',    colorG.toFixed(1)],
      ['color B',    colorB.toFixed(1)],
    ],
  },

  sections: [
    { id: 'motion',     heading: 'Motion', resetTitle: 'Reset motion' },
    { id: 'appearance', heading: 'Appearance', marginTop: true, resetTitle: 'Reset appearance' },
  ],

  sliders: [
    { id: 'speed-slider', section: 'motion', label: 'Time speed',
      min: 0, max: 5, step: 0.05, default: 1.0,
      set: 'setTimeSpeed', format: v => v.toFixed(2), get: () => timeSpeed,
      cycle: 'oscillate', speed: { min: 0, max: 0.1, step: 0.002, default: 0.02 },
      tip: { eyebrow: 'Motion', headline: 'Time speed',
        lead: 'Animation rate multiplier.',
        note: 'Scales the time driving the particle drift and flashing. <strong>Set to 0</strong> to freeze a still frame for export.' } },

    { id: 'count-slider', section: 'motion', label: 'Particles',
      min: 1, max: 50, step: 1, default: 50,
      set: 'setCount', format: v => v.toFixed(0), get: () => count,
      cycle: 'oscillate', speed: { min: 0, max: 2, step: 0.05, default: 0.3 },
      tip: { eyebrow: 'Motion', headline: 'Particles',
        lead: 'Number of debris streaks.',
        note: 'Each iteration adds one flashing, trailing point light. <strong>Fewer</strong> leaves a sparse spray; the full 50 builds the dense glowing cloud.' } },

    { id: 'exposure-slider', section: 'appearance', label: 'Exposure',
      min: 0.2, max: 3, step: 0.05, default: 1.0,
      set: 'setExposure', format: v => v.toFixed(2), get: () => exposure,
      cycle: 'oscillate', speed: { min: 0, max: 0.1, step: 0.002, default: 0.02 },
      tip: { eyebrow: 'Appearance', headline: 'Exposure',
        lead: 'Brightness of the accumulated light.',
        note: 'Multiplies the summed glow before the tanh tone-map — pull it down for moody embers or up to blow out the trails.' } },

    { id: 'cr-slider', section: 'appearance', label: 'Color R', labelColor: '#f87',
      min: 0, max: 6, step: 0.1, default: 1.0,
      set: 'setColorR', format: v => v.toFixed(1), get: () => colorR,
      cycle: 'oscillate', speed: { min: 0, max: 0.2, step: 0.005, default: 0.04 },
      tip: { eyebrow: 'Appearance', headline: 'Color R',
        lead: 'Red channel colour frequency.',
        note: 'Sets how fast the red tint cycles across particles. Lower frequencies (the original\'s 1) make red the broadest, slowest channel.' } },

    { id: 'cg-slider', section: 'appearance', label: 'Color G', labelColor: '#8d8',
      min: 0, max: 6, step: 0.1, default: 2.0,
      set: 'setColorG', format: v => v.toFixed(1), get: () => colorG,
      cycle: 'oscillate', speed: { min: 0, max: 0.2, step: 0.005, default: 0.05 },
      tip: { eyebrow: 'Appearance', headline: 'Color G',
        lead: 'Green channel colour frequency.',
        note: 'Sets how fast the green tint cycles across particles. The R–G–B spread controls how rainbow vs monochromatic the debris looks.' } },

    { id: 'cb-slider', section: 'appearance', label: 'Color B', labelColor: '#7cf',
      min: 0, max: 6, step: 0.1, default: 3.0,
      set: 'setColorB', format: v => v.toFixed(1), get: () => colorB,
      cycle: 'oscillate', speed: { min: 0, max: 0.2, step: 0.005, default: 0.06 },
      tip: { eyebrow: 'Appearance', headline: 'Color B',
        lead: 'Blue channel colour frequency.',
        note: 'Sets how fast the blue tint cycles across particles. The highest frequency (the original\'s 3) makes blue dissipate quickest.' } },
  ],
});
