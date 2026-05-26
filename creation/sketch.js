// "Creation" shader sketch.
// Original GLSL by Silexars (Danilo Guanabara): https://www.shadertoy.com/view/XsXXDn
// p5.js wrapper with interactive uniforms.

// ── Tunable parameters (read and set by common/ui.js via config.js) ──────────
let timeSpeed  = 1.0;   // Animation rate multiplier
let layerPhase = 0.07;  // Per-channel phase offset (the original's 0.07 z step)
let rippleFreq = 9.0;   // Radial ripple frequency
let glow       = 0.01;  // Line glow / brightness
let exposure   = 1.0;   // Overall output exposure

// ── Setters called by the UI ─────────────────────────────────────────────────
function setTimeSpeed(v)  { timeSpeed  = v; }
function setLayerPhase(v) { layerPhase = v; }
function setRippleFreq(v) { rippleFreq = v; }
function setGlow(v)       { glow       = v; }
function setExposure(v)   { exposure   = v; }

function resetAll() {
  timeSpeed  = 1.0;
  layerPhase = 0.07;
  rippleFreq = 9.0;
  glow       = 0.01;
  exposure   = 1.0;
}

// ── Settings serialisation (share links + screenshot export) ─────────────────
function encodeSettings() {
  return [
    's=' + timeSpeed,
    'p=' + layerPhase,
    'f=' + rippleFreq,
    'g=' + glow,
    'e=' + exposure,
  ].join('&');
}

function applySettingsFromHash() {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  const p = {};
  for (const kv of hash.split('&')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
  }
  if ('s' in p) timeSpeed  = parseFloat(p.s) || timeSpeed;
  if ('p' in p) layerPhase = parseFloat(p.p) || layerPhase;
  if ('f' in p) rippleFreq = parseFloat(p.f) || rippleFreq;
  if ('g' in p) glow       = parseFloat(p.g) || glow;
  if ('e' in p) exposure   = parseFloat(p.e) || exposure;
}

// ── p5.js sketch ─────────────────────────────────────────────────────────────
let theShader;
let shaderBg; // Offscreen WEBGL buffer — keeps the main canvas in 2D mode

function preload() {
  theShader = loadShader('vertex.glsl', 'fragment.glsl');
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noStroke();

  shaderBg = createGraphics(windowWidth, windowHeight, WEBGL);
  shaderBg.noStroke();

  applySettingsFromHash(); // Restore any URL-encoded settings
}

function draw() {
  shaderBg.shader(theShader);

  theShader.setUniform('iResolution', [width, height]);
  theShader.setUniform('iTime',       millis() / 1000.0);
  theShader.setUniform('iTimeSpeed',  timeSpeed);
  theShader.setUniform('iLayerPhase', layerPhase);
  theShader.setUniform('iRippleFreq', rippleFreq);
  theShader.setUniform('iGlow',       glow);
  theShader.setUniform('iExposure',   exposure);

  shaderBg.rect(0, 0, width, height);
  image(shaderBg, 0, 0, width, height);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  shaderBg.resizeCanvas(windowWidth, windowHeight);
}
