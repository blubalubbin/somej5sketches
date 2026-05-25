// Accretion disk shader sketch.
// Original GLSL by @XorDev: https://www.shadertoy.com/view/WcKXDV
// p5.js wrapper with interactive uniforms.

// ── Tunable parameters (read and set by the UI inline script) ────────────────
let radialScale = 5.0;  // Size of the accretion disk ring
let depthAtten  = 0.2;  // Glow attenuation along each ray
let angleSquish = 0.2;  // Vertical compression of the disk (atan divisor)
let initOffset  = 0.1;  // Starting depth of the camera ray
let timeSpeed   = 1.0;  // Animation rate multiplier
let colorR      = 6.0;  // Red channel phase in the cosine colour palette
let colorG      = 1.0;  // Green channel phase
let colorB      = 9.0;  // Blue channel phase

// ── Setters called by the UI ─────────────────────────────────────────────────
function setRadialScale(v) { radialScale = v; }
function setDepthAtten(v)  { depthAtten  = v; }
function setAngleSquish(v) { angleSquish = v; }
function setInitOffset(v)  { initOffset  = v; }
function setTimeSpeed(v)   { timeSpeed   = v; }
function setColorR(v)      { colorR      = v; }
function setColorG(v)      { colorG      = v; }
function setColorB(v)      { colorB      = v; }

function resetAll() {
  radialScale = 5.0;
  depthAtten  = 0.2;
  angleSquish = 0.2;
  initOffset  = 0.1;
  timeSpeed   = 1.0;
  colorR      = 6.0;
  colorG      = 1.0;
  colorB      = 9.0;
}

// ── Settings serialisation (share links + screenshot export) ─────────────────
function encodeSettings() {
  return [
    'r='  + radialScale,
    'd='  + depthAtten,
    'a='  + angleSquish,
    'i='  + initOffset,
    's='  + timeSpeed,
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
  if ('r'  in p) radialScale = parseFloat(p.r)  || radialScale;
  if ('d'  in p) depthAtten  = parseFloat(p.d)  || depthAtten;
  if ('a'  in p) angleSquish = parseFloat(p.a)  || angleSquish;
  if ('i'  in p) initOffset  = parseFloat(p.i)  || initOffset;
  if ('s'  in p) timeSpeed   = parseFloat(p.s)  || timeSpeed;
  if ('cr' in p) colorR      = parseFloat(p.cr) || colorR;
  if ('cg' in p) colorG      = parseFloat(p.cg) || colorG;
  if ('cb' in p) colorB      = parseFloat(p.cb) || colorB;
}

// ── p5.js sketch ─────────────────────────────────────────────────────────────
let theShader;
let shaderBg; // Offscreen WEBGL buffer — keeps the main canvas in 2D mode

function preload() {
  // Load the GLSL shader pair (vertex + fragment)
  theShader = loadShader('vertex.glsl', 'fragment.glsl');
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noStroke();

  // Offscreen WEBGL graphics buffer for the shader
  shaderBg = createGraphics(windowWidth, windowHeight, WEBGL);
  shaderBg.noStroke();

  applySettingsFromHash(); // Restore any URL-encoded settings
}

function draw() {
  // Activate our shader on the offscreen WEBGL buffer
  shaderBg.shader(theShader);

  // Push all tunable parameters to the shader as uniforms
  theShader.setUniform('iResolution',  [width, height]);
  theShader.setUniform('iTime',        millis() / 1000.0);
  theShader.setUniform('iRadialScale', radialScale);
  theShader.setUniform('iDepthAtten',  depthAtten);
  theShader.setUniform('iAngleSquish', angleSquish);
  theShader.setUniform('iInitOffset',  initOffset);
  theShader.setUniform('iTimeSpeed',   timeSpeed);
  theShader.setUniform('iColorR',      colorR);
  theShader.setUniform('iColorG',      colorG);
  theShader.setUniform('iColorB',      colorB);

  // Draw a fullscreen rect to run the fragment shader
  shaderBg.rect(0, 0, width, height);

  // Composite onto the main 2D canvas
  image(shaderBg, 0, 0, width, height);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  shaderBg.resizeCanvas(windowWidth, windowHeight); // Keep buffer in sync
}
