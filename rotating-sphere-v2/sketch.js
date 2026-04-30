let rotationVector;
let sphX, sphY, sphZ;   // pre-computed unit-sphere coords (equirectangular mode)
let UVmap;
let RM;                  // rotation matrix (pre-scaled by 127.5)
let mode3D  = false;
let sphereR;

// Rotation-axis spherical coordinates
let axisTheta    = Math.acos(Math.sqrt(3) / 3); // polar  (~54.7°)
let axisPhi      = Math.PI / 4;                  // azimuthal (45°)
let rotSpeed     = 0.01;                         // rad / frame

// Colour-warp exponent  z^(a+ib)
let coordExp     = 1.0;
let coordExpImag = 0.0;

// Coordinate-centre offset — subtracted from each surface normal before warp.
let coordCenterX = 0.0;
let coordCenterY = 0.0;
let coordCenterZ = 0.0;

// Rotation offset controlled by dragging the canvas (radians).
// Replaces the raw mouseX-based offset.
let rotOffset = 0.0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  RM = new Float64Array(9);
  applySettingsFromHash();
  updateRotationVector();
  initBuffers();
}

function initBuffers() {
  const N = width * height;
  sphX = new Float32Array(N);
  sphY = new Float32Array(N);
  sphZ = new Float32Array(N);
  UVmap = createImage(width, height);
  buildCoordsVector(sphX, sphY, sphZ, height, width);
  sphereR = Math.min(width, height) * 0.45;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  initBuffers();
}

function draw() {
  const theta = frameCount * rotSpeed + rotOffset;
  buildRotationMatrix(RM, rotationVector, theta);
  if (mode3D) {
    renderSphere3D(UVmap, RM, sphereR, width / 2, height / 2);
  } else {
    renderSphere(UVmap, RM, sphX, sphY, sphZ);
  }
  image(UVmap, 0, 0);
}

function toggle3D() {
  mode3D = !mode3D;
  document.getElementById('mode-btn').textContent = mode3D ? 'Flat map' : '3D sphere';
}

