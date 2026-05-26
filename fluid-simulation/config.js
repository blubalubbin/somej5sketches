/* Fluid Simulation — controls config consumed by ../common/ui.js.
   Linear sliders, so each `get` returns the global directly. The hue slider
   wraps; everything else oscillates. encodeSettings/applySettingsFromHash live
   in sketch.js; the runtime only adds the sp_* auto-cycle speed params. */
SketchUI.init({
  title: 'Fluid Simulation',
  pngPrefix: 'fluid-simulation',
  storagePrefix: 'fluid-sim',

  infoHtml: `<p style="margin:0.5rem 0 0.6rem;color:#aaa;font-size:0.87rem;max-width:60ch;">
      A 16×16 Navier-Stokes fluid grid advects 32 k particle tracers.
      Move the mouse to push the fluid; adjust viscosity, diffusion, and particle
      settings in Controls. Based on
      <a href="http://www.dgp.toronto.edu/people/stam/reality/Research/pdf/GDC03.pdf"
         style="color:#58a6ff;" target="_blank" rel="noopener">Jos Stam's GDC 2003 paper</a>.
    </p>`,
  infoItems: [
    ['Mouse', 'push the fluid'],
    ['&#9881; Controls', 'adjust fluid &amp; particle parameters'],
    ['&#8595; Download', 'export a settings panel + image'],
    ['&#11014; Share', 'copy a link with all current settings'],
    ['▶ button', 'start auto-cycling a slider; click again to stop'],
    ['Trail fade', 'lower = longer motion trails'],
  ],

  share: {
    speedParams: {
      'viscosity-slider': 'sp_v', 'diffusion-slider': 'sp_d',
      'force-slider': 'sp_f', 'maxmouse-slider': 'sp_m',
      'hue-slider': 'sp_h', 'trail-slider': 'sp_t',
    },
  },

  exportPanel: {
    size: 720, panelW: 380, title: 'Fluid Simulation', valXFrac: 0.55,
    rows: () => [
      ['viscosity',   fluidViscosity.toFixed(5)],
      ['diffusion',   fluidDiffusion.toFixed(3)],
      ['force scale', velocityScaleFactor.toFixed(0)],
      ['max mouse',   maxMouseVelocity.toFixed(0)],
      ['hue',         particleHue.toFixed(0) + '°'],
      ['trail fade',  trailOpacity.toFixed(0)],
    ],
  },

  sections: [
    { id: 'physics',   heading: 'Fluid physics', resetTitle: 'Reset physics' },
    { id: 'particles', heading: 'Particles', marginTop: true, resetTitle: 'Reset particles' },
  ],

  sliders: [
    { id: 'viscosity-slider', section: 'physics', label: 'Viscosity',
      min: 0, max: 0.005, step: 0.00001, default: 0.00025,
      set: 'setViscosity', format: v => v.toFixed(5), get: () => fluidViscosity,
      cycle: 'oscillate', speed: { min: 0, max: 0.0002, step: 0.000001, default: 0.00002 },
      tip: { eyebrow: 'Fluid physics', headline: 'Viscosity',
        lead: 'Thickness of the fluid.',
        note: 'Higher values damp velocity quickly — the fluid "forgets" its motion faster. At zero it flows freely.' } },

    { id: 'diffusion-slider', section: 'physics', label: 'Diffusion',
      min: 0, max: 0.15, step: 0.001, default: 0.03,
      set: 'setDiffusion', format: v => v.toFixed(3), get: () => fluidDiffusion,
      cycle: 'oscillate', speed: { min: 0, max: 0.005, step: 0.0001, default: 0.001 },
      tip: { eyebrow: 'Fluid physics', headline: 'Diffusion',
        lead: 'How quickly velocity spreads to neighbours.',
        note: 'High diffusion blurs the velocity field across the grid, making forces fan out in all directions instead of staying local.' } },

    { id: 'force-slider', section: 'physics', label: 'Force scale',
      min: 0, max: 60, step: 1, default: 10,
      set: 'setForceScale', format: v => v.toFixed(0), get: () => velocityScaleFactor,
      cycle: 'oscillate', speed: { min: 0, max: 1, step: 0.01, default: 0.5 },
      tip: { eyebrow: 'Fluid physics', headline: 'Force scale',
        lead: 'Amplifies mouse strokes into fluid forces.',
        note: 'Turn it up for dramatic swirls from small movements; turn it down for fine, controlled brushstrokes.' } },

    { id: 'maxmouse-slider', section: 'physics', label: 'Max mouse vel',
      min: 1, max: 80, step: 1, default: 10,
      set: 'setMaxMouse', format: v => v.toFixed(0), get: () => maxMouseVelocity,
      cycle: 'oscillate', speed: { min: 0, max: 2, step: 0.05, default: 0.5 },
      tip: { eyebrow: 'Fluid physics', headline: 'Max velocity',
        lead: 'Caps how fast raw mouse movement is sampled.',
        note: 'Prevents a sudden fast swipe from injecting extreme velocity that destabilises the solver.' } },

    { id: 'hue-slider', section: 'particles', label: 'Hue',
      min: 0, max: 360, step: 1, default: 180,
      set: 'setParticleHue', format: v => v.toFixed(0) + '°', get: () => particleHue,
      cycle: 'wrap', speed: { min: -5, max: 5, step: 0.1, default: 1.0 },
      tip: { eyebrow: 'Particles', headline: 'Hue',
        lead: 'Colour of the particle stream.',
        note: 'Full saturation and brightness — sweep the hue to change from cyan to magenta to red to green and back.' } },

    { id: 'trail-slider', section: 'particles', label: 'Trail fade',
      min: 5, max: 120, step: 1, default: 40,
      set: 'setTrailOpacity', format: v => v.toFixed(0), get: () => trailOpacity,
      cycle: 'oscillate', speed: { min: 0, max: 2, step: 0.05, default: 0.5 },
      tip: { eyebrow: 'Particles', headline: 'Trail fade',
        lead: 'Controls how long particle trails persist.',
        note: '<strong>Lower = longer trails.</strong> Each frame a semi-transparent rectangle fades the canvas toward black; this alpha controls how aggressively it erases the previous frame.' } },
  ],
});
