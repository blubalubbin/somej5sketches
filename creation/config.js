/* Creation — controls config consumed by ../common/ui.js.
   Linear sliders, so each `get` returns the global directly. All parameters
   oscillate when auto-cycled. encodeSettings/applySettingsFromHash live in
   sketch.js; the runtime only adds the sp_* auto-cycle speed params. */
SketchUI.init({
  title: 'Creation',
  pngPrefix: 'creation',
  storagePrefix: 'creation',

  infoHtml: `<p style="margin:0.5rem 0 0.6rem;color:#aaa;font-size:0.87rem;max-width:62ch;">
      The whole effect is one 3-iteration loop — one pass per colour channel.
      Each pass ripples the UV outward from the centre, then accumulates a
      glowing line through a repeating grid. Original shader
      <a href="https://www.shadertoy.com/view/XsXXDn" style="color:#58a6ff;"
         target="_blank" rel="noopener">"Creation" by Silexars (Danilo Guanabara)</a>.
    </p>`,
  infoItems: [
    ['&#9881; Controls', 'adjust motion &amp; pattern parameters'],
    ['&#8595; Download', 'export a settings panel + image'],
    ['&#11014; Share', 'copy a link with all current settings'],
    ['▶ button', 'start auto-cycling a slider; click again to stop'],
    ['Time speed 0', 'freezes the animation'],
    ['Exposure', 'overall brightness of the output'],
  ],

  share: {
    speedParams: {
      'speed-slider': 'sp_s', 'phase-slider': 'sp_p',
      'freq-slider': 'sp_f', 'glow-slider': 'sp_g',
      'exposure-slider': 'sp_e',
    },
  },

  exportPanel: {
    size: 720, panelW: 380, title: 'Creation', valXFrac: 0.58,
    rows: () => [
      ['time speed',  timeSpeed.toFixed(2)],
      ['layer phase', layerPhase.toFixed(3)],
      ['ripple freq', rippleFreq.toFixed(1)],
      ['glow',        glow.toFixed(3)],
      ['exposure',    exposure.toFixed(2)],
    ],
  },

  sections: [
    { id: 'motion',  heading: 'Motion', resetTitle: 'Reset motion' },
    { id: 'pattern', heading: 'Pattern', marginTop: true, resetTitle: 'Reset pattern' },
  ],

  sliders: [
    { id: 'speed-slider', section: 'motion', label: 'Time speed',
      min: 0, max: 5, step: 0.05, default: 1.0,
      set: 'setTimeSpeed', format: v => v.toFixed(2), get: () => timeSpeed,
      cycle: 'oscillate', speed: { min: 0, max: 0.1, step: 0.002, default: 0.02 },
      tip: { eyebrow: 'Motion', headline: 'Time speed',
        lead: 'Animation rate multiplier.',
        note: 'Scales the time driving the ripples. <strong>Set to 0</strong> to freeze a still frame for export.' } },

    { id: 'phase-slider', section: 'motion', label: 'Layer phase',
      min: 0, max: 0.3, step: 0.005, default: 0.07,
      set: 'setLayerPhase', format: v => v.toFixed(3), get: () => layerPhase,
      cycle: 'oscillate', speed: { min: 0, max: 0.02, step: 0.0005, default: 0.004 },
      tip: { eyebrow: 'Motion', headline: 'Layer phase',
        lead: 'Separation between the three colour passes.',
        note: 'Each of the R/G/B passes advances by this much. <strong>Larger values</strong> fan the channels apart into stronger chromatic fringing.' } },

    { id: 'freq-slider', section: 'pattern', label: 'Ripple freq',
      min: 1, max: 20, step: 0.1, default: 9.0,
      set: 'setRippleFreq', format: v => v.toFixed(1), get: () => rippleFreq,
      cycle: 'oscillate', speed: { min: 0, max: 0.3, step: 0.005, default: 0.05 },
      tip: { eyebrow: 'Pattern', headline: 'Ripple freq',
        lead: 'How many rings radiate from the centre.',
        note: 'Higher frequencies pack more concentric ripples into the same space, breaking the image into finer filaments.' } },

    { id: 'glow-slider', section: 'pattern', label: 'Glow',
      min: 0.002, max: 0.05, step: 0.001, default: 0.01,
      set: 'setGlow', format: v => v.toFixed(3), get: () => glow,
      cycle: 'oscillate', speed: { min: 0, max: 0.01, step: 0.0005, default: 0.002 },
      tip: { eyebrow: 'Pattern', headline: 'Glow',
        lead: 'Thickness and brightness of each line.',
        note: 'Scales the 1/distance falloff along the grid lines — higher values bloom the filaments into thick glowing veins.' } },

    { id: 'exposure-slider', section: 'pattern', label: 'Exposure',
      min: 0.2, max: 3, step: 0.05, default: 1.0,
      set: 'setExposure', format: v => v.toFixed(2), get: () => exposure,
      cycle: 'oscillate', speed: { min: 0, max: 0.1, step: 0.002, default: 0.02 },
      tip: { eyebrow: 'Pattern', headline: 'Exposure',
        lead: 'Overall brightness of the output.',
        note: 'A final multiplier on the accumulated colour — pull it down for moody dark frames or up to blow out the highlights.' } },
  ],
});
