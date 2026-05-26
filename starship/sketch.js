// "Starship" shader sketch.
// Original GLSL by @XorDev: https://www.shadertoy.com/view/l3cfW4
// p5.js wrapper with interactive uniforms.

// ── Tunable parameters (read and set by common/ui.js via config.js) ──────────
let timeSpeed = 1.0;   // Animation rate multiplier
let count     = 50;    // Number of debris particles (loop iterations, 1..50)
let exposure  = 1.0;   // Brightness of the accumulated light
let colorR    = 1.0;   // Red channel colour frequency
let colorG    = 2.0;   // Green channel colour frequency
let colorB    = 3.0;   // Blue channel colour frequency

// ── Setters called by the UI ─────────────────────────────────────────────────
function setTimeSpeed(v) { timeSpeed = v; }
function setCount(v)     { count     = v; }
function setExposure(v)  { exposure  = v; }
function setColorR(v)    { colorR    = v; }
function setColorG(v)    { colorG    = v; }
function setColorB(v)    { colorB    = v; }

function resetAll() {
  timeSpeed = 1.0;
  count     = 50;
  exposure  = 1.0;
  colorR    = 1.0;
  colorG    = 2.0;
  colorB    = 3.0;
}

// ── Settings serialisation (share links + screenshot export) ─────────────────
function encodeSettings() {
  return [
    's='  + timeSpeed,
    'n='  + count,
    'e='  + exposure,
    'cr=' + colorR,
    'cg=' + colorG,
    'cb=' + colorB,
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
  if ('s'  in p) timeSpeed = parseFloat(p.s)  || timeSpeed;
  if ('n'  in p) count     = parseFloat(p.n)  || count;
  if ('e'  in p) exposure  = parseFloat(p.e)  || exposure;
  if ('cr' in p) colorR    = parseFloat(p.cr) || colorR;
  if ('cg' in p) colorG    = parseFloat(p.cg) || colorG;
  if ('cb' in p) colorB    = parseFloat(p.cb) || colorB;
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
  theShader.setUniform('iCount',      count);
  theShader.setUniform('iExposure',   exposure);
  theShader.setUniform('iColorR',     colorR);
  theShader.setUniform('iColorG',     colorG);
  theShader.setUniform('iColorB',     colorB);

  shaderBg.rect(0, 0, width, height);
  image(shaderBg, 0, 0, width, height);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  shaderBg.resizeCanvas(windowWidth, windowHeight);
}