function updateRotationVector() {
  const sinT = Math.sin(axisTheta);
  rotationVector = createVector(
    sinT * Math.cos(axisPhi),
    sinT * Math.sin(axisPhi),
    Math.cos(axisTheta)
  );
  const el = document.getElementById('axis-display');
  if (el) {
    const v = rotationVector;
    el.textContent = `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
  }
}

function setAxisTheta(deg)    { axisTheta    = deg * Math.PI / 180; updateRotationVector(); }
function setAxisPhi(deg)      { axisPhi      = deg * Math.PI / 180; updateRotationVector(); }
function setRotSpeed(val)     { rotSpeed     = parseFloat(val); }
function setCoordExp(val)     { coordExp     = parseFloat(val); }
function setCoordExpImag(val) { coordExpImag = parseFloat(val); }
function setCoordCenterX(val) { coordCenterX = parseFloat(val); }
function setCoordCenterY(val) { coordCenterY = parseFloat(val); }
function setCoordCenterZ(val) { coordCenterZ = parseFloat(val); }
function setRotOffset(val)    { rotOffset    = parseFloat(val); }

// ── Settings serialization ──────────────────────────────────────────
function getSettings() {
  return {
    t:  +(axisTheta * 180 / Math.PI).toFixed(2),
    p:  +(axisPhi   * 180 / Math.PI).toFixed(2),
    s:  +rotSpeed.toFixed(4),
    a:  +coordExp.toFixed(3),
    b:  +coordExpImag.toFixed(2),
    cx: +coordCenterX.toFixed(3),
    cy: +coordCenterY.toFixed(3),
    cz: +coordCenterZ.toFixed(3),
    ro: +rotOffset.toFixed(3),
    m:  mode3D ? 1 : 0,
  };
}

function encodeSettings() {
  const s = getSettings();
  return Object.keys(s).map(k => `${k}=${s[k]}`).join('&');
}

function parseSettingsHash(hash) {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const out = {};
  for (const kv of raw.split('&')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    const k = decodeURIComponent(kv.slice(0, i));
    const v = decodeURIComponent(kv.slice(i + 1));
    out[k] = v;
  }
  return out;
}

function applySettingsFromHash() {
  const s = parseSettingsHash(typeof location !== 'undefined' ? location.hash : '');
  if (!s) return;
  const num = (v, fb) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };
  if ('t'  in s) axisTheta    = num(s.t,  axisTheta * 180 / Math.PI) * Math.PI / 180;
  if ('p'  in s) axisPhi      = num(s.p,  axisPhi   * 180 / Math.PI) * Math.PI / 180;
  if ('s'  in s) rotSpeed     = num(s.s,  rotSpeed);
  if ('a'  in s) coordExp     = num(s.a,  coordExp);
  if ('b'  in s) coordExpImag = num(s.b,  coordExpImag);
  if ('cx' in s) coordCenterX = num(s.cx, coordCenterX);
  if ('cy' in s) coordCenterY = num(s.cy, coordCenterY);
  if ('cz' in s) coordCenterZ = num(s.cz, coordCenterZ);
  if ('ro' in s) rotOffset    = num(s.ro, rotOffset);
  if ('m'  in s) mode3D       = s.m === '1' || s.m === 'true';
}

// Real part of sign(v)·|v|^(a+ib).  At a=1, b=0 this is the identity.
function warpCoord(v, a, b) {
  if (v === 0) return 0;
  const absv = Math.abs(v);
  return Math.sign(v) * Math.pow(absv, a) * (b === 0 ? 1 : Math.cos(b * Math.log(absv)));
}

// Rodrigues rotation — pre-scaled by 127.5 so pixel writes need no extra arithmetic.
function buildRotationMatrix(RM, RV, theta) {
  const c = Math.cos(theta), s = Math.sin(theta), t = 1 - c;
  const x = RV.x, y = RV.y, z = RV.z, k = 127.5;
  RM[0] = k*(c+x*x*t);   RM[1] = k*(x*y*t-z*s); RM[2] = k*(x*z*t+y*s);
  RM[3] = k*(y*x*t+z*s); RM[4] = k*(c+y*y*t);   RM[5] = k*(y*z*t-x*s);
  RM[6] = k*(z*x*t-y*s); RM[7] = k*(z*y*t+x*s); RM[8] = k*(c+z*z*t);
}

function buildCoordsVector(xs, ys, zs, meridiansCount, parallelsCount) {
  for (let j = 0; j < meridiansCount; j++) {
    const meridian = Math.PI * j / (meridiansCount - 1);
    const sinM = Math.sin(meridian), cosM = Math.cos(meridian);
    const rowOffset = parallelsCount * j;
    for (let i = 0; i < parallelsCount; i++) {
      const parallel = (Math.PI * 2) * i / parallelsCount;
      const idx = i + rowOffset;
      xs[idx] = sinM * Math.cos(parallel);
      ys[idx] = sinM * Math.sin(parallel);
      zs[idx] = cosM;
    }
  }
}

// v2 pipeline: (coord − centre) → warp → normalise → rotate → pixel.
// Fast path when centre=(0,0,0) and warp=identity: skip all three steps.
function renderSphere(img, RM, xs, ys, zs) {
  img.loadPixels();
  const pixels = img.pixels;
  const m00=RM[0],m01=RM[1],m02=RM[2],m10=RM[3],m11=RM[4],m12=RM[5],m20=RM[6],m21=RM[7],m22=RM[8];
  const k  = 127.5;
  const N  = xs.length;
  const a  = coordExp, b = coordExpImag;
  const cx = coordCenterX, cy = coordCenterY, cz = coordCenterZ;
  const pure = (a===1 && b===0 && cx===0 && cy===0 && cz===0);

  for (let i = 0; i < N; i++) {
    const p = i << 2;
    let nx, ny, nz;
    if (pure) {
      nx = xs[i]; ny = ys[i]; nz = zs[i];
    } else {
      const wx = warpCoord(xs[i]-cx, a, b);
      const wy = warpCoord(ys[i]-cy, a, b);
      const wz = warpCoord(zs[i]-cz, a, b);
      const len = Math.sqrt(wx*wx + wy*wy + wz*wz);
      if (len < 1e-6) { pixels[p]=pixels[p+1]=pixels[p+2]=0; pixels[p+3]=255; continue; }
      nx = wx/len; ny = wy/len; nz = wz/len;
    }
    pixels[p]   = m00*nx + m01*ny + m02*nz + k;
    pixels[p+1] = m10*nx + m11*ny + m12*nz + k;
    pixels[p+2] = m20*nx + m21*ny + m22*nz + k;
    pixels[p+3] = 255;
  }
  img.updatePixels();
}

function renderSphere3D(img, RM, R, ox, oy) {
  img.loadPixels();
  const pixels = img.pixels;
  const W = img.width, H = img.height;
  const m00=RM[0],m01=RM[1],m02=RM[2],m10=RM[3],m11=RM[4],m12=RM[5],m20=RM[6],m21=RM[7],m22=RM[8];
  const k    = 127.5;
  const invR = 1 / R;
  const a    = coordExp, b = coordExpImag;
  const cx   = coordCenterX, cy = coordCenterY, cz = coordCenterZ;
  const pure = (a===1 && b===0 && cx===0 && cy===0 && cz===0);

  for (let j = 0; j < H; j++) {
    const rny  = (j-oy) * invR;
    const rny2 = rny * rny;
    const rowBase = j * W;
    for (let i = 0; i < W; i++) {
      const p   = (rowBase+i) << 2;
      const rnx = (i-ox) * invR;
      const d2  = rnx*rnx + rny2;
      if (d2 > 1) {
        pixels[p]=pixels[p+1]=pixels[p+2]=0; pixels[p+3]=255; continue;
      }
      const rnz = Math.sqrt(1-d2);
      let nx, ny, nz;
      if (pure) {
        nx = rnx; ny = rny; nz = rnz;
      } else {
        const wx = warpCoord(rnx-cx, a, b);
        const wy = warpCoord(rny-cy, a, b);
        const wz = warpCoord(rnz-cz, a, b);
        const len = Math.sqrt(wx*wx + wy*wy + wz*wz);
        if (len < 1e-6) { pixels[p]=pixels[p+1]=pixels[p+2]=0; pixels[p+3]=255; continue; }
        nx = wx/len; ny = wy/len; nz = wz/len;
      }
      pixels[p]   = m00*nx + m01*ny + m02*nz + k;
      pixels[p+1] = m10*nx + m11*ny + m12*nz + k;
      pixels[p+2] = m20*nx + m21*ny + m22*nz + k;
      pixels[p+3] = 255;
    }
  }
  img.updatePixels();
}
