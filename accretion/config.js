/* Accretion — controls config consumed by ../common/ui.js.
   Sliders are linear, so each `get` returns the global directly and the value
   doubles as the slider position. encodeSettings/applySettingsFromHash live in
   sketch.js; the runtime only adds the sp_* auto-cycle speed params. */
SketchUI.init({
  title: 'Accretion',
  pngPrefix: 'accretion',
  storagePrefix: 'accretion',

  infoHtml: `<p style="margin:0.5rem 0 0.6rem;color:#aaa;font-size:0.87rem;max-width:64ch;">
      A raymarched accretion disk rendered entirely in a GLSL fragment shader.
      Each ray is bent through polar coordinates, displaced by 7 octaves of
      fractal sine-noise, and colour-accumulated using a cosine palette.
      Original shader
      <a href="https://www.shadertoy.com/view/WcKXDV" style="color:#58a6ff;"
         target="_blank" rel="noopener">"Accretion" by @XorDev on ShaderToy</a>.
    </p>`,
  infoItems: [
    ['&#9881; Controls', 'adjust disk geometry &amp; colours'],
    ['&#8595; Download', 'export a settings panel + image'],
    ['&#11014; Share', 'copy a link with all current settings'],
    ['▶ button', 'start auto-cycling a slider; click again to stop'],
    ['Time speed 0', 'freezes the animation'],
    ['Color R/G/B', 'shift the cosine palette hue channels'],
  ],

  share: {
    speedParams: {
      'radial-slider': 'sp_r', 'depth-slider': 'sp_d',
      'squish-slider': 'sp_a', 'offset-slider': 'sp_i',
      'speed-slider': 'sp_s', 'cr-slider': 'sp_cr',
      'cg-slider': 'sp_cg', 'cb-slider': 'sp_cb',
    },
  },

  exportPanel: {
    size: 720, panelW: 380, title: 'Accretion', valXFrac: 0.58,
    rows: () => [
      ['radial scale', radialScale.toFixed(1)],
      ['depth fade',   depthAtten.toFixed(2)],
      ['angle squish', angleSquish.toFixed(2)],
      ['ray offset',   initOffset.toFixed(2)],
      ['time speed',   timeSpeed.toFixed(2)],
      ['color R',      colorR.toFixed(1)],
      ['color G',      colorG.toFixed(1)],
      ['color B',      colorB.toFixed(1)],
    ],
  },

  sections: [
    { id: 'disk',       heading: 'Accretion disk', resetTitle: 'Reset disk' },
    { id: 'appearance', heading: 'Appearance', marginTop: true, resetTitle: 'Reset appearance' },
  ],

  sliders: [
    { id: 'radial-slider', section: 'disk', label: 'Radial scale',
      min: 0.5, max: 15, step: 0.1, default: 5.0,
      set: 'setRadialScale', format: v => v.toFixed(1), get: () => radialScale,
      cycle: 'oscillate', speed: { min: 0, max: 0.3, step: 0.005, default: 0.04 },
      tip: { eyebrow: 'Accretion disk', headline: 'Radial scale',
        lead: 'Size of the disk ring.',
        note: 'Higher values push the ring further out, revealing more of the glowing torus shape.' } },

    { id: 'depth-slider', section: 'disk', label: 'Depth fade',
      min: 0, max: 1, step: 0.01, default: 0.2,
      set: 'setDepthAtten', format: v => v.toFixed(2), get: () => depthAtten,
      cycle: 'oscillate', speed: { min: 0, max: 0.02, step: 0.0005, default: 0.004 },
      tip: { eyebrow: 'Accretion disk', headline: 'Depth fade',
        lead: 'Glow attenuation along each ray.',
        note: 'Controls how quickly accumulated brightness drops off as the ray travels deeper — lower = more even glow.' } },

    { id: 'squish-slider', section: 'disk', label: 'Angle squish',
      min: 0.01, max: 2.0, step: 0.01, default: 0.2,
      set: 'setAngleSquish', format: v => v.toFixed(2), get: () => angleSquish,
      cycle: 'oscillate', speed: { min: 0, max: 0.04, step: 0.001, default: 0.008 },
      tip: { eyebrow: 'Accretion disk', headline: 'Angle squish',
        lead: 'Vertical compression of the disk.',
        note: 'Divides the Y component before computing the polar angle. <strong>Low values</strong> flatten the disk to a thin band; higher values make it more spherical.' } },

    { id: 'offset-slider', section: 'disk', label: 'Ray offset',
      min: 0, max: 1, step: 0.01, default: 0.1,
      set: 'setInitOffset', format: v => v.toFixed(2), get: () => initOffset,
      cycle: 'oscillate', speed: { min: 0, max: 0.02, step: 0.0005, default: 0.004 },
      tip: { eyebrow: 'Accretion disk', headline: 'Ray offset',
        lead: 'Starting depth of the camera ray.',
        note: 'Shifts where raymarching begins — useful for "zooming in" to the disk centre or pulling back to see the full ring.' } },

    { id: 'speed-slider', section: 'appearance', label: 'Time speed',
      min: 0, max: 5, step: 0.05, default: 1.0,
      set: 'setTimeSpeed', format: v => v.toFixed(2), get: () => timeSpeed,
      cycle: 'oscillate', speed: { min: 0, max: 0.1, step: 0.002, default: 0.02 },
      tip: { eyebrow: 'Appearance', headline: 'Time speed',
        lead: 'Animation rate multiplier.',
        note: 'Scales the time fed to the noise and colour functions. <strong>Set to 0</strong> to freeze the disk for a still export.' } },

    { id: 'cr-slider', section: 'appearance', label: 'Color R', labelColor: '#f87',
      min: 0, max: 12, step: 0.1, default: 6.0,
      set: 'setColorR', format: v => v.toFixed(1), get: () => colorR,
      cycle: 'wrap', speed: { min: -1, max: 1, step: 0.02, default: 0.06 },
      tip: { eyebrow: 'Appearance', headline: 'Color R',
        lead: 'Red channel phase in the cosine palette.',
        note: 'cos(phase + <strong>R</strong>) drives the red channel. Sweep all three R/G/B phases to cycle through the full colour spectrum.' } },

    { id: 'cg-slider', section: 'appearance', label: 'Color G', labelColor: '#8d8',
      min: 0, max: 12, step: 0.1, default: 1.0,
      set: 'setColorG', format: v => v.toFixed(1), get: () => colorG,
      cycle: 'wrap', speed: { min: -1, max: 1, step: 0.02, default: 0.04 },
      tip: { eyebrow: 'Appearance', headline: 'Color G',
        lead: 'Green channel phase in the cosine palette.',
        note: 'cos(phase + <strong>G</strong>) drives the green channel. The R–G–B gap controls how "rainbow" vs monochromatic the palette is.' } },

    { id: 'cb-slider', section: 'appearance', label: 'Color B', labelColor: '#7cf',
      min: 0, max: 12, step: 0.1, default: 9.0,
      set: 'setColorB', format: v => v.toFixed(1), get: () => colorB,
      cycle: 'wrap', speed: { min: -1, max: 1, step: 0.02, default: 0.09 },
      tip: { eyebrow: 'Appearance', headline: 'Color B',
        lead: 'Blue channel phase in the cosine palette.',
        note: 'cos(phase + <strong>B</strong>) drives the blue channel. Try auto-cycling all three at different speeds for shifting aurora colours.' } },
  ],
});
